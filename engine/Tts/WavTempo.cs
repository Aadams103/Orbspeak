using Orbspeak.Shared;

namespace Orbspeak.Engine.Tts;

/// <summary>
/// Pitch-preserving tempo change for providers that have no native speech-rate control.
/// Used for Qwen Read Aloud and voiceover export so the Studio rate is audible and exported.
/// </summary>
internal static class WavTempo
{
    public static byte[] ChangeRate(byte[] wav, double rate)
    {
        var clamped = SpeechRate.Clamp(rate);
        if (SpeechRate.IsDefault(clamped) || wav.Length < 44)
        {
            return wav;
        }

        if (!WavPcm.TryParse(wav, out var pcm))
        {
            return wav;
        }

        var input = pcm.ToChannelSamples();
        var stretched = new float[input.Length][];
        var factor = 1.0 / clamped;
        for (var channel = 0; channel < input.Length; channel++)
        {
            stretched[channel] = Wsola.Stretch(input[channel], factor);
        }

        return WavPcm.Write(stretched, pcm.SampleRate, pcm.BitsPerSample);
    }
}

internal readonly struct WavPcm
{
    public int SampleRate { get; init; }
    public int Channels { get; init; }
    public int BitsPerSample { get; init; }
    public byte[] Data { get; init; }

    public static bool TryParse(byte[] wav, out WavPcm pcm)
    {
        pcm = default;
        if (wav.Length < 44)
        {
            return false;
        }

        if (!HasTag(wav, 0, "RIFF") || !HasTag(wav, 8, "WAVE"))
        {
            return false;
        }

        var offset = 12;
        var sampleRate = 0;
        var channels = 0;
        var bits = 0;
        byte[]? data = null;
        while (offset + 8 <= wav.Length)
        {
            var chunkId = System.Text.Encoding.ASCII.GetString(wav, offset, 4);
            var chunkSize = BitConverter.ToInt32(wav, offset + 4);
            var payload = offset + 8;
            if (chunkSize < 0 || payload + chunkSize > wav.Length)
            {
                break;
            }

            if (chunkId == "fmt ")
            {
                channels = BitConverter.ToInt16(wav, payload + 2);
                sampleRate = BitConverter.ToInt32(wav, payload + 4);
                bits = BitConverter.ToInt16(wav, payload + 14);
            }
            else if (chunkId == "data")
            {
                data = wav.AsSpan(payload, chunkSize).ToArray();
            }

            offset = payload + chunkSize + (chunkSize % 2);
        }

        if (data is null || sampleRate <= 0 || channels <= 0 || bits != 16)
        {
            return false;
        }

        pcm = new WavPcm
        {
            SampleRate = sampleRate,
            Channels = channels,
            BitsPerSample = bits,
            Data = data
        };
        return true;
    }

    public float[][] ToChannelSamples()
    {
        var frameCount = Data.Length / (Channels * 2);
        var channels = new float[Channels][];
        for (var c = 0; c < Channels; c++)
        {
            channels[c] = new float[frameCount];
        }

        for (var i = 0; i < frameCount; i++)
        {
            for (var c = 0; c < Channels; c++)
            {
                var sample = BitConverter.ToInt16(Data, (i * Channels + c) * 2);
                channels[c][i] = sample / 32768f;
            }
        }

        return channels;
    }

    public static byte[] Write(float[][] channels, int sampleRate, int bitsPerSample)
    {
        var channelCount = channels.Length;
        var frameCount = channels[0].Length;
        var dataSize = frameCount * channelCount * 2;
        using var ms = new MemoryStream(44 + dataSize);
        using var writer = new BinaryWriter(ms);
        writer.Write(System.Text.Encoding.ASCII.GetBytes("RIFF"));
        writer.Write(36 + dataSize);
        writer.Write(System.Text.Encoding.ASCII.GetBytes("WAVE"));
        writer.Write(System.Text.Encoding.ASCII.GetBytes("fmt "));
        writer.Write(16);
        writer.Write((short)1);
        writer.Write((short)channelCount);
        writer.Write(sampleRate);
        writer.Write(sampleRate * channelCount * (bitsPerSample / 8));
        writer.Write((short)(channelCount * (bitsPerSample / 8)));
        writer.Write((short)bitsPerSample);
        writer.Write(System.Text.Encoding.ASCII.GetBytes("data"));
        writer.Write(dataSize);
        for (var i = 0; i < frameCount; i++)
        {
            for (var c = 0; c < channelCount; c++)
            {
                var sample = Math.Clamp(channels[c][i], -1f, 1f);
                writer.Write((short)Math.Round(sample * 32767f));
            }
        }

        writer.Flush();
        return ms.ToArray();
    }

    public static byte[] CreateSine(double seconds, int sampleRate, double frequency)
    {
        var frames = (int)Math.Round(seconds * sampleRate);
        var channel = new float[frames];
        for (var i = 0; i < frames; i++)
        {
            channel[i] = (float)Math.Sin(2 * Math.PI * frequency * i / sampleRate) * 0.5f;
        }

        return Write(new[] { channel }, sampleRate, 16);
    }

    private static bool HasTag(byte[] wav, int offset, string tag)
    {
        var expected = System.Text.Encoding.ASCII.GetBytes(tag);
        for (var i = 0; i < expected.Length; i++)
        {
            if (wav[offset + i] != expected[i])
            {
                return false;
            }
        }

        return true;
    }
}

internal static class Wsola
{
    public static float[] Stretch(float[] input, double factor)
    {
        if (input.Length == 0 || Math.Abs(factor - 1) < 0.001)
        {
            return input;
        }

        var window = 1024;
        var synthesisHop = 256;
        var analysisHop = Math.Max(1, (int)Math.Round(synthesisHop / factor));
        var search = 128;
        var outputLength = Math.Max(1, (int)Math.Round(input.Length * factor));
        var output = new float[outputLength];
        var windowWeights = Hann(window);
        var overlap = new float[outputLength];
        var weight = new float[outputLength];

        var inputPos = 0;
        var outputPos = 0;
        while (outputPos + window < outputLength && inputPos + window < input.Length)
        {
            var searchStart = Math.Max(0, inputPos - search);
            var searchEnd = Math.Min(input.Length - window, inputPos + search);
            var best = inputPos;
            if (outputPos > 0 && searchEnd > searchStart)
            {
                var bestCorr = double.MinValue;
                for (var candidate = searchStart; candidate <= searchEnd; candidate++)
                {
                    var corr = 0.0;
                    var limit = Math.Min(window / 4, outputLength - outputPos);
                    for (var i = 0; i < limit; i++)
                    {
                        corr += output[outputPos + i] * input[candidate + i];
                    }

                    if (corr > bestCorr)
                    {
                        bestCorr = corr;
                        best = candidate;
                    }
                }
            }

            for (var i = 0; i < window && outputPos + i < outputLength && best + i < input.Length; i++)
            {
                overlap[outputPos + i] += input[best + i] * windowWeights[i];
                weight[outputPos + i] += windowWeights[i];
            }

            inputPos = best + analysisHop;
            outputPos += synthesisHop;
        }

        for (var i = 0; i < output.Length; i++)
        {
            output[i] = weight[i] > 0.0001f ? overlap[i] / weight[i] : 0;
        }

        return output;
    }

    private static float[] Hann(int size)
    {
        var window = new float[size];
        for (var i = 0; i < size; i++)
        {
            window[i] = (float)(0.5 - 0.5 * Math.Cos(2 * Math.PI * i / (size - 1)));
        }

        return window;
    }
}
