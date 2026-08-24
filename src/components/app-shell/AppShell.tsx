import { Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-shell/AppHeader";
import { AppRail } from "@/components/app-shell/AppRail";
import { PlaybackProvider } from "@/components/playback/PlaybackProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { loadAudioProviders, type AudioProvidersSnapshot } from "@/lib/engine-status";
import { useMediaQuery } from "@/lib/useMediaQuery";

const PAGE_META: Array<{ test: (path: string) => boolean; title: string; subtitle?: string; hideHeader?: boolean; flush?: boolean }> = [
  { test: (path) => path === "/", title: "Home", subtitle: "Private AI Voice Platform" },
  { test: (path) => path === "/reader", title: "Reader", subtitle: "Listen to documents on this PC" },
  { test: (path) => path.startsWith("/reader/"), title: "Reader", hideHeader: true, flush: true },
  { test: (path) => path === "/studio", title: "Studio", subtitle: "Produce audio on this PC" },
  { test: (path) => path.startsWith("/studio/"), title: "Studio", hideHeader: true, flush: true },
  { test: (path) => path === "/voices", title: "Voices", subtitle: "Choose a voice for Studio and Reader" },
  { test: (path) => path === "/dictation", title: "Dictation", subtitle: "Speak, then place the text where you work", flush: true },
  { test: (path) => path === "/settings", title: "Settings", subtitle: "Engines, connections, and storage" },
];

export function AppShell() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const expanded = useMediaQuery("(min-width: 1280px)");
  const [snapshot, setSnapshot] = useState<AudioProvidersSnapshot | null>(null);
  const meta = PAGE_META.find((item) => item.test(pathname)) ?? {
    test: () => true,
    title: "OrbSpeak",
    hideHeader: false,
    flush: false,
  };

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  useEffect(() => {
    loadAudioProviders()
      .then(setSnapshot)
      .catch(() => setSnapshot(null));
  }, [pathname]);

  return (
    <TooltipProvider delayDuration={200}>
      <PlaybackProvider>
        <div className="flex h-full min-h-0 bg-background text-foreground">
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-card focus:px-3 focus:py-2"
          >
            Skip to content
          </a>
          <AppRail collapsed={!expanded} snapshot={snapshot} />
          <div className="flex min-w-0 flex-1 flex-col">
            {meta.hideHeader ? null : <AppHeader title={meta.title} subtitle={meta.subtitle} />}
            <main id="main" className={meta.flush ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 flex-1 overflow-auto"}>
              <Outlet />
            </main>
          </div>
        </div>
      </PlaybackProvider>
    </TooltipProvider>
  );
}
