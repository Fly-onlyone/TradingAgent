import * as Sentry from "@sentry/react";

type PendingNavigation = {
    finish: () => void;
    startedAt: number;
};

const pendingNavigations = new Map<string, PendingNavigation>();

export function markNavStart(routeId: string): void {
    if (typeof performance === 'undefined') {
        return;
    }

    const existing = pendingNavigations.get(routeId);
    if (existing) {
        existing.finish();
        pendingNavigations.delete(routeId);
    }

    Sentry.startSpanManual(
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
    if (typeof performance === 'undefined') {
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

    if (import.meta.env.DEV) {
        console.info(`[navigation] ${routeId} ${durationMs.toFixed(1)}ms`);
    }
}
