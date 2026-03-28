/**
 * Market Data API Endpoints
 */

import type {
	AccountBalance,
	Candle,
	MarketOverview,
	OrderBook,
	TechnicalIndicators,
	Ticker,
	Timeframe,
} from "@/types";
import { toNumber, toTimestamp } from "@/utils/transformers";
import apiClient from "../client";

export interface SymbolInfo {
	symbol: string;
	base: string;
	quote: string;
}

/** Grouped option for symbol Autocomplete dropdowns. */
export interface SymbolOption extends SymbolInfo {
	group: string;
}

export interface UserPreferences {
	defaultSymbol: string;
	defaultTimeframe: string;
}

export interface UserPreferencesUpdate {
	defaultSymbol?: string;
	defaultTimeframe?: string;
}

export interface CandlesParams {
	symbol: string;
	timeframe: Timeframe;
	limit?: number;
	startTime?: number;
	endTime?: number;
}

function transformTicker(data: Record<string, unknown>): Ticker {
	return {
		symbol: data.symbol as string,
		lastPrice: toNumber(data.last_price),
		priceChange: toNumber(data.change_24h),
		priceChangePercent: toNumber(data.change_pct_24h),
		high24h: toNumber(data.high_24h),
		low24h: toNumber(data.low_24h),
		volume24h: toNumber(data.volume_24h),
		quoteVolume24h: toNumber(data.quote_volume_24h, toNumber(data.volume_24h)),
		bidPrice: toNumber(data.bid_price),
		askPrice: toNumber(data.ask_price),
		timestamp: toTimestamp(data.timestamp),
	};
}

export const marketApi = {
	/**
	 * Get ticker for a symbol
	 */
	async getTicker(symbol: string): Promise<Ticker> {
		const response = await apiClient.get<Record<string, unknown>>(
			`/market/ticker/${symbol}`,
		);
		return transformTicker(response.data);
	},

	/**
	 * Get all tickers
	 */
	async getAllTickers(): Promise<Ticker[]> {
		const response =
			await apiClient.get<Record<string, unknown>[]>("/market/tickers");
		return response.data.map(transformTicker);
	},

	/**
	 * Get OHLCV candles
	 */
	async getCandles(params: CandlesParams): Promise<Candle[]> {
		const response = await apiClient.get<Candle[]>("/market/candles", {
			params,
		});
		return response.data;
	},

	/**
	 * Get order book
	 */
	async getOrderBook(symbol: string, limit?: number): Promise<OrderBook> {
		const response = await apiClient.get<OrderBook>(
			`/market/orderbook/${symbol}`,
			{
				params: { limit },
			},
		);
		return response.data;
	},

	/**
	 * Get technical indicators
	 */
	async getIndicators(
		symbol: string,
		timeframe: Timeframe,
	): Promise<TechnicalIndicators> {
		const response = await apiClient.get<TechnicalIndicators>(
			`/market/indicators/${symbol}`,
			{
				params: { timeframe },
			},
		);
		return response.data;
	},

	/**
	 * Get available symbols with base/quote metadata.
	 */
	async getSymbols(quoteCurrency?: string): Promise<SymbolInfo[]> {
		const response = await apiClient.get<{
			symbols: Array<{ symbol: string; base: string; quote: string }>;
		}>("/market/symbols", {
			params: quoteCurrency ? { quote_currency: quoteCurrency } : undefined,
		});
		return response.data.symbols.map((s) => ({
			symbol: s.symbol,
			base: s.base,
			quote: s.quote,
		}));
	},

	async getAccountBalance(): Promise<AccountBalance> {
		const response =
			await apiClient.get<Record<string, unknown>>("/market/account");
		return {
			totalEquity: toNumber(response.data.total_equity),
			availableBalance: toNumber(response.data.available_balance),
			unrealizedPnl: toNumber(response.data.unrealized_pnl),
			marginRatio: (() => {
				const ratio = response.data.margin_ratio;
				if (ratio === null || ratio === undefined || ratio === "") {
					return null;
				}
				return toNumber(ratio, 0);
			})(),
			currencies: (
				(response.data.currencies as Record<string, unknown>[]) || []
			).map((c) => ({
				currency: String(c.currency ?? ""),
				equity: toNumber(c.equity),
				available: toNumber(c.available),
				frozen: toNumber(c.frozen),
				upl: toNumber(c.upl),
			})),
			error: (response.data.error as string | null) ?? null,
		};
	},

	async getMarketOverview(): Promise<MarketOverview> {
		const response =
			await apiClient.get<Record<string, unknown>>("/market/overview");
		const transformOverviewTicker = (t: Record<string, unknown>) => ({
			symbol: String(t.symbol ?? ""),
			lastPrice: toNumber(t.last_price),
			changePct24h: toNumber(t.change_pct_24h),
			volume24h: toNumber(t.volume_24h),
		});
		return {
			totalVolume24h: toNumber(response.data.total_volume_24h),
			topGainers: (
				(response.data.top_gainers as Record<string, unknown>[]) || []
			).map(transformOverviewTicker),
			topLosers: (
				(response.data.top_losers as Record<string, unknown>[]) || []
			).map(transformOverviewTicker),
			mostTraded: (
				(response.data.most_traded as Record<string, unknown>[]) || []
			).map(transformOverviewTicker),
			error: (response.data.error as string | null) ?? null,
		};
	},

	async getUserPreferences(): Promise<UserPreferences> {
		const response = await apiClient.get<Record<string, unknown>>(
			"/users/me/preferences",
		);
		return {
			defaultSymbol: response.data.default_symbol as string,
			defaultTimeframe: response.data.default_timeframe as string,
		};
	},

	async updateUserPreferences(
		update: UserPreferencesUpdate,
	): Promise<UserPreferences> {
		const payload: Record<string, unknown> = {};
		if (update.defaultSymbol !== undefined)
			payload.default_symbol = update.defaultSymbol;
		if (update.defaultTimeframe !== undefined)
			payload.default_timeframe = update.defaultTimeframe;

		const response = await apiClient.put<Record<string, unknown>>(
			"/users/me/preferences",
			payload,
		);
		return {
			defaultSymbol: response.data.default_symbol as string,
			defaultTimeframe: response.data.default_timeframe as string,
		};
	},
};

export default marketApi;
