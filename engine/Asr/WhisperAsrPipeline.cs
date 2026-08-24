using System.IO;
using NAudio.Wave;
using Orbspeak.Engine;
using Orbspeak.Shared;
using Whisper.net;

namespace Orbspeak.Engine.Asr;

/// <summary>
/// Wraps Whisper.net: loads model from path, processes 16 kHz mono PCM chunks, enqueues dictation.final for each segment.
/// </summary>
internal sealed class WhisperAsrPipeline
{
    private readonly string _modelPath;
    private readonly JsonFileLogger _logger;
    private readonly SemaphoreSlim _processLock = new(1, 1);

    private WhisperFactory? _factory;
    private WhisperProcessor? _processor;

    public WhisperAsrPipeline(string modelPath, JsonFileLogger logger)
    {
        _modelPath = modelPath ?? throw new ArgumentNullException(nameof(modelPath));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// Ensure the model is loaded. Throws if the file is missing or load fails.
    /// </summary>
    public void EnsureModelLoaded()
    {
        if (_processor is not null)
        {
            return;
        }

        if (!File.Exists(_modelPath))
        {
            throw new FileNotFoundException($"ASR model not found: {_modelPath}");
        }

        _factory = WhisperFactory.FromPath(_modelPath);
        _processor = _factory.CreateBuilder()
            .WithLanguage("en")
            .Build();

        _logger.Info("asr.whisper", "Loaded Whisper model", null);
    }

    /// <summary>
    /// Process a chunk of 16 kHz mono 16-bit PCM and enqueue dictation.final for each segment via <paramref name="enqueue"/>.
    /// Thread-safe; serializes with other ProcessChunkAsync calls.
    /// </summary>
    public async Task ProcessChunkAsync(short[] samples16kMono, Action<IpcEnvelope> enqueue, CancellationToken cancellationToken = default)
    {
        if (samples16kMono is not { Length: > 0 })
        {
            return;
        }

        await _processLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (_processor is null)
            {
                throw new InvalidOperationException("Whisper model not loaded. Call EnsureModelLoaded first.");
            }

            using var ms = new MemoryStream();
            var wf = new WaveFormat(16000, 16, 1);
            using (var wfw = new WaveFileWriter(ms, wf))
            {
                var bytes = new byte[samples16kMono.Length * 2];
                Buffer.BlockCopy(samples16kMono, 0, bytes, 0, bytes.Length);
                wfw.Write(bytes, 0, bytes.Length);
            }

            ms.Position = 0;

            await foreach (var result in _processor.ProcessAsync(ms).WithCancellation(cancellationToken).ConfigureAwait(false))
            {
                var text = (result.Text ?? "").Trim();
                if (string.IsNullOrEmpty(text))
                {
                    continue;
                }

                enqueue(new EventMessage
                {
                    Event = IpcEvents.DictationFinal,
                    Payload = new { text }
                });
            }
        }
        catch (OperationCanceledException)
        {
            // Expected when stopping dictation.
        }
        catch (Exception ex)
        {
            _logger.Error("asr.whisper", "Whisper processing failed", ex);
            enqueue(new EventMessage
            {
                Event = IpcEvents.DictationError,
                Payload = new { code = "asr.error", message = ex.Message }
            });
        }
        finally
        {
            _processLock.Release();
        }
    }

    public void Dispose()
    {
        _processor?.Dispose();
        _processor = null;
        _factory?.Dispose();
        _factory = null;
        _processLock.Dispose();
    }
}
