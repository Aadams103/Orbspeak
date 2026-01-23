import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Outlet, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { Toaster } from "@/components/ui/sonner";

export const Route = createRootRoute({
	component: Root,
});

function Root() {
	return (
		<ErrorBoundary tagName="main">
			<Outlet />
			<TanStackRouterDevtools position="bottom-right" />
			<Toaster />
		</ErrorBoundary>
	);
}
