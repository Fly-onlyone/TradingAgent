import { reportFrontendLog } from "@/utils/frontendLogger";
import { startSentrySpanManual } from "@/utils/sentry";

type PendingNavigation = {
	finish: () => void;
	startedAt: number;
};

const pendingNavigations = new Map<string, PendingNavigation>();

export function markNavStart(routeId: string): void {
	if (typeof performance === "undefined") {
		return;
	}

	const existing = pendingNavigations.get(routeId);
	if (existing) {
		existing.finish();
		pendingNavigations.delete(routeId);
	}

	startSentrySpanManual(
		{
			name: `route.transition ${routeId}`,
			op: "ui.navigation",
		},
		(span, finish) => {
			span.setAttribute("route.id", routeId);
			pendingNavigations.set(routeId, {
				finish,
				startedAt: performance.now(),
			});
		},
	);
}

export function markNavEnd(routeId: string): number | null {
	if (typeof performance === "undefined") {
		return null;
	}

	const pendingNavigation = pendingNavigations.get(routeId);
	if (!pendingNavigation) {
		return null;
	}

	pendingNavigations.delete(routeId);
	const durationMs = performance.now() - pendingNavigation.startedAt;
	pendingNavigation.finish();
	return durationMs;
}

export function reportNavDuration(routeId: string, durationMs: number): void {
	if (!Number.isFinite(durationMs)) {
		return;
	}

	const rounded = Math.round(durationMs * 10) / 10;
	const message = `[navigation] ${routeId} ${rounded}ms`;

	if (import.meta.env.DEV) {
		console.info(message);
	}

	reportFrontendLog("INFO", message, {
		loggerName: "frontend.performance.navigation",
		module: "navigationMetrics",
		extra: {
			route_id: routeId,
			duration_ms: rounded,
		},
	});
}
