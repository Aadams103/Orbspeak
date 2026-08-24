using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;

namespace Orbspeak.Engine.Artwork;

internal sealed class GrokImageClient
{
    private static readonly HttpClient Http = new()
    {
        Timeout = TimeSpan.FromMinutes(2)
    };

    public async Task<byte[]> GenerateAsync(string prompt, string? artworkStyle, CancellationToken cancellationToken)
    {
        var apiKey = SecretStore.GetXaiApiKey();
        if (string.IsNullOrWhiteSpace(apiKey))
        {
            throw new InvalidOperationException("Set XAI_API_KEY or save xaiApiKey in %LOCALAPPDATA%\\Orbspeak\\config\\secrets.json.");
        }

        var fullPrompt = string.IsNullOrWhiteSpace(artworkStyle)
            ? prompt
            : $"{prompt}. Style: {artworkStyle}";

        var payload = new
        {
            model = "grok-imagine-image-2.0",
            prompt = fullPrompt,
            n = 1,
            response_format = "b64_json"
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.x.ai/v1/images/generations");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
        using var response = await Http.SendAsync(request, cancellationToken).ConfigureAwait(false);
        var body = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            throw new InvalidOperationException($"xAI image API returned {(int)response.StatusCode}: {Trim(body)}");
        }

        using var doc = JsonDocument.Parse(body);
        if (!doc.RootElement.TryGetProperty("data", out var data) || data.GetArrayLength() == 0)
        {
            throw new InvalidOperationException("xAI image API returned no image data.");
        }

        var first = data[0];
        if (first.TryGetProperty("b64_json", out var b64) && b64.ValueKind == JsonValueKind.String)
        {
            return Convert.FromBase64String(b64.GetString()!);
        }

        if (first.TryGetProperty("url", out var urlProp) && urlProp.ValueKind == JsonValueKind.String)
        {
            var url = urlProp.GetString();
            if (!string.IsNullOrWhiteSpace(url))
            {
                return await Http.GetByteArrayAsync(url, cancellationToken).ConfigureAwait(false);
            }
        }

        throw new InvalidOperationException("xAI image API response had neither b64_json nor url.");
    }

    private static string Trim(string body) =>
        body.Length > 400 ? body[..400] : body;
}
