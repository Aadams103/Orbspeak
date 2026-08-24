using Orbspeak.Shared;

namespace Orbspeak.Engine.Tts;

/// <summary>
/// Speaks or exports text through the selected TTS provider.
/// Provider, voice, rate, and style are resolved by <see cref="TtsSpeechPlanner"/>.
/// </summary>
internal sealed class TtsService : IDisposable
{
    private readonly EngineConfig _config;
    private readonly JsonFileLogger? _logger;
    private readonly ITtsTransport _transport;
    private readonly ISentencePlayer _player;
    private readonly PlaybackController _playback = new();
    private readonly ManualResetEventSlim _resumeGate = new(true);
    private readonly object _sessionLock = new();
    private CancellationTokenSource? _speakCts;

    public TtsService(
        EngineConfig config,
        JsonFileLogger? logger = null,
        ITtsTransport? transport = null,
        ISentencePlayer? player = null)
    {
        _config = config;
        _logger = logger;
        _transport = transport ?? new HttpTtsTransport();
        _player = player ?? new WaveOutSentencePlayer();
    }

    public string? CurrentSessionId => _playback.SessionId;
    public PlaybackSessionState CurrentState => _playback.State;
    public PlaybackController Playback => _playback;

    public TtsEngineDefaults Defaults() => new()
    {
        DefaultProvider = _config.TtsProvider,
        QwenSpeaker = _config.QwenSpeaker,
        QwenLanguage = _config.QwenLanguage,
        QwenInstruct = _config.QwenInstruct,
        QwenModel = _config.QwenModel,
        QwenSidecarUrl = _config.QwenSidecarUrl,
        OpenAiTtsModel = _config.OpenAiTtsModel,
        OpenAiTtsVoice = _config.OpenAiTtsVoice
    };

    public ResolvedSpeechJob Resolve(StudioSpeechRequest request) =>
        TtsSpeechPlanner.Resolve(request, Defaults());

    public async Task SpeakAsync(StudioSpeechRequest request, Action<IpcEnvelope> enqueue, CancellationToken cancellationToken)
    {
        var job = Resolve(request);
        StopInternal(emit: false);
        var sessionId = _playback.Begin();
        var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        lock (_sessionLock)
        {
            _speakCts = cts;
        }

        var token = cts.Token;
        _resumeGate.Set();
        EmitState(enqueue, sessionId, job, PlaybackSessionState.Loading);

        try
        {
            var cursorMs = 0;
            for (var i = 0; i < job.Sentences.Count; i++)
            {
                token.ThrowIfCancellationRequested();
                WaitIfPaused(token);
                var sentence = job.Sentences[i];
                var wav = await SynthesizeSentenceAsync(job, sentence, token).ConfigureAwait(false);
                var duration = WavConcat.DurationMs(wav);
                if (!_playback.IsCurrent(sessionId))
                {
                    return;
                }

                WaitIfPaused(token);
                if (_playback.MarkPlaying(sessionId, i))
                {
                    EmitState(enqueue, sessionId, job, PlaybackSessionState.Playing);
                    enqueue(new EventMessage
                    {
                        Event = IpcEvents.TtsProgress,
                        Payload = new TtsProgressPayload
                        {
                            Index = i,
                            Text = sentence,
                            StartMs = cursorMs,
                            EndMs = cursorMs + duration,
                            SessionId = sessionId
                        }
                    });
                }

                await _player.PlayAsync(wav, token).ConfigureAwait(false);
                cursorMs += duration;
            }

            if (_playback.Complete(sessionId))
            {
                EmitState(enqueue, sessionId, job, PlaybackSessionState.Completed);
                enqueue(new EventMessage
                {
                    Event = IpcEvents.EngineState,
                    Payload = new EngineStateEventPayload { State = "idle" }
                });
                _playback.Reset();
            }
        }
        catch (OperationCanceledException)
        {
            if (_playback.IsCurrent(sessionId) && _playback.State != PlaybackSessionState.Error)
            {
                _playback.Stop();
                EmitState(enqueue, sessionId, job, PlaybackSessionState.Stopped);
                enqueue(new EventMessage
                {
                    Event = IpcEvents.EngineState,
                    Payload = new EngineStateEventPayload { State = "idle" }
                });
            }
        }
        catch (Exception ex)
        {
            _logger?.Error("tts.lifecycle", "tts.speak failed", ex);
            if (_playback.Fail(sessionId, ex.Message))
            {
                EmitState(enqueue, sessionId, job, PlaybackSessionState.Error, ex.Message);
                enqueue(new EventMessage
                {
                    Event = IpcEvents.EngineState,
                    Payload = new EngineStateEventPayload { State = "idle" }
                });
            }

            throw;
        }
    }

    public async Task<StudioExportResult> ExportAsync(StudioSpeechRequest request, CancellationToken cancellationToken)
    {
        var job = Resolve(request);
        var chunks = new List<byte[]>();
        foreach (var sentence in job.Sentences)
        {
            cancellationToken.ThrowIfCancellationRequested();
            chunks.Add(await SynthesizeSentenceAsync(job, sentence, cancellationToken).ConfigureAwait(false));
        }

        return new StudioExportResult
        {
            Wav = WavConcat.Concatenate(chunks),
            Job = job
        };
    }

    public bool Pause()
    {
        if (!_playback.TryPause())
        {
            return false;
        }

        _resumeGate.Reset();
        _player.Pause();
        return true;
    }

    public bool Resume()
    {
        if (!_playback.TryResume())
        {
            return false;
        }

        _player.Resume();
        _resumeGate.Set();
        return true;
    }

    public void Stop() => StopInternal(emit: false);

    public void Dispose()
    {
        Stop();
        _resumeGate.Dispose();
        if (_player is IDisposable disposable)
        {
            disposable.Dispose();
        }
    }

    private async Task<byte[]> SynthesizeSentenceAsync(ResolvedSpeechJob job, string sentence, CancellationToken cancellationToken)
    {
        var call = job.PlanSentence(sentence);
        var result = await _transport.SendAsync(call, cancellationToken).ConfigureAwait(false);
        return call.ApplyEngineTempo ? WavTempo.ChangeRate(result.Wav, call.Rate) : result.Wav;
    }

    private void WaitIfPaused(CancellationToken token)
    {
        _resumeGate.Wait(token);
        token.ThrowIfCancellationRequested();
    }

    private void StopInternal(bool emit)
    {
        try
        {
            _speakCts?.Cancel();
        }
        catch
        {
            // ignored
        }

        _resumeGate.Set();
        _player.Stop();
        _playback.Stop();
        if (emit)
        {
            // callers that need events emit them after Stop().
        }
    }

    private static void EmitState(
        Action<IpcEnvelope> enqueue,
        string sessionId,
        ResolvedSpeechJob job,
        PlaybackSessionState state,
        string? error = null)
    {
        enqueue(new EventMessage
        {
            Event = IpcEvents.TtsState,
            Payload = new
            {
                state = PlaybackStateIds.ToId(state),
                sessionId,
                provider = job.ProviderId,
                voiceId = job.VoiceId,
                rate = job.Rate,
                instructionApplied = job.InstructionApplied,
                instructionUnavailableReason = job.InstructionUnavailableReason,
                error
            }
        });
    }
}

internal sealed class StudioExportResult
{
    public byte[] Wav { get; init; } = Array.Empty<byte>();
    public required ResolvedSpeechJob Job { get; init; }
}
