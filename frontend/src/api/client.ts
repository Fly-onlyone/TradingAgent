/**
 * Axios API Client with JWT interceptors
 */

import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import type { ApiError, AuthTokens } from '@/types';

// Token storage (in memory for security)
let accessToken: string | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};

export const getAccessToken = () => accessToken;

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
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
  (error) => Promise.reject(error)
);

// Response interceptor - handle errors
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    // Handle 401 Unauthorized
    if (error.response?.status === 401) {
      // Clear token and redirect to login
      setAccessToken(null);
      window.location.href = '/auth/login';
      return Promise.reject(error);
    }

    // Handle other errors
    const apiError: ApiError = {
      detail: error.response?.data?.detail || error.message || 'An error occurred',
      code: error.code,
    };

    return Promise.reject(apiError);
  }
);

export default apiClient;

// Helper for setting tokens from auth response
export const handleAuthResponse = (tokens: AuthTokens) => {
  setAccessToken(tokens.access_token);
};

// Helper to check if user is authenticated
export const isAuthenticated = () => Boolean(accessToken);
