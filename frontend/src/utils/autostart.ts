/**
 * Autostart bridge — uses Windows Startup folder shortcut (.lnk).
 * No-op in browser context so it's safe to call unconditionally.
 */

import { isTauri } from "./tauriEnv";

export interface AutostartSyncResult {
	enabled: boolean;
	previousEnabled: boolean;
	changed: boolean;
}

export async function enableAutostart(): Promise<void> {
	if (!isTauri()) return;

	const { invoke } = await import("@tauri-apps/api/core");
	await invoke("ensure_startup_shortcut");

	// Clean up old registry entry from previous plugin-based approach
	try {
		const { disable } = await import("@tauri-apps/plugin-autostart");
		await disable();
	} catch {
		/* old plugin may not be available */
	}
}

export async function disableAutostart(): Promise<void> {
	if (!isTauri()) return;

	const { invoke } = await import("@tauri-apps/api/core");
	await invoke("remove_startup_shortcut");

	// Also clean up old registry entry
	try {
		const { disable } = await import("@tauri-apps/plugin-autostart");
		await disable();
	} catch {
		/* old plugin may not be available */
	}
}

export async function isAutostartEnabled(): Promise<boolean> {
	if (!isTauri()) return false;

	try {
		const { invoke } = await import("@tauri-apps/api/core");
		return await invoke<boolean>("is_startup_shortcut_enabled");
	} catch (e) {
		console.debug("Autostart check failed:", e);
		return false;
	}
}

/**
 * Reconcile the saved preference with the real OS startup registration.
 * Use this on app launch so updates can restore the startup shortcut.
 */
export async function syncAutostartPreference(
	enabled: boolean,
): Promise<AutostartSyncResult> {
	if (!isTauri()) {
		return {
			enabled,
			previousEnabled: enabled,
			changed: false,
		};
	}

	const previousEnabled = await isAutostartEnabled();
	if (previousEnabled === enabled) {
		return {
			enabled,
			previousEnabled,
			changed: false,
		};
	}

	if (enabled) {
		await enableAutostart();
	} else {
		await disableAutostart();
	}

	return {
		enabled,
		previousEnabled,
		changed: true,
	};
}
