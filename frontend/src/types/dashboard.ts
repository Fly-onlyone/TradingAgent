import type { AccountBalance } from "./market";
import type { AgentDecisionSummary } from "./session";
import type { AgentMode } from "./task";
import type { TradeSummary, TradeWithPnL } from "./trade";

export interface DashboardSummary {
	account: AccountBalance;
	tradeSummary: TradeSummary;
	recentTrades: TradeWithPnL[];
	recentDecisions: AgentDecisionSummary[];
	totalDecisions: number;
	activeTaskMode: AgentMode | null;
}
