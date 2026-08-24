using Orbspeak.Shared;
using Xunit;

namespace Orbspeak.Tests;

public class SpeechInstructionTests
{
    [Fact]
    public void Compose_JoinsInstructAndStyleNotes()
    {
        var composed = SpeechInstruction.Compose("warm audiobook narrator", "intimate delivery, deliberate pacing");
        Assert.Equal("warm audiobook narrator. intimate delivery, deliberate pacing", composed);
    }

    [Fact]
    public void QwenPlan_SendsInstructWhenModelSupportsIt()
    {
        var defaults = new TtsEngineDefaults
        {
            QwenModel = "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"
        };
        var job = TtsSpeechPlanner.Resolve(new StudioSpeechRequest
        {
            Text = "Style must reach Qwen.",
            Provider = TtsProviderIds.Qwen3,
            VoiceId = "Vivian",
            Instruct = "calm documentary narrator",
            StyleMarkdown = "measured and warm"
        }, defaults);

        var call = job.PlanSentence(job.Sentences[0]);
        Assert.True(job.InstructionApplied);
        Assert.Equal("calm documentary narrator. measured and warm", call.Payload["instruct"]);
    }

    [Fact]
    public void Qwen06B_DoesNotPretendInstructWasApplied()
    {
        var defaults = new TtsEngineDefaults
        {
            QwenModel = "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice"
        };
        var job = TtsSpeechPlanner.Resolve(new StudioSpeechRequest
        {
            Text = "This 0.6B model drops instruct.",
            Provider = TtsProviderIds.Qwen3,
            VoiceId = "Vivian",
            Instruct = "excited dramatic storyteller"
        }, defaults);

        var call = job.PlanSentence(job.Sentences[0]);
        Assert.False(job.InstructionApplied);
        Assert.NotNull(job.InstructionUnavailableReason);
        Assert.Null(call.Payload["instruct"]);
    }

    [Fact]
    public void OpenAiPlan_MapsInstructionsWhenSupported()
    {
        var job = TtsSpeechPlanner.Resolve(new StudioSpeechRequest
        {
            Text = "OpenAI should receive instructions.",
            Provider = TtsProviderIds.OpenAi,
            VoiceId = "alloy",
            Instruct = "calm documentary narrator"
        }, new TtsEngineDefaults());

        var call = job.PlanSentence(job.Sentences[0]);
        Assert.True(call.InstructionApplied);
        Assert.Equal("calm documentary narrator", call.Payload["instructions"]);
    }
}
