import { friendlyProviderLabel } from "@/lib/provider-labels";

export function ProviderLabel({ provider }: { provider: string }) {
  return <span className="text-xs text-muted-foreground">{friendlyProviderLabel(provider)}</span>;
}
