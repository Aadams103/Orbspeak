import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { FileUp, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { StudioDocumentMeta } from "./studioTypes";

type Props = {
  documents: StudioDocumentMeta[];
  busy?: boolean;
  error?: string | null;
  onImport: (file: File) => void;
};

export function LibraryView({ documents, busy, error, onImport }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Studio library</h1>
          <p className="text-sm text-muted-foreground">
            Upload .txt, .md, or .pdf. Files stay on this computer.
          </p>
        </div>
        <Button onClick={() => inputRef.current?.click()} disabled={busy}>
          <FileUp className="h-4 w-4" />
          Upload document
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onImport(file);
            event.target.value = "";
          }}
        />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <BookOpen className="h-10 w-10 opacity-40" />
            <p>No documents yet. Upload an article to read it aloud.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {documents.map((doc) => (
            <Link key={doc.id} to="/studio/$docId" params={{ docId: doc.id }} className="block">
              <Card className="transition hover:border-primary/40">
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div>
                    <div className="font-medium">{doc.title}</div>
                    <div className="text-xs text-muted-foreground">{doc.fileName}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {doc.hasVoiceover ? "Voiceover ready" : "Needs voiceover"}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
