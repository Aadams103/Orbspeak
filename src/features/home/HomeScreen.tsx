import { useNavigate } from "@tanstack/react-router";
import { BookOpen, Mic, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DocumentList } from "@/features/library/DocumentList";
import { importDocument, listDocuments, openDocumentPicker } from "@/features/studio/studioClient";
import type { StudioDocumentMeta } from "@/features/studio/studioTypes";
import { engineErrorMessage } from "@/lib/engine-ipc";
import { engineStatusLines, loadAudioProviders, type AudioProvidersSnapshot } from "@/lib/engine-status";

const ACTIONS = [
  {
    id: "read",
    title: "Read something",
    description: "Import a document and listen in Reader.",
    icon: BookOpen,
  },
  {
    id: "produce",
    title: "Create audio",
    description: "Import a script and produce it in Studio.",
    icon: Sparkles,
  },
  {
    id: "voice",
    title: "Create a voice",
    description: "Browse the Voice Library. Cloning is not available yet.",
    icon: Wand2,
  },
  {
    id: "dictate",
    title: "Start dictating",
    description: "Open the existing orb and start speaking.",
    icon: Mic,
  },
] as const;

export function HomeScreen() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<StudioDocumentMeta[]>([]);
  const [snapshot, setSnapshot] = useState<AudioProvidersSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const status = engineStatusLines(snapshot);

  useEffect(() => {
    listDocuments()
      .then(setDocuments)
      .catch((err) => setError(engineErrorMessage(err)));
    loadAudioProviders()
      .then(setSnapshot)
      .catch(() => setSnapshot(null));
  }, []);

  const importAndOpen = async (mode: "listen" | "produce") => {
    const file = await openDocumentPicker();
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const doc = await importDocument(file);
      await navigate({
        to: mode === "listen" ? "/reader/$docId" : "/studio/$docId",
        params: { docId: doc.id },
      });
    } catch (err) {
      setError(engineErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-10 px-6 py-8">
      <div>
        <h2 className="text-2xl font-semibold">What do you want to do?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {status.primary} · {status.secondary}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <Card key={action.id} className="transition hover:border-primary/40">
              <CardContent className="flex flex-col gap-4 p-5">
                <div className="flex items-start gap-3">
                  <span className="rounded-md bg-primary/15 p-2 text-primary">
                    <Icon className="size-4" />
                  </span>
                  <div>
                    <h3 className="font-medium">{action.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{action.description}</p>
                  </div>
                </div>
                <Button
                  disabled={busy && (action.id === "read" || action.id === "produce")}
                  variant={action.id === "dictate" || action.id === "voice" ? "outline" : "default"}
                  onClick={() => {
                    if (action.id === "read") void importAndOpen("listen");
                    if (action.id === "produce") void importAndOpen("produce");
                    if (action.id === "voice") void navigate({ to: "/voices" });
                    if (action.id === "dictate") void navigate({ to: "/dictation" });
                  }}
                >
                  {action.id === "voice" ? "Open Voice Library" : action.title}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold tracking-wide text-muted-foreground">Recent projects</h3>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DocumentList documents={documents.slice(0, 8)} mode="produce" empty="No projects yet. Import a document to get started." />
      </section>
    </div>
  );
}
