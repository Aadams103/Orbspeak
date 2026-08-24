using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using System.Threading.Channels;
using Orbspeak.Engine.Artwork;
using Orbspeak.Engine.Asr;
using Orbspeak.Engine.Studio;
using Orbspeak.Engine.Tts;
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
    private readonly OpenAiAsrPipeline _openAiAsr;
    private readonly TtsService _tts;
    private readonly GrokImageClient _artwork;
    private readonly EngineStatusSnapshot _status = new();
    private CancellationTokenSource? _ttsCts;
    private readonly object _dictationLock = new();

    private CancellationTokenSource? _currentDictationCts;
    private AudioBuffer? _currentBuffer;
    private Action<IpcEnvelope>? _currentEnqueue;
    private Action<short[], int, int>? _currentFeedHandler;
    private bool _sessionUsesOpenAi;

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
        _openAiAsr = new OpenAiAsrPipeline(config, logger);
        _tts = new TtsService(config, logger);
        _artwork = new GrokImageClient();
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
            // Ownership of the stream transfers to HandleClientAsync, which disposes it.
            // Disposing here (e.g. via `using`) would kill the pipe while the client session is live.
            var server = new NamedPipeServerStream(
                _pipeName,
                PipeDirection.InOut,
                NamedPipeServerStream.MaxAllowedServerInstances,
                PipeTransmissionMode.Byte,
                PipeOptions.Asynchronous);

            _logger.Info("ipc.server", "Waiting for client connection");

            try
            {
                await server.WaitForConnectionAsync(cancellationToken).ConfigureAwait(false);
            }
            catch
            {
                await server.DisposeAsync().ConfigureAwait(false);
                throw;
            }

            _logger.Info("ipc.server", "Client connected");

            _ = HandleClientSafeAsync(server, cancellationToken);
        }
    }

    private async Task HandleClientSafeAsync(NamedPipeServerStream server, CancellationToken cancellationToken)
    {
        try
        {
            await HandleClientAsync(server, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            _logger.Error("ipc.server", "Client session ended with error", ex);
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
                case IpcMethods.TtsSpeak:
                    HandleTtsSpeak(request, enqueue);
                    break;
                case IpcMethods.TtsVoices:
                    _ = Task.Run(async () =>
                    {
                        try
                        {
                            enqueue(await HandleTtsVoicesAsync(request).ConfigureAwait(false));
                        }
                        catch (Exception ex)
                        {
                            _logger.Error("tts.voices", "tts.voices failed", ex, request.Id);
                            enqueue(Fail(request.Id, "tts.voices_failed", ex.Message));
                        }
                    });
                    break;
                case IpcMethods.StudioImport:
                case IpcMethods.StudioList:
                case IpcMethods.StudioGet:
                case IpcMethods.StudioExportAudio:
                case IpcMethods.StudioSaveStyle:
                case IpcMethods.StudioGetStyle:
                case IpcMethods.ArtworkGenerate:
                    _ = Task.Run(async () =>
                    {
                        try
                        {
                            enqueue(await HandleStudioAsync(request).ConfigureAwait(false));
                        }
                        catch (Exception ex)
                        {
                            _logger.Error("studio", "Studio request failed", ex, request.Id);
                            enqueue(new ResponseMessage
                            {
                                Id = request.Id,
                                Ok = false,
                                Error = new IpcError { Code = "studio.error", Message = ex.Message }
                            });
                        }
                    });
                    break;
                case IpcMethods.TtsPause:
                {
                    var paused = _tts.Pause();
                    enqueue(new ResponseMessage { Id = request.Id, Ok = true, Result = new { paused } });
                    if (paused)
                    {
                        enqueue(new EventMessage
                        {
                            Event = IpcEvents.TtsState,
                            Payload = new
                            {
                                state = PlaybackStateIds.Paused,
                                sessionId = _tts.CurrentSessionId
                            }
                        });
                    }

                    break;
                }
                case IpcMethods.TtsResume:
                {
                    var resumed = _tts.Resume();
                    enqueue(new ResponseMessage { Id = request.Id, Ok = true, Result = new { resumed } });
                    if (resumed)
                    {
                        enqueue(new EventMessage
                        {
                            Event = IpcEvents.TtsState,
                            Payload = new
                            {
                                state = PlaybackStateIds.Playing,
                                sessionId = _tts.CurrentSessionId
                            }
                        });
                    }

                    break;
                }
                case IpcMethods.TtsStop:
                    _ttsCts?.Cancel();
                    _tts.Stop();
                    if (_status.State == "speaking")
                    {
                        _status.State = "idle";
                    }
                    enqueue(new ResponseMessage { Id = request.Id, Ok = true, Result = new { stopped = true } });
                    enqueue(new EventMessage { Event = IpcEvents.TtsState, Payload = new { state = "stopped" } });
                    enqueue(new EventMessage { Event = IpcEvents.EngineState, Payload = new EngineStateEventPayload { State = "idle" } });
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
        var key = ReadStringParam(request.Params, "key");
        if (key == "debug.dump")
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

        if (key == "audio.providers")
        {
            return new ResponseMessage
            {
                Id = request.Id,
                Ok = true,
                Result = new
                {
                    asr = new[]
                    {
                        new { id = "local", label = "Whisper.net (on device)", cost = "free" },
                        new { id = "openai", label = "OpenAI Whisper / gpt-4o-transcribe", cost = "paid-api" }
                    },
                    tts = new[]
                    {
                        new { id = TtsProviderIds.Qwen3, label = "Qwen3-TTS sidecar", cost = "free-local-weights" },
                        new { id = TtsProviderIds.OpenAi, label = "OpenAI TTS", cost = "paid-api" }
                    },
                    active = new
                    {
                        asr = _config.UsesOpenAiAsr ? "openai" : "local",
                        tts = _config.TtsProvider,
                        openaiKeyConfigured = SecretStore.GetOpenAiApiKey() is not null,
                        xaiKeyConfigured = SecretStore.GetXaiApiKey() is not null
                    }
                }
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
        if (request.Params is JsonElement root &&
            root.ValueKind == JsonValueKind.Object &&
            root.TryGetProperty("values", out var values) &&
            values.ValueKind == JsonValueKind.Object)
        {
            if (values.TryGetProperty("asrProvider", out var asr) && asr.ValueKind == JsonValueKind.String)
            {
                _config.AsrProvider = asr.GetString() ?? _config.AsrProvider;
            }

            if (values.TryGetProperty("ttsProvider", out var tts) && tts.ValueKind == JsonValueKind.String)
            {
                var requested = tts.GetString();
                if (!TtsProviderIds.TryParse(requested, out var kind))
                {
                    return Fail(request.Id, "tts.invalid_provider",
                        $"Unknown TTS provider '{requested}'. Supported providers: {string.Join(", ", TtsProviderIds.All)}.");
                }

                _config.TtsProvider = TtsProviderIds.ToId(kind);
            }

            if (values.TryGetProperty("openaiAsrModel", out var asrModel) && asrModel.ValueKind == JsonValueKind.String)
            {
                _config.OpenAiAsrModel = asrModel.GetString() ?? _config.OpenAiAsrModel;
            }

            if (values.TryGetProperty("openaiApiKey", out var apiKey) && apiKey.ValueKind == JsonValueKind.String)
            {
                SecretStore.SetOpenAiApiKey(apiKey.GetString());
            }

            if (values.TryGetProperty("xaiApiKey", out var xaiKey) && xaiKey.ValueKind == JsonValueKind.String)
            {
                SecretStore.SetXaiApiKey(xaiKey.GetString());
            }

            if (values.TryGetProperty("qwenSpeaker", out var speaker) && speaker.ValueKind == JsonValueKind.String)
            {
                _config.QwenSpeaker = speaker.GetString() ?? _config.QwenSpeaker;
            }

            if (values.TryGetProperty("qwenInstruct", out var instruct) && instruct.ValueKind == JsonValueKind.String)
            {
                _config.QwenInstruct = instruct.GetString();
            }

            _config.Save();
        }

        return new ResponseMessage
        {
            Id = request.Id,
            Ok = true,
            Result = new { applied = true }
        };
    }

    private void HandleTtsSpeak(RequestMessage request, Action<IpcEnvelope> enqueue)
    {
        StudioSpeechRequest speechRequest;
        ResolvedSpeechJob job;
        try
        {
            speechRequest = ReadSpeechRequest(request.Params, requireText: true);
            job = _tts.Resolve(speechRequest);
        }
        catch (TtsValidationException ex)
        {
            enqueue(new ResponseMessage
            {
                Id = request.Id,
                Ok = false,
                Error = new IpcError { Code = ex.Code, Message = ex.Message }
            });
            return;
        }

        enqueue(new ResponseMessage
        {
            Id = request.Id,
            Ok = true,
            Result = new
            {
                started = true,
                sessionId = (string?)null,
                provider = job.ProviderId,
                voiceId = job.VoiceId,
                rate = job.Rate,
                instructionApplied = job.InstructionApplied,
                instructionUnavailableReason = job.InstructionUnavailableReason
            }
        });
        _status.State = "speaking";
        _ttsCts?.Cancel();
        _ttsCts = new CancellationTokenSource();
        var token = _ttsCts.Token;
        _ = Task.Run(async () =>
        {
            try
            {
                await _tts.SpeakAsync(speechRequest, enqueue, token).ConfigureAwait(false);
                if (_status.State == "speaking")
                {
                    _status.State = "idle";
                }
            }
            catch (OperationCanceledException)
            {
                // Stopped by the user.
            }
            catch (Exception ex)
            {
                _logger.Error("tts.lifecycle", "tts.speak failed", ex);
                if (_status.State == "speaking")
                {
                    _status.State = "idle";
                }
            }
        }, CancellationToken.None);
    }

    private async Task<ResponseMessage> HandleTtsVoicesAsync(RequestMessage request)
    {
        IReadOnlyList<string>? live = null;
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
            var url = (_config.QwenSidecarUrl ?? "http://127.0.0.1:8765").TrimEnd('/') + "/voices";
            using var response = await http.GetAsync(url).ConfigureAwait(false);
            if (response.IsSuccessStatusCode)
            {
                await using var stream = await response.Content.ReadAsStreamAsync().ConfigureAwait(false);
                using var doc = await JsonDocument.ParseAsync(stream).ConfigureAwait(false);
                if (doc.RootElement.TryGetProperty("speakers", out var speakers) &&
                    speakers.ValueKind == JsonValueKind.Array)
                {
                    live = speakers.EnumerateArray()
                        .Select(item => item.GetString())
                        .Where(item => !string.IsNullOrWhiteSpace(item))
                        .Select(item => item!)
                        .ToArray();
                }
            }
        }
        catch
        {
            // Sidecar is optional; the static catalog still lets Studio validate voices.
        }

        return new ResponseMessage
        {
            Id = request.Id,
            Ok = true,
            Result = new
            {
                providers = TtsProviderIds.All,
                qwen3 = TtsVoiceCatalog.MergeQwenSpeakers(live),
                openai = TtsVoiceCatalog.OpenAiVoices,
                active = TtsProviderIds.TryParse(_config.TtsProvider, out var active)
                    ? TtsProviderIds.ToId(active)
                    : TtsProviderIds.Qwen3
            }
        };
    }

    private async Task<ResponseMessage> HandleStudioAsync(RequestMessage request)
    {
        var profileId = ReadStringParam(request.Params, "profileId") ?? "default";
        switch (request.Method)
        {
            case IpcMethods.StudioImport:
            {
                var fileName = ReadStringParam(request.Params, "fileName") ?? "document.txt";
                var b64 = ReadStringParam(request.Params, "contentBase64");
                if (string.IsNullOrWhiteSpace(b64))
                {
                    return Fail(request.Id, "studio.missing_file", "contentBase64 is required.");
                }

                var bytes = Convert.FromBase64String(b64);
                var mime = ReadStringParam(request.Params, "mimeType");
                var doc = StudioLibrary.Import(profileId, fileName, bytes, mime);
                return new ResponseMessage { Id = request.Id, Ok = true, Result = doc };
            }
            case IpcMethods.StudioList:
                return new ResponseMessage { Id = request.Id, Ok = true, Result = new { documents = StudioLibrary.List(profileId) } };
            case IpcMethods.StudioGet:
            {
                var docId = ReadStringParam(request.Params, "docId");
                if (string.IsNullOrWhiteSpace(docId))
                {
                    return Fail(request.Id, "studio.missing_doc", "docId is required.");
                }

                var doc = StudioLibrary.Get(profileId, docId);
                if (doc is null)
                {
                    return Fail(request.Id, "studio.not_found", "Document was not found.");
                }

                return new ResponseMessage { Id = request.Id, Ok = true, Result = doc };
            }
            case IpcMethods.StudioExportAudio:
            {
                var docId = ReadStringParam(request.Params, "docId");
                if (string.IsNullOrWhiteSpace(docId))
                {
                    return Fail(request.Id, "studio.missing_doc", "docId is required.");
                }

                var payload = StudioLibrary.Get(profileId, docId);
                if (payload is null)
                {
                    return Fail(request.Id, "studio.not_found", "Document was not found.");
                }

                var style = StudioLibrary.LoadStyle(profileId);
                var raw = ReadStringParamFromObject(payload, "text") ?? "";
                StudioSpeechRequest speechRequest;
                try
                {
                    speechRequest = ReadSpeechRequest(request.Params, requireText: false);
                    speechRequest = new StudioSpeechRequest
                    {
                        Text = raw,
                        Provider = speechRequest.Provider ?? style.TtsProvider,
                        VoiceId = speechRequest.VoiceId ?? style.TtsVoice,
                        Rate = speechRequest.Rate ?? style.TtsRate,
                        Instruct = speechRequest.Instruct ?? style.Instruct,
                        StyleMarkdown = speechRequest.StyleMarkdown ?? style.StyleMarkdown,
                        PronunciationCsv = speechRequest.PronunciationCsv ?? style.PronunciationCsv
                    };
                }
                catch (TtsValidationException ex)
                {
                    return Fail(request.Id, ex.Code, ex.Message);
                }

                var overwritten = StudioLibrary.VoiceoverExists(profileId, docId);
                StudioExportResult exported;
                try
                {
                    exported = await _tts.ExportAsync(speechRequest, CancellationToken.None).ConfigureAwait(false);
                }
                catch (TtsValidationException ex)
                {
                    return Fail(request.Id, ex.Code, ex.Message);
                }
                var settings = exported.Job.ToSettings();
                var path = StudioLibrary.SaveVoiceover(profileId, docId, exported.Wav, new
                {
                    provider = settings.Provider,
                    voiceId = settings.VoiceId,
                    rate = settings.Rate,
                    instruct = speechRequest.Instruct,
                    styleMarkdown = speechRequest.StyleMarkdown,
                    performanceInstruct = settings.PerformanceInstruct,
                    instructionApplied = settings.InstructionApplied,
                    instructionUnavailableReason = settings.InstructionUnavailableReason,
                    applyEngineTempo = settings.ApplyEngineTempo,
                    sentenceCount = exported.Job.Sentences.Count,
                    bytes = exported.Wav.Length,
                    overwritten,
                    createdAt = DateTime.UtcNow.ToString("o")
                });
                return new ResponseMessage
                {
                    Id = request.Id,
                    Ok = true,
                    Result = new
                    {
                        path,
                        bytes = exported.Wav.Length,
                        dataUrl = "data:audio/wav;base64," + Convert.ToBase64String(exported.Wav),
                        overwritten,
                        settings
                    }
                };
            }
            case IpcMethods.StudioSaveStyle:
            {
                var current = StudioLibrary.LoadStyle(profileId);
                current.StyleMarkdown = ReadStringParam(request.Params, "styleMarkdown") ?? current.StyleMarkdown;
                current.PronunciationCsv = ReadStringParam(request.Params, "pronunciationCsv") ?? current.PronunciationCsv;
                current.Instruct = ReadStringParam(request.Params, "instruct") ?? current.Instruct;
                current.TtsVoice = ReadStringParam(request.Params, "ttsVoice") ?? current.TtsVoice;
                current.TtsProvider = ReadStringParam(request.Params, "ttsProvider") ?? current.TtsProvider;
                current.ArtworkStyle = ReadStringParam(request.Params, "artworkStyle") ?? current.ArtworkStyle;
                var rate = ReadDoubleParam(request.Params, "ttsRate");
                if (rate is not null)
                {
                    current.TtsRate = rate.Value;
                }

                StudioProfileStyle saved;
                try
                {
                    saved = StudioLibrary.SaveStyle(profileId, StudioLibrary.NormalizeStyle(current));
                }
                catch (TtsValidationException ex)
                {
                    return Fail(request.Id, ex.Code, ex.Message);
                }

                var provider = TtsProviderIds.ParseRequired(saved.TtsProvider);
                if (provider == TtsProviderKind.Qwen3)
                {
                    _config.QwenSpeaker = saved.TtsVoice;
                    _config.QwenInstruct = saved.Instruct;
                }
                else
                {
                    _config.OpenAiTtsVoice = saved.TtsVoice;
                }

                _config.TtsProvider = saved.TtsProvider;
                _config.Save();
                return new ResponseMessage { Id = request.Id, Ok = true, Result = saved };
            }
            case IpcMethods.StudioGetStyle:
                return new ResponseMessage { Id = request.Id, Ok = true, Result = StudioLibrary.LoadStyle(profileId) };
            case IpcMethods.ArtworkGenerate:
            {
                var docId = ReadStringParam(request.Params, "docId");
                var prompt = ReadStringParam(request.Params, "prompt");
                if (string.IsNullOrWhiteSpace(docId) || string.IsNullOrWhiteSpace(prompt))
                {
                    return Fail(request.Id, "artwork.missing", "docId and prompt are required.");
                }

                var kind = ReadStringParam(request.Params, "kind") ?? "cover";
                var style = StudioLibrary.LoadStyle(profileId);
                var png = await _artwork.GenerateAsync(prompt, style.ArtworkStyle, CancellationToken.None).ConfigureAwait(false);
                var path = StudioLibrary.SaveArtwork(profileId, docId, kind, png);
                return new ResponseMessage
                {
                    Id = request.Id,
                    Ok = true,
                    Result = new
                    {
                        path,
                        kind,
                        dataUrl = "data:image/png;base64," + Convert.ToBase64String(png)
                    }
                };
            }
            default:
                return Fail(request.Id, "method.not_implemented", $"Method '{request.Method}' is not implemented.");
        }
    }

    private static ResponseMessage Fail(string id, string code, string message) =>
        new()
        {
            Id = id,
            Ok = false,
            Error = new IpcError { Code = code, Message = message }
        };

    private StudioSpeechRequest ReadSpeechRequest(object? raw, bool requireText)
    {
        var text = ReadStringParam(raw, "text") ?? string.Empty;
        if (requireText && string.IsNullOrWhiteSpace(text))
        {
            throw new TtsValidationException("tts.missing_text", "tts.speak requires text.");
        }

        return new StudioSpeechRequest
        {
            Text = text,
            Provider = ReadStringParam(raw, "provider"),
            VoiceId = ReadStringParam(raw, "voiceId"),
            Rate = ReadDoubleParam(raw, "rate"),
            Instruct = ReadStringParam(raw, "instruct"),
            StyleMarkdown = ReadStringParam(raw, "styleMarkdown"),
            PronunciationCsv = ReadStringParam(raw, "pronunciationCsv")
        };
    }

    private static string? ReadStringParamFromObject(object payload, string name)
    {
        var json = JsonSerializer.Serialize(payload);
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.TryGetProperty(name, out var prop) && prop.ValueKind == JsonValueKind.String
            ? prop.GetString()
            : null;
    }

    private static string? ReadStringParam(object? raw, string name)
    {
        if (raw is JsonElement el &&
            el.ValueKind == JsonValueKind.Object &&
            el.TryGetProperty(name, out var prop) &&
            prop.ValueKind == JsonValueKind.String)
        {
            return prop.GetString();
        }

        return null;
    }

    private static double? ReadDoubleParam(object? raw, string name)
    {
        if (raw is JsonElement el &&
            el.ValueKind == JsonValueKind.Object &&
            el.TryGetProperty(name, out var prop))
        {
            if (prop.ValueKind == JsonValueKind.Number && prop.TryGetDouble(out var n))
            {
                return n;
            }

            if (prop.ValueKind == JsonValueKind.String && double.TryParse(prop.GetString(), out var parsed))
            {
                return parsed;
            }
        }

        return null;
    }

    private void HandleDictationStart(RequestMessage request, Action<IpcEnvelope> enqueue)
    {
        var modelPath = _config.AsrModelPath ?? EngineConfig.GetDefaultAsrModelPath();
        var useOpenAi = _config.UsesOpenAiAsr;

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

            enqueue(new ResponseMessage { Id = request.Id, Ok = true, Result = new { started = true, provider = useOpenAi ? "openai" : "local" } });
            enqueue(new EventMessage { Event = IpcEvents.EngineState, Payload = new EngineStateEventPayload { State = "dictating" } });
            _status.State = "dictating";
            _sessionUsesOpenAi = useOpenAi;
            _openAiAsr.Reset();

            var cts = new CancellationTokenSource();
            _currentDictationCts = cts;
            _currentEnqueue = enqueue;

            var buffer = new AudioBuffer(samples =>
            {
                if (useOpenAi)
                {
                    _openAiAsr.Append(samples);
                    return;
                }

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
                    if (useOpenAi)
                    {
                        if (SecretStore.GetOpenAiApiKey() is null)
                        {
                            throw new InvalidOperationException("Set OPENAI_API_KEY or save it under %LOCALAPPDATA%\\Orbspeak\\config\\secrets.json.");
                        }

                        await _audioInput.StartAsync(cts.Token).ConfigureAwait(false);
                        return;
                    }

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
                            _sessionUsesOpenAi = false;
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
                        _sessionUsesOpenAi = false;
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
        var useOpenAi = false;

        lock (_dictationLock)
        {
            cts = _currentDictationCts;
            buffer = _currentBuffer;
            feedHandler = _currentFeedHandler;
            useOpenAi = _sessionUsesOpenAi;
            _currentDictationCts = null;
            _currentBuffer = null;
            _currentEnqueue = null;
            _currentFeedHandler = null;
            _sessionUsesOpenAi = false;
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
                if (useOpenAi)
                {
                    await _openAiAsr.TranscribeAndEnqueueAsync(enqueue, CancellationToken.None).ConfigureAwait(false);
                }
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
            _sessionUsesOpenAi = false;
            _openAiAsr.Reset();
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

