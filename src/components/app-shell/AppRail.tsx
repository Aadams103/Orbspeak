import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, Home, Mic, Settings, Sparkles, Wand2 } from "lucide-react";
import { OrbMark } from "@/components/app-shell/OrbMark";
import { EngineStatus } from "@/components/app-shell/EngineStatus";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AudioProvidersSnapshot } from "@/lib/engine-status";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Home", icon: Home, exact: true },
  { to: "/reader", label: "Reader", icon: BookOpen },
  { to: "/studio", label: "Studio", icon: Sparkles },
  { to: "/voices", label: "Voices", icon: Wand2 },
  { to: "/dictation", label: "Dictation", icon: Mic },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppRail({
  collapsed,
  snapshot,
}: {
  collapsed: boolean;
  snapshot: AudioProvidersSnapshot | null;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        collapsed ? "w-[80px]" : "w-[220px]",
      )}
    >
      <div className={cn("flex items-center gap-3 px-4 py-5", collapsed && "justify-center px-2")}>
        <OrbMark className="size-8 text-primary" />
        {!collapsed ? (
          <div className="min-w-0">
            <p className="text-[13px] font-semibold tracking-[0.18em]">ORBSPEAK</p>
            <p className="text-[11px] text-muted-foreground">Private AI Voice Platform</p>
          </div>
        ) : (
          <span className="sr-only">OrbSpeak</span>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-2" aria-label="Main">
        {NAV.map((item) => {
          const Icon = item.icon;
          const exact = "exact" in item && item.exact;
          const active = exact
            ? pathname === item.to
            : pathname === item.to || pathname.startsWith(`${item.to}/`);
          const link = (
            <Link
              to={item.to}
              className={cn(
                "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:text-foreground",
                collapsed && "justify-center px-0",
                active && "bg-primary/15 text-foreground",
              )}
            >
              {active ? <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary" /> : null}
              <Icon className="size-4 shrink-0" />
              {!collapsed ? <span>{item.label}</span> : <span className="sr-only">{item.label}</span>}
            </Link>
          );

          if (!collapsed) return <div key={item.to}>{link}</div>;
          return (
            <Tooltip key={item.to}>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      <div className={cn("border-t border-sidebar-border px-3 py-4", collapsed && "px-2")}>
        <EngineStatus snapshot={snapshot} compact={collapsed} />
      </div>
    </aside>
  );
}
