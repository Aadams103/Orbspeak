import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { LibraryView } from "@/features/studio/LibraryView";
import { StudioProfilePanel } from "@/features/studio/StudioProfilePanel";
import { StudioShell } from "@/features/studio/StudioShell";
import { importDocument, listDocuments, loadStyle, saveStyle } from "@/features/studio/studioClient";
import { engineErrorMessage } from "@/lib/engine-ipc";
import { DEFAULT_STUDIO_STYLE, type StudioDocumentMeta, type StudioStyle } from "@/features/studio/studioTypes";

export const Route = createFileRoute("/studio")({
  component: StudioLibraryPage,
});

function StudioLibraryPage() {
  const [documents, setDocuments] = useState<StudioDocumentMeta[]>([]);
  const [style, setStyle] = useState<StudioStyle>(DEFAULT_STUDIO_STYLE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setDocuments(await listDocuments());
    setStyle(await loadStyle());
  }, []);

  useEffect(() => {
    refresh().catch((err) => setError(engineErrorMessage(err)));
  }, [refresh]);

  return (
    <StudioShell>
      <div className="space-y-10">
        <LibraryView
          documents={documents}
          busy={busy}
          error={error}
          onImport={async (file) => {
            setBusy(true);
            setError(null);
            try {
              await importDocument(file);
              await refresh();
            } catch (err) {
              setError(engineErrorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        />
        <StudioProfilePanel
          style={style}
          onChange={setStyle}
          busy={busy}
          onSave={async () => {
            setBusy(true);
            setError(null);
            try {
              setStyle(await saveStyle(style));
            } catch (err) {
              setError(engineErrorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
    </StudioShell>
  );
}
