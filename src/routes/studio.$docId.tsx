import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArtworkPanel } from "@/features/studio/ArtworkPanel";
import { ReaderView } from "@/features/studio/ReaderView";
import { StudioShell } from "@/features/studio/StudioShell";
import { VoiceoverPanel } from "@/features/studio/VoiceoverPanel";
import {
  exportVoiceover,
  generateArtwork,
  getDocument,
  loadStyle,
  prepareReadAloud,
} from "@/features/studio/studioClient";
import { DEFAULT_STUDIO_STYLE, type StudioDocument, type StudioStyle } from "@/features/studio/studioTypes";
import { useTtsPlayback } from "@/features/studio/useTtsPlayback";
import { splitSentences } from "@/features/studio/applyStyle";

export const Route = createFileRoute("/studio/$docId")({
  component: StudioDocumentPage,
});

function StudioDocumentPage() {
  const { docId } = Route.useParams();
  const [doc, setDoc] = useState<StudioDocument | null>(null);
  const [style, setStyle] = useState<StudioStyle>(DEFAULT_STUDIO_STYLE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voiceoverUrl, setVoiceoverUrl] = useState<string | null>(null);
  const playback = useTtsPlayback();

  const refresh = useCallback(async () => {
    const next = await getDocument(docId);
    setDoc(next);
    setStyle(await loadStyle());
  }, [docId]);

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [refresh]);

  const text = doc ? prepareReadAloud(doc.text, style) : "";
  const sentences = doc?.sentences?.length ? doc.sentences : splitSentences(text);

  return (
    <StudioShell>
      <div className="mb-4">
        <Link to="/studio" className="text-sm text-muted-foreground hover:text-foreground">
          Back to library
        </Link>
      </div>
      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      {!doc ? (
        <p className="text-muted-foreground">Loading document…</p>
      ) : (
        <div className="space-y-10">
          <ReaderView
            title={doc.title}
            sentences={sentences}
            activeIndex={playback.activeIndex}
            speaking={playback.speaking}
            paused={playback.paused}
            onPlay={() =>
              playback.speak(text, {
                voiceId: style.ttsVoice,
                rate: style.ttsRate,
                instruct: style.instruct || style.styleMarkdown,
              })
            }
            onPause={playback.pause}
            onResume={playback.resume}
            onStop={playback.stop}
          />
          {playback.error ? <p className="text-sm text-destructive">{playback.error}</p> : null}
          <VoiceoverPanel
            hasVoiceover={doc.hasVoiceover}
            dataUrl={voiceoverUrl}
            busy={busy}
            onExport={async () => {
              setBusy(true);
              try {
                const result = await exportVoiceover(doc.id, {
                  voiceId: style.ttsVoice,
                  instruct: style.instruct,
                });
                setVoiceoverUrl(result.dataUrl ?? null);
                await refresh();
                return result.dataUrl;
              } finally {
                setBusy(false);
              }
            }}
          />
          <ArtworkPanel
            coverDataUrl={doc.coverDataUrl}
            scenes={doc.scenes}
            busy={busy}
            onGenerate={async (prompt, kind) => {
              setBusy(true);
              try {
                await generateArtwork(doc.id, prompt, kind);
                await refresh();
              } finally {
                setBusy(false);
              }
            }}
          />
        </div>
      )}
    </StudioShell>
  );
}
