import { type TtsProviderId } from "./ttsContracts";

export type StudioDocumentMeta = {
  id: string;
  title: string;
  fileName: string;
  createdAt?: string;
  updatedAt?: string;
  hasVoiceover?: boolean;
  coverPath?: string | null;
  sceneCount?: number;
};

export type StudioDocument = StudioDocumentMeta & {
  text: string;
  sentences: string[];
  coverDataUrl?: string | null;
  scenes?: string[];
  folder?: string;
};

export type StudioStyle = {
  styleMarkdown: string;
  pronunciationCsv: string;
  instruct: string;
  ttsVoice: string;
  ttsRate: number;
  ttsProvider: TtsProviderId | string;
  artworkStyle: string;
};

export const DEFAULT_STUDIO_STYLE: StudioStyle = {
  styleMarkdown: "",
  pronunciationCsv: "",
  instruct: "calm narrator",
  ttsVoice: "Vivian",
  ttsRate: 1,
  ttsProvider: "qwen3",
  artworkStyle: "cinematic book cover",
};

export const DEFAULT_STUDIO_PROFILE = "default";
