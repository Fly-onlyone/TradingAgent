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
	StrategyRiskParams,
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
		const response = await apiClient.get<{
			strategies: Record<string, unknown>[];
		}>("/strategies");
		return (response.data.strategies ?? []).map(transformStrategy);
	},

	async getStrategy(strategyId: string): Promise<Strategy> {
		const response = await apiClient.get<Record<string, unknown>>(
			`/strategies/${strategyId}`,
		);
		return transformStrategy(response.data);
	},

	async createStrategy(data: StrategyCreate): Promise<Strategy> {
		const response = await apiClient.post<Strategy>("/strategies", data);
		return response.data;
	},

	async updateStrategy(
		strategyId: string,
		data: StrategyUpdate,
	): Promise<Strategy> {
		const payload: Record<string, unknown> = {};
		if (data.name !== undefined) payload.name = data.name;
		if (data.description !== undefined) payload.description = data.description;
		if (data.isActive !== undefined) payload.is_active = data.isActive;
		if (data.symbol !== undefined) payload.symbol = data.symbol;
		if (data.timeframe !== undefined) payload.timeframe = data.timeframe;
		if (data.entryRules !== undefined) payload.entry_rules = data.entryRules;
		if (data.exitRules !== undefined) payload.exit_rules = data.exitRules;
		if (data.riskParams !== undefined) payload.risk_params = data.riskParams;

		const response = await apiClient.patch<Record<string, unknown>>(
			`/strategies/${strategyId}`,
			payload,
		);
		return transformStrategy(response.data);
	},

	async deleteStrategy(strategyId: string): Promise<void> {
		await apiClient.delete(`/strategies/${strategyId}`);
	},

	async toggleStrategy(strategyId: string, active: boolean): Promise<Strategy> {
		const response = await apiClient.patch<Record<string, unknown>>(
			`/strategies/${strategyId}`,
			{ is_active: active },
		);
		return transformStrategy(response.data);
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

function transformStrategy(data: Record<string, unknown>): Strategy {
	const riskParams = (data.risk_params as StrategyRiskParams | undefined) ?? {
		maxPositionSize: 0,
		riskPerTrade: 0,
		maxDrawdown: 0,
	};

	return {
		id: data.id as string,
		name: data.name as string,
		description: (data.description as string) || "",
		isActive: data.is_active as boolean,
		symbol: data.symbol as string | undefined,
		timeframe: data.timeframe as string | undefined,
		symbols: (data.symbols as string[]) || [],
		timeframes: (data.timeframes as string[]) || [],
		entryRules: (data.entry_rules as Record<string, unknown>) || {},
		exitRules: (data.exit_rules as Record<string, unknown>) || {},
		riskParams,
		backtestResults: data.backtest_results as Strategy["backtestResults"],
		autoDiscovered: (data.auto_discovered as boolean) ?? false,
		sourceUrl: data.source_url as string | undefined,
		createdAt: data.created_at as string,
		updatedAt: data.updated_at as string | undefined,
	};
}

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
