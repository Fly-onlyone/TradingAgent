/**
 * Strategies API Endpoints
 */

import type {
	BacktestResults,
	ExtractedStrategy,
	Strategy,
	StrategyCreate,
	StrategyImportConfirm,
	StrategyImportResult,
	StrategySignal,
	StrategyUpdate,
} from "@/types";
import apiClient from "../client";

export interface BacktestParams {
	strategyId: string;
	symbol: string;
	timeframe: string;
	startDate: string;
	endDate: string;
	initialCapital?: number;
}

export const strategiesApi = {
	async getStrategies(): Promise<Strategy[]> {
		const response = await apiClient.get<Strategy[]>("/strategies");
		return response.data;
	},

	async getStrategy(strategyId: string): Promise<Strategy> {
		const response = await apiClient.get<Strategy>(`/strategies/${strategyId}`);
		return response.data;
	},

	async createStrategy(data: StrategyCreate): Promise<Strategy> {
		const response = await apiClient.post<Strategy>("/strategies", data);
		return response.data;
	},

	async updateStrategy(
		strategyId: string,
		data: StrategyUpdate,
	): Promise<Strategy> {
		const response = await apiClient.patch<Strategy>(
			`/strategies/${strategyId}`,
			data,
		);
		return response.data;
	},

	async deleteStrategy(strategyId: string): Promise<void> {
		await apiClient.delete(`/strategies/${strategyId}`);
	},

	async toggleStrategy(strategyId: string, active: boolean): Promise<Strategy> {
		const response = await apiClient.patch<Strategy>(
			`/strategies/${strategyId}`,
			{ isActive: active },
		);
		return response.data;
	},

	async runBacktest(params: BacktestParams): Promise<BacktestResults> {
		const response = await apiClient.post<BacktestResults>(
			`/strategies/${params.strategyId}/backtest`,
			params,
		);
		return response.data;
	},

	async getSignals(strategyId: string): Promise<StrategySignal[]> {
		const response = await apiClient.get<StrategySignal[]>(
			`/strategies/${strategyId}/signals`,
		);
		return response.data;
	},

	async extractFromUrl(url: string): Promise<ExtractedStrategy> {
		const response = await apiClient.post<Record<string, unknown>>(
			"/strategies/import/url/extract",
			{ url },
		);
		return transformExtractedStrategy(response.data);
	},

	async extractFromFile(file: File): Promise<ExtractedStrategy> {
		const formData = new FormData();
		formData.append("file", file);
		const response = await apiClient.post<Record<string, unknown>>(
			"/strategies/import/file/extract",
			formData,
			{ headers: { "Content-Type": "multipart/form-data" } },
		);
		return transformExtractedStrategy(response.data);
	},

	async confirmImport(
		data: StrategyImportConfirm,
	): Promise<StrategyImportResult> {
		const payload = {
			name: data.name,
			description: data.description,
			entry_rules: data.entryRules,
			exit_rules: data.exitRules,
			risk_params: data.riskParams,
			symbols: data.symbols,
			timeframes: data.timeframes,
			market_conditions: data.marketConditions,
			asset_classes: data.assetClasses,
			source_url: data.sourceUrl,
			source_filename: data.sourceFilename,
		};
		const response = await apiClient.post<Record<string, unknown>>(
			"/strategies/import/confirm",
			payload,
		);
		return {
			strategyId: response.data.strategy_id as string,
			knowledgeId: response.data.knowledge_id as string,
		};
	},
};

function transformExtractedStrategy(
	data: Record<string, unknown>,
): ExtractedStrategy {
	return {
		name: (data.name as string) || "",
		description: (data.description as string) || "",
		entryRules: (data.entry_rules as Record<string, unknown>) || {},
		exitRules: (data.exit_rules as Record<string, unknown>) || {},
		riskParams: (data.risk_params as Record<string, unknown>) || {},
		symbols: (data.symbols as string[]) || [],
		timeframes: (data.timeframes as string[]) || [],
		marketConditions: (data.market_conditions as string[]) || [],
		assetClasses: (data.asset_classes as string[]) || [],
		sourceUrl: data.source_url as string | undefined,
		sourceFilename: data.source_filename as string | undefined,
	};
}

export default strategiesApi;
