using System.Text.Json;

namespace Orbspeak.Engine;

/// <summary>
/// Reads secrets from the process environment or a user-local file.
/// Never writes keys into engine.json or the git tree.
/// </summary>
internal static class SecretStore
{
    public static string? GetOpenAiApiKey() =>
        ReadEnvOrFile("OPENAI_API_KEY", "openaiApiKey");

    public static string? GetXaiApiKey() =>
        ReadEnvOrFile("XAI_API_KEY", "xaiApiKey");

    public static void SetOpenAiApiKey(string? apiKey) =>
        MergeSecret("openaiApiKey", apiKey);

    public static void SetXaiApiKey(string? apiKey) =>
        MergeSecret("xaiApiKey", apiKey);

    public static string GetSecretsPath()
    {
        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        return Path.Combine(localAppData, "Orbspeak", "config", "secrets.json");
    }

    private static string? ReadEnvOrFile(string envName, string jsonName)
    {
        var env = Environment.GetEnvironmentVariable(envName);
        if (!string.IsNullOrWhiteSpace(env))
        {
            return env.Trim();
        }

        var map = ReadAll();
        return map.TryGetValue(jsonName, out var value) && !string.IsNullOrWhiteSpace(value)
            ? value.Trim()
            : null;
    }

    private static void MergeSecret(string name, string? value)
    {
        var map = ReadAll();
        if (string.IsNullOrWhiteSpace(value))
        {
            map.Remove(name);
        }
        else
        {
            map[name] = value.Trim();
        }

        var path = GetSecretsPath();
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, JsonSerializer.Serialize(map, new JsonSerializerOptions
        {
            WriteIndented = true
        }));
    }

    private static Dictionary<string, string?> ReadAll()
    {
        var path = GetSecretsPath();
        if (!File.Exists(path))
        {
            return new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        }

        try
        {
            using var doc = JsonDocument.Parse(File.ReadAllText(path));
            var map = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                map[prop.Name] = prop.Value.ValueKind == JsonValueKind.String
                    ? prop.Value.GetString()
                    : prop.Value.ToString();
            }

            return map;
        }
        catch
        {
            return new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        }
    }
}
