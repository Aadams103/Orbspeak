using Orbspeak.Shared;
using Xunit;

namespace Orbspeak.Tests;

public class TtsProviderRoutingTests
{
    private static readonly TtsEngineDefaults Defaults = new();

    [Fact]
    public void Qwen3_RoutesToQwenSidecar()
    {
        var job = TtsSpeechPlanner.Resolve(new StudioSpeechRequest
        {
            Text = "Hello from OrbSpeak.",
            Provider = TtsProviderIds.Qwen3,
            VoiceId = "Vivian"
        }, Defaults);

        var call = job.PlanSentence(job.Sentences[0]);
        Assert.Equal(TtsProviderKind.Qwen3, call.Provider);
        Assert.Equal(TtsProviderIds.Qwen3, call.ProviderId);
        Assert.Contains("/v1/speak", call.Url);
        Assert.Equal("Vivian", call.Payload["speaker"]);
        Assert.DoesNotContain("speed", call.Payload.Keys);
    }

    [Fact]
    public void OpenAi_RoutesToOpenAiSpeechApi()
    {
        var job = TtsSpeechPlanner.Resolve(new StudioSpeechRequest
        {
            Text = "Hello from OrbSpeak.",
            Provider = TtsProviderIds.OpenAi,
            VoiceId = "alloy"
        }, Defaults);

        var call = job.PlanSentence(job.Sentences[0]);
        Assert.Equal(TtsProviderKind.OpenAi, call.Provider);
        Assert.Equal(TtsProviderIds.OpenAi, call.ProviderId);
        Assert.Equal("https://api.openai.com/v1/audio/speech", call.Url);
        Assert.Equal("alloy", call.Payload["voice"]);
        Assert.Contains("speed", call.Payload.Keys);
    }

    [Fact]
    public void InvalidProvider_FailsCleanly()
    {
        var ex = Assert.Throws<TtsValidationException>(() => TtsSpeechPlanner.Resolve(new StudioSpeechRequest
        {
            Text = "Hello",
            Provider = "elevenlabs"
        }, Defaults));

        Assert.Equal("tts.invalid_provider", ex.Code);
        Assert.Contains("qwen3", ex.Message);
        Assert.Contains("openai", ex.Message);
    }

    [Fact]
    public void InvalidOpenAiVoice_FailsCleanly()
    {
        var ex = Assert.Throws<TtsValidationException>(() => TtsSpeechPlanner.Resolve(new StudioSpeechRequest
        {
            Text = "Hello",
            Provider = TtsProviderIds.OpenAi,
            VoiceId = "Vivian"
        }, Defaults));

        Assert.Equal("tts.invalid_voice", ex.Code);
        Assert.Contains("alloy", ex.Message);
    }

    [Fact]
    public void ProviderSwitch_CanRemapImpossibleVoice()
    {
        var job = TtsSpeechPlanner.Resolve(new StudioSpeechRequest
        {
            Text = "Hello",
            Provider = TtsProviderIds.OpenAi,
            VoiceId = "Vivian",
            AllowVoiceRemap = true
        }, Defaults);

        Assert.Equal("alloy", job.VoiceId);
        Assert.Equal(TtsProviderIds.OpenAi, job.ProviderId);
    }
}
