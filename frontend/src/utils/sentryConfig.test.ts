import {describe, expect, it} from "vitest";
import {
    createFrontendSentryInitOptions,
    DEFAULT_FRONTEND_SENTRY_PROFILE_SESSION_SAMPLE_RATE,
    DEFAULT_FRONTEND_SENTRY_TRACES_SAMPLE_RATE,
    getFrontendSentryProfileSessionSampleRate,
    getFrontendSentryTracePropagationTargets,
    getFrontendSentryTracingSampleRate,
    isFrontendSentryProfilingEnabled,
    isFrontendSentryTracingEnabled,
} from "./sentryConfig";

describe("sentryConfig", () => {
    it("falls back to default traces sample rate when env value is invalid", () => {
        expect(
            getFrontendSentryTracingSampleRate({
                VITE_SENTRY_TRACES_SAMPLE_RATE: "invalid",
            }),
        ).toBe(DEFAULT_FRONTEND_SENTRY_TRACES_SAMPLE_RATE);
        expect(
            getFrontendSentryTracingSampleRate({
                VITE_SENTRY_TRACES_SAMPLE_RATE: "1.5",
            }),
        ).toBe(DEFAULT_FRONTEND_SENTRY_TRACES_SAMPLE_RATE);
    });

    it("treats tracing as enabled only when DSN is set and sample rate is positive", () => {
        expect(
            isFrontendSentryTracingEnabled({
                VITE_SENTRY_DSN: "https://example@sentry.io/1",
                VITE_SENTRY_TRACES_SAMPLE_RATE: "0.2",
            }),
        ).toBe(true);
        expect(
            isFrontendSentryTracingEnabled({
                VITE_SENTRY_DSN: "https://example@sentry.io/1",
                VITE_SENTRY_TRACES_SAMPLE_RATE: "0",
            }),
        ).toBe(false);
        expect(
            isFrontendSentryTracingEnabled({
                VITE_SENTRY_TRACES_SAMPLE_RATE: "0.2",
            }),
        ).toBe(false);
    });

    it("falls back to default profile session sample rate when env value is invalid", () => {
        expect(
            getFrontendSentryProfileSessionSampleRate({
                VITE_SENTRY_PROFILE_SESSION_SAMPLE_RATE: "invalid",
            }),
        ).toBe(DEFAULT_FRONTEND_SENTRY_PROFILE_SESSION_SAMPLE_RATE);
        expect(
            getFrontendSentryProfileSessionSampleRate({
                VITE_SENTRY_PROFILE_SESSION_SAMPLE_RATE: "-1",
            }),
        ).toBe(DEFAULT_FRONTEND_SENTRY_PROFILE_SESSION_SAMPLE_RATE);
    });

    it("treats profiling as enabled only when DSN is set and session sample rate is positive", () => {
        expect(
            isFrontendSentryProfilingEnabled({
                VITE_SENTRY_DSN: "https://example@sentry.io/1",
                VITE_SENTRY_PROFILE_SESSION_SAMPLE_RATE: "0.5",
            }),
        ).toBe(true);
        expect(
            isFrontendSentryProfilingEnabled({
                VITE_SENTRY_DSN: "https://example@sentry.io/1",
                VITE_SENTRY_PROFILE_SESSION_SAMPLE_RATE: "0",
            }),
        ).toBe(false);
        expect(
            isFrontendSentryProfilingEnabled({
                VITE_SENTRY_PROFILE_SESSION_SAMPLE_RATE: "0.5",
            }),
        ).toBe(false);
    });

    it("includes default and custom trace propagation targets", () => {
        const targets = getFrontendSentryTracePropagationTargets({
            VITE_SENTRY_TRACE_PROPAGATION_TARGETS:
                "https://api.example.com/v1,/internal-api",
        });

        const regexTargets = targets.filter(
            (target): target is RegExp => target instanceof RegExp,
        );
        const stringTargets = targets.filter(
            (target): target is string => typeof target === "string",
        );

        expect(regexTargets.some((target) => target.test("/api/v1/orders"))).toBe(
            true,
        );
        expect(
            regexTargets.some((target) =>
                target.test("http://localhost:7000/api/v1/orders"),
            ),
        ).toBe(true);
        expect(stringTargets).toEqual([
            "https://api.example.com/v1",
            "/internal-api",
        ]);
    });

    it("builds sentry init options with environment, release, tracing, and profiling", () => {
        const browserTracingIntegration = {name: "browser-tracing"};
        const browserProfilingIntegration = {name: "browser-profiling"};
        const options = createFrontendSentryInitOptions(
            {
                DEV: false,
                VITE_SENTRY_DSN: "https://example@sentry.io/1",
                VITE_SENTRY_ENVIRONMENT: "staging",
                VITE_SENTRY_RELEASE: "frontend@1.2.3",
                VITE_SENTRY_TRACES_SAMPLE_RATE: "0.25",
                VITE_SENTRY_PROFILE_SESSION_SAMPLE_RATE: "0.4",
                VITE_SENTRY_PROFILE_LIFECYCLE: "trace",
            },
            {
                browserTracingIntegrationFactory: () => browserTracingIntegration,
                browserProfilingIntegrationFactory: () => browserProfilingIntegration,
            },
        );

        expect(options.enabled).toBe(true);
        expect(options.environment).toBe("staging");
        expect(options.release).toBe("frontend@1.2.3");
        expect(options.tracesSampleRate).toBe(0.25);
        expect(options.profileSessionSampleRate).toBe(0.4);
        expect(options.profileLifecycle).toBe("trace");
        expect(options.integrations).toEqual([
            browserTracingIntegration,
            browserProfilingIntegration,
        ]);
    });
});
