/**
 * Authentication Store
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { setAccessToken } from "@/api/client";
import type { User } from "@/types";
import { setSentryUser } from "@/utils/sentry";

interface AuthState {
	user: User | null;
	token: string | null;
	isAuthenticated: boolean;
	isLoading: boolean;

	// Actions
	setUser: (user: User | null) => void;
	setLoading: (loading: boolean) => void;
	login: (user: User, token: string) => void;
	updateToken: (token: string) => void;
	logout: () => void;
}

export const useAuthStore = create<AuthState>()(
	persist(
		(set) => ({
			user: null,
			token: null,
			isAuthenticated: false,
			isLoading: true,

			setUser: (user) =>
				set({
					user,
					isAuthenticated: !!user,
				}),

			setLoading: (isLoading) => set({ isLoading }),

			login: (user, token) => {
				setAccessToken(token);
				setSentryUser({ id: String(user.id), email: user.email });
				set({
					user,
					token,
					isAuthenticated: true,
					isLoading: false,
				});
			},

			updateToken: (token) => {
				setAccessToken(token);
				set({ token });
			},

			logout: () => {
				setAccessToken(null);
				setSentryUser(null);
				set({
					user: null,
					token: null,
					isAuthenticated: false,
					isLoading: false,
				});
			},
		}),
		{
			name: "auth-storage",
			partialize: (state) => ({
				user: state.user,
				token: state.token,
				isAuthenticated: state.isAuthenticated,
			}),
			onRehydrateStorage: () => (state) => {
				if (state?.token) {
					setAccessToken(state.token);
				}
				if (state?.user) {
					setSentryUser({
						id: String(state.user.id),
						email: state.user.email,
					});
				}
			},
		},
	),
);

export default useAuthStore;
