using System.Text.Json;

namespace Orbspeak.Engine;

/// <summary>
/// Reads secrets from the process environment or a user-local file.
/// Never writes keys into engine.json or the git tree.
/// </summary>
internal static class SecretStore
{
    public static string? GetOpenAiApiKey()
    {
        var env = Environment.GetEnvironmentVariable("OPENAI_API_KEY");
        if (!string.IsNullOrWhiteSpace(env))
        {
            return env.Trim();
        }

        var path = GetSecretsPath();
        if (!File.Exists(path))
        {
            return null;
        }

        try
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(path));
            if (doc.RootElement.TryGetProperty("openaiApiKey", out var key) &&
                key.ValueKind == JsonValueKind.String)
            {
                var value = key.GetString();
                return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
            }
        }
        catch
        {
            return null;
        }

        return null;
    }

    public static void SetOpenAiApiKey(string? apiKey)
    {
        var path = GetSecretsPath();
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var payload = new Dictionary<string, string?>
        {
            ["openaiApiKey"] = string.IsNullOrWhiteSpace(apiKey) ? null : apiKey.Trim()
        };
        File.WriteAllText(path, JsonSerializer.Serialize(payload, new JsonSerializerOptions
        {
            WriteIndented = true
        }));
    }

    public static string GetSecretsPath()
    {
        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        return Path.Combine(localAppData, "Orbspeak", "config", "secrets.json");
    }
}
