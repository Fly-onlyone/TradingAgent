/**
 * Knowledge Base API Endpoints
 */

import type {
	KnowledgeQuery,
	KnowledgeSearchResult,
	StrategyKnowledge,
	TradeLesson,
	TradingPattern,
} from "@/types";
import apiClient from "../client";

export const knowledgeApi = {
	/**
	 * Search knowledge base
	 */
	async search(params: KnowledgeQuery): Promise<KnowledgeSearchResult> {
		const response = await apiClient.post<KnowledgeSearchResult>(
			"/knowledge/search",
			params,
		);
		return response.data;
	},

	/**
	 * Get all strategies
	 */
	async getStrategies(limit?: number): Promise<StrategyKnowledge[]> {
		const response = await apiClient.get<StrategyKnowledge[]>(
			"/knowledge/strategies",
			{
				params: { limit },
			},
		);
		return response.data;
	},

	/**
	 * Get strategy by ID
	 */
	async getStrategy(strategyId: string): Promise<StrategyKnowledge> {
		const response = await apiClient.get<StrategyKnowledge>(
			`/knowledge/strategies/${strategyId}`,
		);
		return response.data;
	},

	/**
	 * Create strategy knowledge
	 */
	async createStrategy(
		data: Omit<StrategyKnowledge, "id" | "createdAt" | "updatedAt">,
	): Promise<StrategyKnowledge> {
		const response = await apiClient.post<StrategyKnowledge>(
			"/knowledge/strategies",
			data,
		);
		return response.data;
	},

	/**
	 * Get trade lessons
	 */
	async getLessons(params?: {
		symbol?: string;
		outcome?: string;
		limit?: number;
	}): Promise<TradeLesson[]> {
		const response = await apiClient.get<TradeLesson[]>("/knowledge/lessons", {
			params,
		});
		return response.data;
	},

	/**
	 * Get lesson by ID
	 */
	async getLesson(lessonId: string): Promise<TradeLesson> {
		const response = await apiClient.get<TradeLesson>(
			`/knowledge/lessons/${lessonId}`,
		);
		return response.data;
	},

	/**
	 * Get trading patterns
	 */
	async getPatterns(params?: {
		patternType?: string;
		minSuccessRate?: number;
		limit?: number;
	}): Promise<TradingPattern[]> {
		const response = await apiClient.get<TradingPattern[]>(
			"/knowledge/patterns",
			{ params },
		);
		return response.data;
	},

	/**
	 * Get pattern by ID
	 */
	async getPattern(patternId: string): Promise<TradingPattern> {
		const response = await apiClient.get<TradingPattern>(
			`/knowledge/patterns/${patternId}`,
		);
		return response.data;
	},

	/**
	 * Get relevant context for agent
	 */
	async getContext(query: string): Promise<string> {
		const response = await apiClient.get<{ context: string }>(
			"/knowledge/context",
			{
				params: { query },
			},
		);
		return response.data.context;
	},
};

export default knowledgeApi;
