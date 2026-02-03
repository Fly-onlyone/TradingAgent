/**
 * Knowledge Base Types
 */

export interface StrategyKnowledge {
  id: string;
  name: string;
  description: string;
  entryRules: Record<string, unknown>;
  exitRules: Record<string, unknown>;
  riskParams: Record<string, unknown>;
  backtestResults?: Record<string, unknown>;
  winRate?: number;
  marketConditions?: string[];
  createdAt: string;
  updatedAt?: string;
}

export interface TradeLesson {
  id: string;
  orderId?: string;
  outcome: 'profit' | 'loss' | 'breakeven';
  profitPercent: number;
  lessonSummary: string;
  marketContext: Record<string, unknown>;
  mistakes?: string[];
  successes?: string[];
  symbol: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  exitPrice: number;
  createdAt: string;
}

export interface TradingPattern {
  id: string;
  patternName: string;
  patternType: 'technical' | 'sentiment' | 'correlation' | 'fundamental';
  description: string;
  conditions: Record<string, unknown>;
  successRate: number;
  sampleCount: number;
  avgReturn: number;
  symbols?: string[];
  timeframes?: string[];
  createdAt: string;
  lastValidated?: string;
}

export interface KnowledgeSearchResult {
  strategies: StrategyKnowledge[];
  lessons: TradeLesson[];
  patterns: TradingPattern[];
}

export interface KnowledgeQuery {
  query: string;
  limitPerType?: number;
  minSimilarity?: number;
  symbol?: string;
  patternType?: string;
}
