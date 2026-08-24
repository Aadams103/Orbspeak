namespace Orbspeak.Shared;

public sealed class PlannedTtsCall
{
    public TtsProviderKind Provider { get; init; }
    public string ProviderId { get; init; } = TtsProviderIds.Qwen3;
    public string Url { get; init; } = string.Empty;
    public string VoiceId { get; init; } = string.Empty;
    public double Rate { get; init; } = SpeechRate.Default;
    public string Text { get; init; } = string.Empty;
    public string? PerformanceInstruct { get; init; }
    public bool InstructionApplied { get; init; }
    public string? InstructionUnavailableReason { get; init; }
    public bool ApplyEngineTempo { get; init; }
    public IReadOnlyDictionary<string, object?> Payload { get; init; } = new Dictionary<string, object?>();
}

public sealed class ResolvedSpeechJob
{
    public string SpokenText { get; init; } = string.Empty;
    public IReadOnlyList<string> Sentences { get; init; } = Array.Empty<string>();
    public TtsProviderKind Provider { get; init; }
    public string ProviderId { get; init; } = TtsProviderIds.Qwen3;
    public string VoiceId { get; init; } = string.Empty;
    public double Rate { get; init; } = SpeechRate.Default;
    public string? PerformanceInstruct { get; init; }
    public bool InstructionRequested { get; init; }
    public bool InstructionSupported { get; init; }
    public bool InstructionApplied { get; init; }
    public string? InstructionUnavailableReason { get; init; }
    public bool ApplyEngineTempo { get; init; }
    public TtsEngineDefaults Defaults { get; init; } = new();

    public PlannedTtsCall PlanSentence(string sentence) =>
        TtsSpeechPlanner.PlanCall(this, sentence);

    public StudioSpeechSettings ToSettings() => new()
    {
        Provider = ProviderId,
        VoiceId = VoiceId,
        Rate = Rate,
        Instruct = PerformanceInstruct ?? string.Empty,
        StyleMarkdown = string.Empty,
        PronunciationCsv = string.Empty,
        PerformanceInstruct = PerformanceInstruct,
        InstructionApplied = InstructionApplied,
        InstructionUnavailableReason = InstructionUnavailableReason,
        ApplyEngineTempo = ApplyEngineTempo
    };
}

/// <summary>
/// Engine-side authority for provider routing, rate, voice, and instruction mapping.
/// The React UI must not reimplement this.
/// </summary>
public static class TtsSpeechPlanner
{
    public static ResolvedSpeechJob Resolve(StudioSpeechRequest request, TtsEngineDefaults defaults)
    {
        if (string.IsNullOrWhiteSpace(request.Text))
        {
            throw new TtsValidationException("tts.missing_text", "Text is required.");
        }

        var provider = string.IsNullOrWhiteSpace(request.Provider)
            ? TtsProviderIds.ParseRequired(defaults.DefaultProvider)
            : TtsProviderIds.ParseRequired(request.Provider);

        var voice = request.AllowVoiceRemap
            ? TtsVoiceCatalog.ResolveOrDefault(provider, FirstNonEmpty(request.VoiceId, DefaultVoice(provider, defaults)))
            : TtsVoiceCatalog.Require(provider, FirstNonEmpty(request.VoiceId, DefaultVoice(provider, defaults)));

        var spoken = PronunciationMapper.Apply(request.Text, request.PronunciationCsv);
        var rate = SpeechRate.Clamp(request.Rate);
        var instruct = request.Instruct;
        if (string.IsNullOrWhiteSpace(instruct) && provider == TtsProviderKind.Qwen3)
        {
            instruct = defaults.QwenInstruct;
        }

        var composed = SpeechInstruction.Compose(instruct, request.StyleMarkdown);
        var (supported, reason) = SpeechInstruction.DescribeSupport(provider, defaults);
        var instructionRequested = !string.IsNullOrWhiteSpace(composed);

        return new ResolvedSpeechJob
        {
            SpokenText = spoken,
            Sentences = SpeechText.SplitSentences(spoken),
            Provider = provider,
            ProviderId = TtsProviderIds.ToId(provider),
            VoiceId = voice.Id,
            Rate = rate,
            PerformanceInstruct = composed,
            InstructionRequested = instructionRequested,
            InstructionSupported = supported,
            InstructionApplied = instructionRequested && supported,
            InstructionUnavailableReason = instructionRequested && !supported ? reason : null,
            ApplyEngineTempo = provider == TtsProviderKind.Qwen3 && !SpeechRate.IsDefault(rate),
            Defaults = defaults
        };
    }

    public static PlannedTtsCall PlanCall(ResolvedSpeechJob job, string sentence)
    {
        if (job.Provider == TtsProviderKind.OpenAi)
        {
            var payload = new Dictionary<string, object?>
            {
                ["model"] = job.Defaults.OpenAiTtsModel,
                ["voice"] = job.VoiceId,
                ["input"] = sentence,
                ["response_format"] = "wav",
                ["speed"] = job.Rate
            };
            if (job.InstructionApplied)
            {
                payload["instructions"] = job.PerformanceInstruct;
            }

            return new PlannedTtsCall
            {
                Provider = TtsProviderKind.OpenAi,
                ProviderId = TtsProviderIds.OpenAi,
                Url = "https://api.openai.com/v1/audio/speech",
                VoiceId = job.VoiceId,
                Rate = job.Rate,
                Text = sentence,
                PerformanceInstruct = job.PerformanceInstruct,
                InstructionApplied = job.InstructionApplied,
                InstructionUnavailableReason = job.InstructionUnavailableReason,
                ApplyEngineTempo = false,
                Payload = payload
            };
        }

        return new PlannedTtsCall
        {
            Provider = TtsProviderKind.Qwen3,
            ProviderId = TtsProviderIds.Qwen3,
            Url = (job.Defaults.QwenSidecarUrl ?? "http://127.0.0.1:8765").TrimEnd('/') + "/v1/speak",
            VoiceId = job.VoiceId,
            Rate = job.Rate,
            Text = sentence,
            PerformanceInstruct = job.PerformanceInstruct,
            InstructionApplied = job.InstructionApplied,
            InstructionUnavailableReason = job.InstructionUnavailableReason,
            ApplyEngineTempo = job.ApplyEngineTempo,
            Payload = new Dictionary<string, object?>
            {
                ["text"] = sentence,
                ["speaker"] = job.VoiceId,
                ["language"] = job.Defaults.QwenLanguage,
                ["instruct"] = job.InstructionApplied ? job.PerformanceInstruct : null,
                ["model"] = job.Defaults.QwenModel
            }
        };
    }

    private static string DefaultVoice(TtsProviderKind provider, TtsEngineDefaults defaults) =>
        provider == TtsProviderKind.OpenAi ? defaults.OpenAiTtsVoice : defaults.QwenSpeaker;

    private static string? FirstNonEmpty(params string?[] values) =>
        values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));
}
