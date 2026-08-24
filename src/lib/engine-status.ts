import { getEngineIpc } from "@/lib/engine-ipc";
import { asrFriendlyLabel, friendlyProviderLabel } from "@/lib/provider-labels";

export type AudioProvidersSnapshot = {
  asr?: Array<{ id?: string; label?: string }>;
  tts?: Array<{ id?: string; label?: string }>;
  active?: {
    asr?: string;
    tts?: string;
    openaiKeyConfigured?: boolean;
    xaiKeyConfigured?: boolean;
  };
  sidecarUrl?: string;
  qwenModel?: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export async function loadAudioProviders(): Promise<AudioProvidersSnapshot | null> {
  const ipc = getEngineIpc();
  if (!ipc?.settingsGet) return null;
  const result = asRecord(await ipc.settingsGet("audio.providers"));
  return result as AudioProvidersSnapshot;
}

export function engineStatusLines(snapshot: AudioProvidersSnapshot | null): { primary: string; secondary: string } {
  if (!snapshot) {
    return { primary: "Engine offline", secondary: "Browser preview" };
  }
  const tts = friendlyProviderLabel(snapshot.active?.tts);
  return {
    primary: `${tts} • Ready`,
    secondary: "Private • On this PC",
  };
}

export function recognitionStatusLabel(snapshot: AudioProvidersSnapshot | null): string {
  if (!snapshot) return "Not connected";
  return `${asrFriendlyLabel(snapshot.active?.asr)} • Ready`;
}
