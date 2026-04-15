/**
 * Captures browser page load metrics (LCP, FCP, TTFB, DOM load)
 * and sends them as a single log entry to the backend.
 */

import { onFCP, onLCP, onTTFB } from "web-vitals";

import { reportFrontendLog } from "@/utils/frontendLogger";

interface PageLoadTimings {
	lcp_ms: number | null;
	fcp_ms: number | null;
	ttfb_ms: number | null;
	dom_load_ms: number | null;
}

const REPORT_TIMEOUT_MS = 10_000;
const PAGELOAD_LOG_THRESHOLD_MS = 3000;

const timings: PageLoadTimings = {
	lcp_ms: null,
	fcp_ms: null,
	ttfb_ms: null,
	dom_load_ms: null,
};

let reported = false;

function round(value: number): number {
	return Math.round(value * 10) / 10;
}

function sendReport(): void {
	if (reported) return;
	reported = true;

	const parts: string[] = [];
	if (timings.lcp_ms !== null) parts.push(`LCP=${timings.lcp_ms.toFixed(0)}ms`);
	if (timings.fcp_ms !== null) parts.push(`FCP=${timings.fcp_ms.toFixed(0)}ms`);
	if (timings.ttfb_ms !== null)
		parts.push(`TTFB=${timings.ttfb_ms.toFixed(0)}ms`);
	if (timings.dom_load_ms !== null)
		parts.push(`DOM=${timings.dom_load_ms.toFixed(0)}ms`);

	if (parts.length === 0) return;

	const message = `[pageload] ${parts.join(" ")}`;

	if (import.meta.env.DEV) {
		console.info(message);
	}

	if (
		Math.max(
			timings.lcp_ms ?? 0,
			timings.fcp_ms ?? 0,
			timings.ttfb_ms ?? 0,
			timings.dom_load_ms ?? 0,
		) < PAGELOAD_LOG_THRESHOLD_MS
	) {
		return;
	}

	reportFrontendLog("INFO", message, {
		loggerName: "frontend.performance.pageload",
		module: "pageLoadMetrics",
		extra: {
			lcp_ms: timings.lcp_ms,
			fcp_ms: timings.fcp_ms,
			ttfb_ms: timings.ttfb_ms,
			dom_load_ms: timings.dom_load_ms,
		},
	});
}

function maybeSendReport(): void {
	if (reported) return;
	const allCollected = Object.values(timings).every((v) => v !== null);
	if (allCollected) sendReport();
}

function collectDomLoadTime(): void {
	const entries = performance.getEntriesByType("navigation");
	const navEntry = entries[0] as PerformanceNavigationTiming | undefined;
	if (navEntry) {
		timings.dom_load_ms = round(
			navEntry.domContentLoadedEventEnd - navEntry.startTime,
		);
		maybeSendReport();
	}
}

export function initializePageLoadMetrics(): void {
	if (
		typeof window === "undefined" ||
		typeof PerformanceObserver === "undefined"
	) {
		return;
	}

	onLCP((metric) => {
		timings.lcp_ms = round(metric.value);
		maybeSendReport();
	});

	onFCP((metric) => {
		timings.fcp_ms = round(metric.value);
		maybeSendReport();
	});

	onTTFB((metric) => {
		timings.ttfb_ms = round(metric.value);
		maybeSendReport();
	});

	if (
		document.readyState === "complete" ||
		document.readyState === "interactive"
	) {
		collectDomLoadTime();
	} else {
		window.addEventListener("load", () => collectDomLoadTime(), {
			once: true,
		});
	}

	// Send whatever we have after timeout (LCP may not finalize quickly)
	setTimeout(() => {
		if (!reported) sendReport();
	}, REPORT_TIMEOUT_MS);
}
