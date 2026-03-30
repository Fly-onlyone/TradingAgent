/**
 * Native notification bridge — wraps Tauri's notification plugin.
 * No-op in browser context so it's safe to call unconditionally.
 */

import { isTauri } from "./tauriEnv";

let notificationsEnabled = true;

/** Fetch the native notification setting from the API and cache it locally. */
export async function refreshNativeNotificationSetting(): Promise<void> {
	try {
		const { nativeNotificationApi } = await import("@/api/endpoints/settings");
		const config = await nativeNotificationApi.getNativeNotificationConfig();
		notificationsEnabled = config.enabled;
	} catch {
		// Default to enabled if we can't reach the API
		notificationsEnabled = true;
	}
}

export async function sendNativeNotification(
	title: string,
	body: string,
): Promise<void> {
	if (!isTauri()) return;
	if (!notificationsEnabled) return;

	try {
		const { isPermissionGranted, requestPermission, sendNotification } =
			await import("@tauri-apps/plugin-notification");

		let granted = await isPermissionGranted();
		if (!granted) {
			const permission = await requestPermission();
			granted = permission === "granted";
		}

		if (granted) {
			sendNotification({ title, body });
		}
	} catch (e) {
		// Silently swallow — native notifications are best-effort
		console.debug("Native notification failed:", e);
	}
}
