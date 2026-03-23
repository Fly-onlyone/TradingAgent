/**
 * Shared Agent Configuration Panel
 * Used on both the Agent page (standalone) and Settings page (card variant).
 */

import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import LoginIcon from "@mui/icons-material/Login";
import LogoutIcon from "@mui/icons-material/Logout";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import {
	Alert,
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	CircularProgress,
	MenuItem,
	Slider,
	TextField,
	ToggleButton,
	ToggleButtonGroup,
	Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import type { AgentConfigUpdate } from "@/api/endpoints/settings";
import { settingsApi } from "@/api/endpoints/settings";
import { agentConfigQueryOptions } from "@/api/queryOptions/agent";
import { usePollingLogin } from "@/hooks/usePollingLogin";
import { useZoomAwareMenu } from "@/hooks/useZoomAwareMenu";
import { notify } from "@/store/uiStore";

interface AgentConfigPanelProps {
	/** "card" wraps in MUI Card with title header; "standalone" is bare. */
	variant?: "card" | "standalone";
	/** Show the thinking budget slider (agent page only). */
	showThinkingBudget?: boolean;
}

export function AgentConfigPanel({
	variant = "standalone",
	showThinkingBudget = false,
}: AgentConfigPanelProps) {
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
	const {
		anchorRef: modelFieldRef,
		handleClose: handleModelMenuClose,
		handleOpen: handleModelMenuOpen,
		menuProps: modelMenuProps,
		open: isModelMenuOpen,
	} = useZoomAwareMenu();

	const configQuery = useQuery(agentConfigQueryOptions());

	const modelOptionsQuery = useQuery({
		queryKey: ["agent-model-options"],
		queryFn: () => settingsApi.getAgentModels(),
		enabled: configQuery.isSuccess,
		staleTime: 60_000,
	});

	const updateMutation = useMutation({
		mutationFn: (update: AgentConfigUpdate) =>
			settingsApi.updateAgentConfig(update),
		onSuccess: (_, variables) => {
			void queryClient.invalidateQueries({ queryKey: ["agent-config"] });
			notify.success("Agent configuration updated");
			setTestResult(null);
			if (variables.apiKey !== undefined) {
				setApiKeyInput("");
			}
		},
		onError: () => {
			notify.error("Failed to update agent configuration");
		},
	});

	const testMutation = useMutation({
		mutationFn: () => settingsApi.testConnection(),
		onSuccess: (result) => {
			setTestResult(result);
			if (result.success) notify.success(result.message);
			else notify.error(result.message);
		},
		onError: () => {
			setTestResult({ success: false, message: "Test request failed" });
		},
	});

	const loginMutation = useMutation({
		mutationFn: () => settingsApi.startCLILogin(),
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
		mutationFn: () => settingsApi.cliLogout(),
		onSuccess: (result) => {
			void queryClient.invalidateQueries({ queryKey: ["agent-config"] });
			if (result.success) notify.success(result.message);
			else notify.error(result.message);
			setLoginResult(null);
		},
	});

	const { isPolling, startPolling } = usePollingLogin({
		pollFn: useCallback(async () => {
			const fresh = await settingsApi.getAgentConfig();
			return fresh.cliLoggedIn;
		}, []),
		onSuccess: useCallback(() => {
			setLoginResult({
				success: true,
				message: "Successfully logged in to Claude",
			});
			notify.success("Successfully logged in to Claude");
			void queryClient.invalidateQueries({ queryKey: ["agent-config"] });
		}, [queryClient]),
		onTimeout: useCallback(() => {
			setLoginResult({
				success: false,
				message: "Login timed out. Please try again.",
			});
		}, []),
	});

	const config = configQuery.data;
	const resolvedModelOptions = config
		? (() => {
				const fetched = modelOptionsQuery.data ?? [];
				if (fetched.some((opt) => opt.value === config.model)) return fetched;
				return [{ value: config.model, label: config.model }, ...fetched];
			})()
		: [];

	const handleAuthModeChange = (
		_: React.MouseEvent<HTMLElement>,
		newMode: string | null,
	) => {
		if (newMode) updateMutation.mutate({ authMode: newMode });
	};

	const handleSaveApiKey = () => {
		if (apiKeyInput.trim())
			updateMutation.mutate({ apiKey: apiKeyInput.trim() });
	};

	const handleClearApiKey = () => {
		updateMutation.mutate({ apiKey: "" });
	};

	const body = configQuery.isLoading ? (
		<Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
			<CircularProgress size={24} />
		</Box>
	) : configQuery.error ? (
		<Alert severity="error">Failed to load agent configuration</Alert>
	) : config ? (
		<Box
			sx={{
				display: "flex",
				flexDirection: "column",
				gap: variant === "standalone" ? 2.5 : 3,
			}}
		>
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
					fullWidth={variant === "standalone"}
					disabled={updateMutation.isPending}
				>
					<ToggleButton value="subscription">Claude Subscription</ToggleButton>
					<ToggleButton value="api_key">API Key</ToggleButton>
				</ToggleButtonGroup>
				<Typography
					variant={variant === "standalone" ? "caption" : "body2"}
					color="text.secondary"
					sx={{ mt: 0.5, display: "block" }}
				>
					{config.authMode === "subscription"
						? "Uses Claude Pro/Max subscription via CLI login (free with plan)"
						: "Uses a direct Anthropic API key (pay-per-use billing)"}
				</Typography>
			</Box>

			{/* Subscription: CLI login */}
			{config.authMode === "subscription" && (
				<Box>
					<Box
						sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}
					>
						<Typography variant="subtitle2">CLI Login Status</Typography>
						<Chip
							icon={config.cliLoggedIn ? <CheckCircleIcon /> : <ErrorIcon />}
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
						<Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
							<Button
								variant="contained"
								fullWidth={variant === "standalone"}
								startIcon={
									loginMutation.isPending || isPolling ? (
										<CircularProgress size={16} color="inherit" />
									) : (
										<LoginIcon />
									)
								}
								onClick={() => loginMutation.mutate()}
								disabled={loginMutation.isPending || isPolling}
							>
								{isPolling
									? "Waiting for login..."
									: loginMutation.isPending
										? "Opening browser..."
										: "Login with Claude"}
							</Button>
							{isPolling && (
								<Alert
									severity="info"
									sx={{
										fontSize: variant === "standalone" ? "0.8rem" : undefined,
									}}
								>
									Complete the login in your browser. This page will update
									automatically.
								</Alert>
							)}
							{loginResult && (
								<Alert severity={loginResult.success ? "success" : "error"}>
									{loginResult.message}
								</Alert>
							)}
						</Box>
					)}
				</Box>
			)}

			{/* API Key mode */}
			{config.authMode === "api_key" && (
				<Box>
					<Typography variant="subtitle2" gutterBottom>
						Anthropic API Key
					</Typography>
					{config.hasApiKey && (
						<Box
							sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}
						>
							{variant === "card" ? (
								<Typography
									variant="body2"
									fontFamily="monospace"
									color="text.secondary"
								>
									{config.maskedApiKey}
								</Typography>
							) : (
								<Chip
									label={config.maskedApiKey}
									color="success"
									size="small"
									variant="outlined"
									sx={{ fontFamily: "monospace" }}
								/>
							)}
							<Chip
								label="Configured"
								color="success"
								size="small"
								variant="outlined"
							/>
							<Button size="small" color="error" onClick={handleClearApiKey}>
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
							fullWidth={variant === "standalone"}
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
				<Box ref={modelFieldRef}>
					<TextField
						select
						size="small"
						fullWidth={variant === "standalone"}
						value={config.model}
						onChange={(e) => updateMutation.mutate({ model: e.target.value })}
						disabled={updateMutation.isPending}
						sx={{ minWidth: 280 }}
						SelectProps={{
							open: isModelMenuOpen,
							onOpen: handleModelMenuOpen,
							onClose: handleModelMenuClose,
							MenuProps: modelMenuProps,
						}}
					>
						{resolvedModelOptions.map((opt) => (
							<MenuItem key={opt.value} value={opt.value}>
								{opt.label}
							</MenuItem>
						))}
					</TextField>
				</Box>
			</Box>

			{/* Thinking Budget (agent page only) */}
			{showThinkingBudget && (
				<Box>
					<Typography variant="subtitle2" gutterBottom>
						Thinking Budget:{" "}
						{config.maxThinkingTokens === 0
							? "Disabled"
							: `${config.maxThinkingTokens.toLocaleString()} tokens`}
					</Typography>
					<Slider
						value={config.maxThinkingTokens}
						onChange={(_, value) =>
							updateMutation.mutate({ maxThinkingTokens: value as number })
						}
						min={0}
						max={50000}
						step={1000}
						marks={[
							{ value: 0, label: "Off" },
							{ value: 10000, label: "10k" },
							{ value: 25000, label: "25k" },
							{ value: 50000, label: "50k" },
						]}
						valueLabelDisplay="auto"
						valueLabelFormat={(v) =>
							v === 0 ? "Off" : `${(v / 1000).toFixed(0)}k`
						}
						disabled={updateMutation.isPending}
						size="small"
					/>
					<Typography variant="caption" color="text.secondary">
						Maximum tokens for agent reasoning. 0 = disabled.
					</Typography>
				</Box>
			)}

			{/* Test Connection */}
			<Box>
				<Button
					variant={variant === "standalone" ? "contained" : "outlined"}
					fullWidth={variant === "standalone"}
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
	) : null;

	if (variant === "card") {
		return (
			<Card sx={{ mb: 3 }}>
				<CardContent>
					<Typography variant="h6" gutterBottom>
						AI Agent Configuration
					</Typography>
					{body}
				</CardContent>
			</Card>
		);
	}

	// standalone variant — shown inside the agent config drawer
	return (
		<Box
			sx={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				gap: 3,
				py: 4,
				px: 3,
				maxWidth: 480,
				mx: "auto",
			}}
		>
			<SmartToyIcon sx={{ fontSize: 56, color: "text.secondary" }} />
			<Box sx={{ textAlign: "center" }}>
				<Typography variant="h6" gutterBottom>
					Configure AI Agent
				</Typography>
				<Typography variant="body2" color="text.secondary">
					Set up authentication to start chatting with the trading agent.
				</Typography>
			</Box>
			<Box sx={{ width: "100%" }}>{body}</Box>
		</Box>
	);
}

export default AgentConfigPanel;
