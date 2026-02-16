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

export const marketApi = {
	/**
	 * Get ticker for a symbol
	 */
	async getTicker(symbol: string): Promise<Ticker> {
		const response = await apiClient.get<Ticker>(`/market/ticker/${symbol}`);
		return response.data;
	},

	/**
	 * Get all tickers
	 */
	async getAllTickers(): Promise<Ticker[]> {
		const response = await apiClient.get<Ticker[]>("/market/tickers");
		return response.data;
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
			totalEquity: response.data.total_equity as number,
			availableBalance: response.data.available_balance as number,
			unrealizedPnl: response.data.unrealized_pnl as number,
			marginRatio: response.data.margin_ratio as number | null,
			currencies: (
				(response.data.currencies as Record<string, unknown>[]) || []
			).map((c) => ({
				currency: c.currency as string,
				equity: c.equity as number,
				available: c.available as number,
				frozen: c.frozen as number,
				upl: c.upl as number,
			})),
			error: (response.data.error as string | null) ?? null,
		};
	},

	async getMarketOverview(): Promise<MarketOverview> {
		const response =
			await apiClient.get<Record<string, unknown>>("/market/overview");
		const transformTicker = (t: Record<string, unknown>) => ({
			symbol: t.symbol as string,
			lastPrice: t.last_price as number,
			changePct24h: t.change_pct_24h as number,
			volume24h: t.volume_24h as number,
		});
		return {
			totalVolume24h: response.data.total_volume_24h as number,
			topGainers: (
				(response.data.top_gainers as Record<string, unknown>[]) || []
			).map(transformTicker),
			topLosers: (
				(response.data.top_losers as Record<string, unknown>[]) || []
			).map(transformTicker),
			mostTraded: (
				(response.data.most_traded as Record<string, unknown>[]) || []
			).map(transformTicker),
			error: (response.data.error as string | null) ?? null,
		};
	},
};

export default marketApi;
