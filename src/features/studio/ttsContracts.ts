export const TTS_PROVIDERS = ["qwen3", "openai"] as const;
export type TtsProviderId = (typeof TTS_PROVIDERS)[number];

export const PLAYBACK_STATES = [
  "idle",
  "loading",
  "playing",
  "paused",
  "stopped",
  "completed",
  "error",
] as const;
export type PlaybackState = (typeof PLAYBACK_STATES)[number];

export const SPEECH_RATE = {
  min: 0.5,
  max: 2,
  defaultValue: 1,
} as const;

export type TtsVoiceInfo = {
  id: string;
  displayName: string;
  provider: TtsProviderId;
  language?: string;
  description?: string;
  isDefault?: boolean;
};

export type StudioSpeechSettings = {
  provider: TtsProviderId;
  voiceId: string;
  rate: number;
  instruct: string;
  styleMarkdown: string;
  pronunciationCsv: string;
};

export const QWEN_VOICES: TtsVoiceInfo[] = [
  { id: "Vivian", displayName: "Vivian", provider: "qwen3", language: "Chinese", description: "Bright, slightly edgy young female voice.", isDefault: true },
  { id: "Serena", displayName: "Serena", provider: "qwen3", language: "Chinese", description: "Warm, gentle young female voice." },
  { id: "Uncle_Fu", displayName: "Uncle Fu", provider: "qwen3", language: "Chinese", description: "Seasoned male voice with a low, mellow timbre." },
  { id: "Dylan", displayName: "Dylan", provider: "qwen3", language: "Chinese (Beijing)", description: "Youthful Beijing male voice." },
  { id: "Eric", displayName: "Eric", provider: "qwen3", language: "Chinese (Sichuan)", description: "Lively Chengdu male voice." },
  { id: "Ryan", displayName: "Ryan", provider: "qwen3", language: "English", description: "Dynamic male voice with strong rhythmic drive." },
  { id: "Aiden", displayName: "Aiden", provider: "qwen3", language: "English", description: "Sunny American male voice." },
  { id: "Ono_Anna", displayName: "Ono Anna", provider: "qwen3", language: "Japanese", description: "Playful Japanese female voice." },
  { id: "Sohee", displayName: "Sohee", provider: "qwen3", language: "Korean", description: "Warm Korean female voice." },
];

export const OPENAI_VOICES: TtsVoiceInfo[] = [
  { id: "alloy", displayName: "Alloy", provider: "openai", language: "English", description: "Neutral default voice.", isDefault: true },
  { id: "ash", displayName: "Ash", provider: "openai", language: "English" },
  { id: "ballad", displayName: "Ballad", provider: "openai", language: "English" },
  { id: "coral", displayName: "Coral", provider: "openai", language: "English" },
  { id: "echo", displayName: "Echo", provider: "openai", language: "English" },
  { id: "fable", displayName: "Fable", provider: "openai", language: "English" },
  { id: "onyx", displayName: "Onyx", provider: "openai", language: "English" },
  { id: "nova", displayName: "Nova", provider: "openai", language: "English" },
  { id: "sage", displayName: "Sage", provider: "openai", language: "English" },
  { id: "shimmer", displayName: "Shimmer", provider: "openai", language: "English" },
  { id: "verse", displayName: "Verse", provider: "openai", language: "English" },
  { id: "marin", displayName: "Marin", provider: "openai", language: "English" },
];

export function isTtsProviderId(value: string | undefined | null): value is TtsProviderId {
  return TTS_PROVIDERS.includes((value ?? "") as TtsProviderId);
}

export function parseTtsProviderId(value: string | undefined | null): TtsProviderId {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "openai" || normalized === "gpt" || normalized === "openai-tts") return "openai";
  if (normalized === "qwen3" || normalized === "qwen" || normalized === "qwen3-tts") return "qwen3";
  throw new Error(`Unknown TTS provider '${value}'. Supported providers: ${TTS_PROVIDERS.join(", ")}.`);
}

export function clampSpeechRate(rate: number | undefined | null): number {
  if (rate == null || Number.isNaN(rate) || !Number.isFinite(rate)) return SPEECH_RATE.defaultValue;
  return Math.min(SPEECH_RATE.max, Math.max(SPEECH_RATE.min, rate));
}

export function voicesForProvider(provider: TtsProviderId, catalogs?: Partial<Record<TtsProviderId, TtsVoiceInfo[]>>): TtsVoiceInfo[] {
  if (provider === "openai") return catalogs?.openai?.length ? catalogs.openai : OPENAI_VOICES;
  return catalogs?.qwen3?.length ? catalogs.qwen3 : QWEN_VOICES;
}

export function defaultVoiceId(provider: TtsProviderId, catalogs?: Partial<Record<TtsProviderId, TtsVoiceInfo[]>>): string {
  const voices = voicesForProvider(provider, catalogs);
  return voices.find((voice) => voice.isDefault)?.id ?? voices[0]?.id ?? (provider === "openai" ? "alloy" : "Vivian");
}

export function resolveVoiceId(
  provider: TtsProviderId,
  voiceId: string | undefined,
  catalogs?: Partial<Record<TtsProviderId, TtsVoiceInfo[]>>,
): string {
  const voices = voicesForProvider(provider, catalogs);
  const match = voices.find((voice) => voice.id.toLowerCase() === (voiceId ?? "").trim().toLowerCase());
  return match?.id ?? defaultVoiceId(provider, catalogs);
}

export function composePerformanceInstruction(instruct: string, styleMarkdown: string): string {
  return [instruct, styleMarkdown]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(". ");
}

export function shouldApplyTtsEvent(currentSessionId: string | null, incomingSessionId?: string): boolean {
  if (!currentSessionId || !incomingSessionId) return true;
  return currentSessionId === incomingSessionId;
}

export function playbackStateFromEngine(state: string | undefined): PlaybackState {
  switch (state) {
    case "loading":
      return "loading";
    case "speaking":
      return "playing";
    case "paused":
      return "paused";
    case "completed":
      return "completed";
    case "error":
      return "error";
    case "stopped":
      return "stopped";
    default:
      return "idle";
  }
}
