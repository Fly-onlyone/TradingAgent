import Box from "@mui/material/Box";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import {
	onlineManager,
	QueryClient,
	QueryClientProvider,
} from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { StrictMode, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { ErrorState } from "./components/common/ErrorState";
import { ZoomIndicator } from "./components/common/ZoomIndicator";
import { useAppTheme } from "./hooks/useAppTheme";
import { useUIScaleZoom } from "./hooks/useUIScaleZoom";
// Import the generated route tree
import { routeTree } from "./routeTree.gen";
import { useUIStore } from "./store/uiStore";
import { bootstrapObservability, reportReactRenderError } from "./utils/sentry";
import { getApiBaseUrl, getBackendBaseUrl, isTauri } from "./utils/tauriEnv";

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
const backendHealthUrl = isTauri()
	? `${getBackendBaseUrl()}/health`
	: `${getApiBaseUrl().replace(/\/api\/v1$/, "")}/health`;
let hasLoggedFrontendStartup = false;
let backendHealthMonitorStarted = false;
let backendHasConnected = false;
let lastBackendStatus: "connecting" | "online" | "offline" | null = null;
let lastBackendStatusMessage = "";

type DesktopStartupFailure = {
	code: string;
	message: string;
	detail?: string | null;
	recoverable: boolean;
};

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

function DesktopStartupErrorScreen({
	failure,
	onRetry,
}: {
	failure: DesktopStartupFailure;
	onRetry: () => void;
}) {
	const detail = [
		`code=${failure.code}`,
		failure.detail?.trim(),
		`health_url=${backendHealthUrl}`,
	]
		.filter(Boolean)
		.join("\n");

	return (
		<Box
			sx={{
				display: "flex",
				minHeight: "100vh",
				alignItems: "center",
				justifyContent: "center",
				px: 2,
				background:
					"radial-gradient(circle at top, rgba(249,115,22,0.12), transparent 45%), #1b1510",
			}}
		>
			<Box sx={{ width: "100%", maxWidth: 640 }}>
				<ErrorState
					title="Desktop backend failed to start"
					message={failure.message}
					detail={detail}
					onRetry={onRetry}
				/>
				<Typography
					variant="body2"
					color="text.secondary"
					sx={{ mt: 2, textAlign: "center" }}
				>
					Check the packaged desktop logs if this keeps happening. The app needs
					its local backend and MongoDB to start cleanly.
				</Typography>
			</Box>
		</Box>
	);
}

function App() {
	const theme = useAppTheme();
	const { uiScale, visible } = useUIScaleZoom();
	const setBackendStatus = useUIStore((s) => s.setBackendStatus);
	const backendStatus = useUIStore((s) => s.backendStatus);
	const [startupFailure, setStartupFailure] =
		useState<DesktopStartupFailure | null>(null);

	useEffect(() => {
		if (!hasLoggedFrontendStartup) {
			console.info("[startup] Frontend application initialized");
			hasLoggedFrontendStartup = true;
		}

		ensureBackendHealthMonitor(setBackendStatus);
	}, [setBackendStatus]);

	useEffect(() => {
		if (!isTauri()) {
			return;
		}

		let isDisposed = false;
		let unlisten: (() => void) | undefined;

		void import("@tauri-apps/api/event")
			.then(({ listen }) =>
				listen<DesktopStartupFailure>(
					"backend-startup-failure",
					({ payload }) => {
						backendHasConnected = true;
						setStartupFailure(payload);
						reportBackendStatus(setBackendStatus, "offline", payload.message);
					},
				),
			)
			.then((dispose) => {
				if (isDisposed) {
					dispose();
					return;
				}
				unlisten = dispose;
			})
			.catch((error: unknown) => {
				console.error(
					"[startup] Failed to subscribe to Tauri startup events",
					error,
				);
			});

		return () => {
			isDisposed = true;
			unlisten?.();
		};
	}, [setBackendStatus]);

	useEffect(() => {
		if (backendStatus === "online") {
			setStartupFailure(null);
		}
	}, [backendStatus]);

	if (isTauri() && startupFailure && backendStatus !== "online") {
		return (
			<ThemeProvider theme={theme}>
				<CssBaseline />
				<DesktopStartupErrorScreen
					failure={startupFailure}
					onRetry={() => window.location.reload()}
				/>
			</ThemeProvider>
		);
	}

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
		// Keep early error reporting without pulling Sentry into the critical path.
		onUncaughtError: (error, errorInfo) =>
			reportReactRenderError(error, errorInfo),
		onCaughtError: (error, errorInfo) =>
			reportReactRenderError(error, errorInfo),
		onRecoverableError: (error, errorInfo) =>
			reportReactRenderError(error, errorInfo),
	});
	root.render(
		<StrictMode>
			<QueryClientProvider client={queryClient}>
				<App />
			</QueryClientProvider>
		</StrictMode>,
	);
	document.getElementById("startup-loader")?.remove();
	bootstrapObservability();
}
