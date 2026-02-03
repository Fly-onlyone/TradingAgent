/**
 * Authentication API Endpoints
 */

import apiClient, { handleAuthResponse } from '../client';
import type { AuthTokens, User, UserCreate, UserLogin, UserUpdate } from '@/types';

export const authApi = {
  /**
   * Login with email and password
   */
  async login(credentials: UserLogin): Promise<AuthTokens> {
    const formData = new URLSearchParams();
    formData.append('username', credentials.email);
    formData.append('password', credentials.password);

    const response = await apiClient.post<AuthTokens>('/auth/login', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    handleAuthResponse(response.data);
    return response.data;
  },

  /**
   * Register new user
   */
  async register(data: UserCreate): Promise<User> {
    const response = await apiClient.post<User>('/auth/register', data);
    return response.data;
  },

  /**
   * Get current user profile
   */
  async getMe(): Promise<User> {
    const response = await apiClient.get<User>('/auth/me');
    return response.data;
  },

  /**
   * Update current user
   */
  async updateMe(data: UserUpdate): Promise<User> {
    const response = await apiClient.patch<User>('/auth/me', data);
    return response.data;
  },

  /**
   * Logout (clear local token)
   */
  logout(): void {
    handleAuthResponse({ access_token: '', token_type: 'bearer' });
  },
};

export default authApi;
