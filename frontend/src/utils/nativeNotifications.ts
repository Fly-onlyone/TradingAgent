/**
 * Native notification using the standard Web Notification API.
 * Works in Tauri's WebView2 (Chromium) — no Rust plugin needed.
 */

let notificationsEnabled = true;

/** Fetch the native notification setting from the API and cache it locally. */
export async function refreshNativeNotificationSetting(): Promise<void> {
	try {
		const { nativeNotificationApi } = await import("@/api/endpoints/settings");
		const config = await nativeNotificationApi.getNativeNotificationConfig();
		notificationsEnabled = config.enabled;
	} catch {
		notificationsEnabled = true;
	}
}

export async function sendNativeNotification(
	title: string,
	body: string,
): Promise<void> {
	if (!notificationsEnabled) return;
	if (typeof Notification === "undefined") return;

	try {
		if (Notification.permission === "default") {
			await Notification.requestPermission();
		}
		if (Notification.permission !== "granted") return;

		new Notification(title, {
			body,
			icon: "/coin.png",
		});
	} catch (e) {
		console.debug("Notification failed:", e);
	}
}
