import { useNavigate } from "@tanstack/react-router";
import { SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlaybackBar } from "@/components/playback/PlaybackBar";
import { usePlayback } from "@/components/playback/PlaybackProvider";
import { SentenceDocument } from "@/components/playback/SentenceDocument";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EngineStatus } from "@/components/app-shell/EngineStatus";
import { splitSentences } from "@/features/studio/applyStyle";
import { ExportDialog } from "@/features/studio/ExportDialog";
import { StudioInspector } from "@/features/studio/StudioInspector";
import { StudioProjectRail } from "@/features/studio/StudioProjectRail";
import {
  exportVoiceover,
  generateArtwork,
  getDocument,
  importDocument,
  listTtsVoices,
  loadStyle,
  openDocumentPicker,
  prepareReadAloud,
  saveDocumentText,
  saveStyle,
} from "@/features/studio/studioClient";
import {
  DEFAULT_STUDIO_STYLE,
  documentAsSections,
  type StudioDocument,
  type StudioStyle,
} from "@/features/studio/studioTypes";
import {
  clampSpeechRate,
  parseTtsProviderId,
  resolveVoiceId,
  voicesForProvider,
  type TtsProviderId,
  type TtsVoiceInfo,
} from "@/features/studio/ttsContracts";
import { engineErrorMessage } from "@/lib/engine-ipc";
import { loadAudioProviders, type AudioProvidersSnapshot } from "@/lib/engine-status";
import { useMediaQuery } from "@/lib/useMediaQuery";

export function StudioWorkspace({ docId }: { docId: string }) {
  const navigate = useNavigate();
  const playback = usePlayback();
  const showInspectorPane = useMediaQuery("(min-width: 1280px)");
  const [doc, setDoc] = useState<StudioDocument | null>(null);
  const [draft, setDraft] = useState("");
  const [savedText, setSavedText] = useState("");
  const [style, setStyle] = useState<StudioStyle>(DEFAULT_STUDIO_STYLE);
  const [catalogs, setCatalogs] = useState<Partial<Record<TtsProviderId, TtsVoiceInfo[]>>>({});
  const [snapshot, setSnapshot] = useState<AudioProvidersSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const dirty = draft !== savedText;

  const refresh = useCallback(async () => {
    const [nextDoc, nextStyle, nextVoices, nextSnapshot] = await Promise.all([
      getDocument(docId),
      loadStyle(),
      listTtsVoices(),
      loadAudioProviders(),
    ]);
    setDoc(nextDoc);
    if (nextDoc) {
      setDraft(nextDoc.text);
      setSavedText(nextDoc.text);
    }
    setStyle(nextStyle);
    setCatalogs(nextVoices);
    setSnapshot(nextSnapshot);
  }, [docId]);

  useEffect(() => {
    refresh().catch((err) => setError(engineErrorMessage(err)));
  }, [refresh]);

  useEffect(() => {
    void playback.stop();
    return () => {
      void playback.stop();
    };
  }, [docId, playback.stop]);

  const provider = useMemo(() => {
    try {
      return parseTtsProviderId(style.ttsProvider);
    } catch {
      return "qwen3" as const;
    }
  }, [style.ttsProvider]);

  const spokenText = prepareReadAloud(draft, style);
  const sentences = splitSentences(spokenText);
  const voices = voicesForProvider(provider, catalogs);
  const settings = {
    provider,
    voiceId: resolveVoiceId(provider, style.ttsVoice, catalogs),
    rate: clampSpeechRate(style.ttsRate),
    instruct: style.instruct,
    styleMarkdown: style.styleMarkdown,
    pronunciationCsv: style.pronunciationCsv,
  };

  const persistStyle = async (next: StudioStyle) => {
    const resolved = {
      ...next,
      ttsProvider: (() => {
        try {
          return parseTtsProviderId(next.ttsProvider);
        } catch {
          return provider;
        }
      })(),
      ttsVoice: resolveVoiceId(
        (() => {
          try {
            return parseTtsProviderId(next.ttsProvider);
          } catch {
            return provider;
          }
        })(),
        next.ttsVoice,
        catalogs,
      ),
      ttsRate: clampSpeechRate(next.ttsRate),
    };
    setStyle(resolved);
    try {
      setStyle(await saveStyle(resolved));
    } catch (err) {
      setError(engineErrorMessage(err));
    }
  };

  const saveDraft = async () => {
    if (!doc || !dirty) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await saveDocumentText(doc.id, draft);
      setDoc(saved);
      setSavedText(saved.text);
      setDraft(saved.text);
    } catch (err) {
      setError(engineErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveDraft();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const inspector = (
    <StudioInspector
      style={style}
      provider={provider}
      catalogs={catalogs}
      coverDataUrl={doc?.coverDataUrl}
      scenes={doc?.scenes}
      busy={busy}
      onChange={(next) => void persistStyle(next)}
      onGenerateArtwork={async (prompt, kind) => {
        if (!doc) return;
        setBusy(true);
        try {
          await generateArtwork(doc.id, prompt, kind);
          await refresh();
        } finally {
          setBusy(false);
        }
      }}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{doc?.title ?? "Studio"}</p>
          <p className="text-xs text-muted-foreground">{dirty ? "Unsaved" : "Saved"}</p>
        </div>
        <div className="flex items-center gap-3">
          <EngineStatus snapshot={snapshot} />
          {!showInspectorPane ? (
            <Button size="sm" variant="outline" onClick={() => setInspectorOpen(true)}>
              <SlidersHorizontal className="size-4" />
              Inspector
            </Button>
          ) : null}
          <Button onClick={() => setExportOpen(true)} disabled={!doc}>
            Export
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <StudioProjectRail
          sections={doc ? documentAsSections(doc) : []}
          activeId={doc?.id}
          onAdd={async () => {
            const file = await openDocumentPicker();
            if (!file) return;
            try {
              const imported = await importDocument(file);
              await navigate({ to: "/studio/$docId", params: { docId: imported.id } });
            } catch (err) {
              setError(engineErrorMessage(err));
            }
          }}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-auto px-6 py-8">
            {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
            {!doc ? (
              <p className="text-sm text-muted-foreground">Loading document…</p>
            ) : (
              <div className="mx-auto max-w-[65ch]">
                {playback.speaking ? (
                  <SentenceDocument sentences={sentences} activeIndex={playback.highlightIndex} />
                ) : (
                  <SentenceDocument
                    sentences={sentences}
                    activeIndex={null}
                    editable
                    value={draft}
                    onChange={setDraft}
                    onBlur={() => void saveDraft()}
                  />
                )}
              </div>
            )}
          </div>
          <PlaybackBar
            sentences={sentences}
            settings={settings}
            voices={voices}
            disabled={!doc}
            onRateChange={(rate) => void persistStyle({ ...style, ttsRate: rate })}
            onVoiceChange={(voiceId) => void persistStyle({ ...style, ttsVoice: voiceId })}
          />
        </div>

        {showInspectorPane ? (
          <aside className="w-[360px] shrink-0 overflow-hidden border-l border-border bg-card/40">
            <ScrollArea className="h-full">{inspector}</ScrollArea>
          </aside>
        ) : (
          <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
            <SheetContent className="w-full sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Inspector</SheetTitle>
              </SheetHeader>
              <ScrollArea className="h-[calc(100%-3rem)]">{inspector}</ScrollArea>
            </SheetContent>
          </Sheet>
        )}
      </div>

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        projectName={doc?.title ?? "Untitled"}
        voiceName={settings.voiceId}
        provider={provider}
        busy={busy}
        onExport={async () => {
          if (!doc) return;
          setBusy(true);
          try {
            if (dirty) await saveDraft();
            await exportVoiceover(doc.id, settings);
            await refresh();
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
