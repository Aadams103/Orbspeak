import { useNavigate } from "@tanstack/react-router";
import { FileUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlaybackBar } from "@/components/playback/PlaybackBar";
import { usePlayback } from "@/components/playback/PlaybackProvider";
import { SentenceDocument } from "@/components/playback/SentenceDocument";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { splitSentences } from "@/features/studio/applyStyle";
import { DocumentList } from "@/features/library/DocumentList";
import {
  getDocument,
  importDocument,
  listDocuments,
  listTtsVoices,
  loadStyle,
  openDocumentPicker,
  prepareReadAloud,
  saveStyle,
} from "@/features/studio/studioClient";
import { DEFAULT_STUDIO_STYLE, type StudioDocument, type StudioDocumentMeta, type StudioStyle } from "@/features/studio/studioTypes";
import { clampSpeechRate, parseTtsProviderId, resolveVoiceId, voicesForProvider, type TtsProviderId, type TtsVoiceInfo } from "@/features/studio/ttsContracts";
import { engineErrorMessage } from "@/lib/engine-ipc";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";

export function ReaderWorkspace({ docId }: { docId: string }) {
  const navigate = useNavigate();
  const playback = usePlayback();
  const wide = useMediaQuery("(min-width: 1280px)");
  const [documents, setDocuments] = useState<StudioDocumentMeta[]>([]);
  const [doc, setDoc] = useState<StudioDocument | null>(null);
  const [style, setStyle] = useState<StudioStyle>(DEFAULT_STUDIO_STYLE);
  const [catalogs, setCatalogs] = useState<Partial<Record<TtsProviderId, TtsVoiceInfo[]>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [nextDoc, nextStyle, nextDocs, nextVoices] = await Promise.all([
      getDocument(docId),
      loadStyle(),
      listDocuments(),
      listTtsVoices(),
    ]);
    setDoc(nextDoc);
    setStyle(nextStyle);
    setDocuments(nextDocs);
    setCatalogs(nextVoices);
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
  const voices = voicesForProvider(provider, catalogs);
  const spokenText = doc ? prepareReadAloud(doc.text, style) : "";
  const sentences = splitSentences(spokenText);
  const settings = {
    provider,
    voiceId: resolveVoiceId(provider, style.ttsVoice, catalogs),
    rate: clampSpeechRate(style.ttsRate),
    instruct: style.instruct,
    styleMarkdown: style.styleMarkdown,
    pronunciationCsv: style.pronunciationCsv,
  };

  const persist = async (next: StudioStyle) => {
    setStyle(next);
    try {
      setStyle(await saveStyle(next));
    } catch (err) {
      setError(engineErrorMessage(err));
    }
  };

  return (
    <div className="flex h-full min-h-0">
      {wide ? (
        <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-card/40">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground">Library</p>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                const file = await openDocumentPicker();
                if (!file) return;
                setBusy(true);
                try {
                  const imported = await importDocument(file);
                  await refresh();
                  await navigate({ to: "/reader/$docId", params: { docId: imported.id } });
                } catch (err) {
                  setError(engineErrorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <FileUp className="size-4" />
              Add
            </Button>
          </div>
          <ScrollArea className="flex-1 px-3 pb-4">
            <DocumentList documents={documents} mode="listen" empty="No documents yet." />
          </ScrollArea>
        </aside>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{doc?.title ?? "Reader"}</p>
            <p className="text-xs text-muted-foreground">Listen only</p>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-auto px-6 py-8">
          {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
          {!doc ? (
            <p className="text-sm text-muted-foreground">Loading document…</p>
          ) : (
            <div className={cn("mx-auto max-w-[65ch]")}>
              <SentenceDocument sentences={sentences} activeIndex={playback.highlightIndex} />
            </div>
          )}
        </div>
        <PlaybackBar
          sentences={sentences}
          settings={settings}
          voices={voices}
          disabled={!doc}
          onRateChange={(rate) => void persist({ ...style, ttsRate: rate })}
          onVoiceChange={(voiceId) => void persist({ ...style, ttsVoice: voiceId })}
        />
      </div>
    </div>
  );
}
