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
	stats?: Record<string, number>;
}

function formatProgressEvent(event: ProgressEvent): string {
	switch (event.step) {
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

			startRun: (token: string) => {
				if (get().isRunning) return;

				const controller = new AbortController();
				set({
					isRunning: true,
					runResult: null,
					progressMessages: [],
					abortController: controller,
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
						const s = event.stats ?? {};
						const parts: string[] = [];
						if ((s.discovery_new_sources ?? 0) > 0)
							parts.push(`Discovered ${s.discovery_new_sources} new sources`);
						if ((s.discovery_strategies_extracted ?? 0) > 0)
							parts.push(
								`extracted ${s.discovery_strategies_extracted} strategies from web`,
							);
						if ((s.sources_crawled ?? 0) > 0)
							parts.push(
								`crawled ${s.sources_crawled} sources, found ${s.strategies_found ?? 0} more`,
							);
						set({
							runResult:
								parts.length > 0 ? parts.join(", ") : "No new strategies found",
						});
						if ((s.strategies_found ?? 0) > 0) {
							notify.success(`Discovered ${s.strategies_found} new strategies`);
						} else {
							notify.info("No new strategies found");
						}
					} else if (event.step === "error") {
						notify.error(event.message ?? "Discovery failed");
					} else {
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
