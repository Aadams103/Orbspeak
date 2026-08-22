using System.Net.Http.Headers;
using System.Text.Json;
using Orbspeak.Shared;

namespace Orbspeak.Engine.Asr;

/// <summary>
/// Cloud ASR using OpenAI audio transcriptions (whisper-1 / gpt-4o-transcribe).
/// Audio is buffered locally and uploaded only when dictation stops.
/// </summary>
internal sealed class OpenAiAsrPipeline
{
    private static readonly HttpClient Http = new()
    {
        Timeout = TimeSpan.FromMinutes(2)
    };

    private readonly EngineConfig _config;
    private readonly JsonFileLogger _logger;
    private readonly object _lock = new();
    private readonly List<short> _pcm = new();

    public OpenAiAsrPipeline(EngineConfig config, JsonFileLogger logger)
    {
        _config = config;
        _logger = logger;
    }

    public void Reset()
    {
        lock (_lock)
        {
            _pcm.Clear();
        }
    }

    public void Append(short[] samples16kMono)
    {
        if (samples16kMono is not { Length: > 0 })
        {
            return;
        }

        lock (_lock)
        {
            _pcm.AddRange(samples16kMono);
        }
    }

    public async Task TranscribeAndEnqueueAsync(Action<IpcEnvelope> enqueue, CancellationToken cancellationToken)
    {
        short[] samples;
        lock (_lock)
        {
            samples = _pcm.ToArray();
            _pcm.Clear();
        }

        if (samples.Length == 0)
        {
            return;
        }

        var apiKey = SecretStore.GetOpenAiApiKey();
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            enqueue(new EventMessage
            {
                Event = IpcEvents.DictationError,
                Payload = new
                {
                    code = "openai.missing_key",
                    message = "Set OPENAI_API_KEY or %LOCALAPPDATA%\\Orbspeak\\config\\secrets.json."
                }
            });
            return;
        }

        var wav = PcmWav.From16kMono(samples);
        using var content = new MultipartFormDataContent();
        var file = new ByteArrayContent(wav);
        file.Headers.ContentType = new MediaTypeHeaderValue("audio/wav");
        content.Add(file, "file", "dictation.wav");
        content.Add(new StringContent(_config.OpenAiAsrModel), "model");
        if (!string.IsNullOrWhiteSpace(_config.OpenAiLanguage))
        {
            content.Add(new StringContent(_config.OpenAiLanguage), "language");
        }

        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/audio/transcriptions");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        request.Content = content;

        try
        {
            using var response = await Http.SendAsync(request, cancellationToken).ConfigureAwait(false);
            var body = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                _logger.Error("asr.openai", $"OpenAI transcription failed: {(int)response.StatusCode} {body}", new InvalidOperationException(body));
                enqueue(new EventMessage
                {
                    Event = IpcEvents.DictationError,
                    Payload = new { code = "openai.http", message = $"OpenAI returned {(int)response.StatusCode}." }
                });
                return;
            }

            using var doc = JsonDocument.Parse(body);
            var text = doc.RootElement.TryGetProperty("text", out var textProp)
                ? (textProp.GetString() ?? string.Empty).Trim()
                : string.Empty;
            if (string.IsNullOrEmpty(text))
            {
                return;
            }

            enqueue(new EventMessage
            {
                Event = IpcEvents.DictationFinal,
                Payload = new { text, provider = "openai" }
            });
        }
        catch (OperationCanceledException)
        {
            // Caller cancelled.
        }
        catch (Exception ex)
        {
            _logger.Error("asr.openai", "OpenAI transcription failed", ex);
            enqueue(new EventMessage
            {
                Event = IpcEvents.DictationError,
                Payload = new { code = "openai.error", message = ex.Message }
            });
        }
    }
}

internal static class PcmWav
{
    public static byte[] From16kMono(short[] samples)
    {
        var dataLength = samples.Length * 2;
        using var ms = new MemoryStream(44 + dataLength);
        using var writer = new BinaryWriter(ms);
        writer.Write(System.Text.Encoding.ASCII.GetBytes("RIFF"));
        writer.Write(36 + dataLength);
        writer.Write(System.Text.Encoding.ASCII.GetBytes("WAVE"));
        writer.Write(System.Text.Encoding.ASCII.GetBytes("fmt "));
        writer.Write(16);
        writer.Write((short)1);
        writer.Write((short)1);
        writer.Write(16000);
        writer.Write(16000 * 2);
        writer.Write((short)2);
        writer.Write((short)16);
        writer.Write(System.Text.Encoding.ASCII.GetBytes("data"));
        writer.Write(dataLength);
        var bytes = new byte[dataLength];
        Buffer.BlockCopy(samples, 0, bytes, 0, dataLength);
        writer.Write(bytes);
        writer.Flush();
        return ms.ToArray();
    }
}
