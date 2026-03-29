/**
 * Tauri environment detection and URL helpers.
 * All functions are safe to call in both browser and Tauri contexts.
 */

/** Backend port for Tauri builds — overridable via VITE_BACKEND_PORT at build time. */
const TAURI_BACKEND_PORT = import.meta.env.VITE_BACKEND_PORT || "7000";

export function isTauri(): boolean {
	return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Returns the base URL for API calls. */
export function getApiBaseUrl(): string {
	return isTauri()
		? `http://localhost:${TAURI_BACKEND_PORT}/api/v1`
		: "/api/v1";
}

/** Returns a fully-qualified WebSocket URL. In browser mode derives from window.location. */
export function getWsUrl(path: string): string {
	if (isTauri()) {
		return `ws://localhost:${TAURI_BACKEND_PORT}${path}`;
	}
	const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
	return `${proto}//${window.location.host}${path}`;
}
