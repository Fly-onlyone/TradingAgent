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
	MenuItem,
	Switch,
	TextField,
	ToggleButton,
	ToggleButtonGroup,
	Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type {
	AgentConfigUpdate,
	ExchangeConfigUpdate,
} from "@/api/endpoints/settings";
import { settingsApi } from "@/api/endpoints/settings";
import { PageTransition } from "@/components/common/PageTransition";
import { useAuth } from "@/hooks/useAuth";
import { useAuthStore } from "@/store/authStore";
import { notify } from "@/store/uiStore";
import { spring } from "@/utils/animations/variants";
import { type SettingsInput, settingsSchema } from "@/utils/validators";
import { requireAuth } from "./-guards";

export const Route = createFileRoute("/settings")({
	beforeLoad: requireAuth,
	component: SettingsPage,
});

const MODEL_OPTIONS = [
	{ value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
	{ value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
	{ value: "claude-opus-4-6", label: "Claude Opus 4.6" },
];

function getApiErrorMessage(error: unknown, fallback: string): string {
	if (error && typeof error === "object" && "detail" in error) {
		const detail = (error as { detail?: unknown }).detail;
		if (typeof detail === "string" && detail.trim()) {
			return detail;
		}
	}

	if (error instanceof Error && error.message.trim()) {
		return error.message;
	}

	return fallback;
}

function AgentConfigCard() {
	const { user } = useAuthStore();
	const isSuperuser = user?.isSuperuser ?? false;
	const queryClient = useQueryClient();
	const [apiKeyInput, setApiKeyInput] = useState("");
	const [testResult, setTestResult] = useState<{
		success: boolean;
		message: string;
	} | null>(null);
	const [loginResult, setLoginResult] = useState<{
		success: boolean;
		message: string;
	} | null>(null);

	const configQuery = useQuery({
		queryKey: ["agent-config"],
		queryFn: () => settingsApi.getAgentConfig(),
		enabled: isSuperuser || import.meta.env.DEV,
		staleTime: 60_000,
	});

	const updateMutation = useMutation({
		mutationFn: (update: AgentConfigUpdate) =>
			settingsApi.updateAgentConfig(update),
		onSuccess: (_, variables) => {
			queryClient.invalidateQueries({ queryKey: ["agent-config"] });
			notify.success("Agent configuration updated");
			setTestResult(null);

			if (variables.apiKey !== undefined) {
				setApiKeyInput("");
			}
		},
		onError: (error) => {
			notify.error(
				"Failed to update agent configuration",
				getApiErrorMessage(error, "Request failed"),
			);
		},
	});

	const testMutation = useMutation({
		mutationFn: () => settingsApi.testConnection(),
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

	const [isPollingLogin, setIsPollingLogin] = useState(false);

	const loginMutation = useMutation({
		mutationFn: () => settingsApi.startCLILogin(),
		onSuccess: (result) => {
			setLoginResult(result);
			if (result.success) {
				setIsPollingLogin(true);
			} else {
				notify.error(result.message);
			}
		},
		onError: () => {
			setLoginResult({ success: false, message: "Login request failed" });
		},
	});

	// Poll for CLI login status after browser opens
	useEffect(() => {
		if (!isPollingLogin) return;
		const interval = setInterval(async () => {
			try {
				const fresh = await settingsApi.getAgentConfig();
				if (fresh.cliLoggedIn) {
					setIsPollingLogin(false);
					setLoginResult({
						success: true,
						message: "Successfully logged in to Claude",
					});
					notify.success("Successfully logged in to Claude");
					queryClient.invalidateQueries({ queryKey: ["agent-config"] });
				}
			} catch {
				/* ignore poll errors */
			}
		}, 4000);
		const timeout = setTimeout(() => {
			setIsPollingLogin(false);
			setLoginResult({
				success: false,
				message: "Login timed out. Please try again.",
			});
		}, 120_000);
		return () => {
			clearInterval(interval);
			clearTimeout(timeout);
		};
	}, [isPollingLogin, queryClient]);

	const logoutMutation = useMutation({
		mutationFn: () => settingsApi.cliLogout(),
		onSuccess: (result) => {
			queryClient.invalidateQueries({ queryKey: ["agent-config"] });
			if (result.success) notify.success(result.message);
			else notify.error(result.message);
			setLoginResult(null);
		},
	});

	if (!isSuperuser && !import.meta.env.DEV) return null;

	const config = configQuery.data;

	const handleAuthModeChange = (
		_: React.MouseEvent<HTMLElement>,
		newMode: string | null,
	) => {
		if (newMode) {
			updateMutation.mutate({ authMode: newMode });
		}
	};

	const handleModelChange = (model: string) => {
		updateMutation.mutate({ model });
	};

	const handleSaveApiKey = () => {
		if (apiKeyInput.trim()) {
			updateMutation.mutate({ apiKey: apiKeyInput.trim() });
		}
	};

	const handleClearApiKey = () => {
		updateMutation.mutate({ apiKey: "" });
	};

	return (
		<Card sx={{ mb: 3 }}>
			<CardContent>
				<Typography variant="h6" gutterBottom>
					AI Agent Configuration
				</Typography>

				{configQuery.isLoading ? (
					<Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
						<CircularProgress size={24} />
					</Box>
				) : configQuery.error ? (
					<Alert severity="error">Failed to load agent configuration</Alert>
				) : config ? (
					<Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
						{/* Auth Mode Toggle */}
						<Box>
							<Typography variant="subtitle2" gutterBottom>
								Authentication Mode
							</Typography>
							<ToggleButtonGroup
								value={config.authMode}
								exclusive
								onChange={handleAuthModeChange}
								size="small"
								disabled={updateMutation.isPending}
							>
								<ToggleButton value="subscription">
									Claude Subscription
								</ToggleButton>
								<ToggleButton value="api_key">API Key</ToggleButton>
							</ToggleButtonGroup>
							<Typography
								variant="body2"
								color="text.secondary"
								sx={{ mt: 0.5 }}
							>
								{config.authMode === "subscription"
									? "Uses Claude Pro/Max subscription via CLI login (free with plan)"
									: "Uses a direct Anthropic API key (pay-per-use billing)"}
							</Typography>
						</Box>

						{/* Subscription mode: CLI login */}
						{config.authMode === "subscription" && (
							<Box>
								<Box
									sx={{
										display: "flex",
										alignItems: "center",
										gap: 1.5,
										mb: 1.5,
									}}
								>
									<Typography variant="subtitle2">CLI Login Status</Typography>
									<Chip
										icon={
											config.cliLoggedIn ? <CheckCircleIcon /> : <ErrorIcon />
										}
										label={config.cliLoggedIn ? "Logged In" : "Not Logged In"}
										color={config.cliLoggedIn ? "success" : "warning"}
										size="small"
										variant="outlined"
									/>
								</Box>
								{config.cliLoggedIn ? (
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
										Logout
									</Button>
								) : (
									<Box
										sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}
									>
										<Button
											variant="contained"
											startIcon={
												loginMutation.isPending || isPollingLogin ? (
													<CircularProgress size={16} color="inherit" />
												) : (
													<LoginIcon />
												)
											}
											onClick={() => loginMutation.mutate()}
											disabled={loginMutation.isPending || isPollingLogin}
										>
											{isPollingLogin
												? "Waiting for login..."
												: loginMutation.isPending
													? "Opening browser..."
													: "Login with Claude"}
										</Button>
										{isPollingLogin && (
											<Alert severity="info">
												Complete the login in your browser. This page will
												update automatically.
											</Alert>
										)}
										{loginResult && (
											<Alert
												severity={loginResult.success ? "success" : "error"}
											>
												{loginResult.message}
											</Alert>
										)}
									</Box>
								)}
							</Box>
						)}

						{/* API Key mode: key input */}
						{config.authMode === "api_key" && (
							<Box>
								<Typography variant="subtitle2" gutterBottom>
									Anthropic API Key
								</Typography>
								{config.hasApiKey && (
									<Box
										sx={{
											display: "flex",
											alignItems: "center",
											gap: 1,
											mb: 1.5,
										}}
									>
										<Typography
											variant="body2"
											fontFamily="monospace"
											color="text.secondary"
										>
											{config.maskedApiKey}
										</Typography>
										<Chip
											label="Configured"
											color="success"
											size="small"
											variant="outlined"
										/>
										<Button
											size="small"
											color="error"
											onClick={handleClearApiKey}
										>
											Clear
										</Button>
									</Box>
								)}
								<Box sx={{ display: "flex", gap: 1 }}>
									<TextField
										size="small"
										type="password"
										placeholder="sk-ant-..."
										value={apiKeyInput}
										onChange={(e) => setApiKeyInput(e.target.value)}
										sx={{ flex: 1 }}
									/>
									<Button
										variant="outlined"
										onClick={handleSaveApiKey}
										disabled={!apiKeyInput.trim() || updateMutation.isPending}
									>
										{config.hasApiKey ? "Update" : "Save"}
									</Button>
								</Box>
							</Box>
						)}

						{/* Model Selector */}
						<Box>
							<Typography variant="subtitle2" gutterBottom>
								Model
							</Typography>
							<TextField
								select
								size="small"
								value={config.model}
								onChange={(e) => handleModelChange(e.target.value)}
								disabled={updateMutation.isPending}
								sx={{ minWidth: 280 }}
							>
								{MODEL_OPTIONS.map((opt) => (
									<MenuItem key={opt.value} value={opt.value}>
										{opt.label}
									</MenuItem>
								))}
							</TextField>
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

function ProtonPassAuthCard() {
	const { user } = useAuthStore();
	const isSuperuser = user?.isSuperuser ?? false;
	const queryClient = useQueryClient();
	const [isPollingLogin, setIsPollingLogin] = useState(false);
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

	const loginMutation = useMutation({
		mutationFn: () => settingsApi.startProtonPassLogin(),
		onSuccess: (result) => {
			setLoginResult(result);
			if (result.success) {
				setIsPollingLogin(true);
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

	useEffect(() => {
		if (!isPollingLogin) return;
		const interval = setInterval(async () => {
			try {
				const fresh = await settingsApi.getProtonPassStatus();
				if (fresh.loggedIn) {
					setIsPollingLogin(false);
					setLoginResult({
						success: true,
						message: "Successfully logged in to Proton Pass",
					});
					notify.success("Successfully logged in to Proton Pass");
					queryClient.invalidateQueries({ queryKey: ["proton-pass-status"] });
				}
			} catch {
				/* ignore poll errors */
			}
		}, 4000);

		const timeout = setTimeout(() => {
			setIsPollingLogin(false);
			setLoginResult({
				success: false,
				message: "Login timed out. Please try again.",
			});
		}, 120_000);

		return () => {
			clearInterval(interval);
			clearTimeout(timeout);
		};
	}, [isPollingLogin, queryClient]);

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
				getApiErrorMessage(error, "Request failed"),
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
					<AgentConfigCard />

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
