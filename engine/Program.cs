using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;
using Orbspeak.Engine.Asr;
using Orbspeak.Shared;

namespace Orbspeak.Engine;

internal static class Program
{
    private const string MutexName = "Global\\OrbspeakEngine";
    private const string PipeName = "orbspeak-engine-v1";

    public static async Task Main(string[] args)
    {
        using var mutex = new Mutex(initiallyOwned: true, name: MutexName, out var acquired);

        if (!acquired)
        {
            // A resident Engine already exists. In a later phase we can
            // forward args to it over IPC; for now, just exit.
            return;
        }

        using var cts = new CancellationTokenSource();
        Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            cts.Cancel();
        };

        var logger = new JsonFileLogger();
        var config = EngineConfig.Load();
        var modelManager = new ModelManager(config);
        var engine = new EngineHost(PipeName, logger, config, modelManager);

        logger.Info("engine.lifecycle", "Engine starting");

        try
        {
            await engine.RunAsync(cts.Token).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            // Normal shutdown.
        }
        catch (Exception ex)
        {
            logger.Error("engine.lifecycle", "Unhandled exception in Engine", ex);
        }
        finally
        {
            logger.Info("engine.lifecycle", "Engine stopping");
        }
    }
}

internal sealed class EngineHost
{
    private readonly string _pipeName;
    private readonly JsonFileLogger _logger;
    private readonly JsonSerializerOptions _serializerOptions;
    private readonly EngineConfig _config;
    private readonly ModelManager _modelManager;
    private readonly IAudioInput _audioInput;
    private readonly WhisperAsrPipeline _asrPipeline;
    private readonly EngineStatusSnapshot _status = new();
    private readonly object _dictationLock = new();

    private CancellationTokenSource? _currentDictationCts;
    private AudioBuffer? _currentBuffer;
    private Action<IpcEnvelope>? _currentEnqueue;
    private Action<short[], int, int>? _currentFeedHandler;

    public EngineHost(string pipeName, JsonFileLogger logger, EngineConfig config, ModelManager modelManager)
    {
        _pipeName = pipeName;
        _logger = logger;
        _config = config;
        _modelManager = modelManager;
        _audioInput = new WasapiAudioInput(logger);
        _asrPipeline = new WhisperAsrPipeline(
            config.AsrModelPath ?? EngineConfig.GetDefaultAsrModelPath(),
            logger);
        _serializerOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = false
        };
    }

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        _status.State = "idle";
        _status.StartedAtUtc = DateTime.UtcNow;

        while (!cancellationToken.IsCancellationRequested)
        {
            using var server = new NamedPipeServerStream(
                _pipeName,
                PipeDirection.InOut,
                NamedPipeServerStream.MaxAllowedServerInstances,
                PipeTransmissionMode.Byte,
                PipeOptions.Asynchronous);

            _logger.Info("ipc.server", "Waiting for client connection");

            await server.WaitForConnectionAsync(cancellationToken).ConfigureAwait(false);
            _logger.Info("ipc.server", "Client connected");

            _ = HandleClientAsync(server, cancellationToken);
        }
    }

    private async Task HandleClientAsync(NamedPipeServerStream server, CancellationToken cancellationToken)
    {
        await using var stream = server;
        using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: false, bufferSize: 4096, leaveOpen: true);
        await using var writer = new StreamWriter(stream, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false), 4096, leaveOpen: true)
        {
            AutoFlush = true
        };

        var channel = Channel.CreateUnbounded<IpcEnvelope>(new UnboundedChannelOptions { SingleReader = false, SingleWriter = false });

        var writerTask = Task.Run(async () =>
        {
            try
            {
                while (await channel.Reader.WaitToReadAsync(cancellationToken).ConfigureAwait(false))
                {
                    while (channel.Reader.TryRead(out var envelope))
                    {
                        await WriteEnvelopeAsync(writer, envelope, cancellationToken).ConfigureAwait(false);
                    }
                }
            }
            catch (OperationCanceledException) { }
        }, cancellationToken);

        void Enqueue(IpcEnvelope envelope) => channel.Writer.TryWrite(envelope);

        Enqueue(new EventMessage
        {
            Event = IpcEvents.EngineState,
            Payload = new EngineStateEventPayload { State = _status.State }
        });

        string? line;
        while (!cancellationToken.IsCancellationRequested && (line = await reader.ReadLineAsync().ConfigureAwait(false)) != null)
        {
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            try
            {
                using var doc = JsonDocument.Parse(line);
                if (!doc.RootElement.TryGetProperty("type", out var typeProp))
                {
                    continue;
                }

                var type = typeProp.GetString();
                if (type == "request")
                {
                    var request = JsonSerializer.Deserialize<RequestMessage>(line, _serializerOptions);
                    if (request is null)
                    {
                        continue;
                    }

                    _logger.Info("ipc.router", $"Handling request {request.Method}", request.Id);
                    HandleRequest(request, Enqueue);
                }
            }
            catch (Exception ex)
            {
                _logger.Error("ipc.server", "Failed to process incoming message", ex);
            }
        }

        channel.Writer.Complete();
        try
        {
            await writerTask.ConfigureAwait(false);
        }
        catch (OperationCanceledException) { }

        _logger.Info("ipc.server", "Client disconnected");
    }

    private void HandleRequest(RequestMessage request, Action<IpcEnvelope> enqueue)
    {
        try
        {
            switch (request.Method)
            {
                case IpcMethods.EnginePing:
                    enqueue(new ResponseMessage
                    {
                        Id = request.Id,
                        Ok = true,
                        Result = new EnginePingResult
                        {
                            Status = _status.State,
                            Version = _status.Version
                        }
                    });
                    break;
                case IpcMethods.DictationStart:
                    HandleDictationStart(request, enqueue);
                    break;
                case IpcMethods.DictationStop:
                    HandleDictationStop(request, enqueue);
                    break;
                case IpcMethods.DictationCancel:
                    HandleDictationCancel(request, enqueue);
                    break;
                case IpcMethods.SettingsGet:
                    enqueue(HandleSettingsGet(request));
                    break;
                case IpcMethods.SettingsSet:
                    enqueue(HandleSettingsSet(request));
                    break;
                default:
                    enqueue(new ResponseMessage
                    {
                        Id = request.Id,
                        Ok = false,
                        Error = new IpcError
                        {
                            Code = "method.not_implemented",
                            Message = $"Method '{request.Method}' is not implemented in this build."
                        }
                    });
                    break;
            }
        }
        catch (Exception ex)
        {
            _logger.Error("ipc.router", "Error while handling request", ex, request.Id);
            enqueue(new ResponseMessage
            {
                Id = request.Id,
                Ok = false,
                Error = new IpcError
                {
                    Code = "internal.error",
                    Message = "Unhandled engine error. See logs for details."
                }
            });
        }
    }

    private ResponseMessage HandleSettingsGet(RequestMessage request)
    {
        if (request.Params is SettingsGetParams getParams && getParams.Key == "debug.dump")
        {
            var snapshot = new
            {
                engine = new
                {
                    version = _status.Version,
                    state = _status.State,
                    startedAtUtc = _status.StartedAtUtc,
                    uptimeSeconds = (DateTime.UtcNow - _status.StartedAtUtc).TotalSeconds
                }
            };

            return new ResponseMessage
            {
                Id = request.Id,
                Ok = true,
                Result = snapshot
            };
        }

        return new ResponseMessage
        {
            Id = request.Id,
            Ok = true,
            Result = new { value = (object?)null }
        };
    }

    private ResponseMessage HandleSettingsSet(RequestMessage request)
    {
        // Accept any settings for now; no-op implementation.
        return new ResponseMessage
        {
            Id = request.Id,
            Ok = true,
            Result = new { applied = true }
        };
    }

    private void HandleDictationStart(RequestMessage request, Action<IpcEnvelope> enqueue)
    {
        var modelPath = _config.AsrModelPath ?? EngineConfig.GetDefaultAsrModelPath();

        lock (_dictationLock)
        {
            if (_status.State == "dictating")
            {
                enqueue(new ResponseMessage
                {
                    Id = request.Id,
                    Ok = false,
                    Error = new IpcError { Code = "already_dictating", Message = "Dictation already in progress." }
                });
                return;
            }

            enqueue(new ResponseMessage { Id = request.Id, Ok = true, Result = new { started = true } });
            enqueue(new EventMessage { Event = IpcEvents.EngineState, Payload = new EngineStateEventPayload { State = "dictating" } });
            _status.State = "dictating";

            var cts = new CancellationTokenSource();
            _currentDictationCts = cts;
            _currentEnqueue = enqueue;

            var buffer = new AudioBuffer(samples =>
            {
                if (_currentEnqueue is null || _currentDictationCts is null) return;
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await _asrPipeline.ProcessChunkAsync(samples, enqueue, _currentDictationCts!.Token).ConfigureAwait(false);
                    }
                    catch (OperationCanceledException) { }
                }, _currentDictationCts.Token);
            });
            _currentBuffer = buffer;

            Action<short[], int, int> feedHandler = (s, sr, ch) => buffer.Feed(s, sr, ch);
            _currentFeedHandler = feedHandler;
            _audioInput.FrameCaptured += feedHandler;

            _ = Task.Run(async () =>
            {
                try
                {
                    if (!await AsrModelLoader.EnsureModelExistsAsync(modelPath, cts.Token).ConfigureAwait(false))
                    {
                        enqueue(new EventMessage { Event = IpcEvents.DictationError, Payload = new { code = "model_download_failed", message = "Could not download ASR model." } });
                        enqueue(new EventMessage { Event = IpcEvents.EngineState, Payload = new EngineStateEventPayload { State = "idle" } });
                        lock (_dictationLock)
                        {
                            _status.State = "idle";
                            cts.Cancel();
                            _currentDictationCts = null;
                            _currentBuffer = null;
                            _currentEnqueue = null;
                            if (_currentFeedHandler is not null) { _audioInput.FrameCaptured -= _currentFeedHandler; _currentFeedHandler = null; }
                        }
                        return;
                    }
                    _asrPipeline.EnsureModelLoaded();
                    await _audioInput.StartAsync(cts.Token).ConfigureAwait(false);
                }
                catch (Exception ex)
                {
                    _logger.Error("asr.lifecycle", "Dictation start failed", ex);
                    enqueue(new EventMessage { Event = IpcEvents.DictationError, Payload = new { code = "asr.error", message = ex.Message } });
                    enqueue(new EventMessage { Event = IpcEvents.EngineState, Payload = new EngineStateEventPayload { State = "idle" } });
                    lock (_dictationLock)
                    {
                        _status.State = "idle";
                        cts.Cancel();
                        _currentDictationCts = null;
                        _currentBuffer = null;
                        _currentEnqueue = null;
                        if (_currentFeedHandler is not null) { _audioInput.FrameCaptured -= _currentFeedHandler; _currentFeedHandler = null; }
                    }
                }
            }, CancellationToken.None);
        }
    }

    private void HandleDictationStop(RequestMessage request, Action<IpcEnvelope> enqueue)
    {
        CancellationTokenSource? cts;
        AudioBuffer? buffer;
        Action<short[], int, int>? feedHandler;

        lock (_dictationLock)
        {
            cts = _currentDictationCts;
            buffer = _currentBuffer;
            feedHandler = _currentFeedHandler;
            _currentDictationCts = null;
            _currentBuffer = null;
            _currentEnqueue = null;
            _currentFeedHandler = null;
        }

        if (cts is null)
        {
            enqueue(new EventMessage { Event = IpcEvents.EngineState, Payload = new EngineStateEventPayload { State = "idle" } });
            enqueue(new ResponseMessage { Id = request.Id, Ok = true, Result = new { stopped = true } });
            return;
        }

        cts.Cancel();
        _ = Task.Run(async () =>
        {
            try
            {
                if (feedHandler is not null) _audioInput.FrameCaptured -= feedHandler;
                await _audioInput.StopAsync().ConfigureAwait(false);
                buffer?.Stop();
                buffer?.Flush();
            }
            catch (Exception ex)
            {
                _logger.Error("asr.lifecycle", "Error stopping dictation", ex);
            }
            finally
            {
                lock (_dictationLock) { _status.State = "idle"; }
                enqueue(new EventMessage { Event = IpcEvents.EngineState, Payload = new EngineStateEventPayload { State = "idle" } });
                enqueue(new ResponseMessage { Id = request.Id, Ok = true, Result = new { stopped = true } });
            }
        }, CancellationToken.None);
    }

    private void HandleDictationCancel(RequestMessage request, Action<IpcEnvelope> enqueue)
    {
        CancellationTokenSource? cts;
        AudioBuffer? buffer;
        Action<short[], int, int>? feedHandler;

        lock (_dictationLock)
        {
            cts = _currentDictationCts;
            buffer = _currentBuffer;
            feedHandler = _currentFeedHandler;
            _currentDictationCts = null;
            _currentBuffer = null;
            _currentEnqueue = null;
            _currentFeedHandler = null;
        }

        if (cts is null)
        {
            enqueue(new EventMessage { Event = IpcEvents.EngineState, Payload = new EngineStateEventPayload { State = "idle" } });
            enqueue(new ResponseMessage { Id = request.Id, Ok = true, Result = new { cancelled = true } });
            return;
        }

        cts.Cancel();
        _ = Task.Run(async () =>
        {
            try
            {
                if (feedHandler is not null) _audioInput.FrameCaptured -= feedHandler;
                await _audioInput.StopAsync().ConfigureAwait(false);
                buffer?.Stop();
                buffer?.Flush();
            }
            catch (Exception ex)
            {
                _logger.Error("asr.lifecycle", "Error cancelling dictation", ex);
            }
            finally
            {
                lock (_dictationLock) { _status.State = "idle"; }
                enqueue(new EventMessage { Event = IpcEvents.EngineState, Payload = new EngineStateEventPayload { State = "idle" } });
                enqueue(new ResponseMessage { Id = request.Id, Ok = true, Result = new { cancelled = true } });
            }
        }, CancellationToken.None);
    }

    private async Task WriteEnvelopeAsync(TextWriter writer, IpcEnvelope envelope, CancellationToken cancellationToken)
    {
        var json = JsonSerializer.Serialize(envelope, envelope.GetType(), _serializerOptions);
        await writer.WriteLineAsync(json.AsMemory(), cancellationToken).ConfigureAwait(false);
    }
}

internal sealed class EngineStatusSnapshot
{
    public string Version { get; set; } = "0.1.0";
    public string State { get; set; } = "idle";
    public DateTime StartedAtUtc { get; set; } = DateTime.UtcNow;
}

internal sealed class JsonFileLogger
{
    private readonly object _lock = new();
    private readonly string _logDirectory;

    public JsonFileLogger()
    {
        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        _logDirectory = Path.Combine(localAppData, "Orbspeak", "logs", "v1");
        Directory.CreateDirectory(_logDirectory);
    }

    private string GetLogFilePath()
    {
        var date = DateTime.UtcNow.ToString("yyyyMMdd");
        return Path.Combine(_logDirectory, $"engine-{date}.log");
    }

    public void Info(string component, string message, string? requestId = null)
        => Write("info", component, message, requestId, null);

    public void Error(string component, string message, Exception ex, string? requestId = null)
        => Write("error", component, message, requestId, ex);

    private void Write(string level, string component, string message, string? requestId, Exception? ex)
    {
        var payload = new Dictionary<string, object?>
        {
            ["ts"] = DateTime.UtcNow.ToString("o"),
            ["level"] = level,
            ["component"] = component,
            ["message"] = message
        };

        if (!string.IsNullOrWhiteSpace(requestId))
        {
            payload["requestId"] = requestId;
        }

        if (ex is not null)
        {
            payload["exception"] = new
            {
                type = ex.GetType().FullName,
                ex.Message,
                ex.StackTrace
            };
        }

        var line = JsonSerializer.Serialize(payload);

        lock (_lock)
        {
            File.AppendAllText(GetLogFilePath(), line + Environment.NewLine, Encoding.UTF8);
        }
    }
}

