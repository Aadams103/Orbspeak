namespace Orbspeak.Engine.Asr;

/// <summary>
/// Resamples PCM audio to 16 kHz mono for Whisper.
/// </summary>
public static class AudioResampler
{
    private const int TargetSampleRate = 16000;

    /// <summary>
    /// Resamples 16-bit PCM to 16 kHz mono. Supports arbitrary input sample rate and channels.
    /// </summary>
    public static short[] ResampleTo16kMono(short[] samples, int inputSampleRate, int inputChannels)
    {
        if (inputSampleRate == TargetSampleRate && inputChannels == 1)
        {
            return samples;
        }

        // Convert to mono by averaging channels
        var mono = inputChannels == 1
            ? samples
            : DownmixToMono(samples, inputChannels);

        if (inputSampleRate == TargetSampleRate)
        {
            return mono;
        }

        return Resample(mono, inputSampleRate, TargetSampleRate);
    }

    private static short[] DownmixToMono(short[] samples, int channels)
    {
        var n = samples.Length / channels;
        var mono = new short[n];
        for (var i = 0; i < n; i++)
        {
            var sum = 0.0;
            for (var c = 0; c < channels; c++)
            {
                sum += samples[i * channels + c];
            }
            mono[i] = (short)Math.Clamp((int)Math.Round(sum / channels), short.MinValue, short.MaxValue);
        }
        return mono;
    }

    private static short[] Resample(short[] mono, int fromRate, int toRate)
    {
        if (fromRate == toRate)
        {
            return mono;
        }

        var ratio = (double)fromRate / toRate;
        var outCount = (int)Math.Round(mono.Length / ratio);
        if (outCount <= 0)
        {
            return Array.Empty<short>();
        }

        var result = new short[outCount];
        for (var i = 0; i < outCount; i++)
        {
            var srcIdx = i * ratio;
            var i0 = (int)Math.Floor(srcIdx);
            var i1 = Math.Min(i0 + 1, mono.Length - 1);
            var frac = srcIdx - i0;

            var v0 = i0 >= 0 && i0 < mono.Length ? mono[i0] : (short)0;
            var v1 = i1 >= 0 && i1 < mono.Length ? mono[i1] : v0;

            var interpolated = v0 * (1.0 - frac) + v1 * frac;
            result[i] = (short)Math.Clamp((int)Math.Round(interpolated), short.MinValue, short.MaxValue);
        }
        return result;
    }
}
