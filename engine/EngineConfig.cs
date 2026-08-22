using System.Text.Json;
using System.Text.Json.Serialization;

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

    /// <summary>
    /// Speech-to-text backend: local (Whisper.net) or openai (paid API).
    /// </summary>
    public string AsrProvider { get; set; } = "local";

    /// <summary>
    /// Speech-to-speech backend: qwen3 (local sidecar) or openai (paid API).
    /// </summary>
    public string TtsProvider { get; set; } = "qwen3";

    public string OpenAiAsrModel { get; set; } = "whisper-1";

    public string OpenAiTtsModel { get; set; } = "gpt-4o-mini-tts";

    public string OpenAiTtsVoice { get; set; } = "alloy";

    /// <summary>
    /// Optional BCP-47 / ISO language hint for OpenAI transcription.
    /// </summary>
    public string? OpenAiLanguage { get; set; }

    public string QwenSidecarUrl { get; set; } = "http://127.0.0.1:8765";

    public string QwenModel { get; set; } = "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice";

    public string QwenSpeaker { get; set; } = "Vivian";

    public string QwenLanguage { get; set; } = "English";

    [JsonIgnore]
    public bool UsesOpenAiAsr =>
        string.Equals(AsrProvider, "openai", StringComparison.OrdinalIgnoreCase) ||
        Backend == BackendMode.Cloud;

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

