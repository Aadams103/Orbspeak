import { localityLabel } from "@/lib/provider-labels";
import { cn } from "@/lib/utils";

export function LocalCloudBadge({ provider }: { provider: string }) {
  const label = localityLabel(provider);
  return (
    <span
      className={cn(
        "rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide",
        label === "LOCAL" ? "border-primary/40 text-primary" : "border-border text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}
