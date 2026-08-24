import { getEngineIpc } from "@/lib/engine-ipc";
import { applyStudioStyle, splitSentences } from "./applyStyle";
import {
  DEFAULT_STUDIO_PROFILE,
  DEFAULT_STUDIO_STYLE,
  type StudioDocument,
  type StudioDocumentMeta,
  type StudioStyle,
} from "./studioTypes";
import {
  OPENAI_VOICES,
  QWEN_VOICES,
  type StudioSpeechSettings,
  type TtsProviderId,
  type TtsVoiceInfo,
} from "./ttsContracts";

const MEMORY_KEY = "orbspeak.studio.library";
const STYLE_KEY = "orbspeak.studio.style";

type MemoryStore = {
  documents: Record<string, StudioDocument>;
};

function readMemory(): MemoryStore {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return { documents: {} };
    return JSON.parse(raw) as MemoryStore;
  } catch {
    return { documents: {} };
  }
}

function writeMemory(store: MemoryStore) {
  localStorage.setItem(MEMORY_KEY, JSON.stringify(store));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function listDocuments(profileId = DEFAULT_STUDIO_PROFILE): Promise<StudioDocumentMeta[]> {
  const ipc = getEngineIpc();
  if (ipc?.studioList) {
    const result = asRecord(await ipc.studioList({ profileId }));
    return (result.documents as StudioDocumentMeta[]) ?? [];
  }
  return Object.values(readMemory().documents).sort((a, b) =>
    (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
  );
}

export async function getDocument(
  docId: string,
  profileId = DEFAULT_STUDIO_PROFILE,
): Promise<StudioDocument | null> {
  const ipc = getEngineIpc();
  if (ipc?.studioGet) {
    return (await ipc.studioGet({ profileId, docId })) as StudioDocument;
  }
  return readMemory().documents[docId] ?? null;
}

export async function importDocument(file: File, profileId = DEFAULT_STUDIO_PROFILE): Promise<StudioDocumentMeta> {
  if (!getEngineIpc()?.studioImport && /\.pdf$/i.test(file.name)) {
    throw new Error("PDF import needs the Orbspeak desktop engine.");
  }
  const ipc = getEngineIpc();
  if (ipc?.studioImport) {
    return (await ipc.studioImport({
      profileId,
      fileName: file.name,
      mimeType: file.type,
      contentBase64: await fileToBase64(file),
    })) as StudioDocumentMeta;
  }

  const text = await file.text();
  const doc: StudioDocument = {
    id: crypto.randomUUID().replaceAll("-", "").slice(0, 12),
    title: file.name.replace(/\.[^.]+$/, ""),
    fileName: file.name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    text,
    sentences: splitSentences(text),
  };
  const store = readMemory();
  store.documents[doc.id] = doc;
  writeMemory(store);
  return doc;
}

export async function exportVoiceover(
  docId: string,
  extras: {
    provider?: string;
    voiceId?: string;
    rate?: number;
    instruct?: string;
    styleMarkdown?: string;
    pronunciationCsv?: string;
  } = {},
  profileId = DEFAULT_STUDIO_PROFILE,
): Promise<{ dataUrl?: string; path?: string; overwritten?: boolean; settings?: StudioSpeechSettings }> {
  const ipc = getEngineIpc();
  if (!ipc?.studioExportAudio) {
    throw new Error("Voiceover export needs the Orbspeak desktop engine.");
  }
  return (await ipc.studioExportAudio({ profileId, docId, ...extras })) as {
    dataUrl?: string;
    path?: string;
    overwritten?: boolean;
    settings?: StudioSpeechSettings;
  };
}

export async function listTtsVoices(): Promise<Record<TtsProviderId, TtsVoiceInfo[]>> {
  const ipc = getEngineIpc();
  if (ipc?.ttsVoices) {
    const result = asRecord(await ipc.ttsVoices());
    return {
      qwen3: (result.qwen3 as TtsVoiceInfo[] | undefined) ?? QWEN_VOICES,
      openai: (result.openai as TtsVoiceInfo[] | undefined) ?? OPENAI_VOICES,
    };
  }
  return { qwen3: QWEN_VOICES, openai: OPENAI_VOICES };
}

export async function generateArtwork(
  docId: string,
  prompt: string,
  kind: "cover" | "scene",
  profileId = DEFAULT_STUDIO_PROFILE,
): Promise<{ dataUrl?: string }> {
  const ipc = getEngineIpc();
  if (!ipc?.artworkGenerate) {
    throw new Error("Artwork generation needs the Orbspeak desktop engine and an xAI key.");
  }
  return (await ipc.artworkGenerate({ profileId, docId, prompt, kind })) as { dataUrl?: string };
}

export async function loadStyle(profileId = DEFAULT_STUDIO_PROFILE): Promise<StudioStyle> {
  const ipc = getEngineIpc();
  if (ipc?.studioGetStyle) {
    return { ...DEFAULT_STUDIO_STYLE, ...(await ipc.studioGetStyle({ profileId })) as Partial<StudioStyle> };
  }
  try {
    const raw = localStorage.getItem(STYLE_KEY);
    return raw ? { ...DEFAULT_STUDIO_STYLE, ...JSON.parse(raw) } : DEFAULT_STUDIO_STYLE;
  } catch {
    return DEFAULT_STUDIO_STYLE;
  }
}

export async function saveStyle(
  style: StudioStyle,
  profileId = DEFAULT_STUDIO_PROFILE,
): Promise<StudioStyle> {
  const ipc = getEngineIpc();
  if (ipc?.studioSaveStyle) {
    return (await ipc.studioSaveStyle({ profileId, ...style })) as StudioStyle;
  }
  localStorage.setItem(STYLE_KEY, JSON.stringify(style));
  return style;
}

export function prepareReadAloud(text: string, style: StudioStyle): string {
  return applyStudioStyle(text, style);
}
