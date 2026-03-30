/**
 * Apprise notification URL configuration card.
 *
 * Manages multi-channel notification URLs (Telegram, Discord, Slack, etc.)
 * and a transactional email URL via the Apprise library.
 */

import AddIcon from "@mui/icons-material/Add";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DeleteIcon from "@mui/icons-material/Delete";
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
	IconButton,
	TextField,
	Tooltip,
	Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useState } from "react";
import type { AppriseConfigUpdate } from "@/api/endpoints/settings";
import { appriseApi } from "@/api/endpoints/settings";
import { useAuthStore } from "@/store/authStore";
import { notify } from "@/store/uiStore";
import { getErrorMessage } from "@/utils/errors";
import { staggerCascade } from "@/utils/animations/variants";

/** Detect Apprise service type from a masked or full URL prefix. */
function detectServiceType(url: string): {
	label: string;
	color:
		| "primary"
		| "secondary"
		| "success"
		| "warning"
		| "error"
		| "info"
		| "default";
} {
	const lower = url.toLowerCase();
	if (lower.startsWith("tgram://")) return { label: "Telegram", color: "info" };
	if (lower.startsWith("discord://"))
		return { label: "Discord", color: "secondary" };
	if (lower.startsWith("slack://")) return { label: "Slack", color: "warning" };
	if (lower.startsWith("mailto://")) return { label: "Email", color: "success" };
	if (lower.startsWith("json://") || lower.startsWith("jsons://"))
		return { label: "Webhook", color: "default" };
	if (lower.startsWith("gotify://") || lower.startsWith("gotifys://"))
		return { label: "Gotify", color: "default" };
	if (lower.startsWith("ntfy://") || lower.startsWith("ntfys://"))
		return { label: "ntfy", color: "default" };
	if (lower.startsWith("pushover://"))
		return { label: "Pushover", color: "default" };
	if (lower.startsWith("msteams://"))
		return { label: "Teams", color: "primary" };
	if (lower.startsWith("matrix://"))
		return { label: "Matrix", color: "default" };
	const scheme = lower.split("://")[0] ?? "unknown";
	return { label: scheme, color: "default" };
}

export function AppriseConfigCard() {
	const { user } = useAuthStore();
	const isSuperuser = user?.isSuperuser ?? false;
	const queryClient = useQueryClient();
	const [newUrl, setNewUrl] = useState("");
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
			setNewUrl("");
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

	const handleAddUrl = () => {
		const trimmed = newUrl.trim();
		if (!trimmed) return;
		setPendingUrls((prev) => [...prev, trimmed]);
		setNewUrl("");
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
					Configure Apprise notification URLs for 80+ services (Telegram,
					Discord, Slack, email, webhooks, etc.). See{" "}
					<Typography
						component="a"
						href="https://github.com/caronc/apprise/wiki"
						target="_blank"
						rel="noopener noreferrer"
						variant="body2"
						color="primary"
					>
						Apprise Wiki
					</Typography>{" "}
					for all supported services and URL formats.
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
						{/* Existing (saved) notification URLs */}
						{config.urlCount > 0 && (
							<Box>
								<Typography variant="subtitle2" gutterBottom>
									Configured Channels ({config.urlCount})
								</Typography>
								<motion.div
									variants={staggerCascade.container}
									initial="hidden"
									animate="visible"
								>
									<Box
										sx={{
											display: "flex",
											flexDirection: "column",
											gap: 0.75,
										}}
									>
										{config.notificationUrls.map((maskedUrl, index) => {
											const service = detectServiceType(maskedUrl);
											return (
												<motion.div
													key={`saved-${maskedUrl}-${index.toString()}`}
													variants={staggerCascade.item}
												>
													<Box
														sx={{
															display: "flex",
															alignItems: "center",
															gap: 1,
															p: 1,
															borderRadius: 1,
															border: "1px solid",
															borderColor: "divider",
															bgcolor: "action.hover",
														}}
													>
														<Chip
															label={service.label}
															size="small"
															color={service.color}
															variant="outlined"
														/>
														<Typography
															variant="body2"
															sx={{
																flex: 1,
																fontFamily: "monospace",
																fontSize: "0.8rem",
															}}
														>
															{maskedUrl}
														</Typography>
													</Box>
												</motion.div>
											);
										})}
									</Box>
								</motion.div>
								<Button
									size="small"
									color="error"
									onClick={handleClearAllUrls}
									disabled={updateMutation.isPending}
									sx={{ mt: 1 }}
								>
									Clear All
								</Button>
							</Box>
						)}

						{config.urlCount === 0 && pendingUrls.length === 0 && (
							<Typography
								variant="body2"
								color="text.secondary"
								sx={{ fontStyle: "italic" }}
							>
								No notification channels configured. Add a URL below to get
								started.
							</Typography>
						)}

						{/* Pending (unsaved) URLs */}
						{pendingUrls.length > 0 && (
							<Box>
								<Typography variant="subtitle2" gutterBottom>
									New Channels (unsaved)
								</Typography>
								<Box
									sx={{
										display: "flex",
										flexDirection: "column",
										gap: 0.5,
									}}
								>
									{pendingUrls.map((url, index) => {
										const service = detectServiceType(url);
										return (
											<Box
												key={`pending-${url}-${index.toString()}`}
												sx={{
													display: "flex",
													alignItems: "center",
													gap: 1,
													p: 1,
													borderRadius: 1,
													border: "1px dashed",
													borderColor: "primary.main",
													bgcolor: "action.selected",
												}}
											>
												<Chip
													label={service.label}
													size="small"
													color={service.color}
													variant="filled"
												/>
												<Typography
													variant="body2"
													sx={{
														flex: 1,
														fontFamily: "monospace",
														fontSize: "0.8rem",
														wordBreak: "break-all",
													}}
												>
													{url}
												</Typography>
												<Tooltip title="Remove">
													<IconButton
														size="small"
														onClick={() => handleRemovePending(index)}
													>
														<DeleteIcon fontSize="small" />
													</IconButton>
												</Tooltip>
											</Box>
										);
									})}
								</Box>
								<Button
									size="small"
									variant="contained"
									onClick={handleSaveUrls}
									disabled={updateMutation.isPending}
									sx={{ mt: 1 }}
								>
									{updateMutation.isPending ? (
										<CircularProgress size={16} sx={{ mr: 1 }} />
									) : null}
									Save {pendingUrls.length} Channel
									{pendingUrls.length > 1 ? "s" : ""}
								</Button>
							</Box>
						)}

						{/* Add URL input */}
						<Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
							<TextField
								size="small"
								placeholder="e.g. tgram://bottoken/ChatID"
								value={newUrl}
								onChange={(e) => setNewUrl(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										handleAddUrl();
									}
								}}
								sx={{ flex: 1 }}
							/>
							<Button
								size="small"
								variant="outlined"
								startIcon={<AddIcon />}
								onClick={handleAddUrl}
								disabled={!newUrl.trim()}
							>
								Add
							</Button>
						</Box>

						<Divider />

						{/* Transactional Email URL */}
						<Box>
							<Typography variant="subtitle2" gutterBottom>
								Transactional Email URL
							</Typography>
							<Typography
								variant="body2"
								color="text.secondary"
								sx={{ mb: 1 }}
							>
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
										sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}
									>
										{config.maskedEmailUrl}
									</Typography>
									<Button
										size="small"
										onClick={() => setEmailEditing(true)}
									>
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
									sx={{ display: "flex", gap: 1, alignItems: "center" }}
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
										disabled={
											!emailUrlInput.trim() || updateMutation.isPending
										}
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
								<Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
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
										color={
											testResult.success
												? "success.main"
												: "error.main"
										}
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
