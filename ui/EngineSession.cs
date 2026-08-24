using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using Orbspeak.Shared;

namespace Orbspeak.Ui;

/// <summary>
/// Long-lived connection to the Orbspeak Engine over a named pipe. Spawns the Engine if not running.
/// </summary>
public sealed class EngineSession
{
    private const string PipeName = "orbspeak-engine-v1";
    private const string EngineExeName = "Orbspeak.Engine.exe";

    private readonly JsonSerializerOptions _serializer = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    private Stream? _stream;
    private StreamReader? _reader;
    private StreamWriter? _writer;
    private Task? _readTask;
    private CancellationTokenSource? _readCts;
    private readonly ConcurrentDictionary<string, TaskCompletionSource<ResponseMessage>> _pending = new();

    public event Action<JsonElement>? Partial;
    public event Action<JsonElement>? Final;
    public event Action<JsonElement>? State;
    public event Action<JsonElement>? Error;
    public event Action<JsonElement>? TtsState;
    public event Action<JsonElement>? TtsProgress;

    private static string ResolveEnginePath()
    {
        // Packaged layout keeps the engine (with its own runtime) in engine\ so the
        // two self-contained publishes never overwrite each other's assemblies.
        var baseDir = AppContext.BaseDirectory;
        var nested = Path.Combine(baseDir, "engine", EngineExeName);
        return File.Exists(nested) ? nested : Path.Combine(baseDir, EngineExeName);
    }

    public async Task ConnectAsync(CancellationToken cancellationToken = default)
    {
        var enginePath = ResolveEnginePath();
        var spawnedEngine = false;
        var deadline = DateTime.UtcNow.AddSeconds(20);

        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var client = new NamedPipeClientStream(".", PipeName, PipeDirection.InOut, PipeOptions.Asynchronous);
            try
            {
                // ConnectAsync surfaces a timeout as OperationCanceledException, not TimeoutException.
                using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                timeout.CancelAfter(TimeSpan.FromSeconds(2));
                await client.ConnectAsync(timeout.Token).ConfigureAwait(false);

                _stream = client;
                _reader = new StreamReader(_stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: false, bufferSize: 4096, leaveOpen: true);
                _writer = new StreamWriter(_stream, new UTF8Encoding(false), 4096, leaveOpen: true) { AutoFlush = true };

                _readCts = new CancellationTokenSource();
                _readTask = Task.Run(() => ReadLoop(_readCts.Token), _readCts.Token);
                return;
            }
            catch (Exception ex) when (ex is OperationCanceledException or TimeoutException or IOException)
            {
                client.Dispose();
                cancellationToken.ThrowIfCancellationRequested();

                if (!spawnedEngine)
                {
                    spawnedEngine = true;
                    if (!File.Exists(enginePath))
                    {
                        throw new InvalidOperationException($"Orbspeak Engine not found at {enginePath}.");
                    }

                    try
                    {
                        Process.Start(new ProcessStartInfo
                        {
                            FileName = enginePath,
                            UseShellExecute = false,
                            CreateNoWindow = true,
                            WorkingDirectory = Path.GetDirectoryName(enginePath) ?? "."
                        });
                    }
                    catch (Exception spawnEx)
                    {
                        throw new InvalidOperationException($"Could not start Orbspeak Engine: {spawnEx.Message}", spawnEx);
                    }
                }
                else if (DateTime.UtcNow >= deadline)
                {
                    throw new InvalidOperationException("Could not connect to Orbspeak Engine within 20 seconds.");
                }

                await Task.Delay(400, cancellationToken).ConfigureAwait(false);
            }
        }
    }

    public async Task<ResponseMessage> SendRequestAsync(string method, object? parameters, CancellationToken cancellationToken = default)
    {
        if (_writer is null || _reader is null)
        {
            throw new InvalidOperationException("Not connected. Call ConnectAsync first.");
        }

        var id = Guid.NewGuid().ToString();
        var request = new RequestMessage { Id = id, Method = method, Params = parameters };
        var tcs = new TaskCompletionSource<ResponseMessage>(TaskCreationOptions.RunContinuationsAsynchronously);
        _pending[id] = tcs;

        try
        {
            var json = JsonSerializer.Serialize(request, _serializer);
            await _writer.WriteLineAsync(json.AsMemory(), cancellationToken).ConfigureAwait(false);
            return await tcs.Task.WaitAsync(cancellationToken).ConfigureAwait(false);
        }
        finally
        {
            _pending.TryRemove(id, out _);
        }
    }

    public Task<ResponseMessage> StartDictationAsync(string profileId = "default", string mode = "default", CancellationToken cancellationToken = default)
    {
        return SendRequestAsync(IpcMethods.DictationStart, new DictationStartParams { ProfileId = profileId, Mode = mode }, cancellationToken);
    }

    public Task<ResponseMessage> StopDictationAsync(CancellationToken cancellationToken = default)
    {
        return SendRequestAsync(IpcMethods.DictationStop, null, cancellationToken);
    }

    private void ReadLoop(CancellationToken cancellationToken)
    {
        if (_reader is null) return;

        string? line;
        try
        {
            while (!cancellationToken.IsCancellationRequested && (line = _reader.ReadLine()) != null)
            {
                if (string.IsNullOrWhiteSpace(line)) continue;

                try
                {
                    using var doc = JsonDocument.Parse(line);
                    var root = doc.RootElement;
                    if (!root.TryGetProperty("type", out var typeProp)) continue;

                    var type = typeProp.GetString();
                    if (type == "response")
                    {
                        var response = JsonSerializer.Deserialize<ResponseMessage>(line, _serializer);
                        if (response is { } r && _pending.TryRemove(r.Id, out var tcs))
                        {
                            tcs.TrySetResult(r);
                        }
                    }
                    else if (type == "event" && root.TryGetProperty("event", out var evtProp) && root.TryGetProperty("payload", out var payload))
                    {
                        var evt = evtProp.GetString();
                        switch (evt)
                        {
                            case IpcEvents.DictationPartial:
                                Partial?.Invoke(payload);
                                break;
                            case IpcEvents.DictationFinal:
                                Final?.Invoke(payload);
                                break;
                            case IpcEvents.EngineState:
                                State?.Invoke(payload);
                                break;
                            case IpcEvents.DictationError:
                                Error?.Invoke(payload);
                                break;
                            case IpcEvents.TtsState:
                                TtsState?.Invoke(payload);
                                break;
                            case IpcEvents.TtsProgress:
                                TtsProgress?.Invoke(payload);
                                break;
                        }
                    }
                }
                catch (JsonException) { /* ignore */ }
            }
        }
        catch (Exception) { /* disconnect */ }
        finally
        {
            foreach (var tcs in _pending.Values)
            {
                tcs.TrySetCanceled();
            }
            _pending.Clear();
        }
    }

    public void Disconnect()
    {
        _readCts?.Cancel();
        _readTask = null;
        _reader?.Dispose();
        _reader = null;
        _writer?.Dispose();
        _writer = null;
        _stream?.Dispose();
        _stream = null;
    }
}
