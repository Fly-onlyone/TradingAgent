const pendingNavigations = new Map<string, number>();

export function markNavStart(routeId: string): void {
    if (typeof performance === 'undefined') {
        return;
    }
    pendingNavigations.set(routeId, performance.now());
}

export function markNavEnd(routeId: string): number | null {
    if (typeof performance === 'undefined') {
        return null;
    }

    const startedAt = pendingNavigations.get(routeId);
    if (startedAt === undefined) {
        return null;
    }

    pendingNavigations.delete(routeId);
    return performance.now() - startedAt;
}

export function reportNavDuration(routeId: string, durationMs: number): void {
    if (!Number.isFinite(durationMs)) {
        return;
    }

    if (import.meta.env.DEV) {
        console.info(`[navigation] ${routeId} ${durationMs.toFixed(1)}ms`);
    }
}
