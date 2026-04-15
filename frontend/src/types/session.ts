/**
 * Agent Session and Decision Types
 */

// Agent connection status
export type AgentStatus =
	| "disconnected"
	| "connected"
	| "initializing"
	| "thinking"
	| "analyzing"
	| "error"
	| "auth_required";

// Decision filter state
export interface DecisionFilters {
	decisionType?: DecisionType;
	symbol?: string;
	action?: DecisionAction;
	status?: DecisionStatus;
	taskId?: string;
}

// Decision types
export type DecisionType =
	| "analysis"
	| "recommendation"
	| "trade_execution"
	| "risk_alert"
	| "news_insight"
	| "monitoring_alert"
	| "task_modification";
export type DecisionAction = "buy" | "sell" | "hold" | "wait" | "close";
export type DecisionStatus =
	| "pending"
	| "confirmed"
	| "rejected"
	| "executed"
	| "expired";
export type MessageRole = "user" | "assistant" | "system";

export interface PendingQuestion {
	id: string;
	sessionId: string;
	question: string;
	options: string[];
	multiSelect?: boolean;
	createdAt?: string;
}

// Session message
export interface SessionMessage {
	id?: string; // AgentSessionMessage._id — present for messages persisted to the separate collection
	role: MessageRole;
	content: string;
	timestamp: string;
	decisionId?: string;
	toolCalls?: ToolCall[];
	thinkingContent?: string;
}

export interface ToolCall {
	name: string;
	arguments: Record<string, unknown>;
	result?: unknown;
	resultSummary?: string;
	executionTimeMs?: number;
}

// Agent Session
export interface AgentSession {
	id: string;
	title?: string;
	description?: string;
	isActive: boolean;
	pendingQuestion?: PendingQuestion;

	// Statistics
	totalMessages: number;
	userMessages: number;
	assistantMessages: number;
	decisionsMade: number;
	tradesExecuted: number;
	totalTokens: number;
	symbolsDiscussed: string[];

	// Timestamps
	startedAt: string;
	endedAt?: string;
	lastMessageAt?: string;
}

export interface AgentSessionWithMessages extends AgentSession {
	messages: SessionMessage[];
}

// Session API types
export interface SessionCreate {
	title?: string;
	description?: string;
}

export interface SessionUpdate {
	title?: string;
	description?: string;
}

export interface MessageCreate {
	role: MessageRole;
	content: string;
	decisionId?: string;
	toolCalls?: ToolCall[];
	tokens?: number;
}

export interface SessionListResponse {
	sessions: AgentSession[];
	total: number;
	page: number;
	pageSize: number;
}

export interface MessageListResponse {
	messages: SessionMessage[];
	total: number;
	page: number;
	pageSize: number;
}

export interface SessionsByDateGroup {
	date: string;
	label: string;
	sessions: AgentSession[];
}

export interface GroupedSessionsResponse {
	groups: SessionsByDateGroup[];
	total: number;
}

// Agent Decision types
export interface AgentDecisionSummary {
	id: string;
	sessionId?: string;
	taskId?: string;

	decisionType: DecisionType;
	symbol?: string;
	action?: DecisionAction;
	confidence?: number;
	status: DecisionStatus;
	summary: string;

	createdAt: string;
	executedAt?: string;
}

export interface MarketContext {
	price?: number;
	priceChange24h?: number;
	volume24h?: number;
	rsi?: number;
	macdSignal?: string;
	trend?: string;
	supportLevels: number[];
	resistanceLevels: number[];
	newsSentiment?: number;
}

export interface AgentDecisionDetail extends AgentDecisionSummary {
	reasoning: string;
	keyFactors: string[];
	proposedChanges?: Record<string, unknown>; // For task modification decisions

	// Trade specifics
	suggestedEntry?: number;
	suggestedStopLoss?: number;
	suggestedTakeProfit?: number;
	suggestedPositionSize?: number;
	riskRewardRatio?: number;

	// Execution
	orderId?: string;
	executionPrice?: number;

	// Context
	toolsUsed: ToolCall[];
	marketContext?: MarketContext;
	modelUsed: string;

	// Feedback
	userFeedback?: "thumbs_up" | "thumbs_down" | "neutral";
	feedbackComment?: string;

	// Timestamps
	confirmedAt?: string;
	expiresAt?: string;
}

export interface DecisionListResponse {
	decisions: AgentDecisionSummary[];
	total: number;
	page: number;
	pageSize: number;
}

export interface DecisionStats {
	totalDecisions: number;
	totalTrades: number;
	pendingConfirmations: number;
	byType: Record<string, number>;
	byAction: Record<string, number>;
	bySymbol: Record<string, number>;
	avgConfidence?: number;
}

export interface FeedbackCreate {
	feedback: "thumbs_up" | "thumbs_down" | "neutral";
	comment?: string;
}

// Decision type configurations
export const DECISION_TYPE_CONFIG: Record<
	DecisionType,
	{ label: string; color: string; icon: string }
> = {
	analysis: {
		label: "Analysis",
		color: "#2196f3",
		icon: "analytics",
	},
	recommendation: {
		label: "Recommendation",
		color: "#9c27b0",
		icon: "lightbulb",
	},
	trade_execution: {
		label: "Trade",
		color: "#4caf50",
		icon: "swap_horiz",
	},
	risk_alert: {
		label: "Risk Alert",
		color: "#f44336",
		icon: "warning",
	},
	news_insight: {
		label: "News",
		color: "#ff9800",
		icon: "article",
	},
	monitoring_alert: {
		label: "Alert",
		color: "#00bcd4",
		icon: "notifications",
	},
	task_modification: {
		label: "Task Change",
		color: "#795548",
		icon: "edit_note",
	},
};

export const DECISION_ACTION_CONFIG: Record<
	DecisionAction,
	{ label: string; color: string }
> = {
	buy: {
		label: "Buy",
		color: "#4caf50",
	},
	sell: {
		label: "Sell",
		color: "#f44336",
	},
	hold: {
		label: "Hold",
		color: "#ff9800",
	},
	wait: {
		label: "Wait",
		color: "#9e9e9e",
	},
	close: {
		label: "Close",
		color: "#9c27b0",
	},
};

export const DECISION_STATUS_CONFIG: Record<
	DecisionStatus,
	{ label: string; color: string }
> = {
	pending: {
		label: "Pending",
		color: "#ff9800",
	},
	confirmed: {
		label: "Confirmed",
		color: "#2196f3",
	},
	rejected: {
		label: "Rejected",
		color: "#f44336",
	},
	executed: {
		label: "Executed",
		color: "#4caf50",
	},
	expired: {
		label: "Expired",
		color: "#9e9e9e",
	},
};
