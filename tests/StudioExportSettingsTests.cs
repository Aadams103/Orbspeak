using Orbspeak.Engine;
using Orbspeak.Engine.Tts;
using Orbspeak.Shared;
using Xunit;

namespace Orbspeak.Tests;

public class StudioExportSettingsTests
{
    [Fact]
    public async Task Export_UsesSameSettingsAsReadAloud()
    {
        var request = new StudioSpeechRequest
        {
            Text = "Export must match Read Aloud. Orbspeak says hello.",
            Provider = TtsProviderIds.OpenAi,
            VoiceId = "coral",
            Rate = 1.4,
            Instruct = "calm documentary narrator",
            StyleMarkdown = "intimate delivery",
            PronunciationCsv = "Orbspeak,Orb speak"
        };

        var speakJob = TtsSpeechPlanner.Resolve(request, new TtsEngineDefaults());
        var transport = new RecordingTransport();
        using var tts = new TtsService(new EngineConfig
        {
            TtsProvider = TtsProviderIds.Qwen3,
            OpenAiTtsVoice = "alloy"
        }, transport: transport, player: new ImmediatePlayer());

        var exported = await tts.ExportAsync(request, CancellationToken.None);
        Assert.Equal(speakJob.ProviderId, exported.Job.ProviderId);
        Assert.Equal(speakJob.VoiceId, exported.Job.VoiceId);
        Assert.Equal(speakJob.Rate, exported.Job.Rate);
        Assert.Equal(speakJob.PerformanceInstruct, exported.Job.PerformanceInstruct);
        Assert.Equal(speakJob.SpokenText, exported.Job.SpokenText);
        Assert.Equal(TtsProviderIds.OpenAi, transport.Calls[0].ProviderId);
        Assert.Equal(1.4, transport.Calls[0].Payload["speed"]);
        Assert.Equal("calm documentary narrator. intimate delivery", transport.Calls[0].Payload["instructions"]);
        Assert.Contains("Orb speak", exported.Job.SpokenText);
        Assert.True(exported.Wav.Length > 44);
    }

    [Fact]
    public void StudioOverride_DoesNotChangeDictationAsrProvider()
    {
        var config = new EngineConfig
        {
            AsrProvider = "local",
            TtsProvider = TtsProviderIds.Qwen3
        };
        var job = TtsSpeechPlanner.Resolve(new StudioSpeechRequest
        {
            Text = "Studio can override TTS only.",
            Provider = TtsProviderIds.OpenAi,
            VoiceId = "nova"
        }, new TtsEngineDefaults { DefaultProvider = config.TtsProvider });

        Assert.Equal(TtsProviderIds.OpenAi, job.ProviderId);
        Assert.Equal("local", config.AsrProvider);
        Assert.Equal(TtsProviderIds.Qwen3, config.TtsProvider);
    }

    private sealed class RecordingTransport : ITtsTransport
    {
        public List<PlannedTtsCall> Calls { get; } = new();

        public Task<TtsTransportResult> SendAsync(PlannedTtsCall call, CancellationToken cancellationToken)
        {
            Calls.Add(call);
            return Task.FromResult(new TtsTransportResult
            {
                Wav = WavPcm.CreateSine(0.05, 24000, 440),
                InstructionApplied = call.InstructionApplied
            });
        }
    }

    private sealed class ImmediatePlayer : ISentencePlayer
    {
        public Task PlayAsync(byte[] wav, CancellationToken cancellationToken) => Task.CompletedTask;
        public void Pause() { }
        public void Resume() { }
        public void Stop() { }
    }
}
