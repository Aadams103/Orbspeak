export type EngineTtsProgress = {
  index?: number;
  text?: string;
  startMs?: number;
  endMs?: number;
};

export type EngineIpc = {
  onPartial: (f: (p: { text?: string }) => void) => void;
  onFinal: (f: (p: { text?: string }) => void) => void;
  onState: (f: (p: { state?: string }) => void) => void;
  onError: (f: (p: { code?: string; message?: string }) => void) => void;
  onTtsState?: (f: (p: { state?: string; error?: string; provider?: string }) => void) => void;
  onTtsProgress?: (f: (p: EngineTtsProgress) => void) => void;
  start: (opts?: { profileId?: string; mode?: string }) => void;
  stop: () => void;
  ttsSpeak?: (opts: { text: string; voiceId?: string; rate?: number; instruct?: string }) => Promise<unknown>;
  ttsPause?: () => Promise<unknown>;
  ttsResume?: () => Promise<unknown>;
  ttsStop?: () => Promise<unknown>;
  settingsGet?: (key: string) => Promise<unknown>;
  settingsSet?: (values: Record<string, unknown>) => Promise<unknown>;
  studioImport?: (p: Record<string, unknown>) => Promise<unknown>;
  studioList?: (p: Record<string, unknown>) => Promise<unknown>;
  studioGet?: (p: Record<string, unknown>) => Promise<unknown>;
  studioExportAudio?: (p: Record<string, unknown>) => Promise<unknown>;
  studioSaveStyle?: (p: Record<string, unknown>) => Promise<unknown>;
  studioGetStyle?: (p: Record<string, unknown>) => Promise<unknown>;
  artworkGenerate?: (p: Record<string, unknown>) => Promise<unknown>;
};

declare global {
  interface Window {
    __engineIpc?: EngineIpc;
  }
}

export function getEngineIpc(): EngineIpc | undefined {
  return typeof window === "undefined" ? undefined : window.__engineIpc;
}

export function hasEngineIpc(): boolean {
  return !!getEngineIpc();
}
