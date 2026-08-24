namespace Orbspeak.Shared;

/// <summary>
/// Performance/style instructions are kept separate from pronunciation replacements.
/// </summary>
public static class SpeechInstruction
{
    public static string? Compose(string? instruct, string? styleMarkdown)
    {
        var parts = new[] { instruct, styleMarkdown }
            .Select(Normalize)
            .Where(part => part is not null)
            .Cast<string>()
            .ToList();

        if (parts.Count == 0)
        {
            return null;
        }

        return string.Join(". ", parts);
    }

    public static bool QwenSupportsInstruct(string? modelId)
    {
        var id = (modelId ?? string.Empty).Replace("-", "", StringComparison.Ordinal).ToLowerInvariant();
        return !id.Contains("0.6b", StringComparison.Ordinal) && !id.Contains("0b6", StringComparison.Ordinal);
    }

    public static bool OpenAiSupportsInstructions(string? modelId)
    {
        var id = modelId ?? string.Empty;
        return id.Contains("gpt-4o", StringComparison.OrdinalIgnoreCase);
    }

    public static (bool Supported, string? Reason) DescribeSupport(TtsProviderKind provider, TtsEngineDefaults defaults)
    {
        if (provider == TtsProviderKind.Qwen3)
        {
            if (QwenSupportsInstruct(defaults.QwenModel))
            {
                return (true, null);
            }

            return (false, $"Qwen model '{defaults.QwenModel}' does not apply narrator instructions. Use Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice for instruct support.");
        }

        if (OpenAiSupportsInstructions(defaults.OpenAiTtsModel))
        {
            return (true, null);
        }

        return (false, $"OpenAI model '{defaults.OpenAiTtsModel}' does not support TTS instructions.");
    }

    private static string? Normalize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim();
    }
}
