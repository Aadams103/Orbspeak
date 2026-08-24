import { createFileRoute } from "@tanstack/react-router";
import { StudioWorkspace } from "@/features/studio/StudioWorkspace";

export const Route = createFileRoute("/studio/$docId")({
  component: StudioDocumentPage,
});

function StudioDocumentPage() {
  const { docId } = Route.useParams();
  return <StudioWorkspace docId={docId} />;
}
