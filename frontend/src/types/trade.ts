/**
 * Trade Types for P&L Tracking
 */

export type TradeStatusType = "open" | "closed";

export interface TradeWithPnL {
	id: string;
	symbol: string;
	side: "buy" | "sell";
	entryPrice: number;
	exitPrice?: number;
	quantity: number;
	realizedPnl?: number;
	realizedPnlPercent?: number;
	feesPaid?: number;
	netPnl?: number;
	entryTime: string;
	exitTime?: string;
	status: TradeStatusType;
	relatedOrderId?: string;
}

export interface TradeSummary {
	totalPnl: number;
	totalPnlPercent: number;
	totalFees: number;
	netPnl: number;
	totalTrades: number;
	winningTrades: number;
	losingTrades: number;
	winRate: number;
	avgWin: number;
	avgLoss: number;
	bestTrade: number;
	worstTrade: number;
	profitFactor: number;
	avgTradePnl: number;
	totalVolume: number;
}

export interface TradesBySymbol {
	symbol: string;
	totalPnl: number;
	totalPnlPercent: number;
	netPnl: number;
	tradeCount: number;
	winningTrades: number;
	losingTrades: number;
	winRate: number;
	trades: TradeWithPnL[];
}

export interface TradesFilter {
	symbol?: string;
	side?: "buy" | "sell";
	status?: TradeStatusType;
	startDate?: string;
	endDate?: string;
	page?: number;
	pageSize?: number;
}

export type TradeViewMode = "table" | "grouped";

export type ExportFormat = "json" | "csv";

// API Response types
export interface TradeListResponse {
	trades: TradeWithPnL[];
	total: number;
	page: number;
	pageSize: number;
}

export interface TradesBySymbolResponse {
	symbols: TradesBySymbol[];
}
