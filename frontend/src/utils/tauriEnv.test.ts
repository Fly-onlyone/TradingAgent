import { afterEach, describe, expect, it, vi } from "vitest";

type MockWindow = {
	location: URL;
	history: {
		replaceState: (_state: unknown, _title: string, url: string) => void;
	};
	__TAURI_INTERNALS__?: unknown;
};

function installMockWindow(url: string): MockWindow {
	const mockWindow: MockWindow = {
		location: new URL(url),
		history: {
			replaceState: (_state, _title, nextUrl) => {
				mockWindow.location = new URL(nextUrl, mockWindow.location.toString());
			},
		},
	};

	vi.stubGlobal("window", mockWindow);
	return mockWindow;
}

describe("tauriEnv", () => {
	afterEach(() => {
		vi.resetModules();
		vi.unstubAllGlobals();
	});

	it("uses localhost API and websocket URLs in Tauri", async () => {
		const mockWindow = installMockWindow("http://localhost/");
		mockWindow.__TAURI_INTERNALS__ = {};

		const { getApiBaseUrl, getBackendBaseUrl, getWsUrl, isTauri } =
			await import("./tauriEnv");

		expect(isTauri()).toBe(true);
		expect(getBackendBaseUrl()).toBe("http://localhost:7000");
		expect(getApiBaseUrl()).toBe("http://localhost:7000/api/v1");
		expect(getWsUrl("/ws/agent/chat")).toBe(
			"ws://localhost:7000/ws/agent/chat",
		);
	});

	it("uses same-origin relative API URLs in the browser", async () => {
		const mockWindow = installMockWindow("https://app.example.com/trading");

		const { getApiBaseUrl, getWsUrl, isTauri } = await import("./tauriEnv");

		expect(isTauri()).toBe(false);
		expect(getApiBaseUrl()).toBe("/api/v1");
		expect(getWsUrl("/ws/agent/chat")).toBe(
			`${
				mockWindow.location.protocol === "https:" ? "wss:" : "ws:"
			}//${mockWindow.location.host}/ws/agent/chat`,
		);
	});
});
