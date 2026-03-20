import {redirect} from "@tanstack/react-router";
import {setAccessToken} from "@/api/client";
import {authApi} from "@/api/endpoints/auth";
import {useAuthStore} from "@/store/authStore";
import axios from "axios";

let authSyncPromise: Promise<void> | null = null;

/** Wait for Zustand persist to finish rehydrating from localStorage. */
async function waitForHydration(): Promise<void> {
    if (useAuthStore.persist.hasHydrated()) return;
    return new Promise((resolve) => {
        useAuthStore.persist.onFinishHydration(resolve);
    });
}

async function syncAuthState(): Promise<void> {
    await waitForHydration();

    const auth = useAuthStore.getState();

    if (!auth.token) {
        if (auth.isAuthenticated || auth.user) {
            auth.logout();
        } else if (auth.isLoading) {
            auth.setLoading(false);
        }
        return;
    }

    setAccessToken(auth.token);

    if (auth.isAuthenticated && auth.user) {
        if (auth.isLoading) {
            auth.setLoading(false);
        }
        return;
    }

    if (authSyncPromise) {
        await authSyncPromise;
        return;
    }

    authSyncPromise = (async () => {
        try {
            const user = await authApi.getMe();
            useAuthStore.getState().setUser(user);
        } catch (error) {
            // Only logout on 401 (invalid credentials).
            // Network errors or server errors are transient — keep the token.
            if (axios.isAxiosError(error) && error.response?.status === 401) {
                useAuthStore.getState().logout();
            }
        } finally {
            useAuthStore.getState().setLoading(false);
            authSyncPromise = null;
        }
    })();

    await authSyncPromise;
}

export async function requireAuth() {
    await syncAuthState();
    const auth = useAuthStore.getState();
    if (!auth.isAuthenticated) {
        throw redirect({to: "/auth/login"});
    }
}

export async function requireGuest() {
    await syncAuthState();
    const auth = useAuthStore.getState();
    if (auth.isAuthenticated) {
        throw redirect({to: "/"});
    }
}

export async function requireAdmin() {
    await syncAuthState();
    const auth = useAuthStore.getState();
    if (!auth.isAuthenticated) {
        throw redirect({to: "/auth/login"});
    }
    if (!auth.user?.isSuperuser && !import.meta.env.DEV) {
        throw redirect({to: "/"});
    }
}
