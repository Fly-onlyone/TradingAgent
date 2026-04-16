import { marketApi } from "@/api/endpoints/market";
import type { Timeframe } from "@/types";
import { createQueryOptionsFactory } from "./_factory";

const MARKET_STALE_TIME = 60_000;
const MARKET_GC_TIME = 10 * 60_000;

const marketQuery = createQueryOptionsFactory({
	staleTime: MARKET_STALE_TIME,
	gcTime: MARKET_GC_TIME,
});

export function marketAccountQueryOptions() {
	return marketQuery({
		queryKey: ["market", "account"] as const,
		queryFn: () => marketApi.getAccountBalance(),
	});
}

export function marketOverviewQueryOptions() {
	return marketQuery({
		queryKey: ["market", "overview"] as const,
		queryFn: () => marketApi.getMarketOverview(),
	});
}

export function marketTickerQueryOptions(symbol: string) {
	return marketQuery({
		queryKey: ["market", "ticker", symbol] as const,
		queryFn: () => marketApi.getTicker(symbol),
		staleTime: 20_000,
	});
}

export function marketCandlesQueryOptions(
	symbol: string,
	timeframe: Timeframe,
	limit = 24,
) {
	return marketQuery({
		queryKey: ["market", "candles", symbol, timeframe, limit] as const,
		queryFn: () => marketApi.getCandles({ symbol, timeframe, limit }),
		staleTime: 60_000,
	});
}

export function marketSymbolsQueryOptions(quoteCurrency?: string) {
	return marketQuery({
		queryKey: ["market", "symbols", quoteCurrency ?? "all"] as const,
		queryFn: () => marketApi.getSymbols(quoteCurrency),
		staleTime: 5 * 60_000,
	});
}

export function userPreferencesQueryOptions() {
	return marketQuery({
		queryKey: ["user", "preferences"] as const,
		queryFn: () => marketApi.getUserPreferences(),
	});
}
