using Orbspeak.Engine.Tts;
using Orbspeak.Shared;
using Xunit;

namespace Orbspeak.Tests;

public class WavTempoTests
{
    [Fact]
    public void ChangeRate_ShortensAudioWhenFaster()
    {
        var original = WavPcm.CreateSine(1.0, 24000, 440);
        var faster = WavTempo.ChangeRate(original, 2.0);
        var slower = WavTempo.ChangeRate(original, 0.5);

        var originalMs = WavConcat.DurationMs(original);
        var fasterMs = WavConcat.DurationMs(faster);
        var slowerMs = WavConcat.DurationMs(slower);

        Assert.InRange(originalMs, 980, 1020);
        Assert.True(fasterMs < originalMs * 0.7, $"Expected faster audio, got {fasterMs}ms from {originalMs}ms");
        Assert.True(slowerMs > originalMs * 1.3, $"Expected slower audio, got {slowerMs}ms from {originalMs}ms");
        Assert.NotEqual(original.Length, faster.Length);
    }

    [Fact]
    public void ChangeRate_IsIdentityAtDefault()
    {
        var original = WavPcm.CreateSine(0.25, 24000, 440);
        var same = WavTempo.ChangeRate(original, SpeechRate.Default);
        Assert.Equal(original, same);
    }
}
