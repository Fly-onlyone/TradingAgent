/**
 * Apprise notification configuration card.
 *
 * Manages multi-channel notification URLs (Telegram, Discord, Slack, etc.)
 * and a transactional email URL via the Apprise library.
 */

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import SendIcon from "@mui/icons-material/Send";
import {
	Alert,
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	CircularProgress,
	Divider,
	TextField,
	Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { AppriseConfigUpdate } from "@/api/endpoints/settings";
import { appriseApi } from "@/api/endpoints/settings";
import { useAuthStore } from "@/store/authStore";
import { notify } from "@/store/uiStore";
import { getErrorMessage } from "@/utils/errors";
import { PendingChannelsList } from "./PendingChannelsList";
import { ProviderChannelForm } from "./ProviderChannelForm";
import { SavedChannelsList } from "./SavedChannelsList";

export function AppriseConfigCard() {
	const { user } = useAuthStore();
	const isSuperuser = user?.isSuperuser ?? false;
	const queryClient = useQueryClient();
	const [pendingUrls, setPendingUrls] = useState<string[]>([]);
	const [emailUrlInput, setEmailUrlInput] = useState("");
	const [emailEditing, setEmailEditing] = useState(false);
	const [testResult, setTestResult] = useState<{
		success: boolean;
		message: string;
	} | null>(null);

	const configQuery = useQuery({
		queryKey: ["apprise-config"],
		queryFn: () => appriseApi.getAppriseConfig(),
		enabled: isSuperuser || import.meta.env.DEV,
		staleTime: 60_000,
	});

	const updateMutation = useMutation({
		mutationFn: (update: AppriseConfigUpdate) =>
			appriseApi.updateAppriseConfig(update),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["apprise-config"] });
			notify.success("Notification configuration updated");
			setPendingUrls([]);
			setEmailEditing(false);
		},
		onError: (error) => {
			notify.error(
				"Failed to update notification configuration",
				getErrorMessage(error),
			);
		},
	});

	const testMutation = useMutation({
		mutationFn: () => appriseApi.testAppriseNotification(),
		onSuccess: (result) => {
			setTestResult(result);
			if (result.success) {
				notify.success(result.message);
			} else {
				notify.error(result.message);
			}
		},
		onError: () => {
			setTestResult({ success: false, message: "Test request failed" });
		},
	});

	if (!isSuperuser && !import.meta.env.DEV) return null;

	const config = configQuery.data;

	const handleAddUrl = (url: string) => {
		const trimmed = url.trim();
		if (!trimmed) return;
		setPendingUrls((prev) => [...prev, trimmed]);
	};

	const handleRemovePending = (index: number) => {
		setPendingUrls((prev) => prev.filter((_, i) => i !== index));
	};

	const handleSaveUrls = () => {
		if (pendingUrls.length === 0) return;
		updateMutation.mutate({ notificationUrls: pendingUrls });
	};

	const handleClearAllUrls = () => {
		updateMutation.mutate({ notificationUrls: [] });
		setPendingUrls([]);
	};

	const handleSaveEmailUrl = () => {
		updateMutation.mutate({ emailUrl: emailUrlInput.trim() });
	};

	const handleClearEmailUrl = () => {
		updateMutation.mutate({ emailUrl: "" });
		setEmailUrlInput("");
		setEmailEditing(false);
	};

	return (
		<Card sx={{ mb: 3 }}>
			<CardContent>
				<Box
					sx={{
						display: "flex",
						alignItems: "center",
						gap: 1,
						mb: 1,
					}}
				>
					<NotificationsActiveIcon color="primary" />
					<Typography variant="h6">Notification Channels</Typography>
				</Box>
				<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
					Select a notification service below to add a channel. Supports
					Telegram, Discord, Slack, email, and{" "}
					<Typography
						component="a"
						href="https://github.com/caronc/apprise/wiki"
						target="_blank"
						rel="noopener noreferrer"
						variant="body2"
						color="primary"
					>
						80+ more via Apprise
					</Typography>
					.
				</Typography>

				{configQuery.isLoading ? (
					<Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
						<CircularProgress size={24} />
					</Box>
				) : configQuery.error ? (
					<Alert severity="error">
						Failed to load notification configuration
					</Alert>
				) : config ? (
					<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
						{/* Saved channels */}
						<SavedChannelsList
							maskedUrls={config.notificationUrls}
							onClearAll={handleClearAllUrls}
							isClearing={updateMutation.isPending}
						/>

						{config.urlCount === 0 && pendingUrls.length === 0 && (
							<Typography
								variant="body2"
								color="text.secondary"
								sx={{ fontStyle: "italic" }}
							>
								No notification channels configured. Select a service below to
								get started.
							</Typography>
						)}

						{/* Pending channels */}
						<PendingChannelsList
							pendingUrls={pendingUrls}
							onRemove={handleRemovePending}
							onSave={handleSaveUrls}
							isSaving={updateMutation.isPending}
						/>

						{/* Provider form */}
						<ProviderChannelForm onAddUrl={handleAddUrl} />

						<Divider />

						{/* Transactional Email URL */}
						<Box>
							<Typography variant="subtitle2" gutterBottom>
								Transactional Email URL
							</Typography>
							<Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
								Used for password resets and email verification. Format:{" "}
								<code>mailto://user:pass@smtp.example.com</code>
							</Typography>

							{config.hasEmailUrl && !emailEditing ? (
								<Box
									sx={{
										display: "flex",
										alignItems: "center",
										gap: 1,
									}}
								>
									<Chip
										label="Email"
										size="small"
										color="success"
										variant="outlined"
									/>
									<Typography
										variant="body2"
										sx={{
											fontFamily: "monospace",
											fontSize: "0.8rem",
										}}
									>
										{config.maskedEmailUrl}
									</Typography>
									<Button size="small" onClick={() => setEmailEditing(true)}>
										Change
									</Button>
									<Button
										size="small"
										color="error"
										onClick={handleClearEmailUrl}
										disabled={updateMutation.isPending}
									>
										Clear
									</Button>
								</Box>
							) : (
								<Box
									sx={{
										display: "flex",
										gap: 1,
										alignItems: "center",
									}}
								>
									<TextField
										size="small"
										placeholder="mailto://user:pass@smtp.example.com"
										value={emailUrlInput}
										onChange={(e) => setEmailUrlInput(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												handleSaveEmailUrl();
											}
										}}
										sx={{ flex: 1 }}
										type="password"
									/>
									<Button
										size="small"
										variant="contained"
										onClick={handleSaveEmailUrl}
										disabled={!emailUrlInput.trim() || updateMutation.isPending}
									>
										Save
									</Button>
									{emailEditing && (
										<Button
											size="small"
											onClick={() => {
												setEmailEditing(false);
												setEmailUrlInput("");
											}}
										>
											Cancel
										</Button>
									)}
								</Box>
							)}
						</Box>

						<Divider />

						{/* Test button */}
						<Box
							sx={{
								display: "flex",
								alignItems: "center",
								gap: 2,
							}}
						>
							<Button
								size="small"
								variant="outlined"
								startIcon={
									testMutation.isPending ? (
										<CircularProgress size={16} />
									) : (
										<SendIcon />
									)
								}
								onClick={() => {
									setTestResult(null);
									testMutation.mutate();
								}}
								disabled={
									testMutation.isPending ||
									(config.urlCount === 0 && !config.hasEmailUrl)
								}
							>
								Send Test Notification
							</Button>
							{testResult && (
								<Box
									sx={{
										display: "flex",
										alignItems: "center",
										gap: 0.5,
									}}
								>
									{testResult.success ? (
										<CheckCircleIcon
											color="success"
											sx={{ fontSize: "1rem" }}
										/>
									) : (
										<ErrorIcon color="error" sx={{ fontSize: "1rem" }} />
									)}
									<Typography
										variant="body2"
										color={testResult.success ? "success.main" : "error.main"}
									>
										{testResult.message}
									</Typography>
								</Box>
							)}
						</Box>
					</Box>
				) : null}
			</CardContent>
		</Card>
	);
}
