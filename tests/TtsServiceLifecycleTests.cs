using Orbspeak.Engine;
using Orbspeak.Engine.Tts;
using Orbspeak.Shared;
using Xunit;

namespace Orbspeak.Tests;

public class TtsServiceLifecycleTests
{
    [Fact]
    public async Task Speak_PlaysPauseResumeStopAndCompletes()
    {
        var transport = new RecordingTtsTransport();
        var player = new RecordingSentencePlayer { Hold = true };
        using var tts = new TtsService(new EngineConfig { TtsProvider = TtsProviderIds.Qwen3 }, transport: transport, player: player);
        var events = new List<string>();

        var speak = tts.SpeakAsync(new StudioSpeechRequest
        {
            Text = "One sentence. Two sentence.",
            Provider = TtsProviderIds.Qwen3,
            VoiceId = "Vivian"
        }, envelope => RecordState(events, envelope), CancellationToken.None);

        await WaitUntil(() =>
            speak.IsCompleted ||
            (player.Played.Count >= 1 && tts.CurrentState == PlaybackSessionState.Playing));
        if (speak.IsFaulted)
        {
            throw speak.Exception!;
        }

        Assert.False(speak.IsCompleted, $"Speak finished early in {tts.CurrentState} after {player.Played.Count} plays");
        Assert.True(
            tts.Pause(),
            $"Pause should work while playing, but state was {tts.CurrentState} session={tts.CurrentSessionId}");
        Assert.Equal(PlaybackSessionState.Paused, tts.CurrentState);
        Assert.True(tts.Resume());
        player.Hold = false;
        player.Release();
        await speak;

        Assert.Equal(2, transport.Calls.Count);
        Assert.All(transport.Calls, call => Assert.Equal(TtsProviderIds.Qwen3, call.ProviderId));
        Assert.Contains("loading", events);
        Assert.Contains("speaking", events);
        Assert.Contains("completed", events);
        Assert.Equal(PlaybackSessionState.Idle, tts.CurrentState);
    }

    [Fact]
    public async Task Stop_CancelsInFlightSynthesis()
    {
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var transport = new RecordingTtsTransport
        {
            Delay = async ct =>
            {
                started.TrySetResult();
                await Task.Delay(Timeout.Infinite, ct);
            }
        };
        var player = new RecordingSentencePlayer();
        using var tts = new TtsService(new EngineConfig(), transport: transport, player: player);
        var events = new List<string>();

        var speak = tts.SpeakAsync(new StudioSpeechRequest
        {
            Text = "This should be cancelled.",
            Provider = TtsProviderIds.Qwen3,
            VoiceId = "Vivian"
        }, envelope => RecordState(events, envelope), CancellationToken.None);

        await started.Task.WaitAsync(TimeSpan.FromSeconds(2));
        tts.Stop();
        await speak;
        Assert.Contains("stopped", events);
    }

    [Fact]
    public async Task ProviderFailure_RecoversToUsableState()
    {
        var transport = new RecordingTtsTransport
        {
            Error = new InvalidOperationException("sidecar down")
        };
        using var tts = new TtsService(new EngineConfig(), transport: transport, player: new RecordingSentencePlayer());
        var events = new List<string>();

        await Assert.ThrowsAsync<InvalidOperationException>(() => tts.SpeakAsync(new StudioSpeechRequest
        {
            Text = "This fails.",
            Provider = TtsProviderIds.Qwen3,
            VoiceId = "Vivian"
        }, envelope => RecordState(events, envelope), CancellationToken.None));

        Assert.Contains("error", events);
        Assert.Equal(PlaybackSessionState.Error, tts.CurrentState);

        transport.Error = null;
        var recovered = new List<string>();
        await tts.SpeakAsync(new StudioSpeechRequest
        {
            Text = "Recovered.",
            Provider = TtsProviderIds.Qwen3,
            VoiceId = "Vivian"
        }, envelope => RecordState(recovered, envelope), CancellationToken.None);
        Assert.Contains("completed", recovered);
    }

    [Fact]
    public async Task SecondSpeak_ReplacesFirstSession()
    {
        var player = new RecordingSentencePlayer { Hold = true };
        using var tts = new TtsService(new EngineConfig(), transport: new RecordingTtsTransport(), player: player);
        var firstEvents = new List<string>();
        var first = tts.SpeakAsync(new StudioSpeechRequest
        {
            Text = "First document.",
            Provider = TtsProviderIds.Qwen3,
            VoiceId = "Vivian"
        }, envelope => RecordState(firstEvents, envelope), CancellationToken.None);

        await WaitUntil(() => player.Played.Count == 1 && tts.CurrentState == PlaybackSessionState.Playing);
        var firstSession = tts.CurrentSessionId;
        player.Hold = false;
        await tts.SpeakAsync(new StudioSpeechRequest
        {
            Text = "Second document.",
            Provider = TtsProviderIds.Qwen3,
            VoiceId = "Ryan"
        }, _ => { }, CancellationToken.None);

        await first;
        Assert.NotEqual(firstSession, tts.CurrentSessionId);
    }

    private static void RecordState(List<string> events, IpcEnvelope envelope)
    {
        if (envelope is not EventMessage message || message.Event != IpcEvents.TtsState)
        {
            return;
        }

        var json = System.Text.Json.JsonSerializer.Serialize(message.Payload);
        using var doc = System.Text.Json.JsonDocument.Parse(json);
        if (doc.RootElement.TryGetProperty("state", out var state))
        {
            events.Add(state.GetString() ?? "");
        }
    }

    private static async Task WaitUntil(Func<bool> condition)
    {
        var deadline = DateTime.UtcNow.AddSeconds(3);
        while (DateTime.UtcNow < deadline && !condition())
        {
            await Task.Delay(20);
        }

        Assert.True(condition(), "Timed out waiting for playback condition.");
    }

    private sealed class RecordingTtsTransport : ITtsTransport
    {
        public List<PlannedTtsCall> Calls { get; } = new();
        public Exception? Error { get; set; }
        public Func<CancellationToken, Task>? Delay { get; set; }

        public async Task<TtsTransportResult> SendAsync(PlannedTtsCall call, CancellationToken cancellationToken)
        {
            Calls.Add(call);
            if (Delay is not null)
            {
                await Delay(cancellationToken);
            }

            if (Error is not null)
            {
                throw Error;
            }

            return new TtsTransportResult
            {
                Wav = WavPcm.CreateSine(0.05, 24000, 440),
                InstructionApplied = call.InstructionApplied
            };
        }
    }

    private sealed class RecordingSentencePlayer : ISentencePlayer
    {
        public List<byte[]> Played { get; } = new();
        public bool Hold { get; set; }
        private TaskCompletionSource? _currentPlay;

        public async Task PlayAsync(byte[] wav, CancellationToken cancellationToken)
        {
            Played.Add(wav);
            if (!Hold)
            {
                return;
            }

            var play = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            _currentPlay = play;
            using var registration = cancellationToken.Register(() => play.TrySetCanceled(cancellationToken));
            await play.Task.WaitAsync(cancellationToken);
        }

        public void Release() => _currentPlay?.TrySetResult();

        public void Pause()
        {
        }

        public void Resume()
        {
        }

        public void Stop() => _currentPlay?.TrySetCanceled();
    }
}
