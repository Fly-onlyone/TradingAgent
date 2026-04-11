/**
 * Task Types
 */

export type TaskFrequency = "once" | "interval" | "daily" | "weekly" | "custom";
export type IntervalUnit = "minutes" | "hours";
export type TaskStatus = "active" | "paused" | "completed" | "failed";
export type RiskLevel = "conservative" | "moderate" | "aggressive";
export type AgentMode = "auto" | "ask";
export type TaskModificationMode = "disabled" | "auto" | "ask";
export type HoldingTerm = "short" | "medium" | "long";

export type MonitoringConditionType =
	| "price_above"
	| "price_below"
	| "price_change_pct"
	| "rsi_above"
	| "rsi_below"
	| "volume_spike"
	| "custom";

export interface MonitoringCondition {
	conditionType: MonitoringConditionType;
	threshold: number;
	timeframe?: string;
	description?: string;
}

export interface TaskSchedule {
	frequency: TaskFrequency;
	cronExpression?: string;
	scheduledTime?: string; // HH:MM
	dayOfWeek?: number; // 0-6
	enabled?: boolean;
	intervalValue?: number;
	intervalUnit?: IntervalUnit;
}

export interface AgentTask {
	id: string;
	name: string;
	description?: string;

	// Capability toggles
	tradingEnabled: boolean;
	monitoringEnabled: boolean;

	// Schedule
	schedules: TaskSchedule[];
	timezone: string;
	nextRunAt?: string;
	lastRunAt?: string;

	// Trading parameters
	symbols: string[];
	riskLevel: RiskLevel;
	holdingTerm?: HoldingTerm;
	agentMode: AgentMode;
	taskModificationMode: TaskModificationMode;
	maxPositionSize?: number;
	maxDailyTrades?: number;
	customInstructions?: string;

	// Monitoring
	monitoringConditions: MonitoringCondition[];
	alertCooldownMinutes: number;

	// Subagents
	useSubagents: boolean;

	// Status
	status: TaskStatus;
	runCount: number;
	successCount: number;
	failureCount: number;
	lastError?: string;

	// Running state
	isRunning: boolean;
	runningProgress?: {
		currentSymbol: string | null;
		completed: number;
		total: number;
	};

	// Timestamps
	createdAt: string;
	updatedAt: string;
}

export interface TaskCreate {
	name: string;
	description?: string;
	tradingEnabled: boolean;
	monitoringEnabled: boolean;
	schedules: TaskSchedule[];
	timezone?: string;
	symbols: string[];
	riskLevel: RiskLevel;
	holdingTerm?: HoldingTerm;
	agentMode: AgentMode;
	taskModificationMode?: TaskModificationMode;
	maxPositionSize?: number;
	maxDailyTrades?: number;
	monitoringConditions?: MonitoringCondition[];
	alertCooldownMinutes?: number;
	useSubagents?: boolean;
	customInstructions?: string;
}

export interface TaskUpdate {
	name?: string;
	description?: string;
	tradingEnabled?: boolean;
	monitoringEnabled?: boolean;
	schedules?: TaskSchedule[];
	timezone?: string;
	symbols?: string[];
	riskLevel?: RiskLevel;
	holdingTerm?: HoldingTerm;
	agentMode?: AgentMode;
	taskModificationMode?: TaskModificationMode;
	maxPositionSize?: number;
	maxDailyTrades?: number;
	monitoringConditions?: MonitoringCondition[];
	alertCooldownMinutes?: number;
	useSubagents?: boolean;
	customInstructions?: string;
}

export interface TaskExecution {
	id: string;
	taskId: string;
	sessionId?: string;
	decisionType: string;
	symbol?: string;
	action?: string;
	confidence?: number;
	summary: string;
	reasoning?: string;
	keyFactors?: string[];
	status: string;
	createdAt: string;
}

export interface TaskListResponse {
	tasks: AgentTask[];
	total: number;
	page: number;
	pageSize: number;
}

export interface TaskExecutionListResponse {
	executions: TaskExecution[];
	total: number;
	page: number;
	pageSize: number;
}

// Risk level configurations
export const RISK_LEVEL_CONFIG: Record<
	RiskLevel,
	{ label: string; description: string; color: string }
> = {
	conservative: {
		label: "Conservative",
		description: "1-2% risk per trade",
		color: "#4caf50",
	},
	moderate: {
		label: "Moderate",
		description: "2-5% risk per trade",
		color: "#ff9800",
	},
	aggressive: {
		label: "Aggressive",
		description: "5-10% risk per trade",
		color: "#f44336",
	},
};

// Holding term configurations
export const HOLDING_TERM_CONFIG: Record<
	HoldingTerm,
	{ label: string; description: string }
> = {
	short: { label: "Short-term", description: "< 7 days" },
	medium: { label: "Medium-term", description: "7-30 days" },
	long: { label: "Long-term", description: "> 30 days" },
};

// Agent mode configurations
export const AGENT_MODE_CONFIG: Record<
	AgentMode,
	{ label: string; description: string }
> = {
	auto: {
		label: "Auto",
		description: "Execute trades automatically",
	},
	ask: {
		label: "Ask",
		description: "Notify and wait for confirmation",
	},
};

// Task modification mode configurations
export const TASK_MODIFICATION_MODE_CONFIG: Record<
	TaskModificationMode,
	{ label: string; description: string }
> = {
	disabled: {
		label: "Disabled",
		description: "Agent cannot modify task configuration",
	},
	auto: {
		label: "Auto",
		description: "Agent applies changes immediately",
	},
	ask: {
		label: "Ask",
		description: "Agent proposes changes for approval",
	},
};

// Monitoring condition type configurations
export const MONITORING_CONDITION_CONFIG: Record<
	MonitoringConditionType,
	{
		label: string;
		description: string;
		unit: string;
	}
> = {
	price_above: {
		label: "Price Above",
		description: "Alert when price rises above threshold",
		unit: "USD",
	},
	price_below: {
		label: "Price Below",
		description: "Alert when price drops below threshold",
		unit: "USD",
	},
	price_change_pct: {
		label: "Price Change %",
		description: "Alert when 24h price change exceeds threshold",
		unit: "%",
	},
	rsi_above: {
		label: "RSI Above",
		description: "Alert when RSI rises above threshold (overbought)",
		unit: "",
	},
	rsi_below: {
		label: "RSI Below",
		description: "Alert when RSI drops below threshold (oversold)",
		unit: "",
	},
	volume_spike: {
		label: "Volume Spike",
		description: "Alert when volume exceeds average by multiplier",
		unit: "x",
	},
	custom: {
		label: "Custom (AI)",
		description: "AI-evaluated custom condition",
		unit: "",
	},
};

// Frequency configurations
export const FREQUENCY_CONFIG: Record<
	TaskFrequency,
	{ label: string; description: string }
> = {
	once: {
		label: "Once",
		description: "Run one time only",
	},
	interval: {
		label: "Every",
		description: "Run at a custom interval",
	},
	daily: {
		label: "Daily",
		description: "Run once a day (with optional repeat)",
	},
	weekly: {
		label: "Weekly",
		description: "Run once a week (with optional repeat)",
	},
	custom: {
		label: "Custom",
		description: "Use cron expression",
	},
};
