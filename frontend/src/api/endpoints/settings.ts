/**
 * Settings API Endpoints - Agent Configuration
 */

import apiClient from '../client';

export interface AgentConfig {
    authMode: string;
    hasApiKey: boolean;
    maskedApiKey: string;
    model: string;
    cliLoggedIn: boolean;
}

export interface AgentConfigUpdate {
    authMode?: string;
    apiKey?: string;
    model?: string;
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

function transformAgentConfig(data: Record<string, unknown>): AgentConfig {
    return {
        authMode: data.auth_mode as string,
        hasApiKey: data.has_api_key as boolean,
        maskedApiKey: data.masked_api_key as string,
        model: data.model as string,
        cliLoggedIn: data.cli_logged_in as boolean,
    };
}

export const settingsApi = {
    async getAgentConfig(): Promise<AgentConfig> {
        const response = await apiClient.get<Record<string, unknown>>('/settings/agent');
        return transformAgentConfig(response.data);
    },

    async updateAgentConfig(update: AgentConfigUpdate): Promise<AgentConfig> {
        const payload: Record<string, unknown> = {};
        if (update.authMode !== undefined) payload.auth_mode = update.authMode;
        if (update.apiKey !== undefined) payload.api_key = update.apiKey;
        if (update.model !== undefined) payload.model = update.model;

        const response = await apiClient.put<Record<string, unknown>>('/settings/agent', payload);
        return transformAgentConfig(response.data);
    },

    async testConnection(): Promise<TestConnectionResult> {
        const response = await apiClient.post<Record<string, unknown>>('/settings/agent/test');
        return {
            success: response.data.success as boolean,
            message: response.data.message as string,
        };
    },

    async checkCLILoginStatus(): Promise<CLILoginStatus> {
        const response = await apiClient.post<Record<string, unknown>>('/settings/agent/cli-login-status');
        return {
            loggedIn: response.data.logged_in as boolean,
            message: response.data.message as string,
        };
    },

    async startCLILogin(): Promise<CLILoginResult> {
        const response = await apiClient.post<Record<string, unknown>>('/settings/agent/cli-login');
        return {
            success: response.data.success as boolean,
            message: response.data.message as string,
        };
    },

    async cliLogout(): Promise<CLILoginResult> {
        const response = await apiClient.post<Record<string, unknown>>('/settings/agent/cli-logout');
        return {
            success: response.data.success as boolean,
            message: response.data.message as string,
        };
    },
};

export default settingsApi;
