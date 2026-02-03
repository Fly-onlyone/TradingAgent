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
  entryRules: Record<string, unknown>;
  exitRules: Record<string, unknown>;
  riskParams: StrategyRiskParams;
  backtestResults?: BacktestResults;
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

export interface StrategySignal {
  strategyId: string;
  symbol: string;
  signal: 'buy' | 'sell' | 'hold';
  confidence: number;
  price: number;
  reason: string;
  timestamp: string;
}
