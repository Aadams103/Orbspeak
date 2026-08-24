import type { StudioStyle } from "./studioTypes";
import { composePerformanceInstruction } from "./ttsContracts";

export function applyPronunciation(text: string, csv: string): string {
  if (!csv.trim()) return text;
  let next = text;
  for (const line of csv.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [original, replacement] = trimmed.split(",", 2);
    if (!original || replacement == null) continue;
    next = replaceInsensitive(next, original, replacement.trim());
  }
  return next;
}

function replaceInsensitive(text: string, original: string, replacement: string): string {
  if (!original) return text;
  const source = text.toLowerCase();
  const needle = original.toLowerCase();
  let result = "";
  let start = 0;
  let index = source.indexOf(needle, start);
  while (index >= 0) {
    result += text.slice(start, index) + replacement;
    start = index + original.length;
    index = source.indexOf(needle, start);
  }
  return result + text.slice(start);
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
  return applyPronunciation(text, style.pronunciationCsv);
}

export function studioPerformanceInstruction(style: StudioStyle): string {
  return composePerformanceInstruction(style.instruct, style.styleMarkdown);
}
