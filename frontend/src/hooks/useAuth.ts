/**
 * Authentication Hook
 */

import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { authApi } from "@/api/endpoints/auth";
import { useAuthStore } from "@/store/authStore";
import { notify } from "@/store/uiStore";
import type { UserCreate, UserLogin } from "@/types";
import { getErrorMessage } from "@/utils/errors";

export function useAuth() {
	const navigate = useNavigate();
	const { user, isAuthenticated, isLoading, login, logout, setLoading } =
		useAuthStore();

	const handleLogin = useCallback(
		async (
			credentials: UserLogin,
			totpCode?: string,
		): Promise<{ requires2FA?: boolean }> => {
			try {
				setLoading(true);
				const result = await authApi.login(credentials, totpCode);

				if (result.requires_2fa) {
					return { requires2FA: true };
				}

				const userData = await authApi.getMe();
				login(userData, result.access_token);
				notify.success("Welcome back!", `Logged in as ${userData.email}`);
				void navigate({ to: "/" });
				return {};
			} catch (error) {
				notify.error("Login failed", getErrorMessage(error, "Login failed"));
				throw error;
			} finally {
				setLoading(false);
			}
		},
		[login, navigate, setLoading],
	);

	const handleRegister = useCallback(
		async (data: UserCreate) => {
			try {
				setLoading(true);
				await authApi.register(data);
				notify.success(
					"Account created",
					"Please log in with your credentials",
				);
				void navigate({ to: "/auth/login" });
			} catch (error) {
				notify.error(
					"Registration failed",
					getErrorMessage(error, "Registration failed"),
				);
				throw error;
			} finally {
				setLoading(false);
			}
		},
		[navigate, setLoading],
	);

	const handleLogout = useCallback(() => {
		authApi.logout();
		logout();
		notify.info("Logged out", "You have been logged out");
		void navigate({ to: "/auth/login" });
	}, [logout, navigate]);

	return {
		user,
		isAuthenticated,
		isLoading,
		login: handleLogin,
		register: handleRegister,
		logout: handleLogout,
	};
}

// Hook to protect routes
export function useRequireAuth() {
	const navigate = useNavigate();
	const { isAuthenticated, isLoading } = useAuthStore();

	useEffect(() => {
		if (!isLoading && !isAuthenticated) {
			void navigate({ to: "/auth/login" });
		}
	}, [isAuthenticated, isLoading, navigate]);

	return { isAuthenticated, isLoading };
}

export default useAuth;
