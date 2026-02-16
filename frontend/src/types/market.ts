/**
 * Market Data Types
 */

export interface Ticker {
	symbol: string;
	lastPrice: number;
	priceChange: number;
	priceChangePercent: number;
	high24h: number;
	low24h: number;
	volume24h: number;
	quoteVolume24h: number;
	bidPrice: number;
	askPrice: number;
	timestamp: number;
}

export interface OHLCV {
	timestamp: number;
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
}

export interface Candle extends OHLCV {
	symbol: string;
	timeframe: string;
}

export interface OrderBookLevel {
	price: number;
	quantity: number;
	total?: number;
}

export interface OrderBook {
	symbol: string;
	bids: OrderBookLevel[];
	asks: OrderBookLevel[];
	timestamp: number;
}

export interface Trade {
	id: string;
	symbol: string;
	price: number;
	quantity: number;
	side: "buy" | "sell";
	timestamp: number;
}

export interface MarketStats {
	symbol: string;
	openInterest?: number;
	fundingRate?: number;
	nextFundingTime?: number;
	markPrice?: number;
	indexPrice?: number;
}

// Timeframe options
export type Timeframe =
	| "1m"
	| "5m"
	| "15m"
	| "30m"
	| "1h"
	| "4h"
	| "1d"
	| "1w"
	| "1M";

export const TIMEFRAMES: Record<Timeframe, string> = {
	"1m": "1 Minute",
	"5m": "5 Minutes",
	"15m": "15 Minutes",
	"30m": "30 Minutes",
	"1h": "1 Hour",
	"4h": "4 Hours",
	"1d": "1 Day",
	"1w": "1 Week",
	"1M": "1 Month",
};

// Technical Indicators
export interface TechnicalIndicators {
	sma20?: number;
	sma50?: number;
	sma200?: number;
	ema12?: number;
	ema26?: number;
	rsi14?: number;
	macd?: {
		line: number;
		signal: number;
		histogram: number;
	};
	bollingerBands?: {
		upper: number;
		middle: number;
		lower: number;
	};
	atr14?: number;
	stochastic?: {
		k: number;
		d: number;
	};
}

// Account Balance
export interface CurrencyBalance {
	currency: string;
	equity: number;
	available: number;
	frozen: number;
	upl: number;
}

export interface AccountBalance {
	totalEquity: number;
	availableBalance: number;
	unrealizedPnl: number;
	marginRatio: number | null;
	currencies: CurrencyBalance[];
	error?: string | null;
}

// Market Overview
export interface MarketOverviewTicker {
	symbol: string;
	lastPrice: number;
	changePct24h: number;
	volume24h: number;
}

export interface MarketOverview {
	totalVolume24h: number;
	topGainers: MarketOverviewTicker[];
	topLosers: MarketOverviewTicker[];
	mostTraded: MarketOverviewTicker[];
	error?: string | null;
}
