/**
 * Frontend log forwarding to backend /api/v1/logs/frontend.
 */

import {getAccessToken} from "@/api/client";

type FrontendLogLevel = "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";

interface FrontendLogPayload {
    level: FrontendLogLevel;
    message: string;
    logger_name?: string;
    module?: string;
    function?: string;
    line?: number;
    request_id?: string;
    page_url?: string;
    user_agent?: string;
    traceback?: string;
    extra?: Record<string, unknown>;
}

interface LogOptions {
    loggerName?: string;
    module?: string;
    functionName?: string;
    line?: number;
    traceback?: string;
    extra?: Record<string, unknown>;
}

const LOG_ENDPOINT = "/api/v1/logs/frontend";
const MAX_MESSAGE_LENGTH = 4000;
const MAX_TRACEBACK_LENGTH = 16000;
const DEDUPE_WINDOW_MS = 1000;

let isInitialized = false;
const recentLogCache = new Map<string, number>();

function truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
        return value;
    }
    return value.slice(0, maxLength);
}

function normalizeError(reason: unknown): { message: string; traceback?: string } {
    if (reason instanceof Error) {
        return {
            message: reason.message || "Unknown error",
            traceback: reason.stack,
        };
    }

    if (typeof reason === "string") {
        return {message: reason};
    }

    try {
        return {message: JSON.stringify(reason)};
    } catch {
        return {message: String(reason)};
    }
}

function stringifyConsoleArg(value: unknown): string {
    if (value instanceof Error) {
        return value.stack || value.message || "Error";
    }
    if (typeof value === "string") {
        return value;
    }
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function shouldSend(level: FrontendLogLevel, loggerName: string, message: string): boolean {
    const key = `${level}:${loggerName}:${message}`;
    const now = Date.now();
    const last = recentLogCache.get(key);
    if (last && now - last < DEDUPE_WINDOW_MS) {
        return false;
    }
    recentLogCache.set(key, now);

    if (recentLogCache.size > 200) {
        const oldest = [...recentLogCache.entries()].sort((a, b) => a[1] - b[1])[0]?.[0];
        if (oldest) {
            recentLogCache.delete(oldest);
        }
    }

    return true;
}

function postLog(payload: FrontendLogPayload): void {
    if (!shouldSend(payload.level, payload.logger_name || "frontend.client", payload.message)) {
        return;
    }

    const token = getAccessToken();
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
    };
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    void fetch(LOG_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        keepalive: true,
    }).catch(() => {
        // Intentionally ignore to avoid recursive logging loops.
    });
}

function reportFrontendLog(level: FrontendLogLevel, message: string, options?: LogOptions): void {
    if (typeof window === "undefined") {
        return;
    }

    const payload: FrontendLogPayload = {
        level,
        message: truncate(message || "(empty log message)", MAX_MESSAGE_LENGTH),
        logger_name: options?.loggerName || "frontend.client",
        module: options?.module,
        function: options?.functionName,
        line: options?.line,
        page_url: window.location.href,
        user_agent: navigator.userAgent,
        traceback: options?.traceback
            ? truncate(options.traceback, MAX_TRACEBACK_LENGTH)
            : undefined,
        extra: options?.extra,
    };

    postLog(payload);
}

function installGlobalErrorHandlers(): void {
    window.addEventListener("error", (event) => {
        const details = normalizeError(event.error || event.message);
        reportFrontendLog("ERROR", details.message || "Unhandled window error", {
            loggerName: "frontend.window.error",
            module: event.filename || undefined,
            line: event.lineno || undefined,
            traceback: details.traceback,
            extra: {
                column: event.colno,
            },
        });
    });

    window.addEventListener("unhandledrejection", (event) => {
        const details = normalizeError(event.reason);
        reportFrontendLog("ERROR", `Unhandled promise rejection: ${details.message}`, {
            loggerName: "frontend.unhandledrejection",
            traceback: details.traceback,
        });
    });
}

function installConsoleHooks(): void {
    const originalDebug = console.debug.bind(console);
    const originalInfo = console.info.bind(console);
    const originalLog = console.log.bind(console);
    const originalWarn = console.warn.bind(console);
    const originalError = console.error.bind(console);

    console.debug = (...args: unknown[]) => {
        originalDebug(...args);
        reportFrontendLog(
            "DEBUG",
            truncate(args.map((arg) => stringifyConsoleArg(arg)).join(" "), MAX_MESSAGE_LENGTH),
            {loggerName: "frontend.console.debug"},
        );
    };

    console.info = (...args: unknown[]) => {
        originalInfo(...args);
        reportFrontendLog(
            "INFO",
            truncate(args.map((arg) => stringifyConsoleArg(arg)).join(" "), MAX_MESSAGE_LENGTH),
            {loggerName: "frontend.console.info"},
        );
    };

    console.log = (...args: unknown[]) => {
        originalLog(...args);
        reportFrontendLog(
            "INFO",
            truncate(args.map((arg) => stringifyConsoleArg(arg)).join(" "), MAX_MESSAGE_LENGTH),
            {loggerName: "frontend.console.log"},
        );
    };

    console.warn = (...args: unknown[]) => {
        originalWarn(...args);
        reportFrontendLog(
            "WARNING",
            truncate(args.map((arg) => stringifyConsoleArg(arg)).join(" "), MAX_MESSAGE_LENGTH),
            {loggerName: "frontend.console.warn"},
        );
    };

    console.error = (...args: unknown[]) => {
        originalError(...args);
        reportFrontendLog(
            "ERROR",
            truncate(args.map((arg) => stringifyConsoleArg(arg)).join(" "), MAX_MESSAGE_LENGTH),
            {loggerName: "frontend.console.error"},
        );
    };
}

export function initializeFrontendLogging(): void {
    if (isInitialized || typeof window === "undefined") {
        return;
    }
    isInitialized = true;
    installGlobalErrorHandlers();
    installConsoleHooks();
}
