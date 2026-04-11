/**
 * Decisions API Endpoints
 */

import type { PaginationParams } from "@/types";
import type {
	AgentDecisionDetail,
	DecisionAction,
	DecisionListResponse,
	DecisionStats,
	DecisionStatus,
	DecisionType,
	FeedbackCreate,
} from "@/types/session";
import apiClient from "../client";

export interface DecisionsFilter extends PaginationParams {
	decisionType?: DecisionType;
	symbol?: string;
	action?: DecisionAction;
	status?: DecisionStatus;
	sessionId?: string;
	taskId?: string;
	startDate?: string;
	endDate?: string;
}

export const decisionsApi = {
	/**
	 * Get all decisions with filters
	 */
	async getDecisions(params?: DecisionsFilter): Promise<DecisionListResponse> {
		const response = await apiClient.get<DecisionListResponse>(
			"/agent/decisions",
			{ params },
		);
		return response.data;
	},

	/**
	 * Get pending decisions awaiting confirmation
	 */
	async getPendingDecisions(
		params?: PaginationParams,
	): Promise<DecisionListResponse> {
		const response = await apiClient.get<DecisionListResponse>(
			"/agent/decisions/pending",
			{
				params,
			},
		);
		return response.data;
	},

	/**
	 * Get decision statistics
	 */
	async getDecisionStats(days?: number): Promise<DecisionStats> {
		const response = await apiClient.get<DecisionStats>(
			"/agent/decisions/stats",
			{
				params: { days },
			},
		);
		return response.data;
	},

	/**
	 * Get unique symbols from decisions
	 */
	async getDecisionSymbols(): Promise<string[]> {
		const response = await apiClient.get<string[]>("/agent/decisions/symbols");
		return response.data;
	},

	/**
	 * Get decision by ID with full details
	 */
	async getDecision(decisionId: string): Promise<AgentDecisionDetail> {
		const response = await apiClient.get<AgentDecisionDetail>(
			`/agent/decisions/${decisionId}`,
		);
		return response.data;
	},

	/**
	 * Confirm a pending decision
	 */
	async confirmDecision(decisionId: string): Promise<AgentDecisionDetail> {
		const response = await apiClient.post<AgentDecisionDetail>(
			`/agent/decisions/${decisionId}/confirm`,
		);
		return response.data;
	},

	/**
	 * Reject a pending decision
	 */
	async rejectDecision(decisionId: string): Promise<AgentDecisionDetail> {
		const response = await apiClient.post<AgentDecisionDetail>(
			`/agent/decisions/${decisionId}/reject`,
		);
		return response.data;
	},

	/**
	 * Add feedback to a decision
	 */
	async addFeedback(
		decisionId: string,
		data: FeedbackCreate,
	): Promise<AgentDecisionDetail> {
		const response = await apiClient.post<AgentDecisionDetail>(
			`/agent/decisions/${decisionId}/feedback`,
			data,
		);
		return response.data;
	},
};

export default decisionsApi;
