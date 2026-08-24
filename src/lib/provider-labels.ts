import type { TtsProviderId } from "@/features/studio/ttsContracts";

export function friendlyProviderLabel(provider: string | undefined | null): string {
  const id = (provider ?? "").trim().toLowerCase();
  if (id === "qwen3" || id === "qwen" || id === "qwen3-tts") return "Qwen Local";
  if (id === "openai" || id === "gpt" || id === "openai-tts") return "OpenAI Cloud";
  if (id === "local") return "Whisper Local";
  return "Voice engine";
}

export function isLocalProvider(provider: string | undefined | null): boolean {
  const id = (provider ?? "").trim().toLowerCase();
  return id === "qwen3" || id === "qwen" || id === "qwen3-tts" || id === "local";
}

export function localityLabel(provider: string | undefined | null): "LOCAL" | "CLOUD" {
  return isLocalProvider(provider) ? "LOCAL" : "CLOUD";
}

export function asrFriendlyLabel(provider: string | undefined | null): string {
  const id = (provider ?? "").trim().toLowerCase();
  if (id === "openai") return "OpenAI Cloud";
  return "Whisper Local";
}

export function providerOptionLabel(provider: TtsProviderId): string {
  return provider === "openai" ? "OpenAI Cloud" : "Qwen Local";
}
