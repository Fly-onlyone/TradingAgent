/**
 * Authentication API Endpoints
 */

import type {AuthTokens, User, UserCreate, UserLogin, UserUpdate,} from "@/types";
import apiClient, {handleAuthResponse} from "../client";

function transformUser(data: Record<string, unknown>): User {
    return {
        id: String(data.id ?? ""),
        email: String(data.email ?? ""),
        username:
            (data.full_name as string | undefined) ??
            (data.username as string | undefined),
        isActive: Boolean(data.is_active),
        isSuperuser: Boolean(data.is_superuser),
        createdAt: String(data.created_at ?? ""),
        updatedAt: data.updated_at ? String(data.updated_at) : undefined,
    };
}

export const authApi = {
    /**
     * Login with email and password
     */
    async login(credentials: UserLogin): Promise<AuthTokens> {
        const normalizedEmail = credentials.email.trim().toLowerCase();
        const formData = new URLSearchParams();
        formData.append("username", normalizedEmail);
        formData.append("password", credentials.password);

        const response = await apiClient.post<AuthTokens>("/auth/token", formData, {
            headers: {"Content-Type": "application/x-www-form-urlencoded"},
        });

        handleAuthResponse(response.data);
        return response.data;
    },

    /**
     * Register new user
     */
    async register(data: UserCreate): Promise<User> {
        const normalizedData = {
            ...data,
            email: data.email.trim().toLowerCase(),
        };
        const response = await apiClient.post<Record<string, unknown>>(
            "/auth/register",
            normalizedData,
        );
        return transformUser(response.data);
    },

    /**
     * Get current user profile
     */
    async getMe(): Promise<User> {
        const response = await apiClient.get<Record<string, unknown>>("/auth/me");
        return transformUser(response.data);
    },

    /**
     * Update current user
     */
    async updateMe(data: UserUpdate): Promise<User> {
        const response = await apiClient.patch<Record<string, unknown>>(
            "/auth/me",
            data,
        );
        return transformUser(response.data);
    },

    /**
     * Refresh the current JWT token
     */
    async refreshToken(): Promise<AuthTokens> {
        const response = await apiClient.post<AuthTokens>("/auth/refresh");
        handleAuthResponse(response.data);
        return response.data;
    },

    /**
     * Change password and receive a new token
     */
    async changePassword(
        currentPassword: string,
        newPassword: string,
    ): Promise<AuthTokens> {
        const response = await apiClient.post<AuthTokens>("/auth/change-password", {
            current_password: currentPassword,
            new_password: newPassword,
        });
        handleAuthResponse(response.data);
        return response.data;
    },

    /**
     * Logout (clear local token)
     */
    logout(): void {
        handleAuthResponse({access_token: "", token_type: "bearer"});
    },
};

export default authApi;
