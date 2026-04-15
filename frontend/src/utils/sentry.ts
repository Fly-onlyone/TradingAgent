import type { CaptureContext } from "@sentry/core";
import { createFrontendSentryInitOptions } from "./sentryConfig";
import { getApiBaseUrl } from "./tauriEnv";

type SentryModule = typeof import("@sentry/react");

type ReactErrorInfoLike = {
	componentStack?: string | null;
};

type ManualSpan = {
	setAttribute: (key: string, value: string | number | boolean) => void;
};

type SpanOptions = {
	name: string;
	op: string;
	[key: string]: unknown;
};

let sentryModule: SentryModule | null = null;
let sentryReadyPromise: Promise<SentryModule | null> | null = null;
let observabilityBootstrapped = false;

function scheduleIdle(task: () => void): void {
	if (typeof window === "undefined") {
		return;
	}

	if ("requestIdleCallback" in window) {
		window.requestIdleCallback(() => task(), { timeout: 1500 });
		return;
	}

	globalThis.setTimeout(task, 0);
}

async function ensureSentry(): Promise<SentryModule | null> {
	if (typeof window === "undefined") {
		return null;
	}

	if (sentryModule) {
		return sentryModule;
	}

	if (sentryReadyPromise) {
		return sentryReadyPromise;
	}

	sentryReadyPromise = import("@sentry/react")
		.then((loadedModule) => {
			loadedModule.init(
				createFrontendSentryInitOptions(import.meta.env, getApiBaseUrl(), {
					browserTracingIntegrationFactory: () =>
						loadedModule.browserTracingIntegration({
							enableInp: true,
						}),
					consoleLoggingIntegrationFactory: () =>
						loadedModule.consoleLoggingIntegration(),
				}),
			);
			sentryModule = loadedModule;
			return loadedModule;
		})
		.catch((error) => {
			sentryReadyPromise = null;
			if (import.meta.env.DEV) {
				console.warn("[startup] Failed to initialize Sentry", error);
			}
			return null;
		});

	return sentryReadyPromise;
}

export function bootstrapObservability(): void {
	if (observabilityBootstrapped || typeof window === "undefined") {
		return;
	}

	observabilityBootstrapped = true;

	// Sentry MUST init immediately to catch early errors
	void ensureSentry();

	// Defer non-critical observability
	scheduleIdle(() => {
		void import("./frontendLogger")
			.then(({ initializeFrontendLogging }) => {
				initializeFrontendLogging();
			})
			.catch((error) => {
				if (import.meta.env.DEV) {
					console.warn(
						"[startup] Failed to initialize frontend logging",
						error,
					);
				}
			});

		void import("./performance/pageLoadMetrics")
			.then(({ initializePageLoadMetrics }) => {
				initializePageLoadMetrics();
			})
			.catch((error) => {
				if (import.meta.env.DEV) {
					console.warn(
						"[startup] Failed to initialize page load metrics",
						error,
					);
				}
			});
	});
}

export function captureSentryException(
	error: unknown,
	context?: CaptureContext,
): void {
	if (sentryModule) {
		sentryModule.captureException(error, context);
		return;
	}

	void ensureSentry().then((loadedModule) => {
		loadedModule?.captureException(error, context);
	});
}

export function captureSentryMessage(
	message: string,
	context?: Parameters<SentryModule["captureMessage"]>[1],
): void {
	if (sentryModule) {
		sentryModule.captureMessage(message, context);
		return;
	}

	void ensureSentry().then((loadedModule) => {
		loadedModule?.captureMessage(message, context);
	});
}

export function setSentryUser(
	user: Parameters<SentryModule["setUser"]>[0],
): void {
	if (sentryModule) {
		sentryModule.setUser(user);
		return;
	}

	void ensureSentry().then((loadedModule) => {
		loadedModule?.setUser(user);
	});
}

export function startSentrySpan<T>(options: SpanOptions, callback: () => T): T {
	if (sentryModule) {
		return sentryModule.startSpan(options, callback);
	}

	void ensureSentry();
	return callback();
}

export function startSentrySpanManual(
	options: SpanOptions,
	callback: (span: ManualSpan, finish: () => void) => void,
): void {
	if (sentryModule) {
		sentryModule.startSpanManual(options, callback);
		return;
	}

	void ensureSentry();
	callback(
		{
			setAttribute: () => {},
		},
		() => {},
	);
}

export function runWithoutSentryTracing<T>(callback: () => T): T {
	if (sentryModule) {
		return sentryModule.suppressTracing(callback);
	}

	return callback();
}

export function reportReactRenderError(
	error: unknown,
	info?: ReactErrorInfoLike,
): void {
	captureSentryException(error, {
		contexts: info?.componentStack
			? {
					react: {
						componentStack: info.componentStack,
					},
				}
			: undefined,
	});
}
