/**
 * Settings Page
 */

import { zodResolver } from "@hookform/resolvers/zod";
import AddIcon from "@mui/icons-material/Add";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import {
	Alert,
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	CircularProgress,
	Divider,
	FormControlLabel,
	Grid2 as Grid,
	Switch,
	Tab,
	Tabs,
	TextField,
	Typography,
} from "@mui/material";
import * as Sentry from "@sentry/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { authApi } from "@/api/endpoints/auth";
import type {
	AuthConfigUpdate,
	EmbeddingConfigUpdate,
	ExchangeConfigUpdate,
	SessionRetentionConfigUpdate,
} from "@/api/endpoints/settings";
import { settingsApi } from "@/api/endpoints/settings";
import { AgentConfigPanel } from "@/components/agent/AgentConfigPanel";
import { MetricRow } from "@/components/common/MetricRow";
import { PageTransition } from "@/components/common/PageTransition";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ThemeSelector } from "@/components/common/ThemeSelector";
import { useAuth } from "@/hooks/useAuth";
import { useAuthStore } from "@/store/authStore";
import { notify, useUIStore } from "@/store/uiStore";
import { getErrorMessage } from "@/utils/errors";
import {
	type ChangePasswordInput,
	changePasswordSchema,
	type SettingsInput,
	settingsSchema,
} from "@/utils/validators";
import { requireAuth } from "./-guards";

export const Route = createFileRoute("/settings")({
	beforeLoad: requireAuth,
	component: SettingsPage,
});

function EmbeddingConfigCard() {
	const { user } = useAuthStore();
	const isSuperuser = user?.isSuperuser ?? false;
	const queryClient = useQueryClient();
	const [newProcess, setNewProcess] = useState("");

	const configQuery = useQuery({
		queryKey: ["embedding-config"],
		queryFn: () => settingsApi.getEmbeddingConfig(),
		enabled: isSuperuser || import.meta.env.DEV,
		staleTime: 60_000,
	});

	const updateMutation = useMutation({
		mutationFn: (update: EmbeddingConfigUpdate) =>
			settingsApi.updateEmbeddingConfig(update),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["embedding-config"] });
			notify.success("Embedding configuration updated");
		},
		onError: (error) => {
			notify.error(
				"Failed to update embedding configuration",
				getErrorMessage(error),
			);
		},
	});

	if (!isSuperuser && !import.meta.env.DEV) return null;

	const config = configQuery.data;

	const handleAddProcess = () => {
		const trimmed = newProcess.trim();
		if (!trimmed || !config) return;
		const updated = [...config.gamingProcessList, trimmed];
		updateMutation.mutate({ gamingProcessList: updated });
		setNewProcess("");
	};

	const handleRemoveProcess = (process: string) => {
		if (!config) return;
		const updated = config.gamingProcessList.filter((p) => p !== process);
		updateMutation.mutate({ gamingProcessList: updated });
	};

	return (
		<Card sx={{ mb: 3 }}>
			<CardContent>
				<Typography variant="h6" gutterBottom>
					Embedding Configuration
				</Typography>

				{configQuery.isLoading ? (
					<Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
						<CircularProgress size={24} />
					</Box>
				) : configQuery.error ? (
					<Alert severity="error">Failed to load embedding configuration</Alert>
				) : config ? (
					<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
						<FormControlLabel
							control={
								<Switch
									checked={config.deferEmbeddingWhenGaming}
									onChange={(_, checked) =>
										updateMutation.mutate({
											deferEmbeddingWhenGaming: checked,
										})
									}
									disabled={updateMutation.isPending}
								/>
							}
							label="Defer embedding tasks when gaming"
						/>
						<Typography variant="body2" color="text.secondary" sx={{ mt: -1 }}>
							Pauses CPU-heavy embedding generation while a game is running,
							then resumes automatically when the game exits.
						</Typography>

						{config.deferEmbeddingWhenGaming && (
							<>
								<Divider />

								<Box>
									<Typography variant="subtitle2" gutterBottom>
										Game Processes
									</Typography>
									<Box
										sx={{
											display: "flex",
											flexWrap: "wrap",
											gap: 0.5,
											mb: 1,
										}}
									>
										{config.gamingProcessList.length === 0 ? (
											<Typography
												variant="body2"
												color="text.secondary"
												sx={{ fontStyle: "italic" }}
											>
												No processes configured
											</Typography>
										) : (
											config.gamingProcessList.map((process) => (
												<Chip
													key={process}
													label={process}
													onDelete={() => handleRemoveProcess(process)}
													size="small"
													variant="outlined"
												/>
											))
										)}
									</Box>
									<Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
										<TextField
											size="small"
											placeholder="e.g. cs2.exe"
											value={newProcess}
											onChange={(e) => setNewProcess(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter") {
													e.preventDefault();
													handleAddProcess();
												}
											}}
											sx={{ width: 200 }}
										/>
										<Button
											size="small"
											variant="outlined"
											startIcon={<AddIcon />}
											onClick={handleAddProcess}
											disabled={!newProcess.trim() || updateMutation.isPending}
										>
											Add
										</Button>
									</Box>
								</Box>

								<Box>
									<Typography variant="subtitle2" gutterBottom>
										Check Interval (minutes)
									</Typography>
									<TextField
										size="small"
										type="number"
										value={config.gamingCheckIntervalMinutes}
										onChange={(e) => {
											const val = Number.parseInt(e.target.value, 10);
											if (val >= 1) {
												updateMutation.mutate({
													gamingCheckIntervalMinutes: val,
												});
											}
										}}
										slotProps={{ htmlInput: { min: 1, max: 60 } }}
										sx={{ width: 120 }}
									/>
									<Typography
										variant="body2"
										color="text.secondary"
										sx={{ mt: 0.5 }}
									>
										How often to check if the game has exited
									</Typography>
								</Box>
							</>
						)}
					</Box>
				) : null}
			</CardContent>
		</Card>
	);
}

function EmbeddingModelCard() {
	const { user } = useAuthStore();
	const isSuperuser = user?.isSuperuser ?? false;
	const queryClient = useQueryClient();

	const configQuery = useQuery({
		queryKey: ["embedding-model-config"],
		queryFn: () => settingsApi.getEmbeddingModelConfig(),
		enabled: isSuperuser || import.meta.env.DEV,
		staleTime: 60_000,
	});

	const updateMutation = useMutation({
		mutationFn: (modelName: string) =>
			settingsApi.updateEmbeddingModelConfig(modelName),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["embedding-model-config"] });
			notify.success("Embedding model updated — will load on next use");
		},
		onError: (error) => {
			notify.error("Failed to update embedding model", getErrorMessage(error));
		},
	});

	if (!isSuperuser && !import.meta.env.DEV) return null;

	const config = configQuery.data;

	return (
		<Card sx={{ mb: 3 }}>
			<CardContent>
				<Typography variant="h6" gutterBottom>
					Embedding Model
				</Typography>
				<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
					Select the local embedding model for RAG search. All models produce
					768-dim vectors.
				</Typography>

				{configQuery.isLoading ? (
					<CircularProgress size={20} />
				) : config ? (
					<Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
						{config.availableModels.map((model) => {
							const isActive = model.hfId === config.currentModel;
							return (
								<Box
									key={model.hfId}
									sx={{
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										p: 1.5,
										borderRadius: 1,
										border: isActive ? "1.5px solid" : "1px solid",
										borderColor: isActive ? "primary.main" : "divider",
										bgcolor: isActive ? "action.selected" : "transparent",
										cursor: "pointer",
										"&:hover": { bgcolor: "action.hover" },
									}}
									onClick={() => {
										if (!isActive) updateMutation.mutate(model.hfId);
									}}
								>
									<Box>
										<Typography variant="subtitle2">
											{model.label}
											{isActive && (
												<Chip
													label="Active"
													size="small"
													color="primary"
													sx={{ ml: 1 }}
												/>
											)}
										</Typography>
										<Typography variant="caption" color="text.secondary">
											{model.description}
										</Typography>
									</Box>
								</Box>
							);
						})}
					</Box>
				) : null}
			</CardContent>
		</Card>
	);
}

function ChangePasswordCard() {
	const {
		control,
		handleSubmit,
		reset,
		formState: { errors },
	} = useForm<ChangePasswordInput>({
		resolver: zodResolver(changePasswordSchema),
		defaultValues: {
			currentPassword: "",
			newPassword: "",
			confirmNewPassword: "",
		},
	});

	const mutation = useMutation({
		mutationFn: (data: ChangePasswordInput) =>
			authApi.changePassword(data.currentPassword, data.newPassword),
		onSuccess: (tokens) => {
			useAuthStore.getState().updateToken(tokens.access_token);
			notify.success("Password changed successfully");
			reset();
		},
		onError: (error) => {
			notify.error("Failed to change password", getErrorMessage(error));
		},
	});

	return (
		<Card sx={{ mb: 3 }}>
			<CardContent>
				<Typography variant="h6" gutterBottom>
					Change Password
				</Typography>

				<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
					<Controller
						name="currentPassword"
						control={control}
						render={({ field }) => (
							<TextField
								{...field}
								type="password"
								label="Current Password"
								fullWidth
								size="small"
								error={!!errors.currentPassword}
								helperText={errors.currentPassword?.message}
							/>
						)}
					/>
					<Controller
						name="newPassword"
						control={control}
						render={({ field }) => (
							<TextField
								{...field}
								type="password"
								label="New Password"
								fullWidth
								size="small"
								error={!!errors.newPassword}
								helperText={errors.newPassword?.message}
							/>
						)}
					/>
					<Controller
						name="confirmNewPassword"
						control={control}
						render={({ field }) => (
							<TextField
								{...field}
								type="password"
								label="Confirm New Password"
								fullWidth
								size="small"
								error={!!errors.confirmNewPassword}
								helperText={errors.confirmNewPassword?.message}
							/>
						)}
					/>
					<Button
						variant="outlined"
						disabled={mutation.isPending}
						sx={{ alignSelf: "flex-start" }}
						onClick={handleSubmit((data) => mutation.mutate(data))}
					>
						{mutation.isPending ? "Changing..." : "Change Password"}
					</Button>
				</Box>
			</CardContent>
		</Card>
	);
}

function AuthConfigCard() {
	const { user } = useAuthStore();
	const isSuperuser = user?.isSuperuser ?? false;
	const queryClient = useQueryClient();
	const [expireInput, setExpireInput] = useState<number | "">("");

	const configQuery = useQuery({
		queryKey: ["auth-config"],
		queryFn: () => settingsApi.getAuthConfig(),
		enabled: isSuperuser || import.meta.env.DEV,
		staleTime: 60_000,
	});

	const updateMutation = useMutation({
		mutationFn: (update: AuthConfigUpdate) =>
			settingsApi.updateAuthConfig(update),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["auth-config"] });
			notify.success("Token expiry updated");
			setExpireInput("");
		},
		onError: (error) => {
			notify.error("Failed to update token expiry", getErrorMessage(error));
		},
	});

	if (!isSuperuser && !import.meta.env.DEV) return null;

	const config = configQuery.data;

	const handleSave = () => {
		if (expireInput === "") return;
		updateMutation.mutate({ accessTokenExpireMinutes: expireInput });
	};

	const formatExpiry = (minutes: number): string => {
		if (minutes === 0) return "Never (no expiry)";
		if (minutes < 60) return `${minutes} minutes`;
		if (minutes < 1440) return `${(minutes / 60).toFixed(1)} hours`;
		return `${(minutes / 1440).toFixed(1)} days`;
	};

	return (
		<Card sx={{ mb: 3 }}>
			<CardContent>
				<Typography variant="h6" gutterBottom>
					Token Expiry
				</Typography>

				{configQuery.isLoading ? (
					<Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
						<CircularProgress size={24} />
					</Box>
				) : configQuery.error ? (
					<Alert severity="error">Failed to load auth configuration</Alert>
				) : config ? (
					<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
						<Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
							<Typography variant="subtitle2">Current:</Typography>
							<Chip
								label={formatExpiry(config.accessTokenExpireMinutes)}
								size="small"
								variant="outlined"
								color={
									config.accessTokenExpireMinutes > 0 ? "success" : "default"
								}
							/>
						</Box>

						<Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
							<TextField
								size="small"
								type="number"
								label="Expire after (minutes)"
								value={expireInput}
								onChange={(e) => {
									const val = e.target.value;
									setExpireInput(val === "" ? "" : Number(val));
								}}
								slotProps={{ htmlInput: { min: 0 } }}
								sx={{ width: 200 }}
							/>
							<Button
								variant="outlined"
								onClick={handleSave}
								disabled={expireInput === "" || updateMutation.isPending}
							>
								Save
							</Button>
						</Box>

						<Typography variant="body2" color="text.secondary">
							0 = never expire. Common values: 60 (1h), 1440 (1 day), 10080 (7
							days)
						</Typography>
					</Box>
				) : null}
			</CardContent>
		</Card>
	);
}

function SessionRetentionCard() {
	const { user } = useAuthStore();
	const isSuperuser = user?.isSuperuser ?? false;
	const queryClient = useQueryClient();
	const [daysInput, setDaysInput] = useState<number | "">("");

	const configQuery = useQuery({
		queryKey: ["session-retention-config"],
		queryFn: () => settingsApi.getSessionRetentionConfig(),
		enabled: isSuperuser || import.meta.env.DEV,
		staleTime: 60_000,
	});

	const updateMutation = useMutation({
		mutationFn: (update: SessionRetentionConfigUpdate) =>
			settingsApi.updateSessionRetentionConfig(update),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["session-retention-config"] });
			notify.success("Session retention updated");
			setDaysInput("");
		},
		onError: (error) => {
			notify.error(
				"Failed to update session retention",
				getErrorMessage(error),
			);
		},
	});

	if (!isSuperuser && !import.meta.env.DEV) return null;

	const config = configQuery.data;

	const handleSave = () => {
		if (daysInput === "") return;
		updateMutation.mutate({ sessionRetentionDays: daysInput });
	};

	const formatRetention = (days: number): string => {
		if (days === 0) return "Keep forever";
		if (days === 1) return "1 day";
		return `${days} days`;
	};

	return (
		<Card sx={{ mb: 3 }}>
			<CardContent>
				<Typography variant="h6" gutterBottom>
					Session Retention
				</Typography>

				{configQuery.isLoading ? (
					<Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
						<CircularProgress size={24} />
					</Box>
				) : configQuery.error ? (
					<Alert severity="error">
						Failed to load session retention config
					</Alert>
				) : config ? (
					<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
						<Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
							<Typography variant="subtitle2">Current:</Typography>
							<Chip
								label={formatRetention(config.sessionRetentionDays)}
								size="small"
								variant="outlined"
								color={config.sessionRetentionDays > 0 ? "success" : "default"}
							/>
						</Box>

						<Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
							<TextField
								size="small"
								type="number"
								label="Retention (days)"
								value={daysInput}
								onChange={(e) => {
									const val = e.target.value;
									setDaysInput(val === "" ? "" : Number(val));
								}}
								slotProps={{ htmlInput: { min: 0 } }}
								sx={{ width: 200 }}
							/>
							<Button
								variant="outlined"
								onClick={handleSave}
								disabled={daysInput === "" || updateMutation.isPending}
							>
								Save
							</Button>
						</Box>

						<Typography variant="body2" color="text.secondary">
							0 = keep forever. Chat sessions older than this will be
							automatically deleted.
						</Typography>
					</Box>
				) : null}
			</CardContent>
		</Card>
	);
}

function ExchangeConfigCard() {
	const { user } = useAuthStore();
	const isSuperuser = user?.isSuperuser ?? false;
	const queryClient = useQueryClient();
	const [apiKeyInput, setApiKeyInput] = useState("");
	const [secretKeyInput, setSecretKeyInput] = useState("");
	const [passphraseInput, setPassphraseInput] = useState("");
	const [testResult, setTestResult] = useState<{
		success: boolean;
		message: string;
	} | null>(null);

	const configQuery = useQuery({
		queryKey: ["exchange-config"],
		queryFn: () => settingsApi.getExchangeConfig(),
		enabled: isSuperuser || import.meta.env.DEV,
		staleTime: 60_000,
	});

	const updateMutation = useMutation({
		mutationFn: (update: ExchangeConfigUpdate) =>
			settingsApi.updateExchangeConfig(update),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ["exchange-config"] });
			notify.success("Exchange configuration updated");
			setTestResult(null);

			if (
				variables.apiKey !== undefined ||
				variables.secretKey !== undefined ||
				variables.passphrase !== undefined
			) {
				setApiKeyInput("");
				setSecretKeyInput("");
				setPassphraseInput("");
			}
		},
		onError: (error) => {
			notify.error(
				"Failed to update exchange configuration",
				getErrorMessage(error),
			);
		},
	});

	const testMutation = useMutation({
		mutationFn: () =>
			Sentry.startSpan(
				{ name: "exchange.test_connection", op: "ui.action" },
				() => settingsApi.testExchangeConnection(),
			),
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

	const handleSaveCredentials = () => {
		const update: ExchangeConfigUpdate = {};
		if (apiKeyInput.trim()) update.apiKey = apiKeyInput.trim();
		if (secretKeyInput.trim()) update.secretKey = secretKeyInput.trim();
		if (passphraseInput.trim()) update.passphrase = passphraseInput.trim();
		if (Object.keys(update).length > 0) {
			updateMutation.mutate(update);
		}
	};

	const handleClearCredentials = () => {
		updateMutation.mutate({ apiKey: "", secretKey: "", passphrase: "" });
	};

	const handleSandboxChange = (
		_: React.ChangeEvent<HTMLInputElement>,
		checked: boolean,
	) => {
		updateMutation.mutate({ sandbox: checked });
	};

	return (
		<Card sx={{ mb: 3 }}>
			<CardContent>
				<Typography variant="h6" gutterBottom>
					OKX Exchange Configuration
				</Typography>

				{configQuery.isLoading ? (
					<Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
						<CircularProgress size={24} />
					</Box>
				) : configQuery.error ? (
					<Alert severity="error">Failed to load exchange configuration</Alert>
				) : config ? (
					<Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
						{/* Current Status */}
						<Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
							<Typography variant="subtitle2">Status</Typography>
							<Chip
								icon={
									config.hasApiKey &&
									config.hasSecretKey &&
									config.hasPassphrase ? (
										<CheckCircleIcon />
									) : (
										<ErrorIcon />
									)
								}
								label={
									config.hasApiKey &&
									config.hasSecretKey &&
									config.hasPassphrase
										? "Configured"
										: "Not Configured"
								}
								color={
									config.hasApiKey &&
									config.hasSecretKey &&
									config.hasPassphrase
										? "success"
										: "warning"
								}
								size="small"
								variant="outlined"
							/>
						</Box>

						{/* Current Keys Display */}
						{config.hasApiKey && (
							<Box>
								<MetricRow
									label="API Key"
									value={config.maskedApiKey || "Not configured"}
								/>
								<MetricRow
									label="Secret Key"
									value={
										config.hasSecretKey
											? config.maskedSecretKey || "Configured"
											: "Not configured"
									}
								/>
								<MetricRow
									label="Passphrase"
									value={config.hasPassphrase ? "••••••••" : "Not configured"}
								/>
								<Button
									size="small"
									color="error"
									onClick={handleClearCredentials}
									sx={{ alignSelf: "flex-start", mt: 1 }}
								>
									Clear All Credentials
								</Button>
							</Box>
						)}

						{/* Credential Inputs */}
						<Box>
							<Typography variant="subtitle2" gutterBottom>
								{config.hasApiKey ? "Update Credentials" : "API Credentials"}
							</Typography>
							<Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
								<TextField
									size="small"
									type="password"
									label="API Key"
									placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
									value={apiKeyInput}
									onChange={(e) => setApiKeyInput(e.target.value)}
									fullWidth
								/>
								<TextField
									size="small"
									type="password"
									label="Secret Key"
									placeholder="Your OKX secret key"
									value={secretKeyInput}
									onChange={(e) => setSecretKeyInput(e.target.value)}
									fullWidth
								/>
								<TextField
									size="small"
									type="password"
									label="Passphrase"
									placeholder="Your OKX passphrase"
									value={passphraseInput}
									onChange={(e) => setPassphraseInput(e.target.value)}
									fullWidth
								/>
								<Button
									variant="outlined"
									onClick={handleSaveCredentials}
									disabled={
										(!apiKeyInput.trim() &&
											!secretKeyInput.trim() &&
											!passphraseInput.trim()) ||
										updateMutation.isPending
									}
									sx={{ alignSelf: "flex-start" }}
								>
									{config.hasApiKey ? "Update" : "Save"}
								</Button>
							</Box>
						</Box>

						{/* Sandbox Toggle */}
						<Box>
							<FormControlLabel
								control={
									<Switch
										checked={config.sandbox}
										onChange={handleSandboxChange}
										disabled={updateMutation.isPending}
									/>
								}
								label="Sandbox Mode (Demo Trading)"
							/>
							<Typography variant="body2" color="text.secondary">
								{config.sandbox
									? "Using OKX demo/testnet environment — no real funds at risk"
									: "Using OKX production environment — real funds will be used"}
							</Typography>
						</Box>

						{/* Test Connection */}
						<Box>
							<Button
								variant="outlined"
								startIcon={
									testMutation.isPending ? (
										<CircularProgress size={16} />
									) : (
										<PlayArrowIcon />
									)
								}
								onClick={() => testMutation.mutate()}
								disabled={testMutation.isPending}
							>
								Test Connection
							</Button>
							{testResult && (
								<Alert
									severity={testResult.success ? "success" : "error"}
									sx={{ mt: 1 }}
								>
									{testResult.message}
								</Alert>
							)}
						</Box>
					</Box>
				) : null}
			</CardContent>
		</Card>
	);
}

function SettingsPage() {
	const { user } = useAuth();
	const isSuperuser = user?.isSuperuser ?? false;
	const [settingsTab, setSettingsTab] = useState(0);
	const { reducedMotion, setReducedMotion, effectsEnabled, setEffectsEnabled } =
		useUIStore();

	const {
		control,
		handleSubmit,
		formState: { errors, isDirty },
	} = useForm<SettingsInput>({
		resolver: zodResolver(settingsSchema),
		defaultValues: {
			email: user?.email || "",
			username: user?.username || "",
			defaultSymbol: "BTC-USDT",
			defaultTimeframe: "1h",
			notifications: {
				email: true,
				push: false,
				orderFilled: true,
				priceAlerts: true,
				newsAlerts: false,
			},
		},
	});

	const onSubmit = async (data: SettingsInput) => {
		try {
			console.log("Saving settings:", data);
			notify.success("Settings saved");
		} catch {
			notify.error("Failed to save settings");
		}
	};

	return (
		<PageTransition pageKey="settings">
			<Box sx={{ maxWidth: 800, mx: "auto" }}>
				<SectionHeader
					title="Settings"
					subtitle="Configure your account, agent, and application preferences"
				/>

				<Tabs
					value={settingsTab}
					onChange={(_, v) => setSettingsTab(v)}
					sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}
				>
					<Tab label="Profile" />
					<Tab label="Agent & Exchange" />
					<Tab label="Appearance" />
					{isSuperuser && <Tab label="Admin" />}
				</Tabs>

				{/* Tab 0: Profile */}
				{settingsTab === 0 && (
					<form onSubmit={handleSubmit(onSubmit)}>
						{/* Profile Settings */}
						<Card sx={{ mb: 3 }}>
							<CardContent>
								<Typography variant="h6" gutterBottom>
									Profile
								</Typography>

								<Grid container spacing={3}>
									<Grid size={{ xs: 12, sm: 6 }}>
										<Controller
											name="email"
											control={control}
											render={({ field }) => (
												<TextField
													{...field}
													label="Email"
													fullWidth
													error={!!errors.email}
													helperText={errors.email?.message}
												/>
											)}
										/>
									</Grid>
									<Grid size={{ xs: 12, sm: 6 }}>
										<Controller
											name="username"
											control={control}
											render={({ field }) => (
												<TextField
													{...field}
													label="Username"
													fullWidth
													error={!!errors.username}
													helperText={errors.username?.message}
												/>
											)}
										/>
									</Grid>
								</Grid>
							</CardContent>
						</Card>

						{/* Trading Preferences */}
						<Card sx={{ mb: 3 }}>
							<CardContent>
								<Typography variant="h6" gutterBottom>
									Trading Preferences
								</Typography>

								<Grid container spacing={3}>
									<Grid size={{ xs: 12, sm: 6 }}>
										<Controller
											name="defaultSymbol"
											control={control}
											render={({ field }) => (
												<TextField
													{...field}
													label="Default Symbol"
													fullWidth
													helperText="Default trading pair to load"
												/>
											)}
										/>
									</Grid>
									<Grid size={{ xs: 12, sm: 6 }}>
										<Controller
											name="defaultTimeframe"
											control={control}
											render={({ field }) => (
												<TextField
													{...field}
													label="Default Timeframe"
													fullWidth
													helperText="Default chart timeframe"
												/>
											)}
										/>
									</Grid>
								</Grid>
							</CardContent>
						</Card>

						{/* Notification Settings */}
						<Card sx={{ mb: 3 }}>
							<CardContent>
								<Typography variant="h6" gutterBottom>
									Notifications
								</Typography>

								<Box
									sx={{
										display: "flex",
										flexDirection: "column",
										gap: 1,
									}}
								>
									<Controller
										name="notifications.email"
										control={control}
										render={({ field }) => (
											<FormControlLabel
												control={<Switch {...field} checked={field.value} />}
												label="Email notifications"
											/>
										)}
									/>
									<Controller
										name="notifications.push"
										control={control}
										render={({ field }) => (
											<FormControlLabel
												control={<Switch {...field} checked={field.value} />}
												label="Push notifications"
											/>
										)}
									/>
									<Divider sx={{ my: 1 }} />
									<Controller
										name="notifications.orderFilled"
										control={control}
										render={({ field }) => (
											<FormControlLabel
												control={<Switch {...field} checked={field.value} />}
												label="Order filled alerts"
											/>
										)}
									/>
									<Controller
										name="notifications.priceAlerts"
										control={control}
										render={({ field }) => (
											<FormControlLabel
												control={<Switch {...field} checked={field.value} />}
												label="Price alerts"
											/>
										)}
									/>
									<Controller
										name="notifications.newsAlerts"
										control={control}
										render={({ field }) => (
											<FormControlLabel
												control={<Switch {...field} checked={field.value} />}
												label="News alerts"
											/>
										)}
									/>
								</Box>
							</CardContent>
						</Card>

						{/* Change Password */}
						<ChangePasswordCard />

						{/* Save Button */}
						<Box sx={{ display: "flex", justifyContent: "flex-end" }}>
							<Button
								type="submit"
								variant="contained"
								size="large"
								disabled={!isDirty}
							>
								Save Changes
							</Button>
						</Box>
					</form>
				)}

				{/* Tab 1: Agent & Exchange */}
				{settingsTab === 1 && (
					<>
						<AgentConfigPanel variant="card" showThinkingBudget={true} />
						<ExchangeConfigCard />
						<AuthConfigCard />
						<SessionRetentionCard />
					</>
				)}

				{/* Tab 2: Appearance */}
				{settingsTab === 2 && (
					<Card>
						<CardContent>
							<Typography variant="h6" sx={{ mb: 2 }}>
								Appearance
							</Typography>

							{/* Theme Selector */}
							<Box sx={{ mb: 3 }}>
								<Typography variant="subtitle2" sx={{ mb: 1 }}>
									Theme
								</Typography>
								<ThemeSelector />
							</Box>

							{/* Reduced Motion */}
							<Box
								sx={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									mb: 2,
								}}
							>
								<Box>
									<Typography variant="body2">Reduced Motion</Typography>
									<Typography variant="caption" color="text.secondary">
										Minimize animations for accessibility
									</Typography>
								</Box>
								<Switch
									checked={reducedMotion}
									onChange={(_, checked) => setReducedMotion(checked)}
								/>
							</Box>

							{/* Effects */}
							<Box
								sx={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									mb: 2,
								}}
							>
								<Box>
									<Typography variant="body2">Background Effects</Typography>
									<Typography variant="caption" color="text.secondary">
										Mesh blobs, particle grid, cursor glow
									</Typography>
								</Box>
								<Switch
									checked={effectsEnabled}
									onChange={(_, checked) => setEffectsEnabled(checked)}
								/>
							</Box>
						</CardContent>
					</Card>
				)}

				{/* Tab 3: Admin (superuser only) */}
				{isSuperuser && settingsTab === 3 && (
					<>
						<EmbeddingModelCard />
						<EmbeddingConfigCard />
					</>
				)}
			</Box>
		</PageTransition>
	);
}
