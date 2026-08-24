import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppShell } from "@/components/app-shell/AppShell";
import { createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { Toaster } from "@/components/ui/sonner";

export const Route = createRootRoute({
	component: Root,
});

function Root() {
	return (
		<ErrorBoundary tagName="main">
			<AppShell />
			<TanStackRouterDevtools position="bottom-right" />
			<Toaster />
		</ErrorBoundary>
	);
}
