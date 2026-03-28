import type { Integration } from "@sentry/core";
import type { BrowserOptions } from "@sentry/react";

export const DEFAULT_FRONTEND_SENTRY_TRACES_SAMPLE_RATE = 0.1;

export type FrontendSentryEnv = {
	DEV?: boolean;
	VITE_SENTRY_DSN?: string;
	VITE_SENTRY_ENVIRONMENT?: string;
	VITE_SENTRY_RELEASE?: string;
	VITE_SENTRY_TRACES_SAMPLE_RATE?: string;
	VITE_SENTRY_TRACE_PROPAGATION_TARGETS?: string;
	VITE_SENTRY_ENABLE_LOGS?: string;
};

export type BrowserTracingIntegrationFactory = () => Integration;
export type ConsoleLoggingIntegrationFactory = () => Integration;

export function isFrontendSentryConfigured(env: FrontendSentryEnv): boolean {
	return Boolean(env.VITE_SENTRY_DSN?.trim());
}

export function getFrontendSentryTracingSampleRate(
	env: FrontendSentryEnv,
): number {
	const rawValue = env.VITE_SENTRY_TRACES_SAMPLE_RATE;
	if (!rawValue) {
		return DEFAULT_FRONTEND_SENTRY_TRACES_SAMPLE_RATE;
	}

	const parsed = Number(rawValue);
	if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
		return DEFAULT_FRONTEND_SENTRY_TRACES_SAMPLE_RATE;
	}

	return parsed;
}

export function isFrontendSentryTracingEnabled(
	env: FrontendSentryEnv,
): boolean {
	return (
		isFrontendSentryConfigured(env) &&
		getFrontendSentryTracingSampleRate(env) > 0
	);
}

export function getFrontendSentryEnvironment(env: FrontendSentryEnv): string {
	const explicitEnvironment = env.VITE_SENTRY_ENVIRONMENT?.trim();
	if (explicitEnvironment) {
		return explicitEnvironment;
	}
	return env.DEV ? "development" : "production";
}

export function getFrontendSentryRelease(
	env: FrontendSentryEnv,
): string | undefined {
	const release = env.VITE_SENTRY_RELEASE?.trim();
	return release || undefined;
}

export function getFrontendSentryTracePropagationTargets(
	env: FrontendSentryEnv,
	apiBaseUrl: string,
): Array<string | RegExp> {
	const defaultTargets = new Set<string | RegExp>([/^\/api\/v1/]);
	const normalizedApiBaseUrl = apiBaseUrl.trim();
	if (normalizedApiBaseUrl.length > 0) {
		defaultTargets.add(normalizedApiBaseUrl);
	}

	const extraTargets = (env.VITE_SENTRY_TRACE_PROPAGATION_TARGETS || "")
		.split(",")
		.map((target) => target.trim())
		.filter((target) => target.length > 0);

	return [...defaultTargets, ...extraTargets];
}

export function isFrontendSentryLogsEnabled(env: FrontendSentryEnv): boolean {
	const raw = env.VITE_SENTRY_ENABLE_LOGS?.trim().toLowerCase();
	if (raw === "false" || raw === "0") return false;
	return true; // enabled by default (matches backend)
}

export function createFrontendSentryInitOptions(
	env: FrontendSentryEnv,
	apiBaseUrl: string,
	integrations: {
		browserTracingIntegrationFactory: BrowserTracingIntegrationFactory;
		consoleLoggingIntegrationFactory?: ConsoleLoggingIntegrationFactory;
	},
): BrowserOptions {
	const enableLogs = isFrontendSentryLogsEnabled(env);
	const integrationList: Integration[] = [
		integrations.browserTracingIntegrationFactory(),
	];
	if (enableLogs && integrations.consoleLoggingIntegrationFactory) {
		integrationList.push(integrations.consoleLoggingIntegrationFactory());
	}
	return {
		dsn: env.VITE_SENTRY_DSN || "",
		enabled: isFrontendSentryConfigured(env),
		environment: getFrontendSentryEnvironment(env),
		release: getFrontendSentryRelease(env),
		tracesSampleRate: getFrontendSentryTracingSampleRate(env),
		tracePropagationTargets: getFrontendSentryTracePropagationTargets(
			env,
			apiBaseUrl,
		),
		enableLogs,
		integrations: integrationList,
	};
}
