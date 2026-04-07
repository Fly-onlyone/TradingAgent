/**
 * Window startup visibility bridge — wraps Tauri commands for
 * the "open window on startup" setting.
 * No-op in browser context so it's safe to call unconditionally.
 */

import { isTauri } from "./tauriEnv";

export interface WindowStartupConfig {
	enabled: boolean;
}

export async function getWindowStartupConfig(): Promise<WindowStartupConfig> {
	if (!isTauri()) return { enabled: true };

	try {
		const { invoke } = await import("@tauri-apps/api/core");
		const enabled = await invoke<boolean>("get_start_with_window_open");
		return { enabled };
	} catch (e) {
		console.debug("getWindowStartupConfig failed:", e);
		return { enabled: true };
	}
}

export async function setWindowStartupConfig(
	enabled: boolean,
): Promise<WindowStartupConfig> {
	if (!isTauri()) return { enabled };

	try {
		const { invoke } = await import("@tauri-apps/api/core");
		await invoke("set_start_with_window_open", { enabled });
		return { enabled };
	} catch (e) {
		console.debug("setWindowStartupConfig failed:", e);
		throw e;
	}
}
