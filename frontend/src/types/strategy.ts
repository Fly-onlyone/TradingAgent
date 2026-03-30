/**
 * Strategy Types
 */

export interface Strategy {
	id: string;
	name: string;
	description: string;
	isActive: boolean;
	symbol?: string;
	timeframe?: string;
	symbols: string[];
	timeframes: string[];
	entryRules: Record<string, unknown>;
	exitRules: Record<string, unknown>;
	riskParams: StrategyRiskParams;
	backtestResults?: BacktestResults;
	autoDiscovered?: boolean;
	sourceUrl?: string;
	createdAt: string;
	updatedAt?: string;
}

export interface StrategyCreate {
	name: string;
	description: string;
	symbol?: string;
	timeframe?: string;
	entryRules: Record<string, unknown>;
	exitRules: Record<string, unknown>;
	riskParams: StrategyRiskParams;
}

export interface StrategyUpdate {
	name?: string;
	description?: string;
	isActive?: boolean;
	symbol?: string;
	timeframe?: string;
	entryRules?: Record<string, unknown>;
	exitRules?: Record<string, unknown>;
	riskParams?: StrategyRiskParams;
}

export interface StrategyRiskParams {
	maxPositionSize: number;
	riskPerTrade: number;
	maxDrawdown: number;
	maxDailyLoss?: number;
	maxOpenPositions?: number;
}

export interface BacktestResults {
	totalTrades: number;
	winningTrades: number;
	losingTrades: number;
	winRate: number;
	profitFactor: number;
	totalPnl: number;
	totalPnlPercent: number;
	maxDrawdown: number;
	sharpeRatio?: number;
	sortinoRatio?: number;
	startDate: string;
	endDate: string;
}

export interface ExtractionMessage {
	role: "system" | "assistant";
	content: string;
}

export interface ExtractedStrategy {
	name: string;
	description: string;
	entryRules: Record<string, unknown>;
	exitRules: Record<string, unknown>;
	riskParams: Record<string, unknown>;
	symbols: string[];
	timeframes: string[];
	marketConditions: string[];
	assetClasses: string[];
	sourceUrl?: string;
	sourceFilename?: string;
	extractionMessages: ExtractionMessage[];
}

export interface StrategyImportConfirm {
	name: string;
	description: string;
	entryRules: Record<string, unknown>;
	exitRules: Record<string, unknown>;
	riskParams: Record<string, unknown>;
	symbols: string[];
	timeframes: string[];
	marketConditions: string[];
	assetClasses: string[];
	sourceUrl?: string;
	sourceFilename?: string;
	extractionMessages: ExtractionMessage[];
}

export interface StrategyExtractionDetail {
	extractionMessages: ExtractionMessage[];
	sourceUrl?: string;
	createdAt?: string;
}

export interface StrategyImportResult {
	strategyId: string;
	knowledgeId: string;
}

export interface StrategySignal {
	strategyId: string;
	symbol: string;
	signal: "buy" | "sell" | "hold";
	confidence: number;
	price: number;
	reason: string;
	timestamp: string;
}
