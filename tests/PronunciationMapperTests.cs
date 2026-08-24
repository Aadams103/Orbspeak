using Orbspeak.Shared;
using Xunit;

namespace Orbspeak.Tests;

public class PronunciationMapperTests
{
    [Fact]
    public void Apply_IsDeterministic()
    {
        const string csv = "Orbspeak,Orb speak\nQwen,Chewen";
        const string text = "Orbspeak uses Qwen";
        Assert.Equal("Orb speak uses Chewen", PronunciationMapper.Apply(text, csv));
        Assert.Equal("Orb speak uses Chewen", PronunciationMapper.Apply(text, csv));
    }

    [Fact]
    public void Apply_IgnoresCommentsAndBlankLines()
    {
        var csv = "# comment\n\nOrbspeak,Orb speak\n";
        Assert.Equal("Orb speak", PronunciationMapper.Apply("Orbspeak", csv));
    }

    [Fact]
    public void Planner_AppliesPronunciationBeforeSentenceSplit()
    {
        var job = TtsSpeechPlanner.Resolve(new StudioSpeechRequest
        {
            Text = "Orbspeak is ready. Qwen reads it.",
            Provider = TtsProviderIds.Qwen3,
            VoiceId = "Vivian",
            PronunciationCsv = "Orbspeak,Orb speak\nQwen,Chewen"
        }, new TtsEngineDefaults());

        Assert.Equal("Orb speak is ready. Chewen reads it.", job.SpokenText);
        Assert.Equal(new[] { "Orb speak is ready.", "Chewen reads it." }, job.Sentences);
    }
}
