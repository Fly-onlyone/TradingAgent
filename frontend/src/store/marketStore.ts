/**
 * Market Data Store
 */

import { create } from "zustand";
import type {
	Candle,
	OrderBook,
	TechnicalIndicators,
	Ticker,
	Trade,
} from "@/types";

interface MarketState {
	// Data
	tickers: Record<string, Ticker>;
	orderBooks: Record<string, OrderBook>;
	recentTrades: Record<string, Trade[]>;
	candles: Record<string, Candle[]>;
	indicators: Record<string, TechnicalIndicators>;

	// Selection
	selectedSymbol: string;
	selectedTimeframe: string;
	watchlist: string[];

	// Actions
	updateTicker: (ticker: Ticker) => void;
	updateOrderBook: (orderBook: OrderBook) => void;
	addTrade: (trade: Trade) => void;
	setCandles: (symbol: string, timeframe: string, candles: Candle[]) => void;
	addCandle: (symbol: string, timeframe: string, candle: Candle) => void;
	setIndicators: (symbol: string, indicators: TechnicalIndicators) => void;
	setSelectedSymbol: (symbol: string) => void;
	setSelectedTimeframe: (timeframe: string) => void;
	addToWatchlist: (symbol: string) => void;
	removeFromWatchlist: (symbol: string) => void;
	loadPreferences: (symbol: string, timeframe: string) => void;
	clearMarketData: () => void;
}

const MAX_TRADES_PER_SYMBOL = 100;
const MAX_CANDLES_PER_SYMBOL = 500;

export const useMarketStore = create<MarketState>((set) => ({
	tickers: {},
	orderBooks: {},
	recentTrades: {},
	candles: {},
	indicators: {},
	selectedSymbol: "BTC-USDT",
	selectedTimeframe: "1h",
	watchlist: ["BTC-USDT", "ETH-USDT", "SOL-USDT"],

	updateTicker: (ticker) =>
		set((state) => ({
			tickers: {
				...state.tickers,
				[ticker.symbol]: ticker,
			},
		})),

	updateOrderBook: (orderBook) =>
		set((state) => ({
			orderBooks: {
				...state.orderBooks,
				[orderBook.symbol]: orderBook,
			},
		})),

	addTrade: (trade) =>
		set((state) => {
			const existing = state.recentTrades[trade.symbol] || [];
			const updated = [trade, ...existing].slice(0, MAX_TRADES_PER_SYMBOL);
			return {
				recentTrades: {
					...state.recentTrades,
					[trade.symbol]: updated,
				},
			};
		}),

	setCandles: (symbol, timeframe, candles) =>
		set((state) => ({
			candles: {
				...state.candles,
				[`${symbol}-${timeframe}`]: candles,
			},
		})),

	addCandle: (symbol, timeframe, candle) =>
		set((state) => {
			const key = `${symbol}-${timeframe}`;
			const existing = state.candles[key] || [];

			// Check if we should update the last candle or add a new one
			const lastCandle = existing[existing.length - 1];
			let updated: Candle[];

			if (lastCandle && lastCandle.timestamp === candle.timestamp) {
				// Update existing candle
				updated = [...existing.slice(0, -1), candle];
			} else {
				// Add new candle
				updated = [...existing, candle].slice(-MAX_CANDLES_PER_SYMBOL);
			}

			return {
				candles: {
					...state.candles,
					[key]: updated,
				},
			};
		}),

	setIndicators: (symbol, indicators) =>
		set((state) => ({
			indicators: {
				...state.indicators,
				[symbol]: indicators,
			},
		})),

	setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),

	setSelectedTimeframe: (timeframe) => set({ selectedTimeframe: timeframe }),

	addToWatchlist: (symbol) =>
		set((state) => ({
			watchlist: state.watchlist.includes(symbol)
				? state.watchlist
				: [...state.watchlist, symbol],
		})),

	removeFromWatchlist: (symbol) =>
		set((state) => ({
			watchlist: state.watchlist.filter((s) => s !== symbol),
		})),

	loadPreferences: (symbol, timeframe) =>
		set({ selectedSymbol: symbol, selectedTimeframe: timeframe }),

	clearMarketData: () =>
		set({
			tickers: {},
			orderBooks: {},
			recentTrades: {},
			candles: {},
			indicators: {},
		}),
}));

export default useMarketStore;
