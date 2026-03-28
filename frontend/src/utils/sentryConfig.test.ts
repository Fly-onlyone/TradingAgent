import { describe, expect, it } from "vitest";
import {
	createFrontendSentryInitOptions,
	DEFAULT_FRONTEND_SENTRY_TRACES_SAMPLE_RATE,
	getFrontendSentryTracePropagationTargets,
	getFrontendSentryTracingSampleRate,
	isFrontendSentryLogsEnabled,
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

	it("includes default and custom trace propagation targets", () => {
		const targets = getFrontendSentryTracePropagationTargets(
			{
				VITE_SENTRY_TRACE_PROPAGATION_TARGETS:
					"https://api.example.com/v1,/internal-api",
			},
			"http://localhost:7000/api/v1",
		);

		const regexTargets = targets.filter(
			(target): target is RegExp => target instanceof RegExp,
		);
		const stringTargets = targets.filter(
			(target): target is string => typeof target === "string",
		);

		expect(regexTargets.some((target) => target.test("/api/v1/orders"))).toBe(
			true,
		);
		expect(stringTargets).toEqual([
			"http://localhost:7000/api/v1",
			"https://api.example.com/v1",
			"/internal-api",
		]);
	});

	it("enables logs by default and respects explicit opt-out", () => {
		expect(isFrontendSentryLogsEnabled({})).toBe(true);
		expect(
			isFrontendSentryLogsEnabled({ VITE_SENTRY_ENABLE_LOGS: "true" }),
		).toBe(true);
		expect(
			isFrontendSentryLogsEnabled({ VITE_SENTRY_ENABLE_LOGS: "false" }),
		).toBe(false);
		expect(isFrontendSentryLogsEnabled({ VITE_SENTRY_ENABLE_LOGS: "0" })).toBe(
			false,
		);
	});

	it("builds sentry init options with environment, release, and tracing", () => {
		const browserTracingIntegration = { name: "browser-tracing" };
		const options = createFrontendSentryInitOptions(
			{
				DEV: false,
				VITE_SENTRY_DSN: "https://example@sentry.io/1",
				VITE_SENTRY_ENVIRONMENT: "staging",
				VITE_SENTRY_RELEASE: "frontend@1.2.3",
				VITE_SENTRY_TRACES_SAMPLE_RATE: "0.25",
			},
			"http://localhost:7000/api/v1",
			{
				browserTracingIntegrationFactory: () => browserTracingIntegration,
			},
		);

		expect(options.enabled).toBe(true);
		expect(options.environment).toBe("staging");
		expect(options.release).toBe("frontend@1.2.3");
		expect(options.tracesSampleRate).toBe(0.25);
		expect(options.tracePropagationTargets).toEqual([
			/^\/api\/v1/,
			"http://localhost:7000/api/v1",
		]);
		expect(options.enableLogs).toBe(true);
		expect(options.integrations).toEqual([browserTracingIntegration]);
	});
});
