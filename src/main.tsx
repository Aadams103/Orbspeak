import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

import reportWebVitals from "./sdk/core/internal/reportWebVitals.ts";
import "./styles.css";

// Initialize Creao platform SDK
import { APP_CONFIG } from "./sdk/core/global.ts";
export { APP_CONFIG }; // for backward compatibility

// Initialize log collector early to capture all logs
import { getLogCollector } from "./lib/log-collector";
// #region agent log
fetch('http://127.0.0.1:7242/ingest/5dc26b30-67de-4c00-b7f1-797bfaa1f758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.tsx:17',message:'Before log collector init',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
// #endregion
try {
  const collector = getLogCollector();
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/5dc26b30-67de-4c00-b7f1-797bfaa1f758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.tsx:20',message:'Log collector initialized',data:{success:true,hasCollector:!!collector},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
} catch (err) {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/5dc26b30-67de-4c00-b7f1-797bfaa1f758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.tsx:23',message:'Log collector init failed',data:{error:err instanceof Error?err.message:String(err)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
  // #endregion
  console.error('Failed to initialize log collector:', err);
}

// Create a QueryClient instance
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 5 * 60 * 1000, // 5 minutes
			gcTime: 10 * 60 * 1000, // 10 minutes (previously cacheTime)
			retry: 1,
			refetchOnWindowFocus: false,
		},
	},
});

// Create a new router instance
const router = createRouter({
	routeTree,
	context: {},
	defaultPreload: "intent",
	scrollRestoration: true,
	defaultStructuralSharing: true,
	defaultPreloadStaleTime: 0,
	basepath: import.meta.env.TENANT_ID ? `/${import.meta.env.TENANT_ID}` : "/",
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

// Render the app
const rootElement = document.getElementById("app");
if (rootElement && !rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement);
	root.render(
		<StrictMode>
			<QueryClientProvider client={queryClient}>
				<RouterProvider router={router} />
			</QueryClientProvider>
		</StrictMode>,
	);
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
