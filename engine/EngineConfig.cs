using System.Text.Json;

namespace Orbspeak.Engine;

public enum BackendMode
{
    Local,
    Cloud
}

/// <summary>
/// Engine configuration for model backends and resource budgets.
/// Backed by a JSON file under %LOCALAPPDATA%\Orbspeak\config\engine.json.
/// </summary>
public sealed class EngineConfig
{
    public BackendMode Backend { get; set; } = BackendMode.Local;

    /// <summary>
    /// Soft RAM budget in megabytes for all models combined.
    /// </summary>
    public int RamBudgetMb { get; set; } = 8_192;

    /// <summary>
    /// Soft VRAM budget in megabytes for GPU-backed models.
    /// </summary>
    public int VramBudgetMb { get; set; } = 6_144;

    /// <summary>
    /// Path to the ASR (Whisper) model file. Default: %LOCALAPPDATA%\Orbspeak\models\ggml-base.en.bin
    /// </summary>
    public string? AsrModelPath { get; set; }

    public static EngineConfig Load()
    {
        try
        {
            var path = GetConfigPath();
            if (!File.Exists(path))
            {
                return new EngineConfig();
            }

            var json = File.ReadAllText(path);
            var cfg = JsonSerializer.Deserialize<EngineConfig>(json);
            return cfg ?? new EngineConfig();
        }
        catch
        {
            // Fall back to defaults on any error; details are in logs.
            return new EngineConfig();
        }
    }

    public void Save()
    {
        var path = GetConfigPath();
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var json = JsonSerializer.Serialize(this, new JsonSerializerOptions
        {
            WriteIndented = true
        });
        File.WriteAllText(path, json);
    }

    /// <summary>
    /// Default ASR model path under %LOCALAPPDATA%\Orbspeak\models\.
    /// </summary>
    public static string GetDefaultAsrModelPath()
    {
        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        return Path.Combine(localAppData, "Orbspeak", "models", "ggml-base.en.bin");
    }

    private static string GetConfigPath()
    {
        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        return Path.Combine(localAppData, "Orbspeak", "config", "engine.json");
    }
}

