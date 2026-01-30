using System.Diagnostics;
using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using Orbspeak.Shared;
using Xunit;

namespace Orbspeak.Tests;

public class EngineIpcTests
{
    private const string PipeName = "orbspeak-engine-v1";

    private static string? GetEngineExePath()
    {
        var baseDir = AppContext.BaseDirectory;
        var candidates = new[]
        {
            Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", "..", "engine", "bin", "Debug", "net8.0", "Orbspeak.Engine.exe")),
            Path.GetFullPath(Path.Combine(baseDir, "..", "..", "..", "..", "engine", "bin", "Release", "net8.0", "Orbspeak.Engine.exe")),
        };
        return candidates.FirstOrDefault(File.Exists);
    }

    [Fact]
    public async Task EnginePing_ReturnsOkResponse()
    {
        var enginePath = GetEngineExePath();
        if (enginePath is null)
        {
            return; // Engine not built; skip
        }

        Process? proc = null;
        try
        {
            proc = Process.Start(new ProcessStartInfo
            {
                FileName = enginePath,
                UseShellExecute = false,
                WorkingDirectory = Path.GetDirectoryName(enginePath) ?? ".",
            });
            if (proc is null)
            {
                return;
            }
            await Task.Delay(2500).ConfigureAwait(false);

            using var client = new NamedPipeClientStream(".", PipeName, PipeDirection.InOut, PipeOptions.Asynchronous);
            await client.ConnectAsync(5000).ConfigureAwait(false);

            await using var stream = client;
            using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: false, bufferSize: 4096, leaveOpen: true);
            await using var writer = new StreamWriter(stream, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false), 4096, leaveOpen: true) { AutoFlush = true };

            _ = await reader.ReadLineAsync().ConfigureAwait(false);

            var request = new RequestMessage { Method = IpcMethods.EnginePing, Params = null };
            var options = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
            var json = JsonSerializer.Serialize(request, options);
            await writer.WriteLineAsync(json).ConfigureAwait(false);

            var line = await reader.ReadLineAsync().ConfigureAwait(false);
            Assert.False(string.IsNullOrWhiteSpace(line));

            var response = JsonSerializer.Deserialize<ResponseMessage>(line!, options);
            Assert.NotNull(response);
            Assert.True(response!.Ok);
        }
        finally
        {
            try { proc?.Kill(entireProcessTree: true); } catch { }
        }
    }

    [Fact]
    public async Task DictationStart_ReceivesResponseAndEngineState()
    {
        var enginePath = GetEngineExePath();
        if (enginePath is null)
        {
            return;
        }

        Process? proc = null;
        try
        {
            proc = Process.Start(new ProcessStartInfo
            {
                FileName = enginePath,
                UseShellExecute = false,
                WorkingDirectory = Path.GetDirectoryName(enginePath) ?? ".",
            });
            if (proc is null) return;
            await Task.Delay(2500).ConfigureAwait(false);

            using var client = new NamedPipeClientStream(".", PipeName, PipeDirection.InOut, PipeOptions.Asynchronous);
            await client.ConnectAsync(5000).ConfigureAwait(false);

            await using var stream = client;
            using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: false, bufferSize: 4096, leaveOpen: true);
            await using var writer = new StreamWriter(stream, new UTF8Encoding(encoderShouldEmitUTF8Identifier: false), 4096, leaveOpen: true) { AutoFlush = true };

            _ = await reader.ReadLineAsync().ConfigureAwait(false);

            var options = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
            var request = new RequestMessage { Method = IpcMethods.DictationStart, Params = new DictationStartParams { ProfileId = "default", Mode = "default" } };
            await writer.WriteLineAsync(JsonSerializer.Serialize(request, options)).ConfigureAwait(false);

            ResponseMessage? response = null;
            string? seenEvent = null;
            var deadline = DateTime.UtcNow.AddSeconds(30);

            while (DateTime.UtcNow < deadline)
            {
                var line = await reader.ReadLineAsync().ConfigureAwait(false);
                if (string.IsNullOrWhiteSpace(line)) continue;

                using var doc = JsonDocument.Parse(line);
                var root = doc.RootElement;
                if (!root.TryGetProperty("type", out var typeProp)) continue;

                var type = typeProp.GetString();
                if (type == "response")
                {
                    response = JsonSerializer.Deserialize<ResponseMessage>(line, options);
                    continue;
                }
                if (type == "event" && root.TryGetProperty("event", out var evtProp))
                {
                    var evt = evtProp.GetString();
                    if (evt is IpcEvents.DictationPartial or IpcEvents.DictationFinal or IpcEvents.DictationError)
                    {
                        seenEvent = evt;
                        break;
                    }
                }
            }

            Assert.NotNull(response);
            Assert.True(response!.Ok);
            Assert.NotNull(seenEvent);
        }
        finally
        {
            try { proc?.Kill(entireProcessTree: true); } catch { }
        }
    }
}
