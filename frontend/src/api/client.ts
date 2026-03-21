/**
 * Axios API Client with JWT interceptors and transparent token refresh
 */

import axios, {
	type AxiosError,
	type AxiosInstance,
	type InternalAxiosRequestConfig,
} from "axios";
import type { ApiError, AuthTokens } from "@/types";
import { getApiBaseUrl } from "@/utils/tauriEnv";

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

// ── Token refresh state ──────────────────────────────────────
let isRefreshing = false;
let failedQueue: Array<{
	resolve: (token: string) => void;
	reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
	for (const prom of failedQueue) {
		if (token) {
			prom.resolve(token);
		} else {
			prom.reject(error);
		}
	}
	failedQueue = [];
};

/** URLs that should never trigger a refresh attempt (prevents infinite loops). */
const NO_REFRESH_URLS = ["/auth/token", "/auth/refresh", "/auth/register"];

function shouldSkipRefresh(url: string | undefined): boolean {
	if (!url) return true;
	return NO_REFRESH_URLS.some((path) => url.endsWith(path));
}

async function forceLogout() {
	setAccessToken(null);
	const { useAuthStore } = await import("@/store/authStore");
	useAuthStore.getState().logout();
}

// Response interceptor - handle errors with refresh-then-retry
apiClient.interceptors.response.use(
	(response) => response,
	async (error: AxiosError<ApiError>) => {
		const apiError: ApiError = {
			detail:
				error.response?.data?.detail || error.message || "An error occurred",
			code: error.code,
		};

		if (error.response?.status !== 401) {
			return Promise.reject(apiError);
		}

		const originalRequest = error.config;

		// Don't refresh for auth endpoints (prevents infinite loop)
		if (!originalRequest || shouldSkipRefresh(originalRequest.url)) {
			await forceLogout();
			return Promise.reject(apiError);
		}

		// If already refreshing, queue this request
		if (isRefreshing) {
			return new Promise<string>((resolve, reject) => {
				failedQueue.push({ resolve, reject });
			}).then((newToken) => {
				originalRequest.headers.Authorization = `Bearer ${newToken}`;
				return apiClient(originalRequest);
			});
		}

		isRefreshing = true;

		try {
			const response = await apiClient.post<AuthTokens>("/auth/refresh");
			const newToken = response.data.access_token;

			setAccessToken(newToken);
			const { useAuthStore } = await import("@/store/authStore");
			useAuthStore.getState().updateToken(newToken);

			processQueue(null, newToken);

			// Retry the original request with the new token
			originalRequest.headers.Authorization = `Bearer ${newToken}`;
			return apiClient(originalRequest);
		} catch (refreshError) {
			processQueue(refreshError, null);
			await forceLogout();
			return Promise.reject(apiError);
		} finally {
			isRefreshing = false;
		}
	},
);

export default apiClient;

// Helper for setting tokens from auth response
export const handleAuthResponse = (tokens: AuthTokens) => {
	setAccessToken(tokens.access_token);
};

// Helper to check if user is authenticated
export const isAuthenticated = () => Boolean(accessToken);
