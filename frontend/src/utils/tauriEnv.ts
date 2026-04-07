/**
 * Tauri environment detection and URL helpers.
 * All functions are safe to call in both browser and Tauri contexts.
 */

/** Backend port for Tauri builds — overridable via VITE_BACKEND_PORT at build time. */
const TAURI_BACKEND_PORT =
	import.meta.env.VITE_BACKEND_PORT || (import.meta.env.DEV ? "7001" : "7000");

export function isTauri(): boolean {
	return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Returns the backend origin used by Tauri desktop builds. */
export function getBackendBaseUrl(): string {
	return `http://localhost:${TAURI_BACKEND_PORT}`;
}

/** Returns the base URL for API calls. */
export function getApiBaseUrl(): string {
	return isTauri() ? `${getBackendBaseUrl()}/api/v1` : "/api/v1";
}

/** Returns a fully-qualified WebSocket URL. In browser mode derives from window.location. */
export function getWsUrl(path: string): string {
	if (isTauri()) {
		return `ws://localhost:${TAURI_BACKEND_PORT}${path}`;
	}
	const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
	return `${proto}//${window.location.host}${path}`;
}
