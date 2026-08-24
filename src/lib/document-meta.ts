export function documentKind(fileName: string | undefined | null): string {
  const ext = (fileName ?? "").split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "PDF";
  if (ext === "md" || ext === "markdown") return "Markdown";
  if (ext === "txt") return "Text";
  return "Document";
}

export function formatUpdatedAt(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
