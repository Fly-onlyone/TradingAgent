/**
 * Settings API Endpoints - Agent Configuration
 */

import apiClient from "../client";

export interface AgentConfig {
	authMode: string;
	hasApiKey: boolean;
	maskedApiKey: string;
	model: string;
	thinkingMode: string;
	thinkingBudget: number;
	effort: string;
	cliLoggedIn: boolean;
}

export interface AgentConfigUpdate {
	authMode?: string;
	apiKey?: string;
	model?: string;
	thinkingMode?: string;
	thinkingBudget?: number;
	effort?: string;
}

export interface AgentModelOption {
	value: string;
	label: string;
}

export interface TestConnectionResult {
	success: boolean;
	message: string;
}

export interface CLILoginStatus {
	loggedIn: boolean;
	message: string;
}

export interface CLILoginResult {
	success: boolean;
	message: string;
}

export interface ExchangeConfig {
	hasApiKey: boolean;
	maskedApiKey: string;
	hasSecretKey: boolean;
	maskedSecretKey: string;
	hasPassphrase: boolean;
	sandbox: boolean;
}

export interface ExchangeCredentials {
	apiKey: string;
	secretKey: string;
	passphrase: string;
}

export interface ExchangeConfigUpdate {
	apiKey?: string;
	secretKey?: string;
	passphrase?: string;
	sandbox?: boolean;
}

export interface BraveSearchConfig {
	hasApiKey: boolean;
	maskedApiKey: string;
}

export interface BraveSearchConfigUpdate {
	apiKey?: string;
}

export interface EmbeddingConfig {
	deferEmbeddingWhenGaming: boolean;
	gamingProcessList: string[];
	gamingCheckIntervalMinutes: number;
}

export interface EmbeddingConfigUpdate {
	deferEmbeddingWhenGaming?: boolean;
	gamingProcessList?: string[];
	gamingCheckIntervalMinutes?: number;
}

export interface EmbeddingModelInfo {
	hfId: string;
	label: string;
	dimension: number;
	description: string;
	paramsMillions: number;
}

export interface EmbeddingModelConfig {
	currentModel: string;
	availableModels: EmbeddingModelInfo[];
}

export interface AuthConfig {
	accessTokenExpireMinutes: number;
}

export interface AuthConfigUpdate {
	accessTokenExpireMinutes?: number;
}

export interface StrategyDiscoverySource {
	id: string;
	name: string;
	domain: string;
	rssUrl: string | null;
	strategyExtraction: boolean;
}

export interface StrategyDiscoveryConfig {
	enabled: boolean;
	intervalHours: number;
	minConfidence: number;
	maxSources: number;
	lastRunAt: string | null;
	sources: StrategyDiscoverySource[];
}

export interface SessionRetentionConfig {
	sessionRetentionDays: number;
}

export interface SessionRetentionConfigUpdate {
	sessionRetentionDays?: number;
}

export interface StrategyDiscoveryConfigUpdate {
	enabled?: boolean;
	intervalHours?: number;
	minConfidence?: number;
	maxSources?: number;
}

export interface DiscoveryRunResult {
	sourcesCrawled: number;
	articlesProcessed: number;
	strategiesFound: number;
	discoveryNewSources: number;
	discoveryArticlesFetched: number;
	discoveryStrategiesExtracted: number;
}

const AGENT_THINKING_MODES = new Set(["adaptive", "enabled", "disabled"]);
const AGENT_EFFORT_LEVELS = new Set(["low", "medium", "high", "max"]);

function transformAgentConfig(data: Record<string, unknown>): AgentConfig {
	const thinkingMode =
		typeof data.thinking_mode === "string" &&
		AGENT_THINKING_MODES.has(data.thinking_mode)
			? data.thinking_mode
			: "adaptive";
	const thinkingBudget =
		typeof data.thinking_budget === "number" ? data.thinking_budget : 10000;
	const effort =
		typeof data.effort === "string" && AGENT_EFFORT_LEVELS.has(data.effort)
			? data.effort
			: "high";

	return {
		authMode: data.auth_mode as string,
		hasApiKey: data.has_api_key as boolean,
		maskedApiKey: data.masked_api_key as string,
		model: data.model as string,
		thinkingMode,
		thinkingBudget,
		effort,
		cliLoggedIn: data.cli_logged_in as boolean,
	};
}

function transformEmbeddingConfig(
	data: Record<string, unknown>,
): EmbeddingConfig {
	return {
		deferEmbeddingWhenGaming: data.defer_embedding_when_gaming as boolean,
		gamingProcessList: data.gaming_process_list as string[],
		gamingCheckIntervalMinutes: data.gaming_check_interval_minutes as number,
	};
}

function transformExchangeConfig(
	data: Record<string, unknown>,
): ExchangeConfig {
	return {
		hasApiKey: data.has_api_key as boolean,
		maskedApiKey: data.masked_api_key as string,
		hasSecretKey: data.has_secret_key as boolean,
		maskedSecretKey: data.masked_secret_key as string,
		hasPassphrase: data.has_passphrase as boolean,
		sandbox: data.sandbox as boolean,
	};
}

function transformBraveSearchConfig(
	data: Record<string, unknown>,
): BraveSearchConfig {
	return {
		hasApiKey: data.has_api_key as boolean,
		maskedApiKey: data.masked_api_key as string,
	};
}

export const settingsApi = {
	async getAgentConfig(): Promise<AgentConfig> {
		const response =
			await apiClient.get<Record<string, unknown>>("/settings/agent");
		return transformAgentConfig(response.data);
	},

	async getAgentModels(): Promise<AgentModelOption[]> {
		const response = await apiClient.get<Array<Record<string, unknown>>>(
			"/settings/agent/models",
		);
		return response.data.map((entry) => ({
			value: entry.value as string,
			label: entry.label as string,
		}));
	},

	async updateAgentConfig(update: AgentConfigUpdate): Promise<AgentConfig> {
		const payload: Record<string, unknown> = {};
		if (update.authMode !== undefined) payload.auth_mode = update.authMode;
		if (update.apiKey !== undefined) payload.api_key = update.apiKey;
		if (update.model !== undefined) payload.model = update.model;
		if (update.thinkingMode !== undefined)
			payload.thinking_mode = update.thinkingMode;
		if (update.thinkingBudget !== undefined)
			payload.thinking_budget = update.thinkingBudget;
		if (update.effort !== undefined) payload.effort = update.effort;

		const response = await apiClient.put<Record<string, unknown>>(
			"/settings/agent",
			payload,
		);
		return transformAgentConfig(response.data);
	},

	async testConnection(): Promise<TestConnectionResult> {
		const response = await apiClient.post<Record<string, unknown>>(
			"/settings/agent/test",
		);
		return {
			success: response.data.success as boolean,
			message: response.data.message as string,
		};
	},

	async checkCLILoginStatus(): Promise<CLILoginStatus> {
		const response = await apiClient.post<Record<string, unknown>>(
			"/settings/agent/cli-login-status",
		);
		return {
			loggedIn: response.data.logged_in as boolean,
			message: response.data.message as string,
		};
	},

	async startCLILogin(): Promise<CLILoginResult> {
		const response = await apiClient.post<Record<string, unknown>>(
			"/settings/agent/cli-login",
		);
		return {
			success: response.data.success as boolean,
			message: response.data.message as string,
		};
	},

	async cliLogout(): Promise<CLILoginResult> {
		const response = await apiClient.post<Record<string, unknown>>(
			"/settings/agent/cli-logout",
		);
		return {
			success: response.data.success as boolean,
			message: response.data.message as string,
		};
	},

	async getEmbeddingConfig(): Promise<EmbeddingConfig> {
		const response = await apiClient.get<Record<string, unknown>>(
			"/settings/embedding",
		);
		return transformEmbeddingConfig(response.data);
	},

	async updateEmbeddingConfig(
		update: EmbeddingConfigUpdate,
	): Promise<EmbeddingConfig> {
		const payload: Record<string, unknown> = {};
		if (update.deferEmbeddingWhenGaming !== undefined)
			payload.defer_embedding_when_gaming = update.deferEmbeddingWhenGaming;
		if (update.gamingProcessList !== undefined)
			payload.gaming_process_list = update.gamingProcessList;
		if (update.gamingCheckIntervalMinutes !== undefined)
			payload.gaming_check_interval_minutes = update.gamingCheckIntervalMinutes;

		const response = await apiClient.put<Record<string, unknown>>(
			"/settings/embedding",
			payload,
		);
		return transformEmbeddingConfig(response.data);
	},

	async getEmbeddingModelConfig(): Promise<EmbeddingModelConfig> {
		const response = await apiClient.get<Record<string, unknown>>(
			"/settings/embedding/model",
		);
		const data = response.data;
		return {
			currentModel: data.current_model as string,
			availableModels: (
				data.available_models as Array<Record<string, unknown>>
			).map((m) => ({
				hfId: m.hf_id as string,
				label: m.label as string,
				dimension: m.dimension as number,
				description: m.description as string,
				paramsMillions: m.params_millions as number,
			})),
		};
	},

	async updateEmbeddingModelConfig(
		modelName: string,
	): Promise<EmbeddingModelConfig> {
		const response = await apiClient.put<Record<string, unknown>>(
			"/settings/embedding/model",
			{ model_name: modelName },
		);
		const data = response.data;
		return {
			currentModel: data.current_model as string,
			availableModels: (
				data.available_models as Array<Record<string, unknown>>
			).map((m) => ({
				hfId: m.hf_id as string,
				label: m.label as string,
				dimension: m.dimension as number,
				description: m.description as string,
				paramsMillions: m.params_millions as number,
			})),
		};
	},

	async getExchangeConfig(): Promise<ExchangeConfig> {
		const response =
			await apiClient.get<Record<string, unknown>>("/settings/exchange");
		return transformExchangeConfig(response.data);
	},

	async updateExchangeConfig(
		update: ExchangeConfigUpdate,
	): Promise<ExchangeConfig> {
		const payload: Record<string, unknown> = {};
		if (update.apiKey !== undefined) payload.api_key = update.apiKey;
		if (update.secretKey !== undefined) payload.secret_key = update.secretKey;
		if (update.passphrase !== undefined) payload.passphrase = update.passphrase;
		if (update.sandbox !== undefined) payload.sandbox = update.sandbox;

		const response = await apiClient.put<Record<string, unknown>>(
			"/settings/exchange",
			payload,
		);
		return transformExchangeConfig(response.data);
	},

	async revealExchangeCredentials(): Promise<ExchangeCredentials> {
		const response = await apiClient.post<Record<string, unknown>>(
			"/settings/exchange/reveal",
		);
		return {
			apiKey: response.data.api_key as string,
			secretKey: response.data.secret_key as string,
			passphrase: response.data.passphrase as string,
		};
	},

	async testExchangeConnection(): Promise<TestConnectionResult> {
		const response = await apiClient.post<Record<string, unknown>>(
			"/settings/exchange/test",
		);
		return {
			success: response.data.success as boolean,
			message: response.data.message as string,
		};
	},

	async getBraveSearchConfig(): Promise<BraveSearchConfig> {
		const response = await apiClient.get<Record<string, unknown>>(
			"/settings/brave-search",
		);
		return transformBraveSearchConfig(response.data);
	},

	async updateBraveSearchConfig(
		update: BraveSearchConfigUpdate,
	): Promise<BraveSearchConfig> {
		const payload: Record<string, unknown> = {};
		if (update.apiKey !== undefined) payload.api_key = update.apiKey;

		const response = await apiClient.put<Record<string, unknown>>(
			"/settings/brave-search",
			payload,
		);
		return transformBraveSearchConfig(response.data);
	},

	async revealBraveSearchKey(): Promise<string> {
		const response = await apiClient.post<Record<string, unknown>>(
			"/settings/brave-search/reveal",
		);
		return response.data.api_key as string;
	},

	async testBraveSearchConnection(): Promise<TestConnectionResult> {
		const response = await apiClient.post<Record<string, unknown>>(
			"/settings/brave-search/test",
		);
		return {
			success: response.data.success as boolean,
			message: response.data.message as string,
		};
	},

	async getAuthConfig(): Promise<AuthConfig> {
		const response =
			await apiClient.get<Record<string, unknown>>("/settings/auth");
		return {
			accessTokenExpireMinutes: response.data
				.access_token_expire_minutes as number,
		};
	},

	async getStrategyDiscoveryConfig(): Promise<StrategyDiscoveryConfig> {
		const response = await apiClient.get<Record<string, unknown>>(
			"/settings/strategy-discovery",
		);
		return transformStrategyDiscoveryConfig(response.data);
	},

	async updateStrategyDiscoveryConfig(
		update: StrategyDiscoveryConfigUpdate,
	): Promise<StrategyDiscoveryConfig> {
		const payload: Record<string, unknown> = {};
		if (update.enabled !== undefined) payload.enabled = update.enabled;
		if (update.intervalHours !== undefined)
			payload.interval_hours = update.intervalHours;
		if (update.minConfidence !== undefined)
			payload.min_confidence = update.minConfidence;
		if (update.maxSources !== undefined)
			payload.max_sources = update.maxSources;

		const response = await apiClient.put<Record<string, unknown>>(
			"/settings/strategy-discovery",
			payload,
		);
		return transformStrategyDiscoveryConfig(response.data);
	},

	async runStrategyDiscoveryNow(): Promise<DiscoveryRunResult> {
		const response = await apiClient.post<Record<string, unknown>>(
			"/settings/strategy-discovery/run-now",
		);
		return {
			sourcesCrawled: response.data.sources_crawled as number,
			articlesProcessed: response.data.articles_processed as number,
			strategiesFound: response.data.strategies_found as number,
			discoveryNewSources: (response.data.discovery_new_sources as number) ?? 0,
			discoveryArticlesFetched:
				(response.data.discovery_articles_fetched as number) ?? 0,
			discoveryStrategiesExtracted:
				(response.data.discovery_strategies_extracted as number) ?? 0,
		};
	},

	async getSessionRetentionConfig(): Promise<SessionRetentionConfig> {
		const response = await apiClient.get<Record<string, unknown>>(
			"/settings/session-retention",
		);
		return {
			sessionRetentionDays: response.data.session_retention_days as number,
		};
	},

	async updateSessionRetentionConfig(
		update: SessionRetentionConfigUpdate,
	): Promise<SessionRetentionConfig> {
		const payload: Record<string, unknown> = {};
		if (update.sessionRetentionDays !== undefined)
			payload.session_retention_days = update.sessionRetentionDays;

		const response = await apiClient.put<Record<string, unknown>>(
			"/settings/session-retention",
			payload,
		);
		return {
			sessionRetentionDays: response.data.session_retention_days as number,
		};
	},

	async updateAuthConfig(update: AuthConfigUpdate): Promise<AuthConfig> {
		const payload: Record<string, unknown> = {};
		if (update.accessTokenExpireMinutes !== undefined)
			payload.access_token_expire_minutes = update.accessTokenExpireMinutes;

		const response = await apiClient.put<Record<string, unknown>>(
			"/settings/auth",
			payload,
		);
		return {
			accessTokenExpireMinutes: response.data
				.access_token_expire_minutes as number,
		};
	},
};

function transformStrategyDiscoveryConfig(
	data: Record<string, unknown>,
): StrategyDiscoveryConfig {
	const rawSources = (data.sources as Array<Record<string, unknown>>) || [];
	return {
		enabled: data.enabled as boolean,
		intervalHours: data.interval_hours as number,
		minConfidence: data.min_confidence as number,
		maxSources: (data.max_sources as number) ?? 30,
		lastRunAt: (data.last_run_at as string) ?? null,
		sources: rawSources.map((s) => ({
			id: s.id as string,
			name: s.name as string,
			domain: s.domain as string,
			rssUrl: s.rss_url as string | null,
			strategyExtraction: s.strategy_extraction as boolean,
		})),
	};
}

export interface AutostartConfig {
	enabled: boolean;
}

export interface NativeNotificationConfig {
	enabled: boolean;
}

export const nativeNotificationApi = {
	async getNativeNotificationConfig(): Promise<NativeNotificationConfig> {
		const response = await apiClient.get<Record<string, unknown>>(
			"/settings/notifications/native",
		);
		return { enabled: response.data.enabled as boolean };
	},

	async updateNativeNotificationConfig(
		enabled: boolean,
	): Promise<NativeNotificationConfig> {
		const response = await apiClient.put<Record<string, unknown>>(
			"/settings/notifications/native",
			{ enabled },
		);
		return { enabled: response.data.enabled as boolean };
	},
};

export const autostartApi = {
	async getAutostartConfig(): Promise<AutostartConfig> {
		const response =
			await apiClient.get<Record<string, unknown>>("/settings/autostart");
		return { enabled: response.data.enabled as boolean };
	},

	async updateAutostartConfig(enabled: boolean): Promise<AutostartConfig> {
		const response = await apiClient.put<Record<string, unknown>>(
			"/settings/autostart",
			{ enabled },
		);
		return { enabled: response.data.enabled as boolean };
	},
};

export default settingsApi;
