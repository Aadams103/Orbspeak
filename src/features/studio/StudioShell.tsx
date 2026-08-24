import type { ReactNode } from "react";

export function StudioShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground pt-14">
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
