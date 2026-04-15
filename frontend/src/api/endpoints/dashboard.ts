import type {
	AccountBalance,
	AgentDecisionSummary,
	DashboardSummary,
	TradeSummary,
	TradeWithPnL,
} from "@/types";
import { toNumber } from "@/utils/transformers";
import apiClient from "../client";

function transformAccountBalance(
	data: Record<string, unknown>,
): AccountBalance {
	return {
		totalEquity: toNumber(data.total_equity),
		availableBalance: toNumber(data.available_balance),
		unrealizedPnl: toNumber(data.unrealized_pnl),
		marginRatio:
			data.margin_ratio === null ||
			data.margin_ratio === undefined ||
			data.margin_ratio === ""
				? null
				: toNumber(data.margin_ratio, 0),
		currencies: (
			(data.currencies as Record<string, unknown>[] | undefined) ?? []
		).map((currency) => ({
			currency: String(currency.currency ?? ""),
			equity: toNumber(currency.equity),
			available: toNumber(currency.available),
			frozen: toNumber(currency.frozen),
			upl: toNumber(currency.upl),
		})),
		error: (data.error as string | null) ?? null,
	};
}

function transformTradeSummary(data: Record<string, unknown>): TradeSummary {
	return {
		totalPnl: toNumber(data.total_pnl),
		totalPnlPercent: toNumber(data.total_pnl_percent),
		totalFees: toNumber(data.total_fees),
		netPnl: toNumber(data.net_pnl),
		totalTrades: toNumber(data.total_trades),
		winningTrades: toNumber(data.winning_trades),
		losingTrades: toNumber(data.losing_trades),
		winRate: toNumber(data.win_rate),
		avgWin: toNumber(data.avg_win),
		avgLoss: toNumber(data.avg_loss),
		bestTrade: toNumber(data.best_trade),
		worstTrade: toNumber(data.worst_trade),
		profitFactor: toNumber(data.profit_factor),
		avgTradePnl: toNumber(data.avg_trade_pnl),
		totalVolume: toNumber(data.total_volume),
	};
}

function transformTrade(data: Record<string, unknown>): TradeWithPnL {
	return {
		id: String(data.id ?? ""),
		symbol: String(data.symbol ?? ""),
		side: data.side as "buy" | "sell",
		entryPrice: toNumber(data.entry_price),
		exitPrice:
			data.exit_price === null || data.exit_price === undefined
				? undefined
				: toNumber(data.exit_price),
		quantity: toNumber(data.quantity),
		realizedPnl:
			data.realized_pnl === null || data.realized_pnl === undefined
				? undefined
				: toNumber(data.realized_pnl),
		realizedPnlPercent:
			data.realized_pnl_percent === null ||
			data.realized_pnl_percent === undefined
				? undefined
				: toNumber(data.realized_pnl_percent),
		feesPaid:
			data.fees_paid === null || data.fees_paid === undefined
				? undefined
				: toNumber(data.fees_paid),
		netPnl:
			data.net_pnl === null || data.net_pnl === undefined
				? undefined
				: toNumber(data.net_pnl),
		entryTime: String(data.entry_time ?? ""),
		exitTime: (data.exit_time as string | undefined) ?? undefined,
		status: data.status as "open" | "closed",
		relatedOrderId: (data.related_order_id as string | undefined) ?? undefined,
	};
}

function transformDecision(
	data: Record<string, unknown>,
): AgentDecisionSummary {
	return {
		id: String(data.id ?? ""),
		sessionId: (data.session_id as string | undefined) ?? undefined,
		taskId: (data.task_id as string | undefined) ?? undefined,
		decisionType: data.decision_type as AgentDecisionSummary["decisionType"],
		symbol: (data.symbol as string | undefined) ?? undefined,
		action: data.action as AgentDecisionSummary["action"],
		confidence:
			data.confidence === null || data.confidence === undefined
				? undefined
				: toNumber(data.confidence),
		status: data.status as AgentDecisionSummary["status"],
		summary: String(data.summary ?? ""),
		createdAt: String(data.created_at ?? ""),
		executedAt: (data.executed_at as string | undefined) ?? undefined,
	};
}

export const dashboardApi = {
	async getSummary(): Promise<DashboardSummary> {
		const response =
			await apiClient.get<Record<string, unknown>>("/dashboard/summary");

		return {
			account: transformAccountBalance(
				response.data.account as Record<string, unknown>,
			),
			tradeSummary: transformTradeSummary(
				response.data.trade_summary as Record<string, unknown>,
			),
			recentTrades: (
				(response.data.recent_trades as Record<string, unknown>[]) ?? []
			).map(transformTrade),
			recentDecisions: (
				(response.data.recent_decisions as Record<string, unknown>[]) ?? []
			).map(transformDecision),
			totalDecisions: toNumber(response.data.total_decisions),
			activeTaskMode:
				(response.data
					.active_task_mode as DashboardSummary["activeTaskMode"]) ?? null,
		};
	},
};
