import { useNavigate } from "@tanstack/react-router";
import { FileUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DocumentList } from "@/features/library/DocumentList";
import { importDocument, listDocuments, openDocumentPicker } from "@/features/studio/studioClient";
import type { StudioDocumentMeta } from "@/features/studio/studioTypes";
import { engineErrorMessage } from "@/lib/engine-ipc";

export function StudioLibraryPage() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<StudioDocumentMeta[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setDocuments(await listDocuments());
  }, []);

  useEffect(() => {
    refresh().catch((err) => setError(engineErrorMessage(err)));
  }, [refresh]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">Import a script to produce a voiceover on this PC.</p>
        <Button
          disabled={busy}
          onClick={async () => {
            const file = await openDocumentPicker();
            if (!file) return;
            setBusy(true);
            setError(null);
            try {
              const doc = await importDocument(file);
              await refresh();
              await navigate({ to: "/studio/$docId", params: { docId: doc.id } });
            } catch (err) {
              setError(engineErrorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <FileUp className="size-4" />
          Import
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DocumentList documents={documents} mode="produce" empty="No projects yet. Import a document to produce audio." />
    </div>
  );
}
