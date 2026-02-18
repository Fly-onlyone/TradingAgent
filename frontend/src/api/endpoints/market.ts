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
import apiClient from "../client";

export interface CandlesParams {
	symbol: string;
	timeframe: Timeframe;
	limit?: number;
	startTime?: number;
	endTime?: number;
}

function toNumber(value: unknown, fallback = 0): number {
	const parsed =
		typeof value === "number"
			? value
			: typeof value === "string"
				? Number(value)
				: Number.NaN;
	return Number.isFinite(parsed) ? parsed : fallback;
}

function toTimestamp(value: unknown): number {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string") {
		const parsed = Date.parse(value);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return Date.now();
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
	 * Get available symbols
	 */
	async getSymbols(): Promise<string[]> {
		const response = await apiClient.get<string[]>("/market/symbols");
		return response.data;
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
};

export default marketApi;
