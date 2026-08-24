import { createFileRoute, Outlet, useMatches } from "@tanstack/react-router";
import { StudioLibraryPage } from "@/features/studio/StudioLibraryPage";

export const Route = createFileRoute("/studio")({
  component: StudioRoute,
});

function StudioRoute() {
  const matches = useMatches();
  const isDocument = matches.some((match) => match.routeId === "/studio/$docId");
  return isDocument ? <Outlet /> : <StudioLibraryPage />;
}
