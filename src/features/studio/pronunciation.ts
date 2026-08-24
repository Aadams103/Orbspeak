export type PronunciationRow = {
  id: string;
  heard: string;
  said: string;
};

function nextId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `row-${Math.random().toString(16).slice(2)}`;
}

export function parsePronunciationRows(csv: string | undefined | null): PronunciationRow[] {
  if (!csv?.trim()) return [];
  return csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [heard = "", said = ""] = line.split(",", 2);
      return { id: nextId(), heard: heard.trim(), said: said.trim() };
    })
    .filter((row) => row.heard || row.said);
}

export function serializePronunciationRows(rows: PronunciationRow[]): string {
  return rows
    .map((row) => `${row.heard.trim()},${row.said.trim()}`)
    .filter((line) => line !== ",")
    .join("\n");
}

export function createPronunciationRow(heard = "", said = ""): PronunciationRow {
  return { id: nextId(), heard, said };
}
