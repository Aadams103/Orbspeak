import { createFileRoute, Outlet, useMatches } from "@tanstack/react-router";
import { ReaderLibrary } from "@/features/reader/ReaderLibrary";

export const Route = createFileRoute("/reader")({
  component: ReaderRoute,
});

function ReaderRoute() {
  const matches = useMatches();
  const isDocument = matches.some((match) => match.routeId === "/reader/$docId");
  return isDocument ? <Outlet /> : <ReaderLibrary />;
}
