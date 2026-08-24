import { engineStatusLines, type AudioProvidersSnapshot } from "@/lib/engine-status";
import { cn } from "@/lib/utils";

export function EngineStatus({
  snapshot,
  compact,
}: {
  snapshot: AudioProvidersSnapshot | null;
  compact?: boolean;
}) {
  const lines = engineStatusLines(snapshot);
  return (
    <div className={cn("min-w-0", compact && "text-center")}>
      <div className="flex items-center gap-2">
        <span className={cn("size-1.5 shrink-0 rounded-full", snapshot ? "bg-primary" : "bg-muted-foreground")} aria-hidden />
        <p className="truncate text-[11px] font-medium text-foreground">{lines.primary}</p>
      </div>
      {!compact ? <p className="mt-0.5 truncate pl-3.5 text-[11px] text-muted-foreground">{lines.secondary}</p> : null}
    </div>
  );
}
