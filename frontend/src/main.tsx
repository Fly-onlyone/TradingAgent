import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import * as Sentry from "@sentry/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { ZoomIndicator } from "./components/common/ZoomIndicator";
import { useAppTheme } from "./hooks/useAppTheme";
import { useUIScaleZoom } from "./hooks/useUIScaleZoom";
// Import the generated route tree
import { routeTree } from "./routeTree.gen";
import { initializeFrontendLogging } from "./utils/frontendLogger";
import { createFrontendSentryInitOptions } from "./utils/sentryConfig";

Sentry.init(
	createFrontendSentryInitOptions(import.meta.env, {
		browserTracingIntegrationFactory: () => Sentry.browserTracingIntegration(),
		browserProfilingIntegrationFactory: () =>
			Sentry.browserProfilingIntegration(),
		consoleLoggingIntegrationFactory: () => Sentry.consoleLoggingIntegration(),
	}),
);

// Create React Query client
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 1000 * 60, // 1 minute
			gcTime: 1000 * 60 * 10, // 10 minutes
			retry: 1,
			refetchOnMount: false,
			refetchOnWindowFocus: false,
		},
	},
});

// Create a new router instance
const router = createRouter({
	routeTree,
	context: {},
	defaultPreload: false,
	scrollRestoration: true,
	defaultStructuralSharing: true,
	defaultPreloadStaleTime: 30_000,
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

initializeFrontendLogging();

function App() {
	const theme = useAppTheme();
	const { uiScale, visible } = useUIScaleZoom();
	return (
		<ThemeProvider theme={theme}>
			<CssBaseline />
			<RouterProvider router={router} />
			<ZoomIndicator uiScale={uiScale} visible={visible} />
		</ThemeProvider>
	);
}

// Render the app
const rootElement = document.getElementById("app");
if (rootElement && !rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement, {
		// React 19 error hooks — capture errors Sentry can't catch via ErrorBoundary alone
		onUncaughtError: Sentry.reactErrorHandler(),
		onCaughtError: Sentry.reactErrorHandler(),
		onRecoverableError: Sentry.reactErrorHandler(),
	});
	root.render(
		<StrictMode>
			<Sentry.ErrorBoundary fallback={<p>Something went wrong</p>}>
				<QueryClientProvider client={queryClient}>
					<App />
				</QueryClientProvider>
			</Sentry.ErrorBoundary>
		</StrictMode>,
	);
}
