/**
 * Native notification bridge — wraps Tauri's notification plugin.
 * No-op in browser context so it's safe to call unconditionally.
 */

import { isTauri } from "./tauriEnv";

export async function sendNativeNotification(
	title: string,
	body: string,
): Promise<void> {
	if (!isTauri()) return;

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
