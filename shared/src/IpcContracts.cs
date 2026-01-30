using System.Text.Json.Serialization;

namespace Orbspeak.Shared;

public enum IpcMessageType
{
    Request,
    Response,
    Event
}

public enum EngineState
{
    Idle,
    Dictating,
    Speaking,
    Error
}

public enum TtsState
{
    Speaking,
    Paused,
    Stopped
}

public static class IpcMethods
{
    public const string EnginePing = "engine.ping";
    public const string AudioListInputDevices = "audio.listInputDevices";
    public const string AudioSetInputDevice = "audio.setInputDevice";
    public const string DictationStart = "dictation.start";
    public const string DictationStop = "dictation.stop";
    public const string DictationCancel = "dictation.cancel";
    public const string TtsSpeak = "tts.speak";
    public const string TtsPause = "tts.pause";
    public const string TtsResume = "tts.resume";
    public const string TtsStop = "tts.stop";
    public const string ProfilesList = "profiles.list";
    public const string ProfilesSetActive = "profiles.setActive";
    public const string ProfilesExport = "profiles.export";
    public const string ProfilesImport = "profiles.import";
    public const string LearningRecordCorrection = "learning.recordCorrection";
    public const string LearningListRules = "learning.listRules";
    public const string LearningDeleteRule = "learning.deleteRule";
    public const string SettingsGet = "settings.get";
    public const string SettingsSet = "settings.set";
}

public static class IpcEvents
{
    public const string EngineState = "engine.state";
    public const string DictationPartial = "dictation.partial";
    public const string DictationFinal = "dictation.final";
    public const string DictationError = "dictation.error";
    public const string TtsState = "tts.state";
    public const string ResourceUsage = "resource.usage";
    public const string HotkeyFired = "hotkey.fired";
}

public sealed class IpcError
{
    [JsonPropertyName("code")]
    public string Code { get; init; } = string.Empty;

    [JsonPropertyName("message")]
    public string Message { get; init; } = string.Empty;
}

public abstract class IpcEnvelope
{
    [JsonPropertyName("v")]
    public int Version { get; init; } = 1;

    [JsonPropertyName("type")]
    public abstract string Type { get; }
}

public sealed class RequestMessage : IpcEnvelope
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = Guid.NewGuid().ToString();

    [JsonPropertyName("method")]
    public string Method { get; init; } = string.Empty;

    [JsonPropertyName("params")]
    public object? Params { get; init; }

    public override string Type => "request";
}

public sealed class ResponseMessage : IpcEnvelope
{
    [JsonPropertyName("id")]
    public string Id { get; init; } = string.Empty;

    [JsonPropertyName("ok")]
    public bool Ok { get; init; }

    [JsonPropertyName("result")]
    public object? Result { get; init; }

    [JsonPropertyName("error")]
    public IpcError? Error { get; init; }

    public override string Type => "response";
}

public sealed class EventMessage : IpcEnvelope
{
    [JsonPropertyName("event")]
    public string Event { get; init; } = string.Empty;

    [JsonPropertyName("payload")]
    public object? Payload { get; init; }

    public override string Type => "event";
}

// Example payload DTOs. Additional DTOs can be added as needed while keeping v1 additive.

public sealed class EnginePingResult
{
    [JsonPropertyName("status")]
    public string Status { get; init; } = "ok";

    [JsonPropertyName("version")]
    public string Version { get; init; } = "0.1.0";
}

public sealed class SettingsGetParams
{
    [JsonPropertyName("key")]
    public string Key { get; init; } = string.Empty;
}

public sealed class SettingsSetParams
{
    [JsonPropertyName("values")]
    public Dictionary<string, object?> Values { get; init; } = new();
}

public sealed class DictationStartParams
{
    [JsonPropertyName("mode")]
    public string Mode { get; init; } = "default";

    [JsonPropertyName("profileId")]
    public string ProfileId { get; init; } = string.Empty;
}

public sealed class EngineStateEventPayload
{
    [JsonPropertyName("state")]
    public string State { get; init; } = "idle";
}

public sealed class DictationPartialPayload
{
    [JsonPropertyName("text")]
    public string Text { get; init; } = string.Empty;

    [JsonPropertyName("stability")]
    public double? Stability { get; init; }
}

public sealed class DictationFinalPayload
{
    [JsonPropertyName("text")]
    public string Text { get; init; } = string.Empty;
}

public sealed class DictationErrorPayload
{
    [JsonPropertyName("code")]
    public string Code { get; init; } = string.Empty;

    [JsonPropertyName("message")]
    public string Message { get; init; } = string.Empty;
}

