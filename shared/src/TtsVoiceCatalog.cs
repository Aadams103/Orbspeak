namespace Orbspeak.Shared;

/// <summary>
/// Static catalogs used to validate voices and to feed a future Voice Library UI.
/// Live Qwen sidecar speakers are merged on top of this list by the engine.
/// </summary>
public static class TtsVoiceCatalog
{
    public static readonly IReadOnlyList<TtsVoiceInfo> QwenVoices = new[]
    {
        Voice(TtsProviderIds.Qwen3, "Vivian", "Vivian", "Chinese", "Bright, slightly edgy young female voice.", isDefault: true),
        Voice(TtsProviderIds.Qwen3, "Serena", "Serena", "Chinese", "Warm, gentle young female voice."),
        Voice(TtsProviderIds.Qwen3, "Uncle_Fu", "Uncle Fu", "Chinese", "Seasoned male voice with a low, mellow timbre."),
        Voice(TtsProviderIds.Qwen3, "Dylan", "Dylan", "Chinese (Beijing)", "Youthful Beijing male voice with a clear, natural timbre."),
        Voice(TtsProviderIds.Qwen3, "Eric", "Eric", "Chinese (Sichuan)", "Lively Chengdu male voice with a slightly husky brightness."),
        Voice(TtsProviderIds.Qwen3, "Ryan", "Ryan", "English", "Dynamic male voice with strong rhythmic drive."),
        Voice(TtsProviderIds.Qwen3, "Aiden", "Aiden", "English", "Sunny American male voice with a clear midrange."),
        Voice(TtsProviderIds.Qwen3, "Ono_Anna", "Ono Anna", "Japanese", "Playful Japanese female voice with a light, nimble timbre."),
        Voice(TtsProviderIds.Qwen3, "Sohee", "Sohee", "Korean", "Warm Korean female voice with rich emotion.")
    };

    public static readonly IReadOnlyList<TtsVoiceInfo> OpenAiVoices = new[]
    {
        Voice(TtsProviderIds.OpenAi, "alloy", "Alloy", "English", "Neutral, balanced default voice.", isDefault: true),
        Voice(TtsProviderIds.OpenAi, "ash", "Ash", "English", "Clear, conversational male voice."),
        Voice(TtsProviderIds.OpenAi, "ballad", "Ballad", "English", "Warm narrative voice."),
        Voice(TtsProviderIds.OpenAi, "coral", "Coral", "English", "Bright, expressive female voice."),
        Voice(TtsProviderIds.OpenAi, "echo", "Echo", "English", "Resonant male voice."),
        Voice(TtsProviderIds.OpenAi, "fable", "Fable", "English", "British storyteller voice."),
        Voice(TtsProviderIds.OpenAi, "onyx", "Onyx", "English", "Deep, authoritative male voice."),
        Voice(TtsProviderIds.OpenAi, "nova", "Nova", "English", "Energetic female voice."),
        Voice(TtsProviderIds.OpenAi, "sage", "Sage", "English", "Calm, measured voice."),
        Voice(TtsProviderIds.OpenAi, "shimmer", "Shimmer", "English", "Soft, airy female voice."),
        Voice(TtsProviderIds.OpenAi, "verse", "Verse", "English", "Expressive reading voice."),
        Voice(TtsProviderIds.OpenAi, "marin", "Marin", "English", "Warm contemporary voice.")
    };

    public static IReadOnlyList<TtsVoiceInfo> ForProvider(TtsProviderKind provider)
        => provider == TtsProviderKind.OpenAi ? OpenAiVoices : QwenVoices;

    public static TtsVoiceInfo DefaultVoice(TtsProviderKind provider)
        => ForProvider(provider).First(v => v.IsDefault);

    public static bool TryFind(TtsProviderKind provider, string? voiceId, out TtsVoiceInfo voice)
    {
        voice = DefaultVoice(provider);
        if (string.IsNullOrWhiteSpace(voiceId))
        {
            return false;
        }

        var match = ForProvider(provider)
            .FirstOrDefault(v => string.Equals(v.Id, voiceId.Trim(), StringComparison.OrdinalIgnoreCase));
        if (match is null)
        {
            return false;
        }

        voice = match;
        return true;
    }

    public static TtsVoiceInfo ResolveOrDefault(TtsProviderKind provider, string? voiceId)
        => TryFind(provider, voiceId, out var voice) ? voice : DefaultVoice(provider);

    public static TtsVoiceInfo Require(TtsProviderKind provider, string? voiceId)
    {
        if (string.IsNullOrWhiteSpace(voiceId))
        {
            return DefaultVoice(provider);
        }

        if (TryFind(provider, voiceId, out var voice))
        {
            return voice;
        }

        var known = string.Join(", ", ForProvider(provider).Select(v => v.Id));
        throw new TtsValidationException(
            "tts.invalid_voice",
            $"Voice '{voiceId}' is not valid for {TtsProviderIds.ToId(provider)}. Supported voices: {known}.");
    }

    public static IReadOnlyList<TtsVoiceInfo> MergeQwenSpeakers(IEnumerable<string>? liveSpeakers)
    {
        var catalog = QwenVoices.ToDictionary(v => v.Id, StringComparer.OrdinalIgnoreCase);
        if (liveSpeakers is null)
        {
            return QwenVoices;
        }

        foreach (var speaker in liveSpeakers)
        {
            if (string.IsNullOrWhiteSpace(speaker))
            {
                continue;
            }

            if (!catalog.ContainsKey(speaker))
            {
                catalog[speaker] = Voice(TtsProviderIds.Qwen3, speaker.Trim(), speaker.Trim(), null, "Qwen sidecar speaker.");
            }
        }

        return catalog.Values
            .OrderByDescending(v => v.IsDefault)
            .ThenBy(v => v.DisplayName, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static TtsVoiceInfo Voice(
        string provider,
        string id,
        string displayName,
        string? language,
        string? description,
        bool isDefault = false) => new()
    {
        Id = id,
        DisplayName = displayName,
        Provider = provider,
        Language = language,
        Description = description,
        IsDefault = isDefault
    };
}
