/**
 * Autostart bridge — wraps Tauri's autostart plugin.
 * No-op in browser context so it's safe to call unconditionally.
 */

import { isTauri } from "./tauriEnv";

export async function enableAutostart(): Promise<void> {
	if (!isTauri()) return;

	try {
		const { enable } = await import("@tauri-apps/plugin-autostart");
		await enable();
	} catch (e) {
		console.debug("Autostart enable failed:", e);
	}
}

export async function disableAutostart(): Promise<void> {
	if (!isTauri()) return;

	try {
		const { disable } = await import("@tauri-apps/plugin-autostart");
		await disable();
	} catch (e) {
		console.debug("Autostart disable failed:", e);
	}
}

export async function isAutostartEnabled(): Promise<boolean> {
	if (!isTauri()) return false;

	try {
		const { isEnabled } = await import("@tauri-apps/plugin-autostart");
		return await isEnabled();
	} catch (e) {
		console.debug("Autostart isEnabled check failed:", e);
		return false;
	}
}
