import { redirect } from "@tanstack/react-router";
import { setAccessToken } from "@/api/client";
import { authApi } from "@/api/endpoints/auth";
import { useAuthStore } from "@/store/authStore";

let authSyncPromise: Promise<void> | null = null;

async function syncAuthState(): Promise<void> {
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
		} catch {
			useAuthStore.getState().logout();
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
		throw redirect({ to: "/auth/login" });
	}
}

export async function requireGuest() {
	await syncAuthState();
	const auth = useAuthStore.getState();
	if (auth.isAuthenticated) {
		throw redirect({ to: "/" });
	}
}

export async function requireAdmin() {
	await syncAuthState();
	const auth = useAuthStore.getState();
	if (!auth.isAuthenticated) {
		throw redirect({ to: "/auth/login" });
	}
	if (!auth.user?.isSuperuser && !import.meta.env.DEV) {
		throw redirect({ to: "/" });
	}
}
