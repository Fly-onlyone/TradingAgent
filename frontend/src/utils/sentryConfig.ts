import type {Integration} from "@sentry/core";
import type {BrowserOptions} from "@sentry/react";

export const DEFAULT_FRONTEND_SENTRY_TRACES_SAMPLE_RATE = 0.1;
export const DEFAULT_FRONTEND_SENTRY_PROFILE_SESSION_SAMPLE_RATE = 0.1;
export const DEFAULT_FRONTEND_SENTRY_PROFILE_LIFECYCLE = "trace";

export type FrontendSentryProfileLifecycle = "manual" | "trace";

export type FrontendSentryEnv = {
    DEV?: boolean;
    VITE_SENTRY_DSN?: string;
    VITE_SENTRY_ENVIRONMENT?: string;
    VITE_SENTRY_RELEASE?: string;
    VITE_SENTRY_TRACES_SAMPLE_RATE?: string;
    VITE_SENTRY_PROFILE_SESSION_SAMPLE_RATE?: string;
    VITE_SENTRY_PROFILE_LIFECYCLE?: string;
    VITE_SENTRY_TRACE_PROPAGATION_TARGETS?: string;
};

export type BrowserTracingIntegrationFactory = () => Integration;
export type BrowserProfilingIntegrationFactory = () => Integration;

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

export function getFrontendSentryProfileSessionSampleRate(
    env: FrontendSentryEnv,
): number {
    const rawValue = env.VITE_SENTRY_PROFILE_SESSION_SAMPLE_RATE;
    if (!rawValue) {
        return DEFAULT_FRONTEND_SENTRY_PROFILE_SESSION_SAMPLE_RATE;
    }

    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
        return DEFAULT_FRONTEND_SENTRY_PROFILE_SESSION_SAMPLE_RATE;
    }

    return parsed;
}

export function getFrontendSentryProfileLifecycle(
    env: FrontendSentryEnv,
): FrontendSentryProfileLifecycle {
    const rawValue = env.VITE_SENTRY_PROFILE_LIFECYCLE?.trim();
    if (rawValue === "manual" || rawValue === "trace") {
        return rawValue;
    }
    return DEFAULT_FRONTEND_SENTRY_PROFILE_LIFECYCLE;
}

export function isFrontendSentryProfilingEnabled(
    env: FrontendSentryEnv,
): boolean {
    return (
        isFrontendSentryConfigured(env) &&
        getFrontendSentryProfileSessionSampleRate(env) > 0
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
): Array<string | RegExp> {
    const defaultTargets: Array<string | RegExp> = [
        /^\/api\/v1/,
        /^https?:\/\/localhost:7000\/api\/v1/,
        /^https?:\/\/127\.0\.0\.1:7000\/api\/v1/,
    ];

    const extraTargets = (env.VITE_SENTRY_TRACE_PROPAGATION_TARGETS || "")
        .split(",")
        .map((target) => target.trim())
        .filter((target) => target.length > 0);

    return [...defaultTargets, ...extraTargets];
}

export function createFrontendSentryInitOptions(
    env: FrontendSentryEnv,
    integrations: {
        browserTracingIntegrationFactory: BrowserTracingIntegrationFactory;
        browserProfilingIntegrationFactory: BrowserProfilingIntegrationFactory;
    },
): BrowserOptions {
    return {
        dsn: env.VITE_SENTRY_DSN || "",
        enabled: isFrontendSentryConfigured(env),
        environment: getFrontendSentryEnvironment(env),
        release: getFrontendSentryRelease(env),
        tracesSampleRate: getFrontendSentryTracingSampleRate(env),
        profileSessionSampleRate: getFrontendSentryProfileSessionSampleRate(env),
        profileLifecycle: getFrontendSentryProfileLifecycle(env),
        tracePropagationTargets: getFrontendSentryTracePropagationTargets(env),
        integrations: [
            integrations.browserTracingIntegrationFactory(),
            integrations.browserProfilingIntegrationFactory(),
        ],
    };
}
