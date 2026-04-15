/**
 * Store for strategy discovery Run Now state.
 * Persists across page navigation so progress isn't lost when switching routes.
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { notify } from "@/store/uiStore";

interface ProgressEvent {
	step: string;
	query?: string;
	results?: number;
	domain?: string;
	source?: string;
	articles?: number;
	name?: string;
	message?: string;
	count?: number;
	merged?: number;
	cycle_id?: string;
	source_session_id?: string;
	explorer_session_id?: string;
	error?: string;
	stats?: Record<string, number | string | null>;
}

function formatProgressEvent(event: ProgressEvent): string {
	switch (event.step) {
		// Agentic pipeline events
		case "cycle_started":
			return `Cycle started (${event.cycle_id ?? "?"})`;
		case "candidates_ready":
			return `Explorer submitted ${event.count ?? 0} candidate(s)`;
		case "extractor_error":
			return `Extractor error: ${event.error ?? "unknown"}`;
		case "dedup_complete":
			return `Dedup complete: ${event.merged ?? 0} unique strategies`;
		case "strategy_saved":
			return `Saved strategy: ${event.name ?? "(unnamed)"}`;
		case "cycle_failed":
			return `Cycle failed: ${event.error ?? "unknown"}`;
		case "cycle_complete":
			return "Cycle complete";
		// Legacy events kept for backward compatibility
		case "brave_search":
			return `Searching: "${event.query}" — ${event.results ?? 0} results`;
		case "source_discovered":
			return `New source: ${event.domain}`;
		case "article_fetched":
			return `Fetched article from ${event.domain}`;
		case "strategy_extracted":
			return `Extracted strategy from ${event.domain}`;
		case "crawling_source":
			return `Crawling: ${event.source}...`;
		case "source_crawled":
			return `Crawled ${event.source}: ${event.articles ?? 0} articles`;
		case "error":
			return `Error: ${event.message}`;
		default:
			return event.step;
	}
}

interface DiscoveryState {
	isRunning: boolean;
	progressMessages: string[];
	runResult: string | null;
	abortController: AbortController | null;
	/** Session id of the currently-running Explorer subagent, if any. */
	currentExplorerSessionId: string | null;

	startRun: (token: string) => void;
	reset: () => void;
}

export const useDiscoveryStore = create<DiscoveryState>()(
	devtools(
		(set, get) => ({
			isRunning: false,
			progressMessages: [],
			runResult: null,
			abortController: null,
			currentExplorerSessionId: null,

			startRun: (token: string) => {
				if (get().isRunning) return;

				const controller = new AbortController();
				set({
					isRunning: true,
					runResult: null,
					progressMessages: [],
					abortController: controller,
					currentExplorerSessionId: null,
				});

				// Fire and forget — runs in background regardless of component mount
				void runDiscoveryStream(token, controller.signal, set);
			},

			reset: () => {
				const { abortController } = get();
				if (abortController) abortController.abort();
				set({
					isRunning: false,
					progressMessages: [],
					runResult: null,
					abortController: null,
					currentExplorerSessionId: null,
				});
			},
		}),
		{ name: "discovery-store" },
	),
);

async function runDiscoveryStream(
	token: string,
	signal: AbortSignal,
	set: (
		partial:
			| Partial<DiscoveryState>
			| ((state: DiscoveryState) => Partial<DiscoveryState>),
	) => void,
) {
	try {
		const response = await fetch(
			"/api/v1/settings/strategy-discovery/run-now",
			{
				method: "POST",
				headers: { Authorization: `Bearer ${token}` },
				signal,
			},
		);

		if (!response.ok || !response.body) {
			notify.error("Discovery run failed");
			set({ isRunning: false, abortController: null });
			return;
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";

			for (const line of lines) {
				if (!line.startsWith("data: ")) continue;
				try {
					const event = JSON.parse(line.slice(6)) as ProgressEvent;

					if (event.step === "complete") {
						const s = (event.stats ?? {}) as Record<
							string,
							number | string | null
						>;
						const candidates = Number(s.candidates_found ?? 0);
						const saved = Number(s.strategies_saved ?? 0);
						const skipped = Number(s.strategies_skipped_low_confidence ?? 0);
						const failed = Number(s.strategies_failed ?? 0);

						const parts: string[] = [];
						if (candidates > 0) parts.push(`${candidates} candidate(s)`);
						if (saved > 0) parts.push(`${saved} saved`);
						if (skipped > 0) parts.push(`${skipped} skipped (low confidence)`);
						if (failed > 0) parts.push(`${failed} failed`);

						set({
							runResult:
								parts.length > 0 ? parts.join(", ") : "No candidates found",
						});
						if (saved > 0) {
							notify.success(`Discovered ${saved} new strategies`);
						} else if (candidates > 0) {
							notify.info(`${candidates} candidates, none saved`);
						} else {
							notify.info("No new strategies found");
						}
					} else if (event.step === "error") {
						notify.error(event.message ?? "Discovery failed");
					} else {
						if (event.step === "explorer_ready" && event.explorer_session_id) {
							set({
								currentExplorerSessionId: event.explorer_session_id,
							});
						}
						set((state) => ({
							progressMessages: [
								...state.progressMessages,
								formatProgressEvent(event),
							],
						}));
					}
				} catch {
					// skip malformed lines
				}
			}
		}
	} catch (err) {
		if (err instanceof DOMException && err.name === "AbortError") return;
		notify.error("Discovery run failed");
	} finally {
		set({ isRunning: false, abortController: null });
	}
}
