using System.Text.Json.Serialization;

namespace Orbspeak.Shared;

/// <summary>
/// Supported Studio/engine TTS backends. Additional providers can be added here
/// without scattering magic strings through UI code.
/// </summary>
public enum TtsProviderKind
{
    Qwen3,
    OpenAi
}

public static class TtsProviderIds
{
    public const string Qwen3 = "qwen3";
    public const string OpenAi = "openai";

    public static readonly IReadOnlyList<string> All = new[] { Qwen3, OpenAi };

    public static string ToId(TtsProviderKind kind) => kind switch
    {
        TtsProviderKind.OpenAi => OpenAi,
        _ => Qwen3
    };

    public static bool TryParse(string? value, out TtsProviderKind kind)
    {
        switch ((value ?? string.Empty).Trim().ToLowerInvariant())
        {
            case Qwen3:
            case "qwen":
            case "qwen3-tts":
                kind = TtsProviderKind.Qwen3;
                return true;
            case OpenAi:
            case "gpt":
            case "openai-tts":
                kind = TtsProviderKind.OpenAi;
                return true;
            default:
                kind = default;
                return false;
        }
    }

    public static TtsProviderKind ParseRequired(string? value)
    {
        if (TryParse(value, out var kind))
        {
            return kind;
        }

        throw new TtsValidationException(
            "tts.invalid_provider",
            $"Unknown TTS provider '{value}'. Supported providers: {string.Join(", ", All)}.");
    }
}

public static class SpeechRate
{
    public const double Min = 0.5;
    public const double Max = 2.0;
    public const double Default = 1.0;

    public static double Clamp(double? rate)
    {
        if (rate is null || double.IsNaN(rate.Value) || double.IsInfinity(rate.Value))
        {
            return Default;
        }

        if (rate.Value < Min)
        {
            return Min;
        }

        if (rate.Value > Max)
        {
            return Max;
        }

        return rate.Value;
    }

    public static bool IsDefault(double rate) => Math.Abs(rate - Default) < 0.001;
}

public enum PlaybackSessionState
{
    Idle,
    Loading,
    Playing,
    Paused,
    Stopped,
    Completed,
    Error
}

public static class PlaybackStateIds
{
    public const string Idle = "idle";
    public const string Loading = "loading";
    public const string Playing = "speaking";
    public const string Paused = "paused";
    public const string Stopped = "stopped";
    public const string Completed = "completed";
    public const string Error = "error";

    public static string ToId(PlaybackSessionState state) => state switch
    {
        PlaybackSessionState.Loading => Loading,
        PlaybackSessionState.Playing => Playing,
        PlaybackSessionState.Paused => Paused,
        PlaybackSessionState.Completed => Completed,
        PlaybackSessionState.Error => Error,
        PlaybackSessionState.Stopped => Stopped,
        _ => Idle
    };
}

public sealed class TtsVoiceInfo
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = string.Empty;

    [JsonPropertyName("displayName")]
    public string DisplayName { get; init; } = string.Empty;

    [JsonPropertyName("provider")]
    public string Provider { get; init; } = TtsProviderIds.Qwen3;

    [JsonPropertyName("language")]
    public string? Language { get; init; }

    [JsonPropertyName("description")]
    public string? Description { get; init; }

    [JsonPropertyName("isDefault")]
    public bool IsDefault { get; init; }
}

public sealed class TtsValidationException : Exception
{
    public string Code { get; }

    public TtsValidationException(string code, string message) : base(message)
    {
        Code = code;
    }
}

public sealed class TtsEngineDefaults
{
    public string DefaultProvider { get; init; } = TtsProviderIds.Qwen3;
    public string QwenSpeaker { get; init; } = "Vivian";
    public string QwenLanguage { get; init; } = "English";
    public string? QwenInstruct { get; init; }
    public string QwenModel { get; init; } = "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice";
    public string QwenSidecarUrl { get; init; } = "http://127.0.0.1:8765";
    public string OpenAiTtsModel { get; init; } = "gpt-4o-mini-tts";
    public string OpenAiTtsVoice { get; init; } = "alloy";
}

public sealed class StudioSpeechRequest
{
    public string Text { get; init; } = string.Empty;
    public string? Provider { get; init; }
    public string? VoiceId { get; init; }
    public double? Rate { get; init; }
    public string? Instruct { get; init; }
    public string? StyleMarkdown { get; init; }
    public string? PronunciationCsv { get; init; }
    public bool AllowVoiceRemap { get; init; }
}

public sealed class StudioSpeechSettings
{
    [JsonPropertyName("provider")]
    public string Provider { get; init; } = TtsProviderIds.Qwen3;

    [JsonPropertyName("voiceId")]
    public string VoiceId { get; init; } = "Vivian";

    [JsonPropertyName("rate")]
    public double Rate { get; init; } = SpeechRate.Default;

    [JsonPropertyName("instruct")]
    public string Instruct { get; init; } = string.Empty;

    [JsonPropertyName("styleMarkdown")]
    public string StyleMarkdown { get; init; } = string.Empty;

    [JsonPropertyName("pronunciationCsv")]
    public string PronunciationCsv { get; init; } = string.Empty;

    [JsonPropertyName("performanceInstruct")]
    public string? PerformanceInstruct { get; init; }

    [JsonPropertyName("instructionApplied")]
    public bool InstructionApplied { get; init; }

    [JsonPropertyName("instructionUnavailableReason")]
    public string? InstructionUnavailableReason { get; init; }

    [JsonPropertyName("applyEngineTempo")]
    public bool ApplyEngineTempo { get; init; }
}
