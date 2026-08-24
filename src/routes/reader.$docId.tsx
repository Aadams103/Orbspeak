import { createFileRoute } from "@tanstack/react-router";
import { ReaderWorkspace } from "@/features/reader/ReaderWorkspace";

export const Route = createFileRoute("/reader/$docId")({
  component: ReaderDocumentPage,
});

function ReaderDocumentPage() {
  const { docId } = Route.useParams();
  return <ReaderWorkspace docId={docId} />;
}
