/**
 * Authentication Store
 */

import * as Sentry from "@sentry/react";
import {create} from 'zustand';
import {persist} from 'zustand/middleware';
import type {User} from '@/types';
import {setAccessToken} from '@/api/client';

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

            setLoading: (isLoading) => set({isLoading}),

            login: (user, token) => {
                setAccessToken(token);
                Sentry.setUser({id: String(user.id), email: user.email});
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
                Sentry.setUser(null);
                set({
                    user: null,
                    token: null,
                    isAuthenticated: false,
                    isLoading: false,
                });
            },
        }),
        {
            name: 'auth-storage',
            partialize: (state) => ({user: state.user, token: state.token, isAuthenticated: state.isAuthenticated}),
            onRehydrateStorage: () => (state) => {
                if (state?.token) {
                    setAccessToken(state.token);
                }
                if (state?.user) {
                    Sentry.setUser({id: String(state.user.id), email: state.user.email});
                }
            },
        }
    )
);

export default useAuthStore;
