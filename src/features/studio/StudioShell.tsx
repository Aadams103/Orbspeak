import type { ReactNode } from "react";

export function StudioShell({ children }: { children: ReactNode }) {
  return <div className="h-full min-h-0">{children}</div>;
}
