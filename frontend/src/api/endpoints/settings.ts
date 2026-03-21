/**
 * Settings API Endpoints - Agent Configuration
 */

import apiClient from "../client";

export interface AgentConfig {
	authMode: string;
	hasApiKey: boolean;
	maskedApiKey: string;
	model: string;
	maxThinkingTokens: number;
	cliLoggedIn: boolean;
}

export interface AgentConfigUpdate {
	authMode?: string;
	apiKey?: string;
	model?: string;
	maxThinkingTokens?: number;
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

export interface ExchangeConfigUpdate {
	apiKey?: string;
	secretKey?: string;
	passphrase?: string;
	sandbox?: boolean;
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
	sources: StrategyDiscoverySource[];
}

export interface StrategyDiscoveryConfigUpdate {
	enabled?: boolean;
	intervalHours?: number;
	minConfidence?: number;
}

export interface DiscoveryRunResult {
	sourcesCrawled: number;
	articlesProcessed: number;
	strategiesFound: number;
}

function transformAgentConfig(data: Record<string, unknown>): AgentConfig {
	return {
		authMode: data.auth_mode as string,
		hasApiKey: data.has_api_key as boolean,
		maskedApiKey: data.masked_api_key as string,
		model: data.model as string,
		maxThinkingTokens: data.max_thinking_tokens as number,
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
		if (update.maxThinkingTokens !== undefined)
			payload.max_thinking_tokens = update.maxThinkingTokens;

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

	async testExchangeConnection(): Promise<TestConnectionResult> {
		const response = await apiClient.post<Record<string, unknown>>(
			"/settings/exchange/test",
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
		sources: rawSources.map((s) => ({
			id: s.id as string,
			name: s.name as string,
			domain: s.domain as string,
			rssUrl: s.rss_url as string | null,
			strategyExtraction: s.strategy_extraction as boolean,
		})),
	};
}

export default settingsApi;
