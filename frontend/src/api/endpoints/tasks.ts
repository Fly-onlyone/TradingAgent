/**
 * Tasks API Endpoints
 */

import type { PaginationParams } from "@/types";
import type {
	AgentTask,
	MonitoringCondition,
	TaskCreate,
	TaskExecution,
	TaskExecutionListResponse,
	TaskListResponse,
	TaskSchedule,
	TaskStatus,
	TaskUpdate,
} from "@/types/task";
import apiClient from "../client";

export interface TasksFilter extends PaginationParams {
	status?: TaskStatus;
}

function transformMonitoringCondition(
	data: Record<string, unknown>,
): MonitoringCondition {
	return {
		conditionType: data.condition_type as MonitoringCondition["conditionType"],
		threshold: data.threshold as number,
		timeframe: data.timeframe as string | undefined,
		description: data.description as string | undefined,
	};
}

function transformTaskSchedule(data: Record<string, unknown>): TaskSchedule {
	return {
		frequency: data.frequency as TaskSchedule["frequency"],
		cronExpression: data.cron_expression as string | undefined,
		scheduledTime: data.scheduled_time as string | undefined,
		dayOfWeek: data.day_of_week as number | undefined,
		enabled: data.enabled as boolean | undefined,
	};
}

function transformTask(data: Record<string, unknown>): AgentTask {
	return {
		id: data.id as string,
		name: data.name as string,
		description: data.description as string | undefined,
		tradingEnabled: data.trading_enabled as boolean,
		monitoringEnabled: data.monitoring_enabled as boolean,
		schedules: (
			(data.schedules as Array<Record<string, unknown>> | undefined) ?? []
		).map(transformTaskSchedule),
		timezone: data.timezone as string,
		nextRunAt: data.next_run_at as string | undefined,
		lastRunAt: data.last_run_at as string | undefined,
		symbols: (data.symbols as string[]) ?? [],
		riskLevel: data.risk_level as AgentTask["riskLevel"],
		holdingTerm: data.holding_term as AgentTask["holdingTerm"],
		agentMode: data.agent_mode as AgentTask["agentMode"],
		taskModificationMode:
			data.task_modification_mode as AgentTask["taskModificationMode"],
		maxPositionSize: data.max_position_size as number | undefined,
		maxDailyTrades: data.max_daily_trades as number | undefined,
		customInstructions: data.custom_instructions as string | undefined,
		monitoringConditions: (
			(data.monitoring_conditions as
				| Array<Record<string, unknown>>
				| undefined) ?? []
		).map(transformMonitoringCondition),
		alertCooldownMinutes: data.alert_cooldown_minutes as number,
		useSubagents: data.use_subagents as boolean,
		status: data.status as TaskStatus,
		runCount: data.run_count as number,
		successCount: data.success_count as number,
		failureCount: data.failure_count as number,
		lastError: data.last_error as string | undefined,
		isRunning: (data.is_running as boolean) ?? false,
		runningProgress: data.running_progress
			? {
					currentSymbol: (data.running_progress as Record<string, unknown>)
						.current_symbol as string | null,
					completed: (data.running_progress as Record<string, unknown>)
						.completed as number,
					total: (data.running_progress as Record<string, unknown>)
						.total as number,
				}
			: undefined,
		createdAt: data.created_at as string,
		updatedAt: data.updated_at as string,
	};
}

function transformTaskListResponse(
	data: Record<string, unknown>,
): TaskListResponse {
	return {
		tasks: (
			(data.tasks as Array<Record<string, unknown>> | undefined) ?? []
		).map(transformTask),
		total: data.total as number,
		page: data.page as number,
		pageSize: data.page_size as number,
	};
}

function transformTaskExecution(data: Record<string, unknown>): TaskExecution {
	return {
		id: data.id as string,
		taskId: data.task_id as string,
		decisionType: data.decision_type as string,
		symbol: data.symbol as string | undefined,
		action: data.action as string | undefined,
		confidence: data.confidence as number | undefined,
		summary: data.summary as string,
		status: data.status as string,
		createdAt: data.created_at as string,
	};
}

function transformTaskExecutionListResponse(
	data: Record<string, unknown>,
): TaskExecutionListResponse {
	return {
		executions: (
			(data.executions as Array<Record<string, unknown>> | undefined) ?? []
		).map(transformTaskExecution),
		total: data.total as number,
		page: data.page as number,
		pageSize: data.page_size as number,
	};
}

function toSchedulePayload(schedule: TaskSchedule): Record<string, unknown> {
	return {
		frequency: schedule.frequency,
		cron_expression: schedule.cronExpression,
		scheduled_time: schedule.scheduledTime,
		day_of_week: schedule.dayOfWeek,
		enabled: schedule.enabled ?? true,
	};
}

function toMonitoringConditionPayload(
	condition: MonitoringCondition,
): Record<string, unknown> {
	return {
		condition_type: condition.conditionType,
		threshold: condition.threshold,
		timeframe: condition.timeframe,
		description: condition.description,
	};
}

function toTaskPayload(data: TaskCreate | TaskUpdate): Record<string, unknown> {
	const payload: Record<string, unknown> = {};

	if (data.name !== undefined) payload.name = data.name;
	if (data.description !== undefined) payload.description = data.description;
	if (data.tradingEnabled !== undefined)
		payload.trading_enabled = data.tradingEnabled;
	if (data.monitoringEnabled !== undefined)
		payload.monitoring_enabled = data.monitoringEnabled;
	if (data.schedules !== undefined)
		payload.schedules = data.schedules.map(toSchedulePayload);
	if (data.timezone !== undefined) payload.timezone = data.timezone;
	if (data.symbols !== undefined) payload.symbols = data.symbols;
	if (data.riskLevel !== undefined) payload.risk_level = data.riskLevel;
	if (data.holdingTerm !== undefined) payload.holding_term = data.holdingTerm;
	if (data.agentMode !== undefined) payload.agent_mode = data.agentMode;
	if (data.taskModificationMode !== undefined) {
		payload.task_modification_mode = data.taskModificationMode;
	}
	if (data.maxPositionSize !== undefined)
		payload.max_position_size = data.maxPositionSize;
	if (data.maxDailyTrades !== undefined)
		payload.max_daily_trades = data.maxDailyTrades;
	if (data.monitoringConditions !== undefined) {
		payload.monitoring_conditions = data.monitoringConditions.map(
			toMonitoringConditionPayload,
		);
	}
	if (data.alertCooldownMinutes !== undefined) {
		payload.alert_cooldown_minutes = data.alertCooldownMinutes;
	}
	if (data.useSubagents !== undefined)
		payload.use_subagents = data.useSubagents;
	if (data.customInstructions !== undefined) {
		payload.custom_instructions = data.customInstructions;
	}

	return payload;
}

export const tasksApi = {
	/**
	 * Create a new task
	 */
	async createTask(data: TaskCreate): Promise<AgentTask> {
		const response = await apiClient.post<Record<string, unknown>>(
			"/agent/tasks",
			toTaskPayload(data),
		);
		return transformTask(response.data);
	},

	/**
	 * Get task by ID
	 */
	async getTask(taskId: string): Promise<AgentTask> {
		const response = await apiClient.get<Record<string, unknown>>(
			`/agent/tasks/${taskId}`,
		);
		return transformTask(response.data);
	},

	/**
	 * Get all tasks with filters
	 */
	async getTasks(params?: TasksFilter): Promise<TaskListResponse> {
		const response = await apiClient.get<Record<string, unknown>>(
			"/agent/tasks",
			{ params },
		);
		return transformTaskListResponse(response.data);
	},

	/**
	 * Update a task
	 */
	async updateTask(taskId: string, data: TaskUpdate): Promise<AgentTask> {
		const response = await apiClient.put<Record<string, unknown>>(
			`/agent/tasks/${taskId}`,
			toTaskPayload(data),
		);
		return transformTask(response.data);
	},

	/**
	 * Delete a task
	 */
	async deleteTask(taskId: string): Promise<void> {
		await apiClient.delete(`/agent/tasks/${taskId}`);
	},

	/**
	 * Pause a task
	 */
	async pauseTask(taskId: string): Promise<AgentTask> {
		const response = await apiClient.post<Record<string, unknown>>(
			`/agent/tasks/${taskId}/pause`,
		);
		return transformTask(response.data);
	},

	/**
	 * Resume a task
	 */
	async resumeTask(taskId: string): Promise<AgentTask> {
		const response = await apiClient.post<Record<string, unknown>>(
			`/agent/tasks/${taskId}/resume`,
		);
		return transformTask(response.data);
	},

	/**
	 * Run task immediately
	 */
	async runTaskNow(taskId: string): Promise<{ message: string }> {
		const response = await apiClient.post<{ message: string }>(
			`/agent/tasks/${taskId}/run-now`,
		);
		return response.data;
	},

	/**
	 * Emergency stop: pause all active tasks
	 */
	async emergencyStop(): Promise<{ pausedCount: number }> {
		const response = await apiClient.post<Record<string, unknown>>(
			"/agent/tasks/emergency-stop",
		);
		return { pausedCount: response.data.paused_count as number };
	},

	/**
	 * Get task execution history
	 */
	async getTaskHistory(
		taskId: string,
		params?: PaginationParams,
	): Promise<TaskExecutionListResponse> {
		const response = await apiClient.get<Record<string, unknown>>(
			`/agent/tasks/${taskId}/history`,
			{ params },
		);
		return transformTaskExecutionListResponse(response.data);
	},
};

export default tasksApi;
