import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import * as Sentry from "@sentry/react";
import {
	onlineManager,
	QueryClient,
	QueryClientProvider,
} from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { StrictMode, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { ZoomIndicator } from "./components/common/ZoomIndicator";
import { useAppTheme } from "./hooks/useAppTheme";
import { useUIScaleZoom } from "./hooks/useUIScaleZoom";
// Import the generated route tree
import { routeTree } from "./routeTree.gen";
import { useUIStore } from "./store/uiStore";
import { initializeFrontendLogging } from "./utils/frontendLogger";
import { createFrontendSentryInitOptions } from "./utils/sentryConfig";
import { getApiBaseUrl } from "./utils/tauriEnv";

Sentry.init(
	createFrontendSentryInitOptions(import.meta.env, getApiBaseUrl(), {
		browserTracingIntegrationFactory: () =>
			Sentry.browserTracingIntegration({
				enableInp: true,
			}),
		consoleLoggingIntegrationFactory: () => Sentry.consoleLoggingIntegration(),
	}),
);

// Create React Query client
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 1000 * 60, // 1 minute
			gcTime: 1000 * 60 * 10, // 10 minutes
			retry: 3,
			retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
			refetchOnMount: false,
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
	defaultPreloadStaleTime: 30_000,
	defaultPendingMs: 200,
	defaultPendingMinMs: 500,
	defaultPendingComponent: AppLoadingScreen,
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

initializeFrontendLogging();

/** Lightweight CSS-only loading screen shown while route guards resolve. */
function AppLoadingScreen(): ReactNode {
	return (
		<div
			style={{
				position: "fixed",
				inset: 0,
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap: 16,
				background: "var(--sl-bg, #211b14)",
			}}
		>
			<img
				src="/coin.png"
				alt=""
				style={{ width: 48, height: 48, borderRadius: 12 }}
			/>
			<div
				style={{
					width: 28,
					height: 28,
					border: "2.5px solid rgba(255,255,255,.12)",
					borderTopColor: "var(--sl-accent, #F97316)",
					borderRadius: "50%",
					animation: "sl-spin .7s linear infinite",
				}}
			/>
		</div>
	);
}

const HEALTH_POLL_FAST_MS = 3000;
const HEALTH_POLL_SLOW_MS = 30000;
const backendHealthUrl = `${getApiBaseUrl().replace(/\/api\/v1$/, "")}/health`;
let hasLoggedFrontendStartup = false;
let backendHealthMonitorStarted = false;
let backendHasConnected = false;
let lastBackendStatus: "connecting" | "online" | "offline" | null = null;
let lastBackendStatusMessage = "";

function reportBackendStatus(
	setBackendStatus: (
		status: "connecting" | "online" | "offline",
		message?: string,
	) => void,
	status: "connecting" | "online" | "offline",
	message: string,
) {
	setBackendStatus(status, message);

	if (lastBackendStatus === status && lastBackendStatusMessage === message) {
		return;
	}

	lastBackendStatus = status;
	lastBackendStatusMessage = message;

	if (status === "online") {
		console.info(`[startup] Backend health check succeeded: ${message}`);
		return;
	}

	if (status === "connecting") {
		console.info(`[startup] Checking backend health at ${message}`);
		return;
	}

	console.error(`[startup] Backend health check failed: ${message}`);
}

function reportBackendHealthFailure(
	setBackendStatus: (
		status: "connecting" | "online" | "offline",
		message?: string,
	) => void,
	message: string,
) {
	if (!backendHasConnected) {
		reportBackendStatus(
			setBackendStatus,
			"connecting",
			`Waiting for backend at ${backendHealthUrl}`,
		);
		return;
	}

	reportBackendStatus(setBackendStatus, "offline", message);
}

async function checkBackendHealth(
	setBackendStatus: (
		status: "connecting" | "online" | "offline",
		message?: string,
	) => void,
) {
	try {
		const response = await fetch(backendHealthUrl, {
			cache: "no-store",
		});
		if (!response.ok) {
			reportBackendHealthFailure(
				setBackendStatus,
				`Health check returned ${response.status}`,
			);
			return;
		}

		const payload = (await response.json()) as { status?: string };
		backendHasConnected = true;
		reportBackendStatus(
			setBackendStatus,
			"online",
			payload.status ? `Connected (${payload.status})` : "Connected",
		);
	} catch (error) {
		reportBackendHealthFailure(
			setBackendStatus,
			error instanceof Error ? error.message : "Unknown health check error",
		);
	}
}

function ensureBackendHealthMonitor(
	setBackendStatus: (
		status: "connecting" | "online" | "offline",
		message?: string,
	) => void,
) {
	if (backendHealthMonitorStarted) {
		return;
	}

	backendHealthMonitorStarted = true;
	reportBackendStatus(setBackendStatus, "connecting", backendHealthUrl);
	void checkBackendHealth(setBackendStatus);

	let wasOnline = false;
	let intervalId: number | undefined;

	const schedulePolling = (ms: number) => {
		if (intervalId) window.clearInterval(intervalId);
		intervalId = window.setInterval(poll, ms);
	};

	const poll = () => {
		if (document.hidden) return;
		void checkBackendHealth(setBackendStatus).then(() => {
			const isOnline = lastBackendStatus === "online";

			// Notify TanStack Query of backend connectivity changes
			if (isOnline !== wasOnline) {
				onlineManager.setOnline(isOnline);
			}

			// Adaptive interval: fast when offline, slow when stable
			if (isOnline && !wasOnline) {
				schedulePolling(HEALTH_POLL_SLOW_MS);
			} else if (!isOnline && wasOnline) {
				schedulePolling(HEALTH_POLL_FAST_MS);
			}

			wasOnline = isOnline;
		});
	};

	// Start with fast polling
	schedulePolling(HEALTH_POLL_FAST_MS);
}

function App() {
	const theme = useAppTheme();
	const { uiScale, visible } = useUIScaleZoom();
	const setBackendStatus = useUIStore((s) => s.setBackendStatus);

	useEffect(() => {
		if (!hasLoggedFrontendStartup) {
			console.info("[startup] Frontend application initialized");
			hasLoggedFrontendStartup = true;
		}

		ensureBackendHealthMonitor(setBackendStatus);
	}, [setBackendStatus]);

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
	document.getElementById("startup-loader")?.remove();
}
