namespace Orbspeak.Engine.Asr;

/// <summary>
/// Accumulates PCM, resamples to 16 kHz mono, and invokes a callback when a chunk is ready (~5 s).
/// </summary>
public sealed class AudioBuffer
{
    private const int TargetSampleRate = 16000;
    private const int ChunkDurationSeconds = 5;
    private const int SamplesPerChunk = TargetSampleRate * ChunkDurationSeconds;

    private readonly List<short> _buffer = new();
    private readonly object _bufferLock = new();
    private readonly Action<short[]> _onChunkReady;
    private volatile bool _stopped;

    public AudioBuffer(Action<short[]> onChunkReady)
    {
        _onChunkReady = onChunkReady ?? throw new ArgumentNullException(nameof(onChunkReady));
    }

    /// <summary>
    /// Feed raw PCM. Will resample to 16 kHz mono and accumulate. Fires onChunkReady when a chunk is full.
    /// </summary>
    public void Feed(short[] samples, int sampleRate, int channels)
    {
        if (_stopped || samples.Length == 0)
        {
            return;
        }

        var resampled = AudioResampler.ResampleTo16kMono(samples, sampleRate, channels);
        if (resampled.Length == 0)
        {
            return;
        }

        short[]? toProcess = null;
        lock (_bufferLock)
        {
            _buffer.AddRange(resampled);
            if (_buffer.Count >= SamplesPerChunk)
            {
                toProcess = _buffer.ToArray();
                _buffer.Clear();
            }
        }

        if (toProcess is { Length: > 0 })
        {
            _onChunkReady(toProcess);
        }
    }

    /// <summary>
    /// Process any remaining samples and stop accepting new data.
    /// </summary>
    public void Stop()
    {
        _stopped = true;
    }

    /// <summary>
    /// Process any remaining samples via onChunkReady and clear. Call after Stop() to flush.
    /// </summary>
    public void Flush()
    {
        short[]? remaining;
        lock (_bufferLock)
        {
            if (_buffer.Count == 0)
            {
                return;
            }
            remaining = _buffer.ToArray();
            _buffer.Clear();
        }
        if (remaining is { Length: > 0 })
        {
            _onChunkReady(remaining);
        }
    }
}
