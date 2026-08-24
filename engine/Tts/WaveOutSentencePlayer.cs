using NAudio.Wave;

namespace Orbspeak.Engine.Tts;

internal sealed class WaveOutSentencePlayer : ISentencePlayer, IDisposable
{
    private readonly object _playLock = new();
    private WaveOutEvent? _output;
    private WaveStream? _reader;
    private MemoryStream? _audioStream;
    private TaskCompletionSource? _playbackDone;

    public Task PlayAsync(byte[] wav, CancellationToken cancellationToken)
    {
        var done = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        lock (_playLock)
        {
            DisposePlayback();
            _playbackDone = done;
            _audioStream = new MemoryStream(wav, writable: false);
            _reader = new WaveFileReader(_audioStream);
            _output = new WaveOutEvent();
            _output.PlaybackStopped += (_, _) => done.TrySetResult();
            _output.Init(_reader);
            _output.Play();
        }

        using var reg = cancellationToken.Register(() =>
        {
            lock (_playLock)
            {
                _output?.Stop();
            }

            done.TrySetCanceled(cancellationToken);
        });

        return done.Task;
    }

    public void Pause()
    {
        lock (_playLock)
        {
            _output?.Pause();
        }
    }

    public void Resume()
    {
        lock (_playLock)
        {
            _output?.Play();
        }
    }

    public void Stop()
    {
        lock (_playLock)
        {
            _output?.Stop();
            DisposePlayback();
            _playbackDone?.TrySetCanceled();
        }
    }

    public void Dispose() => Stop();

    private void DisposePlayback()
    {
        _output?.Dispose();
        _output = null;
        _reader?.Dispose();
        _reader = null;
        _audioStream?.Dispose();
        _audioStream = null;
    }
}
