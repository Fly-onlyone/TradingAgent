/**
 * Task Types
 */

export type TaskFrequency = 'once' | 'hourly' | 'daily' | 'weekly' | 'custom';
export type TaskStatus = 'active' | 'paused' | 'completed' | 'failed';
export type RiskLevel = 'conservative' | 'moderate' | 'aggressive';
export type AgentMode = 'auto' | 'ask';
export type TaskType = 'analysis' | 'trading' | 'monitoring';

export interface AgentTask {
  id: string;
  name: string;
  description?: string;
  taskType: TaskType;

  // Schedule
  frequency: TaskFrequency;
  cronExpression?: string;
  scheduledTime?: string; // HH:MM
  dayOfWeek?: number; // 0-6
  timezone: string;
  nextRunAt?: string;
  lastRunAt?: string;

  // Trading parameters
  symbols: string[];
  riskLevel: RiskLevel;
  agentMode: AgentMode;
  maxPositionSize?: number;
  maxDailyTrades?: number;
  customInstructions?: string;

  // Status
  status: TaskStatus;
  runCount: number;
  successCount: number;
  failureCount: number;
  lastError?: string;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}

export interface TaskCreate {
  name: string;
  description?: string;
  taskType: TaskType;
  frequency: TaskFrequency;
  cronExpression?: string;
  scheduledTime?: string;
  dayOfWeek?: number;
  timezone?: string;
  symbols: string[];
  riskLevel: RiskLevel;
  agentMode: AgentMode;
  maxPositionSize?: number;
  maxDailyTrades?: number;
  customInstructions?: string;
}

export interface TaskUpdate {
  name?: string;
  description?: string;
  taskType?: TaskType;
  frequency?: TaskFrequency;
  cronExpression?: string;
  scheduledTime?: string;
  dayOfWeek?: number;
  timezone?: string;
  symbols?: string[];
  riskLevel?: RiskLevel;
  agentMode?: AgentMode;
  maxPositionSize?: number;
  maxDailyTrades?: number;
  customInstructions?: string;
}

export interface TaskExecution {
  id: string;
  taskId: string;
  decisionType: string;
  symbol?: string;
  action?: string;
  confidence?: number;
  summary: string;
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
export const RISK_LEVEL_CONFIG: Record<RiskLevel, { label: string; description: string; color: string }> = {
  conservative: {
    label: 'Conservative',
    description: '1-2% risk per trade',
    color: '#4caf50',
  },
  moderate: {
    label: 'Moderate',
    description: '2-5% risk per trade',
    color: '#ff9800',
  },
  aggressive: {
    label: 'Aggressive',
    description: '5-10% risk per trade',
    color: '#f44336',
  },
};

// Agent mode configurations
export const AGENT_MODE_CONFIG: Record<AgentMode, { label: string; description: string }> = {
  auto: {
    label: 'Auto',
    description: 'Execute trades automatically',
  },
  ask: {
    label: 'Ask',
    description: 'Notify and wait for confirmation',
  },
};

// Frequency configurations
export const FREQUENCY_CONFIG: Record<TaskFrequency, { label: string; description: string }> = {
  once: {
    label: 'Once',
    description: 'Run one time only',
  },
  hourly: {
    label: 'Hourly',
    description: 'Run every hour',
  },
  daily: {
    label: 'Daily',
    description: 'Run once a day',
  },
  weekly: {
    label: 'Weekly',
    description: 'Run once a week',
  },
  custom: {
    label: 'Custom',
    description: 'Use cron expression',
  },
};
