using Orbspeak.Shared;
using Xunit;

namespace Orbspeak.Tests;

public class SpeechRateTests
{
    [Theory]
    [InlineData(null, 1.0)]
    [InlineData(0.1, 0.5)]
    [InlineData(4.0, 2.0)]
    [InlineData(1.25, 1.25)]
    public void Clamp_UsesReaderRange(double? input, double expected)
    {
        Assert.Equal(expected, SpeechRate.Clamp(input), 3);
    }

    [Fact]
    public void OpenAiPlan_IncludesNativeSpeed()
    {
        var job = TtsSpeechPlanner.Resolve(new StudioSpeechRequest
        {
            Text = "Rate must change the OpenAI request.",
            Provider = TtsProviderIds.OpenAi,
            VoiceId = "alloy",
            Rate = 1.5
        }, new TtsEngineDefaults());

        var slow = TtsSpeechPlanner.Resolve(new StudioSpeechRequest
        {
            Text = "Rate must change the OpenAI request.",
            Provider = TtsProviderIds.OpenAi,
            VoiceId = "alloy",
            Rate = 0.7
        }, new TtsEngineDefaults());

        var fastCall = job.PlanSentence(job.Sentences[0]);
        var slowCall = slow.PlanSentence(slow.Sentences[0]);
        Assert.Equal(1.5, fastCall.Payload["speed"]);
        Assert.Equal(0.7, slowCall.Payload["speed"]);
        Assert.NotEqual(fastCall.Payload["speed"], slowCall.Payload["speed"]);
        Assert.False(fastCall.ApplyEngineTempo);
    }

    [Fact]
    public void QwenPlan_KeepsRateForEngineTempo()
    {
        var discardedWouldBeOne = 1.0;
        var job = TtsSpeechPlanner.Resolve(new StudioSpeechRequest
        {
            Text = "Rate must not be discarded for Qwen.",
            Provider = TtsProviderIds.Qwen3,
            VoiceId = "Vivian",
            Rate = 1.6
        }, new TtsEngineDefaults());

        var call = job.PlanSentence(job.Sentences[0]);
        Assert.Equal(1.6, job.Rate);
        Assert.Equal(1.6, call.Rate);
        Assert.True(call.ApplyEngineTempo);
        Assert.NotEqual(discardedWouldBeOne, call.Rate);
        Assert.DoesNotContain("speed", call.Payload.Keys);
    }
}
