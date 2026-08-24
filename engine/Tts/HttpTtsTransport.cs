using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Orbspeak.Shared;

namespace Orbspeak.Engine.Tts;

internal sealed class HttpTtsTransport : ITtsTransport
{
    private static readonly HttpClient Http = new()
    {
        Timeout = TimeSpan.FromMinutes(3)
    };

    private readonly Func<string?> _openAiApiKey;

    public HttpTtsTransport(Func<string?>? openAiApiKey = null)
    {
        _openAiApiKey = openAiApiKey ?? SecretStore.GetOpenAiApiKey;
    }

    public async Task<TtsTransportResult> SendAsync(PlannedTtsCall call, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, call.Url)
        {
            Content = new StringContent(JsonSerializer.Serialize(call.Payload), Encoding.UTF8, "application/json")
        };

        if (call.Provider == TtsProviderKind.OpenAi)
        {
            var apiKey = _openAiApiKey();
            if (string.IsNullOrWhiteSpace(apiKey))
            {
                throw new InvalidOperationException("OpenAI TTS is selected, but no API key is configured. Set OPENAI_API_KEY or save it under %LOCALAPPDATA%\\Orbspeak\\config\\secrets.json.");
            }

            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        }

        using var response = await Http.SendAsync(request, cancellationToken).ConfigureAwait(false);
        var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            var detail = Encoding.UTF8.GetString(bytes);
            var name = call.Provider == TtsProviderKind.OpenAi ? "OpenAI TTS" : "Qwen sidecar";
            throw new InvalidOperationException($"{name} returned {(int)response.StatusCode}: {detail}");
        }

        var applied = call.InstructionApplied;
        if (response.Headers.TryGetValues("X-Orbspeak-Instruct-Applied", out var values))
        {
            applied = values.Any(v => string.Equals(v, "true", StringComparison.OrdinalIgnoreCase));
        }

        return new TtsTransportResult
        {
            Wav = bytes,
            InstructionApplied = applied
        };
    }
}
