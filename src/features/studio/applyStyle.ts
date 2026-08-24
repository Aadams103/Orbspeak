import type { StudioStyle } from "./studioTypes";

export function applyPronunciation(text: string, csv: string): string {
  if (!csv.trim()) return text;
  let next = text;
  for (const line of csv.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [original, replacement] = trimmed.split(",", 2);
    if (!original || replacement == null) continue;
    const pattern = new RegExp(original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    next = next.replace(pattern, replacement.trim());
  }
  return next;
}

export function splitSentences(text: string): string[] {
  const parts = text
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : text.trim() ? [text.trim()] : [];
}

export function applyStudioStyle(text: string, style: StudioStyle): string {
  let next = text;
  if (style.styleMarkdown.trim()) {
    // Style notes are instructions for TTS, not text rewrites.
  }
  return applyPronunciation(next, style.pronunciationCsv);
}
