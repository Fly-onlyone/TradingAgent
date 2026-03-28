import { queryOptions } from "@tanstack/react-query";

import { marketApi } from "@/api/endpoints/market";

const MARKET_STALE_TIME = 60_000;
const MARKET_GC_TIME = 10 * 60_000;

export function marketAccountQueryOptions() {
	return queryOptions({
		queryKey: ["market", "account"] as const,
		queryFn: () => marketApi.getAccountBalance(),
		staleTime: MARKET_STALE_TIME,
		gcTime: MARKET_GC_TIME,
	});
}

export function marketOverviewQueryOptions() {
	return queryOptions({
		queryKey: ["market", "overview"] as const,
		queryFn: () => marketApi.getMarketOverview(),
		staleTime: MARKET_STALE_TIME,
		gcTime: MARKET_GC_TIME,
	});
}

export function marketTickerQueryOptions(symbol: string) {
	return queryOptions({
		queryKey: ["market", "ticker", symbol] as const,
		queryFn: () => marketApi.getTicker(symbol),
		staleTime: 20_000,
		gcTime: MARKET_GC_TIME,
	});
}

export function marketSymbolsQueryOptions(quoteCurrency?: string) {
	return queryOptions({
		queryKey: ["market", "symbols", quoteCurrency ?? "all"] as const,
		queryFn: () => marketApi.getSymbols(quoteCurrency),
		staleTime: 5 * 60_000,
		gcTime: MARKET_GC_TIME,
	});
}

export function userPreferencesQueryOptions() {
	return queryOptions({
		queryKey: ["user", "preferences"] as const,
		queryFn: () => marketApi.getUserPreferences(),
		staleTime: MARKET_STALE_TIME,
		gcTime: MARKET_GC_TIME,
	});
}
