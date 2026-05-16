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
import type { AgentConfig, AgentConfigUpdate } from "@/api/endpoints/settings";
import { settingsApi } from "@/api/endpoints/settings";
import { agentConfigQueryOptions } from "@/api/queryOptions/agent";
import { ZoomAwareSelect } from "@/components/common/ZoomAwareSelect";
import { usePollingLogin } from "@/hooks/usePollingLogin";
import { useRecoverableQueryState } from "@/hooks/useRecoverableQueryState";
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
	const [openaiKeyInput, setOpenaiKeyInput] = useState("");
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

	const configQuery = useQuery({
		...agentConfigQueryOptions(),
		refetchOnMount: "always",
	});
	const configQueryState = useRecoverableQueryState(configQuery, {
		hasData: configQuery.data !== undefined,
	});

	const modelOptionsQuery = useQuery({
		queryKey: ["agent-model-options"],
		queryFn: () => settingsApi.getAgentModels(),
		enabled: configQuery.isSuccess,
		staleTime: 60_000,
		refetchOnMount: "always",
	});

	const providerOptionsQuery = useQuery({
		queryKey: ["agent-provider-options"],
		queryFn: () => settingsApi.getAgentProviders(),
		enabled: configQuery.isSuccess,
		staleTime: 5 * 60_000,
	});

	const updateMutation = useMutation({
		mutationFn: (update: AgentConfigUpdate) =>
			settingsApi.updateAgentConfig(update),
		onMutate: async (update) => {
			await queryClient.cancelQueries({ queryKey: ["agent-config"] });
			const previousConfig = queryClient.getQueryData<AgentConfig>([
				"agent-config",
			]);

			if (previousConfig) {
				queryClient.setQueryData<AgentConfig>(["agent-config"], {
					...previousConfig,
					...(update.provider !== undefined
						? { provider: update.provider }
						: {}),
					...(update.authMode !== undefined
						? { authMode: update.authMode }
						: {}),
					...(update.model !== undefined ? { model: update.model } : {}),
					...(update.thinkingMode !== undefined
						? { thinkingMode: update.thinkingMode }
						: {}),
					...(update.thinkingBudget !== undefined
						? { thinkingBudget: update.thinkingBudget }
						: {}),
					...(update.effort !== undefined ? { effort: update.effort } : {}),
					...(update.apiKey !== undefined
						? {
								hasApiKey: update.apiKey.trim().length > 0,
								maskedApiKey:
									update.apiKey.trim().length > 0
										? previousConfig.maskedApiKey || "Configured"
										: "",
							}
						: {}),
					...(update.openaiApiKey !== undefined
						? {
								hasOpenaiApiKey: update.openaiApiKey.trim().length > 0,
								maskedOpenaiApiKey:
									update.openaiApiKey.trim().length > 0
										? previousConfig.maskedOpenaiApiKey || "Configured"
										: "",
							}
						: {}),
				});
			}

			return { previousConfig };
		},
		onSuccess: (updatedConfig, variables) => {
			queryClient.setQueryData<AgentConfig>(["agent-config"], updatedConfig);
			// Provider switch may have reset the model server-side; refresh
			// the model option list so the dropdown reflects the new family.
			if (variables.provider !== undefined) {
				void queryClient.invalidateQueries({
					queryKey: ["agent-model-options"],
				});
			}
			notify.success("Agent configuration updated");
			setTestResult(null);
			if (variables.apiKey !== undefined) {
				setApiKeyInput("");
			}
			if (variables.openaiApiKey !== undefined) {
				setOpenaiKeyInput("");
			}
		},
		onError: (_, __, context) => {
			if (context?.previousConfig) {
				queryClient.setQueryData(["agent-config"], context.previousConfig);
			}
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
	const currentProvider = config?.provider ?? "anthropic";
	const resolvedModelOptions = config
		? (() => {
				const fetched = (modelOptionsQuery.data ?? []).filter(
					(opt) => opt.provider === currentProvider,
				);
				if (fetched.some((opt) => opt.value === config.model)) return fetched;
				return [
					{
						provider: currentProvider,
						value: config.model,
						label: config.model,
					},
					...fetched,
				];
			})()
		: [];
	const providerOptions = providerOptionsQuery.data ?? [
		{ value: "anthropic", label: "Anthropic (Claude)" },
		{ value: "openai", label: "OpenAI (GPT)" },
	];

	const handleAuthModeChange = (
		_: React.MouseEvent<HTMLElement>,
		newMode: string | null,
	) => {
		if (newMode) updateMutation.mutate({ authMode: newMode });
	};

	const handleProviderChange = (value: string) => {
		if (value) updateMutation.mutate({ provider: value });
	};

	const handleSaveApiKey = () => {
		if (apiKeyInput.trim())
			updateMutation.mutate({ apiKey: apiKeyInput.trim() });
	};

	const handleClearApiKey = () => {
		updateMutation.mutate({ apiKey: "" });
	};

	const handleSaveOpenaiKey = () => {
		if (openaiKeyInput.trim())
			updateMutation.mutate({ openaiApiKey: openaiKeyInput.trim() });
	};

	const handleClearOpenaiKey = () => {
		updateMutation.mutate({ openaiApiKey: "" });
	};

	const body = configQueryState.isLoading ? (
		<Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
			<CircularProgress size={24} />
		</Box>
	) : configQueryState.showError ? (
		<Alert severity="error">Failed to load agent configuration</Alert>
	) : config ? (
		<Box
			sx={{
				display: "flex",
				flexDirection: "column",
				gap: variant === "standalone" ? 2.5 : 3,
			}}
		>
			{/* Provider Selector — Anthropic vs OpenAI */}
			<Box>
				<Typography variant="subtitle2" gutterBottom>
					Provider
				</Typography>
				<ZoomAwareSelect
					value={currentProvider}
					size="small"
					onChange={(event) =>
						handleProviderChange(event.target.value as string)
					}
					disabled={updateMutation.isPending}
				>
					{providerOptions.map((opt) => (
						<MenuItem key={opt.value} value={opt.value}>
							{opt.label}
						</MenuItem>
					))}
				</ZoomAwareSelect>
				<Typography
					variant={variant === "standalone" ? "caption" : "body2"}
					color="text.secondary"
					sx={{ mt: 0.5, display: "block" }}
				>
					{currentProvider === "openai"
						? "Routes the trading agent and side services through OpenAI."
						: "Routes the trading agent and side services through Anthropic Claude."}
				</Typography>
			</Box>

			{/* Auth Mode Toggle — Anthropic only */}
			{currentProvider === "anthropic" && (
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
						<ToggleButton value="subscription">
							Claude Subscription
						</ToggleButton>
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
			)}

			{/* OpenAI API key — only when provider is OpenAI */}
			{currentProvider === "openai" && (
				<Box>
					<Typography variant="subtitle2" gutterBottom>
						OpenAI API Key
					</Typography>
					{config.hasOpenaiApiKey && (
						<Box
							sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}
						>
							<Chip
								label={config.maskedOpenaiApiKey || "Configured"}
								color="success"
								size="small"
								variant="outlined"
								sx={{ fontFamily: "monospace" }}
							/>
							<Button size="small" color="error" onClick={handleClearOpenaiKey}>
								Clear
							</Button>
						</Box>
					)}
					<Box sx={{ display: "flex", gap: 1 }}>
						<TextField
							size="small"
							type="password"
							placeholder="sk-..."
							value={openaiKeyInput}
							onChange={(e) => setOpenaiKeyInput(e.target.value)}
							sx={{ flex: 1 }}
							fullWidth={variant === "standalone"}
						/>
						<Button
							variant="outlined"
							onClick={handleSaveOpenaiKey}
							disabled={!openaiKeyInput.trim() || updateMutation.isPending}
						>
							{config.hasOpenaiApiKey ? "Update" : "Save"}
						</Button>
					</Box>
					<Typography
						variant="caption"
						color="text.secondary"
						sx={{ mt: 0.5, display: "block" }}
					>
						OpenAI has no subscription fallback — an API key is required.
					</Typography>
				</Box>
			)}

			{/* Subscription: CLI login (Anthropic only) */}
			{currentProvider === "anthropic" &&
				config.authMode === "subscription" && (
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

			{/* API Key mode (Anthropic only) */}
			{currentProvider === "anthropic" && config.authMode === "api_key" && (
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

			{/* Thinking Mode (agent page only) */}
			{showThinkingBudget && (
				<Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
					<Box>
						<Typography variant="subtitle2" gutterBottom>
							Thinking Mode
						</Typography>
						<ToggleButtonGroup
							value={config.thinkingMode}
							exclusive
							onChange={(_, value) => {
								if (value !== null)
									updateMutation.mutate({ thinkingMode: value });
							}}
							size="small"
							fullWidth
							disabled={updateMutation.isPending}
						>
							<ToggleButton value="adaptive">Adaptive</ToggleButton>
							<ToggleButton value="enabled">Budget</ToggleButton>
							<ToggleButton value="disabled">Off</ToggleButton>
						</ToggleButtonGroup>
						<Typography
							variant="caption"
							color="text.secondary"
							sx={{ mt: 0.5 }}
						>
							{config.thinkingMode === "adaptive" &&
								"Claude decides when and how much to think (recommended)."}
							{config.thinkingMode === "enabled" &&
								"Fixed token budget for reasoning."}
							{config.thinkingMode === "disabled" &&
								"Extended thinking is disabled."}
						</Typography>
					</Box>
					{config.thinkingMode === "enabled" && (
						<Box>
							<Typography variant="subtitle2" gutterBottom>
								Thinking Budget:{" "}
								{`${config.thinkingBudget.toLocaleString()} tokens`}
							</Typography>
							<Slider
								value={config.thinkingBudget}
								onChange={(_, value) =>
									updateMutation.mutate({
										thinkingBudget: value as number,
									})
								}
								min={1000}
								max={50000}
								step={1000}
								marks={[
									{ value: 1000, label: "1k" },
									{ value: 10000, label: "10k" },
									{ value: 25000, label: "25k" },
									{ value: 50000, label: "50k" },
								]}
								valueLabelDisplay="auto"
								valueLabelFormat={(v) => `${(v / 1000).toFixed(0)}k`}
								disabled={updateMutation.isPending}
								size="small"
							/>
						</Box>
					)}
					{/* Effort Level */}
					<Box>
						<Typography variant="subtitle2" gutterBottom>
							Effort Level
						</Typography>
						<ToggleButtonGroup
							value={config.effort}
							exclusive
							onChange={(_, value) => {
								if (value !== null) updateMutation.mutate({ effort: value });
							}}
							size="small"
							fullWidth
							disabled={updateMutation.isPending}
						>
							<ToggleButton value="low">Low</ToggleButton>
							<ToggleButton value="medium">Medium</ToggleButton>
							<ToggleButton value="high">High</ToggleButton>
							<ToggleButton value="max">Max</ToggleButton>
						</ToggleButtonGroup>
						<Typography
							variant="caption"
							color="text.secondary"
							sx={{ mt: 0.5 }}
						>
							Controls the depth and intensity of reasoning.
						</Typography>
					</Box>
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
