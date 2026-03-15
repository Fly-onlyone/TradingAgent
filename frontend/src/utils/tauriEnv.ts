/**
 * Tauri environment detection and URL helpers.
 * All functions are safe to call in both browser and Tauri contexts.
 */

export function isTauri(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Returns the base URL for API calls. */
export function getApiBaseUrl(): string {
    return isTauri() ? "http://localhost:7000/api/v1" : "/api/v1";
}

/** Returns a fully-qualified WebSocket URL. In browser mode derives from window.location. */
export function getWsUrl(path: string): string {
    if (isTauri()) {
        return `ws://localhost:7000${path}`;
    }
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}${path}`;
}
