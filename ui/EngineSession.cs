using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using Orbspeak.Shared;

namespace Orbspeak.Ui;

/// <summary>
/// Long-lived connection to the Orbspeak Engine over a named pipe. Spawns the Engine if not running.
/// Dispatches responses to pending requests and raises events for dictation.partial, dictation.final, engine.state, dictation.error.
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

    /// <summary>
    /// Connect to the Engine. If the pipe is not available, spawns Orbspeak.Engine.exe and retries.
    /// </summary>
    public async Task ConnectAsync(CancellationToken cancellationToken = default)
    {
        var enginePath = Path.Combine(AppContext.BaseDirectory, EngineExeName);

        for (var attempt = 0; attempt < 2; attempt++)
        {
            try
            {
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                using var linked = CancellationTokenSource.CreateLinkedTokenSource(cts.Token, cancellationToken);
                var client = new NamedPipeClientStream(".", PipeName, PipeDirection.InOut, PipeOptions.Asynchronous);
                await client.ConnectAsync(linked.Token).ConfigureAwait(false);

                _stream = client;
                _reader = new StreamReader(_stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: false, bufferSize: 4096, leaveOpen: true);
                _writer = new StreamWriter(_stream, new UTF8Encoding(false), 4096, leaveOpen: true) { AutoFlush = true };

                _readCts = new CancellationTokenSource();
                _readTask = Task.Run(() => ReadLoop(_readCts.Token), _readCts.Token);
                return;
            }
            catch (TimeoutException) when (attempt == 0 && File.Exists(enginePath))
            {
                try
                {
                    var start = new ProcessStartInfo
                    {
                        FileName = enginePath,
                        UseShellExecute = false,
                        WorkingDirectory = Path.GetDirectoryName(enginePath) ?? "."
                    };
                    Process.Start(start);
                }
                catch
                {
                    throw new InvalidOperationException("Could not start Orbspeak Engine.");
                }
                await Task.Delay(2500, cancellationToken).ConfigureAwait(false);
            }
        }

        throw new InvalidOperationException("Could not connect to Orbspeak Engine.");
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
