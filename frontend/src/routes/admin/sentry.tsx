/**
 * Sentry Integration Status Page (admin only)
 */

import BugReportIcon from "@mui/icons-material/BugReport";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import {
	Alert,
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	Divider,
	List,
	ListItem,
	ListItemText,
	Typography,
} from "@mui/material";
import * as Sentry from "@sentry/react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";
import apiClient from "@/api/client";
import { useAuthStore } from "@/store/authStore";
import {
	getFrontendSentryProfileLifecycle,
	getFrontendSentryProfileSessionSampleRate,
	getFrontendSentryTracePropagationTargets,
	getFrontendSentryTracingSampleRate,
	isFrontendSentryConfigured,
	isFrontendSentryProfilingEnabled,
	isFrontendSentryTracingEnabled,
} from "@/utils/sentryConfig";

export const Route = createFileRoute("/admin/sentry")({
	beforeLoad: ({ context }) => {
		// @ts-expect-error context type
		const user = context?.auth?.user;
		if (user && !user.isSuperuser) {
			throw redirect({ to: "/" });
		}
	},
	component: SentryPage,
});

const FRONTEND_SENTRY_ENV = import.meta.env;
const SENTRY_PROJECT_URL =
	"https://fly-theonlyone.sentry.io/projects/trading-agent/";
const SENTRY_ISSUES_URL =
	"https://fly-theonlyone.sentry.io/organizations/fly-theonlyone/issues/?project=trading-agent";
const BACKEND_TEST_EVENT_URL = "/api/v1/admin/sentry-test";

type TestFeedback = {
	severity: "success" | "error" | "info";
	message: string;
};

type SentryTestResponse = {
	status: string;
	message: string;
	event_id: string | null;
};

function SentryPage() {
	const { user } = useAuthStore();
	const isConfigured = isFrontendSentryConfigured(FRONTEND_SENTRY_ENV);
	const isTracingEnabled = isFrontendSentryTracingEnabled(FRONTEND_SENTRY_ENV);
	const tracesSampleRate =
		getFrontendSentryTracingSampleRate(FRONTEND_SENTRY_ENV);
	const isProfilingEnabled =
		isFrontendSentryProfilingEnabled(FRONTEND_SENTRY_ENV);
	const profileSessionSampleRate =
		getFrontendSentryProfileSessionSampleRate(FRONTEND_SENTRY_ENV);
	const profileLifecycle =
		getFrontendSentryProfileLifecycle(FRONTEND_SENTRY_ENV);
	const tracePropagationTargets =
		getFrontendSentryTracePropagationTargets(FRONTEND_SENTRY_ENV);
	const hasTracePropagationTargets = tracePropagationTargets.length > 0;
	const capturedItems = [
		"Unhandled backend exceptions (FastAPI middleware)",
		"ERROR and CRITICAL log records (via Sentry LoggingIntegration)",
		"Frontend JavaScript errors and unhandled promise rejections",
		isTracingEnabled
			? `Frontend browser transactions (${Math.round(tracesSampleRate * 100)}% sample rate)`
			: "Frontend browser transactions (disabled: set VITE_SENTRY_TRACES_SAMPLE_RATE > 0)",
		isProfilingEnabled
			? `Frontend JS profiling (${profileLifecycle} lifecycle, ${Math.round(profileSessionSampleRate * 100)}% session sample rate)`
			: "Frontend JS profiling (disabled: set VITE_SENTRY_PROFILE_SESSION_SAMPLE_RATE > 0)",
		hasTracePropagationTargets
			? "Distributed tracing headers for API calls (browser + Tauri localhost backend)"
			: "Distributed tracing headers are not configured",
	];
	const [testFeedback, setTestFeedback] = useState<TestFeedback | null>(null);
	const [isSendingBackendEvent, setIsSendingBackendEvent] = useState(false);

	const sendFrontendTestEvent = () => {
		const error = new Error("Manual Sentry frontend test from /admin/sentry");
		const eventId = Sentry.captureException(error);
		setTestFeedback({
			severity: "success",
			message: eventId
				? `Frontend test event sent (event id: ${eventId}).`
				: "Frontend test event sent.",
		});
	};

	const sendBackendTestEvent = async () => {
		setIsSendingBackendEvent(true);
		try {
			const response = await apiClient.post<SentryTestResponse>(
				BACKEND_TEST_EVENT_URL,
			);
			setTestFeedback({
				severity: "success",
				message: response.data.event_id
					? `Backend test event sent (event id: ${response.data.event_id}).`
					: response.data.message,
			});
		} catch (error: unknown) {
			const detail =
				typeof error === "object" &&
				error !== null &&
				"detail" in error &&
				typeof (error as { detail?: unknown }).detail === "string"
					? (error as { detail: string }).detail
					: "Failed to send backend test event.";
			setTestFeedback({ severity: "error", message: detail });
		} finally {
			setIsSendingBackendEvent(false);
		}
	};

	if (!user?.isSuperuser) {
		return (
			<Alert severity="error" sx={{ m: 3 }}>
				Admin access required.
			</Alert>
		);
	}

	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.25 }}
		>
			<Box sx={{ p: 3, maxWidth: 720 }}>
				{/* Header */}
				<Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 3 }}>
					<BugReportIcon sx={{ color: "primary.main", fontSize: 28 }} />
					<Typography variant="h5" fontWeight={700}>
						Sentry Integration
					</Typography>
				</Box>

				{/* Status card */}
				<Card sx={{ mb: 3 }}>
					<CardContent>
						<Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
							{isConfigured ? (
								<CheckCircleOutlineIcon sx={{ color: "success.main" }} />
							) : (
								<ErrorOutlineIcon sx={{ color: "warning.main" }} />
							)}
							<Typography variant="h6" fontWeight={600}>
								Status
							</Typography>
							<Chip
								label={isConfigured ? "Connected" : "Not configured"}
								color={isConfigured ? "success" : "warning"}
								size="small"
								sx={{ ml: 1 }}
							/>
						</Box>

						{isConfigured ? (
							<Box sx={{ display: "grid", gap: 1 }}>
								<Typography variant="body2" color="text.secondary">
									Sentry SDK is active. Error tracking is enabled on frontend
									and backend.
								</Typography>
								<Typography variant="body2" color="text.secondary">
									Frontend performance tracing:{" "}
									{isTracingEnabled ? "enabled" : "disabled"} (sample rate:{" "}
									{tracesSampleRate}).
								</Typography>
								<Typography variant="body2" color="text.secondary">
									Frontend profiling:{" "}
									{isProfilingEnabled ? "enabled" : "disabled"} (lifecycle:{" "}
									{profileLifecycle}, session sample rate:{" "}
									{profileSessionSampleRate}).
								</Typography>
							</Box>
						) : (
							<Alert severity="warning" sx={{ mt: 1 }}>
								<Typography variant="body2">
									<strong>VITE_SENTRY_DSN</strong> is not set. Add it to your{" "}
									<code>.env</code> file to enable error tracking.
								</Typography>
							</Alert>
						)}
					</CardContent>
				</Card>

				{/* What's captured */}
				<Card sx={{ mb: 3 }}>
					<CardContent>
						<Typography variant="h6" fontWeight={600} sx={{ mb: 1.5 }}>
							What's being captured
						</Typography>
						<List dense disablePadding>
							{capturedItems.map((item) => (
								<ListItem key={item} sx={{ py: 0.25, px: 0 }}>
									<CheckCircleOutlineIcon
										sx={{
											fontSize: 16,
											color: "success.main",
											mr: 1.5,
											flexShrink: 0,
										}}
									/>
									<ListItemText
										primary={item}
										slotProps={{ primary: { variant: "body2" } }}
									/>
								</ListItem>
							))}
						</List>
					</CardContent>
				</Card>

				{/* Test events */}
				<Card sx={{ mb: 3 }}>
					<CardContent>
						<Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
							Send test events
						</Typography>
						<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
							If the Issues page looks empty, set the environment filter to
							<strong>All</strong> or <strong>development</strong>.
						</Typography>
						{testFeedback ? (
							<Alert
								severity={testFeedback.severity}
								sx={{ mb: 2 }}
								onClose={() => {
									setTestFeedback(null);
								}}
							>
								{testFeedback.message}
							</Alert>
						) : null}
						<Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
							<Button variant="contained" onClick={sendFrontendTestEvent}>
								Send Frontend Test Event
							</Button>
							<Button
								variant="outlined"
								disabled={isSendingBackendEvent}
								onClick={() => {
									void sendBackendTestEvent();
								}}
							>
								{isSendingBackendEvent
									? "Sending Backend Event..."
									: "Send Backend Test Event"}
							</Button>
						</Box>
					</CardContent>
				</Card>

				{/* Links */}
				<Card>
					<CardContent>
						<Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
							Sentry Dashboard
						</Typography>
						<Divider sx={{ mb: 2 }} />
						<Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
							<Button
								variant="contained"
								endIcon={<OpenInNewIcon />}
								href={SENTRY_ISSUES_URL}
								target="_blank"
								rel="noopener noreferrer"
							>
								View Issues
							</Button>
							<Button
								variant="outlined"
								endIcon={<OpenInNewIcon />}
								href={SENTRY_PROJECT_URL}
								target="_blank"
								rel="noopener noreferrer"
							>
								Project Settings
							</Button>
						</Box>
						<Typography
							variant="caption"
							color="text.secondary"
							sx={{ display: "block", mt: 2 }}
						>
							Organization: fly-theonlyone · Project: trading-agent
						</Typography>
					</CardContent>
				</Card>
			</Box>
		</motion.div>
	);
}
