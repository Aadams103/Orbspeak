using NAudio.Wave;

namespace Orbspeak.Engine;

/// <summary>
/// Abstraction over microphone capture. Produces 16-bit PCM audio frames.
/// </summary>
public interface IAudioInput : IDisposable
{
    event Action<short[], int, int>? FrameCaptured;

    Task StartAsync(CancellationToken cancellationToken);
    Task StopAsync();
}

/// <summary>
/// WASAPI-based microphone capture using NAudio.
/// </summary>
public sealed class WasapiAudioInput : IAudioInput
{
    private readonly JsonFileLogger _logger;
    private WasapiCapture? _capture;
    private TaskCompletionSource<bool>? _stopTcs;

    public event Action<short[], int, int>? FrameCaptured;

    public WasapiAudioInput(JsonFileLogger logger)
    {
        _logger = logger;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        if (_capture is not null)
        {
            return Task.CompletedTask;
        }

        try
        {
            // Default input device, 16 kHz mono preferred.
            _capture = new WasapiCapture();
            _capture.DataAvailable += OnDataAvailable;
            _capture.RecordingStopped += OnRecordingStopped;

            _stopTcs = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);

            _capture.StartRecording();
            _logger.Info("audio.input", "Started WASAPI capture");

            cancellationToken.Register(async () => await StopAsync().ConfigureAwait(false));
        }
        catch (Exception ex)
        {
            _logger.Error("audio.input", "Failed to start WASAPI capture", ex);
        }

        return Task.CompletedTask;
    }

    public async Task StopAsync()
    {
        var cap = _capture;
        if (cap is null)
        {
            return;
        }

        try
        {
            cap.StopRecording();
            _logger.Info("audio.input", "Stopping WASAPI capture");
        }
        catch (Exception ex)
        {
            _logger.Error("audio.input", "Error while stopping WASAPI capture", ex);
        }

        if (_stopTcs is { } tcs)
        {
            await tcs.Task.ConfigureAwait(false);
        }
    }

    private void OnDataAvailable(object? sender, WaveInEventArgs e)
    {
        try
        {
            // Convert byte buffer to 16-bit samples.
            var samples = new short[e.BytesRecorded / 2];
            Buffer.BlockCopy(e.Buffer, 0, samples, 0, e.BytesRecorded);

            var waveFormat = _capture?.WaveFormat;
            var sampleRate = waveFormat?.SampleRate ?? 16000;
            var channels = waveFormat?.Channels ?? 1;

            FrameCaptured?.Invoke(samples, sampleRate, channels);
        }
        catch (Exception ex)
        {
            _logger.Error("audio.input", "Error processing captured audio frame", ex);
        }
    }

    private void OnRecordingStopped(object? sender, StoppedEventArgs e)
    {
        if (e.Exception is not null)
        {
            _logger.Error("audio.input", "Recording stopped with error", e.Exception);
        }

        _capture?.Dispose();
        _capture = null;

        _stopTcs?.TrySetResult(true);
    }

    public void Dispose()
    {
        _capture?.Dispose();
        _capture = null;
    }
}

