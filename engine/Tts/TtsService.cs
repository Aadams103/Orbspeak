using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using NAudio.Wave;
using Orbspeak.Shared;

namespace Orbspeak.Engine.Tts;

/// <summary>
/// Speaks text through Qwen3-TTS (localhost sidecar) or OpenAI TTS.
/// Sentence-chunks so the UI can highlight the active line.
/// </summary>
internal sealed class TtsService : IDisposable
{
    private static readonly HttpClient Http = new()
    {
        Timeout = TimeSpan.FromMinutes(3)
    };

    private readonly EngineConfig _config;
    private readonly JsonFileLogger _logger;
    private readonly object _playLock = new();
    private WaveOutEvent? _output;
    private WaveStream? _reader;
    private MemoryStream? _audioStream;
    private CancellationTokenSource? _speakCts;
    private TaskCompletionSource? _playbackDone;

    public TtsService(EngineConfig config, JsonFileLogger logger)
    {
        _config = config;
        _logger = logger;
    }

    public async Task SpeakAsync(string text, string? voiceId, double? rate, string? instruct, Action<IpcEnvelope> enqueue, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            throw new ArgumentException("text is required", nameof(text));
        }

        Stop();
        var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        _speakCts = cts;
        var token = cts.Token;
        _ = rate;

        var sentences = SentenceSplitter.SplitSentences(text);
        var provider = (_config.TtsProvider ?? "qwen3").Trim().ToLowerInvariant();
        var cursorMs = 0;

        enqueue(new EventMessage
        {
            Event = IpcEvents.TtsState,
            Payload = new { state = "speaking", provider }
        });
        enqueue(new EventMessage
        {
            Event = IpcEvents.EngineState,
            Payload = new EngineStateEventPayload { State = "speaking" }
        });

        try
        {
            for (var i = 0; i < sentences.Count; i++)
            {
                token.ThrowIfCancellationRequested();
                var sentence = sentences[i];
                var wav = await SynthesizeAsync(sentence, voiceId, instruct, token).ConfigureAwait(false);
                var duration = WavConcat.DurationMs(wav);
                enqueue(new EventMessage
                {
                    Event = IpcEvents.TtsProgress,
                    Payload = new TtsProgressPayload
                    {
                        Index = i,
                        Text = sentence,
                        StartMs = cursorMs,
                        EndMs = cursorMs + duration
                    }
                });
                await PlayAndWaitAsync(wav, token).ConfigureAwait(false);
                cursorMs += duration;
            }

            enqueue(new EventMessage { Event = IpcEvents.TtsState, Payload = new { state = "stopped" } });
            enqueue(new EventMessage
            {
                Event = IpcEvents.EngineState,
                Payload = new EngineStateEventPayload { State = "idle" }
            });
        }
        catch (OperationCanceledException)
        {
            enqueue(new EventMessage { Event = IpcEvents.TtsState, Payload = new { state = "stopped" } });
            enqueue(new EventMessage
            {
                Event = IpcEvents.EngineState,
                Payload = new EngineStateEventPayload { State = "idle" }
            });
        }
    }

    public async Task<byte[]> ExportAsync(string text, string? voiceId, string? instruct, CancellationToken cancellationToken)
    {
        var sentences = SentenceSplitter.SplitSentences(text);
        var chunks = new List<byte[]>();
        foreach (var sentence in sentences)
        {
            cancellationToken.ThrowIfCancellationRequested();
            chunks.Add(await SynthesizeAsync(sentence, voiceId, instruct, cancellationToken).ConfigureAwait(false));
        }

        return WavConcat.Concatenate(chunks);
    }

    public void Pause()
    {
        lock (_playLock)
        {
            _output?.Pause();
        }
    }

    public void Resume()
    {
        lock (_playLock)
        {
            _output?.Play();
        }
    }

    public void Stop()
    {
        try
        {
            _speakCts?.Cancel();
        }
        catch
        {
            // ignored
        }

        lock (_playLock)
        {
            _output?.Stop();
            DisposePlayback();
            _playbackDone?.TrySetCanceled();
        }
    }

    public void Dispose() => Stop();

    private async Task<byte[]> SynthesizeAsync(string text, string? voiceId, string? instruct, CancellationToken cancellationToken)
    {
        var provider = (_config.TtsProvider ?? "qwen3").Trim().ToLowerInvariant();
        if (provider == "openai")
        {
            return await SynthesizeOpenAiAsync(text, voiceId, cancellationToken).ConfigureAwait(false);
        }

        try
        {
            return await SynthesizeQwenAsync(text, voiceId, instruct, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex) when (SecretStore.GetOpenAiApiKey() is not null)
        {
            _logger.Error("tts.qwen", "Qwen sidecar failed; falling back to OpenAI TTS", ex);
            return await SynthesizeOpenAiAsync(text, voiceId, cancellationToken).ConfigureAwait(false);
        }
    }

    private async Task<byte[]> SynthesizeQwenAsync(string text, string? voiceId, string? instruct, CancellationToken cancellationToken)
    {
        var url = (_config.QwenSidecarUrl ?? "http://127.0.0.1:8765").TrimEnd('/') + "/v1/speak";
        var payload = new
        {
            text,
            speaker = string.IsNullOrWhiteSpace(voiceId) ? _config.QwenSpeaker : voiceId,
            language = _config.QwenLanguage,
            instruct = string.IsNullOrWhiteSpace(instruct) ? _config.QwenInstruct : instruct
        };
        using var request = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
        };
        using var response = await Http.SendAsync(request, cancellationToken).ConfigureAwait(false);
        var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            var detail = Encoding.UTF8.GetString(bytes);
            throw new InvalidOperationException($"Qwen sidecar returned {(int)response.StatusCode}: {detail}");
        }

        return bytes;
    }

    private async Task<byte[]> SynthesizeOpenAiAsync(string text, string? voiceId, CancellationToken cancellationToken)
    {
        var apiKey = SecretStore.GetOpenAiApiKey();
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException("Set OPENAI_API_KEY or start the Qwen sidecar for local TTS.");
        }

        var payload = new
        {
            model = _config.OpenAiTtsModel,
            voice = string.IsNullOrWhiteSpace(voiceId) ? _config.OpenAiTtsVoice : voiceId,
            input = text,
            response_format = "wav"
        };
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/audio/speech");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
        using var response = await Http.SendAsync(request, cancellationToken).ConfigureAwait(false);
        var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"OpenAI TTS returned {(int)response.StatusCode}: {Encoding.UTF8.GetString(bytes)}");
        }

        return bytes;
    }

    private Task PlayAndWaitAsync(byte[] wav, CancellationToken cancellationToken)
    {
        var done = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        lock (_playLock)
        {
            DisposePlayback();
            _playbackDone = done;
            _audioStream = new MemoryStream(wav, writable: false);
            _reader = new WaveFileReader(_audioStream);
            _output = new WaveOutEvent();
            _output.PlaybackStopped += (_, _) => done.TrySetResult();
            _output.Init(_reader);
            _output.Play();
        }

        using var reg = cancellationToken.Register(() =>
        {
            lock (_playLock)
            {
                _output?.Stop();
            }

            done.TrySetCanceled(cancellationToken);
        });

        return done.Task;
    }

    private void DisposePlayback()
    {
        _output?.Dispose();
        _output = null;
        _reader?.Dispose();
        _reader = null;
        _audioStream?.Dispose();
        _audioStream = null;
    }
}
