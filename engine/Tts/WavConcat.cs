namespace Orbspeak.Engine.Tts;

internal static class WavConcat
{
    public static byte[] Concatenate(IReadOnlyList<byte[]> wavs)
    {
        if (wavs.Count == 0)
        {
            return Array.Empty<byte>();
        }

        if (wavs.Count == 1)
        {
            return wavs[0];
        }

        var pcm = new List<byte>();
        var sampleRate = 24000;
        var channels = (short)1;
        var bits = (short)16;

        foreach (var wav in wavs)
        {
            if (wav.Length < 44)
            {
                continue;
            }

            sampleRate = BitConverter.ToInt32(wav, 24);
            channels = BitConverter.ToInt16(wav, 22);
            bits = BitConverter.ToInt16(wav, 34);
            var dataSize = BitConverter.ToInt32(wav, 40);
            var start = 44;
            var take = Math.Min(dataSize, wav.Length - start);
            if (take > 0)
            {
                pcm.AddRange(wav.Skip(start).Take(take));
            }
        }

        var dataLength = pcm.Count;
        using var ms = new MemoryStream(44 + dataLength);
        using var writer = new BinaryWriter(ms);
        writer.Write(System.Text.Encoding.ASCII.GetBytes("RIFF"));
        writer.Write(36 + dataLength);
        writer.Write(System.Text.Encoding.ASCII.GetBytes("WAVE"));
        writer.Write(System.Text.Encoding.ASCII.GetBytes("fmt "));
        writer.Write(16);
        writer.Write((short)1);
        writer.Write(channels);
        writer.Write(sampleRate);
        writer.Write(sampleRate * channels * (bits / 8));
        writer.Write((short)(channels * (bits / 8)));
        writer.Write(bits);
        writer.Write(System.Text.Encoding.ASCII.GetBytes("data"));
        writer.Write(dataLength);
        writer.Write(pcm.ToArray());
        writer.Flush();
        return ms.ToArray();
    }

    public static int DurationMs(byte[] wav)
    {
        if (wav.Length < 44)
        {
            return 0;
        }

        var sampleRate = BitConverter.ToInt32(wav, 24);
        var channels = Math.Max((int)BitConverter.ToInt16(wav, 22), 1);
        var bits = Math.Max((int)BitConverter.ToInt16(wav, 34), 8);
        var dataSize = Math.Min(BitConverter.ToInt32(wav, 40), wav.Length - 44);
        if (sampleRate <= 0)
        {
            return 0;
        }

        var bytesPerSecond = sampleRate * channels * (bits / 8);
        return bytesPerSecond <= 0 ? 0 : (int)(1000L * dataSize / bytesPerSecond);
    }
}
