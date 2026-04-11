/**
 * Autostart bridge — wraps Tauri's autostart plugin.
 * No-op in browser context so it's safe to call unconditionally.
 */

import { isTauri } from "./tauriEnv";

export interface AutostartSyncResult {
	enabled: boolean;
	previousEnabled: boolean;
	changed: boolean;
}

async function getAutostartModule() {
	return import("@tauri-apps/plugin-autostart");
}

export async function enableAutostart(): Promise<void> {
	if (!isTauri()) return;

	try {
		const { enable, isEnabled } = await getAutostartModule();
		await enable();
		if (!(await isEnabled())) {
			throw new Error("Windows did not keep the startup registration enabled.");
		}
	} catch (e) {
		console.debug("Autostart enable failed:", e);
		throw e;
	}

	// Backup: create Startup folder shortcut (more persistent than registry)
	try {
		const { invoke } = await import("@tauri-apps/api/core");
		await invoke("ensure_startup_shortcut");
	} catch (e) {
		console.debug("Startup shortcut creation failed (non-critical):", e);
	}
}

export async function disableAutostart(): Promise<void> {
	if (!isTauri()) return;

	try {
		const { disable, isEnabled } = await getAutostartModule();
		await disable();
		if (await isEnabled()) {
			throw new Error("Windows did not remove the startup registration.");
		}
	} catch (e) {
		console.debug("Autostart disable failed:", e);
		throw e;
	}

	// Remove backup shortcut
	try {
		const { invoke } = await import("@tauri-apps/api/core");
		await invoke("remove_startup_shortcut");
	} catch (e) {
		console.debug("Startup shortcut removal failed (non-critical):", e);
	}
}

export async function isAutostartEnabled(): Promise<boolean> {
	if (!isTauri()) return false;

	try {
		const { isEnabled } = await getAutostartModule();
		return await isEnabled();
	} catch (e) {
		console.debug("Autostart isEnabled check failed:", e);
		return false;
	}
}

/**
 * Reconcile the saved preference with the real OS startup registration.
 * Use this on app launch so updates can restore the Windows startup entry.
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
