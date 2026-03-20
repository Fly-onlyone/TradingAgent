/**
 * Axios API Client with JWT interceptors
 */

import axios, {type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig,} from "axios";
import type {ApiError, AuthTokens} from "@/types";
import {getApiBaseUrl} from "@/utils/tauriEnv";

// Token storage (in memory for security)
let accessToken: string | null = null;

export const setAccessToken = (token: string | null) => {
    accessToken = token;
};

export const getAccessToken = () => accessToken;

// Create axios instance
const apiClient: AxiosInstance = axios.create({
    baseURL: getApiBaseUrl(),
    headers: {
        "Content-Type": "application/json",
    },
    timeout: 30000,
});

// Request interceptor - add auth token
apiClient.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        if (accessToken) {
            config.headers.Authorization = `Bearer ${accessToken}`;
        }
        return config;
    },
    (error) => Promise.reject(error),
);

// Response interceptor - handle errors
apiClient.interceptors.response.use(
    (response) => response,
    async (error: AxiosError<ApiError>) => {
        const apiError: ApiError = {
            detail:
                error.response?.data?.detail || error.message || "An error occurred",
            code: error.code,
        };

        // Handle 401 Unauthorized by clearing auth state.
        // The route guards (requireAuth) will handle the redirect on next navigation.
        // Avoid window.location.replace — it causes a full page reload which can race
        // with Zustand persist rehydration and lose auth state unnecessarily.
        if (error.response?.status === 401) {
            setAccessToken(null);
            const {useAuthStore} = await import("@/store/authStore");
            useAuthStore.getState().logout();

            return Promise.reject(apiError);
        }

        return Promise.reject(apiError);
    },
);

export default apiClient;

// Helper for setting tokens from auth response
export const handleAuthResponse = (tokens: AuthTokens) => {
    setAccessToken(tokens.access_token);
};

// Helper to check if user is authenticated
export const isAuthenticated = () => Boolean(accessToken);
