/**
 * Settings Page
 */

import { zodResolver } from "@hookform/resolvers/zod";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import LoginIcon from "@mui/icons-material/Login";
import LogoutIcon from "@mui/icons-material/Logout";
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
	TextField,
	Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useCallback, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import AddIcon from "@mui/icons-material/Add";
import type {
	EmbeddingConfigUpdate,
	ExchangeConfigUpdate,
} from "@/api/endpoints/settings";
import { settingsApi } from "@/api/endpoints/settings";
import { AgentConfigPanel } from "@/components/agent/AgentConfigPanel";
import { PageTransition } from "@/components/common/PageTransition";
import { useAuth } from "@/hooks/useAuth";
import { usePollingLogin } from "@/hooks/usePollingLogin";
import { useAuthStore } from "@/store/authStore";
import { notify } from "@/store/uiStore";
import { spring } from "@/utils/animations/variants";
import { getErrorMessage } from "@/utils/errors";
import { type SettingsInput, settingsSchema } from "@/utils/validators";
import { requireAuth } from "./-guards";

export const Route = createFileRoute("/settings")({
	beforeLoad: requireAuth,
	component: SettingsPage,
});

function ProtonPassAuthCard() {
	const { user } = useAuthStore();
	const isSuperuser = user?.isSuperuser ?? false;
	const queryClient = useQueryClient();
	const [loginResult, setLoginResult] = useState<{
		success: boolean;
		message: string;
	} | null>(null);

	const statusQuery = useQuery({
		queryKey: ["proton-pass-status"],
		queryFn: () => settingsApi.getProtonPassStatus(),
		enabled: isSuperuser || import.meta.env.DEV,
		staleTime: 30_000,
	});

	const { isPolling: isPollingLogin, startPolling } = usePollingLogin({
		pollFn: useCallback(async () => {
			const fresh = await settingsApi.getProtonPassStatus();
			return fresh.loggedIn;
		}, []),
		onSuccess: useCallback(() => {
			setLoginResult({
				success: true,
				message: "Successfully logged in to Proton Pass",
			});
			notify.success("Successfully logged in to Proton Pass");
			queryClient.invalidateQueries({ queryKey: ["proton-pass-status"] });
		}, [queryClient]),
		onTimeout: useCallback(() => {
			setLoginResult({
				success: false,
				message: "Login timed out. Please try again.",
			});
		}, []),
	});

	const loginMutation = useMutation({
		mutationFn: () => settingsApi.startProtonPassLogin(),
		onSuccess: (result) => {
			setLoginResult(result);
			if (result.success) {
				startPolling();
			} else {
				notify.error(result.message);
			}
		},
		onError: () => {
			setLoginResult({ success: false, message: "Login request failed" });
		},
	});

	const logoutMutation = useMutation({
		mutationFn: () => settingsApi.protonPassLogout(),
		onSuccess: (result) => {
			setLoginResult(result);
			queryClient.invalidateQueries({ queryKey: ["proton-pass-status"] });
			if (result.success) notify.success(result.message);
			else notify.error(result.message);
		},
		onError: () => {
			setLoginResult({ success: false, message: "Logout request failed" });
		},
	});

	if (!isSuperuser && !import.meta.env.DEV) {
		return (
			<Card sx={{ mb: 3 }}>
				<CardContent>
					<Typography variant="h6" gutterBottom>
						Proton Pass Authentication
					</Typography>
					<Alert severity="info">
						Superuser access is required to manage Proton Pass authentication.
					</Alert>
				</CardContent>
			</Card>
		);
	}

	const status = statusQuery.data;

	return (
		<Card sx={{ mb: 3 }}>
			<CardContent>
				<Typography variant="h6" gutterBottom>
					Proton Pass Authentication
				</Typography>

				{statusQuery.isLoading ? (
					<Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
						<CircularProgress size={24} />
					</Box>
				) : statusQuery.error ? (
					<Alert severity="error">Failed to load Proton Pass status</Alert>
				) : status ? (
					<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
						<Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
							<Typography variant="subtitle2">CLI Status</Typography>
							<Chip
								icon={status.loggedIn ? <CheckCircleIcon /> : <ErrorIcon />}
								label={status.loggedIn ? "Authenticated" : "Not Authenticated"}
								color={status.loggedIn ? "success" : "warning"}
								size="small"
								variant="outlined"
							/>
							<Chip
								label={status.available ? "CLI Available" : "CLI Missing"}
								color={status.available ? "default" : "error"}
								size="small"
								variant="outlined"
							/>
						</Box>

						<Alert severity={status.loggedIn ? "success" : "info"}>
							{status.message}
						</Alert>

						{!status.configured && (
							<Alert severity="warning">
								No encryption key source configured. Set
								`SECRETS_ENCRYPTION_KEYS_REF` (recommended) or
								`SECRETS_ENCRYPTION_KEYS`.
							</Alert>
						)}

						{status.usingReference && (
							<Alert severity="info">
								Using Proton Pass reference from `SECRETS_ENCRYPTION_KEYS_REF`.
							</Alert>
						)}

						<Box sx={{ display: "flex", gap: 1 }}>
							{status.loggedIn ? (
								<Button
									variant="outlined"
									color="error"
									size="small"
									startIcon={
										logoutMutation.isPending ? (
											<CircularProgress size={14} />
										) : (
											<LogoutIcon />
										)
									}
									onClick={() => logoutMutation.mutate()}
									disabled={logoutMutation.isPending}
								>
									Logout Proton Pass
								</Button>
							) : (
								<Button
									variant="contained"
									size="small"
									startIcon={
										loginMutation.isPending || isPollingLogin ? (
											<CircularProgress size={16} color="inherit" />
										) : (
											<LoginIcon />
										)
									}
									onClick={() => loginMutation.mutate()}
									disabled={
										!status.available ||
										loginMutation.isPending ||
										isPollingLogin
									}
								>
									{isPollingLogin
										? "Waiting for login..."
										: loginMutation.isPending
											? "Opening terminal..."
											: "Login with Proton Pass"}
								</Button>
							)}
						</Box>

						{loginResult && (
							<Alert severity={loginResult.success ? "success" : "error"}>
								{loginResult.message}
							</Alert>
						)}
					</Box>
				) : null}
			</CardContent>
		</Card>
	);
}

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
					<Alert severity="error">
						Failed to load embedding configuration
					</Alert>
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
											disabled={
												!newProcess.trim() || updateMutation.isPending
											}
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
		mutationFn: () => settingsApi.testExchangeConnection(),
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
							<Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
								<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
									<Typography
										variant="body2"
										color="text.secondary"
										sx={{ minWidth: 80 }}
									>
										API Key:
									</Typography>
									<Typography
										variant="body2"
										fontFamily="monospace"
										color="text.secondary"
									>
										{config.maskedApiKey}
									</Typography>
								</Box>
								{config.hasSecretKey && (
									<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
										<Typography
											variant="body2"
											color="text.secondary"
											sx={{ minWidth: 80 }}
										>
											Secret:
										</Typography>
										<Typography
											variant="body2"
											fontFamily="monospace"
											color="text.secondary"
										>
											{config.maskedSecretKey}
										</Typography>
									</Box>
								)}
								{config.hasPassphrase && (
									<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
										<Typography
											variant="body2"
											color="text.secondary"
											sx={{ minWidth: 80 }}
										>
											Passphrase:
										</Typography>
										<Typography
											variant="body2"
											fontFamily="monospace"
											color="text.secondary"
										>
											••••••••
										</Typography>
									</Box>
								)}
								<Button
									size="small"
									color="error"
									onClick={handleClearCredentials}
									sx={{ alignSelf: "flex-start", mt: 0.5 }}
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
				<motion.div
					initial={{ opacity: 0, x: -40 }}
					animate={{ opacity: 1, x: 0 }}
					transition={{ ...spring.snappy, delay: 0.1 }}
				>
					<Typography variant="h4" fontWeight={700} gutterBottom>
						Settings
					</Typography>
				</motion.div>

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

							<Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
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

					{/* AI Agent Configuration (superuser only) */}
					<AgentConfigPanel variant="card" />

					{/* Embedding Configuration (superuser only) */}
					<EmbeddingConfigCard />

					{/* Proton Pass Authentication (superuser only) */}
					<ProtonPassAuthCard />

					{/* OKX Exchange Configuration (superuser only) */}
					<ExchangeConfigCard />

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
			</Box>
		</PageTransition>
	);
}
