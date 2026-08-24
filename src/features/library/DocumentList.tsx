import { Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { documentKind, formatUpdatedAt } from "@/lib/document-meta";
import type { StudioDocumentMeta } from "@/features/studio/studioTypes";

type Mode = "listen" | "produce";

export function DocumentList({
  documents,
  mode,
  empty,
}: {
  documents: StudioDocumentMeta[];
  mode: Mode;
  empty: string;
}) {
  if (documents.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <BookOpen className="h-10 w-10 opacity-40" />
          <p>{empty}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {documents.map((doc) => (
        <Link
          key={doc.id}
          to={mode === "listen" ? "/reader/$docId" : "/studio/$docId"}
          params={{ docId: doc.id }}
          className="block"
        >
          <Card className="transition hover:border-primary/40">
            <CardContent className="flex items-center justify-between gap-4 py-4">
              <div className="min-w-0">
                <div className="truncate font-medium">{doc.title}</div>
                <div className="text-xs text-muted-foreground">
                  {documentKind(doc.fileName)}
                  {doc.updatedAt ? ` • ${formatUpdatedAt(doc.updatedAt)}` : ""}
                </div>
              </div>
              <div className="shrink-0 text-xs text-muted-foreground">
                {doc.hasVoiceover ? "Voiceover ready" : "Needs voiceover"}
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
