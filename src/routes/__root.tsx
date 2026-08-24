import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Link, Outlet, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { Toaster } from "@/components/ui/sonner";

export const Route = createRootRoute({
	component: Root,
});

function Root() {
	return (
		<ErrorBoundary tagName="main">
			<nav className="fixed left-4 top-3 z-[80] flex items-center gap-1 rounded-full border bg-background/90 px-2 py-1 text-xs shadow-sm backdrop-blur">
				<Link
					to="/"
					className="rounded-full px-3 py-1 text-muted-foreground hover:text-foreground [&.active]:bg-primary [&.active]:text-primary-foreground"
					activeOptions={{ exact: true }}
				>
					Dictate
				</Link>
				<Link
					to="/studio"
					className="rounded-full px-3 py-1 text-muted-foreground hover:text-foreground [&.active]:bg-primary [&.active]:text-primary-foreground"
				>
					Studio
				</Link>
			</nav>
			<Outlet />
			<TanStackRouterDevtools position="bottom-right" />
			<Toaster />
		</ErrorBoundary>
	);
}
