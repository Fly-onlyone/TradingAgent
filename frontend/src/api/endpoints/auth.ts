/**
 * Authentication API Endpoints
 */

import type {
	AuthTokens,
	User,
	UserCreate,
	UserLogin,
	UserUpdate,
} from "@/types";
import apiClient, { handleAuthResponse } from "../client";

export interface TwoFactorSetupResponse {
	secret: string;
	qrCode: string;
	uri: string;
}

export interface TwoFactorStatusResponse {
	totpEnabled: boolean;
}

function transformUser(data: Record<string, unknown>): User {
	return {
		id: String(data.id ?? ""),
		email: String(data.email ?? ""),
		username:
			(data.full_name as string | undefined) ??
			(data.username as string | undefined),
		isActive: Boolean(data.is_active),
		isSuperuser: Boolean(data.is_superuser),
		totpEnabled: Boolean(data.totp_enabled),
		createdAt: String(data.created_at ?? ""),
		updatedAt: data.updated_at ? String(data.updated_at) : undefined,
	};
}

export const authApi = {
	/**
	 * Login with email and password
	 */
	async login(
		credentials: UserLogin,
		totpCode?: string,
	): Promise<AuthTokens & { requires_2fa?: boolean }> {
		const normalizedEmail = credentials.email.trim().toLowerCase();
		const formData = new URLSearchParams();
		formData.append("username", normalizedEmail);
		formData.append("password", credentials.password);
		if (totpCode) {
			formData.append("client_secret", totpCode);
		}

		const response = await apiClient.post<
			AuthTokens & { requires_2fa?: boolean }
		>("/auth/token", formData, {
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
		});

		if (response.data.requires_2fa) {
			return response.data;
		}

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
	 * Request a password-reset email
	 */
	async forgotPassword(email: string): Promise<{ message: string }> {
		const response = await apiClient.post<{ message: string }>(
			"/auth/forgot-password",
			{
				email: email.trim().toLowerCase(),
			},
		);
		return response.data;
	},

	/**
	 * Reset password using a token from the reset email
	 */
	async resetPassword(
		token: string,
		password: string,
	): Promise<{ message: string }> {
		const response = await apiClient.post<{ message: string }>(
			"/auth/reset-password",
			{
				token,
				password,
			},
		);
		return response.data;
	},

	/**
	 * Verify email using a token from the verification email
	 */
	async verifyEmail(token: string): Promise<{ message: string }> {
		const response = await apiClient.post<{ message: string }>(
			"/auth/verify-email",
			{
				token,
			},
		);
		return response.data;
	},

	/**
	 * Resend email verification link
	 */
	async resendVerification(email: string): Promise<{ message: string }> {
		const response = await apiClient.post<{ message: string }>(
			"/auth/resend-verification",
			{
				email: email.trim().toLowerCase(),
			},
		);
		return response.data;
	},

	/**
	 * Start 2FA setup — returns secret, QR code image, and provisioning URI
	 */
	async setup2FA(): Promise<TwoFactorSetupResponse> {
		const response =
			await apiClient.post<Record<string, unknown>>("/auth/2fa/setup");
		return {
			secret: String(response.data.secret ?? ""),
			qrCode: String(response.data.qr_code ?? ""),
			uri: String(response.data.uri ?? ""),
		};
	},

	/**
	 * Verify TOTP code to activate 2FA
	 */
	async verify2FA(code: string): Promise<TwoFactorStatusResponse> {
		const response = await apiClient.post<Record<string, unknown>>(
			"/auth/2fa/verify",
			{ code },
		);
		return { totpEnabled: Boolean(response.data.totp_enabled) };
	},

	/**
	 * Disable 2FA (requires current TOTP code)
	 */
	async disable2FA(code: string): Promise<TwoFactorStatusResponse> {
		const response = await apiClient.post<Record<string, unknown>>(
			"/auth/2fa/disable",
			{ code },
		);
		return { totpEnabled: Boolean(response.data.totp_enabled) };
	},

	/**
	 * Logout (clear local token)
	 */
	logout(): void {
		handleAuthResponse({ access_token: "", token_type: "bearer" });
	},
};

export default authApi;
