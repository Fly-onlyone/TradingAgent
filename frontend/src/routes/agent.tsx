/**
 * Agent Chat Page with Session History and Decision Tracking
 */

import AnalyticsIcon from "@mui/icons-material/Analytics";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import HistoryIcon from "@mui/icons-material/History";
import LoginIcon from "@mui/icons-material/Login";
import LogoutIcon from "@mui/icons-material/Logout";
import MenuIcon from "@mui/icons-material/Menu";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PsychologyIcon from "@mui/icons-material/Psychology";
import SettingsIcon from "@mui/icons-material/Settings";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import {
	Alert,
	Badge,
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	CircularProgress,
	Divider,
	Drawer,
	IconButton,
	MenuItem,
	Slider,
	Tab,
	Tabs,
	TextField,
	ToggleButton,
	ToggleButtonGroup,
	Tooltip,
	Typography,
	useMediaQuery,
	useTheme,
} from "@mui/material";
import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import type { MouseEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { decisionsApi } from "@/api/endpoints/decisions";
import { sessionsApi } from "@/api/endpoints/sessions";
import type { AgentConfigUpdate } from "@/api/endpoints/settings";
import { settingsApi } from "@/api/endpoints/settings";
import {
	agentConfigQueryOptions,
	agentDecisionSymbolsQueryOptions,
	agentDecisionsQueryOptions,
	agentPendingDecisionsQueryOptions,
	agentSessionQueryOptions,
	agentSessionsGroupedQueryOptions,
} from "@/api/queryOptions/agent";
import { useAgentSocket } from "@/api/websocket/useAgentSocket";
import { AgentStatusBadge } from "@/components/agent/AgentStatusBadge";
import { ChatInput } from "@/components/agent/ChatInput";
import { ChatMessage } from "@/components/agent/ChatMessage";
import { DecisionCard } from "@/components/agent/DecisionCard";
import { DecisionHistoryPanel } from "@/components/agent/DecisionHistoryPanel";
import { SessionList } from "@/components/agent/SessionList";
import { ThinkingIndicator } from "@/components/agent/ThinkingIndicator";
import { EmptyState } from "@/components/common/EmptyState";
import { PageTransition } from "@/components/common/PageTransition";
import { useAgentStore } from "@/store/agentStore";
import { notify } from "@/store/uiStore";
import type { SessionMessage } from "@/types/session";
import { requireAuth } from "./-guards";

export const Route = createFileRoute("/agent")({
	beforeLoad: requireAuth,
	component: AgentPage,
});

/**
 * Inline agent configuration shown when agent is disconnected.
 */
function AgentSetupPanel() {
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

	const configQuery = useQuery(agentConfigQueryOptions());
	const modelOptionsQuery = useQuery({
		queryKey: ["agent-model-options"],
		queryFn: () => settingsApi.getAgentModels(),
		enabled: configQuery.isSuccess,
		staleTime: 300_000,
	});

	const updateMutation = useMutation({
		mutationFn: (update: AgentConfigUpdate) =>
			settingsApi.updateAgentConfig(update),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["agent-config"] });
			notify.success("Agent configuration updated");
			setTestResult(null);
		},
	});

	const testMutation = useMutation({
		mutationFn: () => settingsApi.testConnection(),
		onSuccess: (result) => {
			setTestResult(result);
			if (result.success) notify.success(result.message);
			else notify.error(result.message);
		},
	});

	const [isPollingLogin, setIsPollingLogin] = useState(false);

	const loginMutation = useMutation({
		mutationFn: () => settingsApi.startCLILogin(),
		onSuccess: (result) => {
			setLoginResult(result);
			if (result.success) {
				// Start polling for login completion
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
					void queryClient.invalidateQueries({ queryKey: ["agent-config"] });
				}
			} catch {
				/* ignore poll errors */
			}
		}, 4000);
		// Stop polling after 2 minutes
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
			void queryClient.invalidateQueries({ queryKey: ["agent-config"] });
			if (result.success) notify.success(result.message);
			else notify.error(result.message);
			setLoginResult(null);
		},
	});

	const config = configQuery.data;
	const resolvedModelOptions = config
		? (() => {
				const fetched = modelOptionsQuery.data ?? [];
				if (fetched.some((option) => option.value === config.model)) {
					return fetched;
				}
				return [{ value: config.model, label: config.model }, ...fetched];
			})()
		: [];

	const handleAuthModeChange = (
		_: MouseEvent<HTMLElement>,
		newMode: string | null,
	) => {
		if (newMode) updateMutation.mutate({ authMode: newMode });
	};

	const handleSaveApiKey = () => {
		if (apiKeyInput.trim()) {
			updateMutation.mutate({ apiKey: apiKeyInput.trim() });
			setApiKeyInput("");
		}
	};

	if (configQuery.isLoading || !config) {
		return (
			<Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
				<CircularProgress size={24} />
			</Box>
		);
	}

	if (configQuery.error) {
		return (
			<Alert severity="warning" sx={{ mx: 2 }}>
				Could not load agent configuration. Check your admin privileges.
			</Alert>
		);
	}

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

			<Box
				sx={{
					width: "100%",
					display: "flex",
					flexDirection: "column",
					gap: 2.5,
				}}
			>
				{/* Auth Mode */}
				<Box>
					<Typography variant="subtitle2" gutterBottom>
						Authentication Mode
					</Typography>
					<ToggleButtonGroup
						value={config.authMode}
						exclusive
						onChange={handleAuthModeChange}
						size="small"
						fullWidth
						disabled={updateMutation.isPending}
					>
						<ToggleButton value="subscription">
							Claude Subscription
						</ToggleButton>
						<ToggleButton value="api_key">API Key</ToggleButton>
					</ToggleButtonGroup>
					<Typography
						variant="caption"
						color="text.secondary"
						sx={{ mt: 0.5, display: "block" }}
					>
						{config.authMode === "subscription"
							? "Free with Claude Pro/Max subscription"
							: "Direct Anthropic API key — pay-per-use billing"}
					</Typography>
				</Box>

				{/* Subscription: CLI login */}
				{config.authMode === "subscription" && (
					<Box>
						<Box
							sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}
						>
							<Typography variant="subtitle2">CLI Status:</Typography>
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
									fullWidth
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
									<Alert severity="info" sx={{ fontSize: "0.8rem" }}>
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

				{/* API Key: input */}
				{config.authMode === "api_key" && (
					<Box>
						<Typography variant="subtitle2" gutterBottom>
							Anthropic API Key
						</Typography>
						{config.hasApiKey && (
							<Chip
								label={config.maskedApiKey}
								color="success"
								size="small"
								variant="outlined"
								sx={{ mb: 1, fontFamily: "monospace" }}
							/>
						)}
						<Box sx={{ display: "flex", gap: 1 }}>
							<TextField
								size="small"
								type="password"
								placeholder="sk-ant-..."
								value={apiKeyInput}
								onChange={(e) => setApiKeyInput(e.target.value)}
								sx={{ flex: 1 }}
								fullWidth
							/>
							<Button
								variant="outlined"
								onClick={handleSaveApiKey}
								disabled={!apiKeyInput.trim() || updateMutation.isPending}
							>
								Save
							</Button>
						</Box>
					</Box>
				)}

				{/* Model */}
				<Box>
					<Typography variant="subtitle2" gutterBottom>
						Model
					</Typography>
					<TextField
						select
						size="small"
						fullWidth
						value={config.model}
						onChange={(e) => updateMutation.mutate({ model: e.target.value })}
						disabled={updateMutation.isPending}
					>
						{resolvedModelOptions.map((opt) => (
							<MenuItem key={opt.value} value={opt.value}>
								{opt.label}
							</MenuItem>
						))}
					</TextField>
				</Box>

				{/* Thinking Budget */}
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

				{/* Test Connection */}
				<Button
					variant="contained"
					startIcon={
						testMutation.isPending ? (
							<CircularProgress size={16} />
						) : (
							<PlayArrowIcon />
						)
					}
					onClick={() => testMutation.mutate()}
					disabled={testMutation.isPending}
					fullWidth
				>
					Test Connection
				</Button>
				{testResult && (
					<Alert severity={testResult.success ? "success" : "error"}>
						{testResult.message}
					</Alert>
				)}
			</Box>
		</Box>
	);
}

// Sidebar tab type
type SidebarTab = "sessions" | "decisions";

function AgentPage() {
	const theme = useTheme();
	const isMobile = useMediaQuery(theme.breakpoints.down("md"));
	const isLargeScreen = useMediaQuery(theme.breakpoints.up("lg"));

	const messagesEndRef = useRef<HTMLDivElement>(null);
	const lastSessionInvalidateMessageRef = useRef<string | null>(null);
	const queryClient = useQueryClient();

	// Store state
	const {
		messages,
		status,
		isThinking,
		lastDecision,
		currentSessionId,
		sessionGroups,
		isLoadingSessions,
		decisions,
		decisionSymbols,
		decisionFilters,
		isLoadingDecisions,
		hasMoreDecisions,
		pendingDecisionsCount,
		currentTurnToolCalls,
		thinkingContent,
		showThinkingContent,
		toggleThinkingContent,
		setCurrentSessionId,
		setSessionGroups,
		setIsLoadingSessions,
		removeSession,
		updateSessionTitle,
		setMessages,
		clearMessages,
		setDecisions,
		appendDecisions,
		setDecisionSymbols,
		setDecisionFilters,
		setIsLoadingDecisions,
		setHasMoreDecisions,
		setPendingDecisionsCount,
		updateDecisionStatus,
	} = useAgentStore();

	// Local state
	const [sidebarTab, setSidebarTab] = useState<SidebarTab>("sessions");
	const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
	const [configDrawerOpen, setConfigDrawerOpen] = useState(false);
	const [decisionPage, setDecisionPage] = useState(1);
	const isDecisionsTabActive = sidebarTab === "decisions";

	// WebSocket connection
	const {
		isConnected,
		sendMessage,
		requestAnalysis,
		requestRecommendation,
		executeDecision,
	} = useAgentSocket();

	// Fetch sessions grouped by date
	const { data: sessionsData, isLoading: sessionsLoading } = useQuery(
		agentSessionsGroupedQueryOptions(50),
	);

	// Update store when sessions data changes
	useEffect(() => {
		if (sessionsData && sessionsData.groups !== sessionGroups) {
			setSessionGroups(sessionsData.groups);
		}

		if (isLoadingSessions !== sessionsLoading) {
			setIsLoadingSessions(sessionsLoading);
		}
	}, [
		sessionsData,
		sessionsLoading,
		sessionGroups,
		isLoadingSessions,
		setSessionGroups,
		setIsLoadingSessions,
	]);

	// Fetch decisions with filters only when the decisions tab is open
	const { data: decisionsData, isLoading: decisionsLoading } = useQuery({
		...agentDecisionsQueryOptions(decisionFilters, decisionPage, 20),
		placeholderData: keepPreviousData,
		enabled: isDecisionsTabActive,
	});

	// Fetch decision symbols for filter dropdown only when needed
	const { data: symbolsData } = useQuery({
		...agentDecisionSymbolsQueryOptions(),
		enabled: isDecisionsTabActive,
	});

	// Fetch pending decisions count
	const { data: pendingData } = useQuery({
		...agentPendingDecisionsQueryOptions(),
		refetchInterval: 30_000,
	});

	// Update store when decisions data changes
	useEffect(() => {
		if (decisionsData) {
			if (decisionPage === 1) {
				const samePageDecisions =
					decisions.length === decisionsData.decisions.length &&
					decisions.every(
						(decision, index) =>
							decision.id === decisionsData.decisions[index]?.id,
					);

				if (!samePageDecisions) {
					setDecisions(decisionsData.decisions);
				}
			} else {
				const newDecisions = decisionsData.decisions.filter(
					(incoming) =>
						!decisions.some((existing) => existing.id === incoming.id),
				);

				if (newDecisions.length > 0) {
					appendDecisions(newDecisions);
				}
			}

			const hasMore =
				decisionsData.total > decisionsData.page * decisionsData.pageSize;
			if (hasMoreDecisions !== hasMore) {
				setHasMoreDecisions(hasMore);
			}
		}

		if (isLoadingDecisions !== decisionsLoading) {
			setIsLoadingDecisions(decisionsLoading);
		}
	}, [
		decisionsData,
		decisions,
		decisionsLoading,
		decisionPage,
		hasMoreDecisions,
		isLoadingDecisions,
		setDecisions,
		appendDecisions,
		setHasMoreDecisions,
		setIsLoadingDecisions,
	]);

	useEffect(() => {
		if (!symbolsData) {
			return;
		}

		const sameSymbols =
			decisionSymbols.length === symbolsData.length &&
			decisionSymbols.every((symbol, index) => symbol === symbolsData[index]);

		if (!sameSymbols) {
			setDecisionSymbols(symbolsData);
		}
	}, [decisionSymbols, symbolsData, setDecisionSymbols]);

	useEffect(() => {
		if (pendingData && pendingData.total !== pendingDecisionsCount) {
			setPendingDecisionsCount(pendingData.total);
		}
	}, [pendingData, pendingDecisionsCount, setPendingDecisionsCount]);

	// Fetch session messages when session changes
	const sessionQuery = useQuery({
		...agentSessionQueryOptions(currentSessionId ?? ""),
		enabled: !!currentSessionId,
	});
	const sessionData = sessionQuery.data;

	// Load messages when session data changes
	useEffect(() => {
		if (!sessionData?.messages) {
			return;
		}

		// Convert session messages to agent message format
		const agentMessages = sessionData.messages.map(
			(msg: SessionMessage, index: number) => ({
				id: `${sessionData.id}-${index}`,
				role: msg.role,
				content: msg.content,
				timestamp: new Date(msg.timestamp).getTime(),
				decision: undefined,
				thinkingContent: msg.thinkingContent,
				toolCalls: msg.toolCalls?.map((tc, i) => ({
					id: `${sessionData.id}-${index}-tc-${i}`,
					name: tc.name,
					arguments: tc.arguments,
				})),
			}),
		);

		setMessages(agentMessages);
	}, [sessionData, setMessages]);

	// Refresh sidebar after each agent response to pick up auto-generated title
	useEffect(() => {
		const last = messages[messages.length - 1];
		if (
			last?.role === "assistant" &&
			last.id !== lastSessionInvalidateMessageRef.current
		) {
			lastSessionInvalidateMessageRef.current = last.id;
			void queryClient.invalidateQueries({
				queryKey: ["agent-sessions-grouped"],
			});
		}
	}, [messages, queryClient]);

	// Handle stale session ID on mount (deleted session)
	useEffect(() => {
		if (sessionQuery.error && currentSessionId) {
			setCurrentSessionId(null);
			clearMessages();
		}
	}, [
		sessionQuery.error,
		currentSessionId,
		setCurrentSessionId,
		clearMessages,
	]);

	// Mutations
	const deleteSessionMutation = useMutation({
		mutationFn: (sessionId: string) => sessionsApi.deleteSession(sessionId),
		onSuccess: (_, sessionId) => {
			removeSession(sessionId);
			void queryClient.invalidateQueries({
				queryKey: ["agent-sessions-grouped"],
			});
		},
	});

	const updateSessionMutation = useMutation({
		mutationFn: ({ sessionId, title }: { sessionId: string; title: string }) =>
			sessionsApi.updateSession(sessionId, { title }),
		onSuccess: (updatedSession) => {
			updateSessionTitle(updatedSession.id, updatedSession.title || "");
		},
	});

	const confirmDecisionMutation = useMutation({
		mutationFn: (decisionId: string) =>
			decisionsApi.confirmDecision(decisionId),
		onSuccess: (decision) => {
			updateDecisionStatus(decision.id, "confirmed");
			void queryClient.invalidateQueries({ queryKey: ["agent-decisions"] });
			void queryClient.invalidateQueries({
				queryKey: ["agent-decisions-pending"],
			});
		},
	});

	const rejectDecisionMutation = useMutation({
		mutationFn: (decisionId: string) => decisionsApi.rejectDecision(decisionId),
		onSuccess: (decision) => {
			updateDecisionStatus(decision.id, "rejected");
			void queryClient.invalidateQueries({ queryKey: ["agent-decisions"] });
			void queryClient.invalidateQueries({
				queryKey: ["agent-decisions-pending"],
			});
		},
	});

	const feedbackMutation = useMutation({
		mutationFn: ({
			decisionId,
			feedback,
		}: {
			decisionId: string;
			feedback: "thumbs_up" | "thumbs_down";
		}) => decisionsApi.addFeedback(decisionId, { feedback }),
	});

	// Handlers
	const handleSessionSelect = useCallback(
		(sessionId: string) => {
			setCurrentSessionId(sessionId);
			if (isMobile) {
				setMobileDrawerOpen(false);
			}
		},
		[setCurrentSessionId, isMobile],
	);

	const handleNewSession = useCallback(() => {
		// WHY: Don't create a backend session eagerly. Just clear the UI
		// so the user sees a blank chat. The backend will create the session
		// lazily when the first message is sent (via session_created WS event).
		setCurrentSessionId(null);
		clearMessages();
		if (isMobile) {
			setMobileDrawerOpen(false);
		}
	}, [setCurrentSessionId, clearMessages, isMobile]);

	const handleDeleteSession = useCallback(
		(sessionId: string) => {
			if (confirm("Are you sure you want to delete this conversation?")) {
				deleteSessionMutation.mutate(sessionId);
			}
		},
		[deleteSessionMutation],
	);

	const handleRenameSession = useCallback(
		(sessionId: string, newTitle: string) => {
			updateSessionMutation.mutate({ sessionId, title: newTitle });
		},
		[updateSessionMutation],
	);

	const handleFiltersChange = useCallback(
		(filters: typeof decisionFilters) => {
			setDecisionFilters(filters);
			setDecisionPage(1); // Reset to first page
		},
		[setDecisionFilters],
	);

	const handleLoadMoreDecisions = useCallback(() => {
		setDecisionPage((prev) => prev + 1);
	}, []);

	// Always start with a blank chat when navigating to the agent page
	useEffect(() => {
		setCurrentSessionId(null);
		clearMessages();
	}, [setCurrentSessionId, clearMessages]);

	// Auto-scroll to bottom on new messages or thinking state changes
	useEffect(() => {
		void messages.length;
		void isThinking;
		void currentTurnToolCalls.length;
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages.length, isThinking, currentTurnToolCalls.length]);

	// Sidebar content
	const sidebarContent = (
		<Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
			<Tabs
				value={sidebarTab}
				onChange={(_, value) => setSidebarTab(value)}
				variant="fullWidth"
				sx={{ borderBottom: 1, borderColor: "divider" }}
			>
				<Tab
					value="sessions"
					icon={<HistoryIcon fontSize="small" />}
					label="History"
					iconPosition="start"
					sx={{ minHeight: 48 }}
				/>
				<Tab
					value="decisions"
					icon={
						<Badge badgeContent={pendingDecisionsCount} color="warning">
							<AnalyticsIcon fontSize="small" />
						</Badge>
					}
					label="Decisions"
					iconPosition="start"
					sx={{ minHeight: 48 }}
				/>
			</Tabs>

			<Box sx={{ flex: 1, overflow: "hidden" }}>
				{sidebarTab === "sessions" ? (
					<SessionList
						groups={sessionGroups}
						currentSessionId={currentSessionId || undefined}
						isLoading={isLoadingSessions}
						onSessionSelect={handleSessionSelect}
						onNewSession={handleNewSession}
						onDeleteSession={handleDeleteSession}
						onRenameSession={handleRenameSession}
					/>
				) : (
					<DecisionHistoryPanel
						decisions={decisions}
						symbols={decisionSymbols}
						isLoading={isLoadingDecisions}
						hasMore={hasMoreDecisions}
						onLoadMore={handleLoadMoreDecisions}
						onConfirmDecision={(id) => confirmDecisionMutation.mutate(id)}
						onRejectDecision={(id) => rejectDecisionMutation.mutate(id)}
						onFeedback={(id, feedback) =>
							feedbackMutation.mutate({ decisionId: id, feedback })
						}
						filters={decisionFilters}
						onFiltersChange={handleFiltersChange}
					/>
				)}
			</Box>
		</Box>
	);

	return (
		<PageTransition pageKey="agent">
			<Box sx={{ height: "calc(100vh - 100px)", display: "flex", gap: 2 }}>
				{/* Mobile Drawer */}
				{isMobile && (
					<Drawer
						anchor="left"
						open={mobileDrawerOpen}
						onClose={() => setMobileDrawerOpen(false)}
						slotProps={{ paper: { sx: { width: 300 } } }}
					>
						{sidebarContent}
					</Drawer>
				)}

				{/* Desktop Left Sidebar - Session History */}
				{!isMobile && (
					<Card sx={{ width: 300, display: "flex", flexDirection: "column" }}>
						{sidebarContent}
					</Card>
				)}

				{/* Main Chat Area */}
				<Card sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
					{/* Header */}
					<Box
						sx={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							p: 2,
							borderBottom: 1,
							borderColor: "divider",
						}}
					>
						<Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
							{isMobile && (
								<IconButton
									onClick={() => setMobileDrawerOpen(true)}
									edge="start"
								>
									<MenuIcon />
								</IconButton>
							)}
							<SmartToyIcon sx={{ color: "primary.main" }} />
							<Box>
								<Typography variant="h6">Trading Agent</Typography>
								{currentSessionId && sessionData && (
									<Typography variant="caption" color="text.secondary">
										{sessionData.title || "New Chat"}
									</Typography>
								)}
							</Box>
						</Box>
						<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
							<AgentStatusBadge status={status} />
							<Tooltip
								title={showThinkingContent ? "Hide thinking" : "Show thinking"}
							>
								<IconButton
									onClick={toggleThinkingContent}
									size="small"
									color={showThinkingContent ? "primary" : "default"}
								>
									<PsychologyIcon fontSize="small" />
								</IconButton>
							</Tooltip>
							<IconButton
								onClick={() => setConfigDrawerOpen(true)}
								size="small"
								title="Agent Configuration"
							>
								<SettingsIcon fontSize="small" />
							</IconButton>
						</Box>
					</Box>

					{/* Agent Configuration Drawer */}
					<Drawer
						anchor="right"
						open={configDrawerOpen}
						onClose={() => setConfigDrawerOpen(false)}
						slotProps={{ paper: { sx: { width: { xs: "100%", sm: 420 } } } }}
					>
						<Box
							sx={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								p: 2,
								borderBottom: 1,
								borderColor: "divider",
							}}
						>
							<Typography variant="h6">Agent Configuration</Typography>
							<IconButton
								onClick={() => setConfigDrawerOpen(false)}
								size="small"
							>
								<MenuIcon fontSize="small" />
							</IconButton>
						</Box>
						<Box sx={{ overflow: "auto", flex: 1 }}>
							<AgentSetupPanel />
						</Box>
					</Drawer>

					{/* Messages */}
					<CardContent
						sx={{
							flex: 1,
							overflow: "auto",
							display: "flex",
							flexDirection: "column",
						}}
					>
						{messages.length === 0 ? (
							<EmptyState
								icon={<SmartToyIcon sx={{ fontSize: 64 }} />}
								title={
									status === "connected" || status === "thinking"
										? "Start a conversation"
										: status === "auth_required"
											? "Authentication required"
											: "Agent not connected"
								}
								description={
									status === "connected" || status === "thinking"
										? "Ask the trading agent for analysis, recommendations, or help with your trading decisions."
										: status === "auth_required"
											? "Click the gear icon above to configure authentication, then refresh."
											: "Check agent configuration via the gear icon above."
								}
							/>
						) : (
							messages.map((message) => (
								<ChatMessage
									key={message.id}
									message={message}
									showThinkingContent={showThinkingContent}
								/>
							))
						)}
						<AnimatePresence>
							{isThinking && (
								<ThinkingIndicator
									toolCalls={currentTurnToolCalls}
									thinkingContent={thinkingContent}
									showThinkingContent={showThinkingContent}
								/>
							)}
						</AnimatePresence>
						<div ref={messagesEndRef} />
					</CardContent>

					<Divider />

					{/* Input */}
					<Box
						sx={{
							p: 2,
							"& .MuiOutlinedInput-root:focus-within": {
								boxShadow: "0 0 0 3px rgba(249, 115, 22, 0.15)",
								borderRadius: 1,
							},
						}}
					>
						<ChatInput
							onSendMessage={sendMessage}
							onRequestAnalysis={requestAnalysis}
							onRequestRecommendation={requestRecommendation}
							isThinking={isThinking}
							disabled={!isConnected}
						/>
					</Box>
				</Card>

				{/* Desktop Right Sidebar - Latest Decision & Quick Prompts */}
				{isLargeScreen && (
					<Box
						sx={{
							width: 320,
							display: "flex",
							flexDirection: "column",
							gap: 2,
						}}
					>
						{/* Latest Decision */}
						<Card sx={{ p: 2 }}>
							<Typography variant="subtitle1" fontWeight={600} gutterBottom>
								Latest Decision
							</Typography>
							{lastDecision ? (
								<DecisionCard
									decision={lastDecision}
									onExecute={() => executeDecision(lastDecision)}
								/>
							) : (
								<Typography
									variant="body2"
									color="text.secondary"
									textAlign="center"
								>
									No recent decisions. Ask the agent for a recommendation.
								</Typography>
							)}
						</Card>

						{/* Quick Prompts */}
						<Card sx={{ p: 2, flex: 1, overflow: "auto" }}>
							<Typography variant="subtitle1" fontWeight={600} gutterBottom>
								Quick Prompts
							</Typography>
							<Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
								{[
									"Analyze BTC/USDT market conditions",
									"What is the current market sentiment?",
									"Should I buy or sell ETH right now?",
									"What are the key support and resistance levels?",
									"Summarize today's market news",
								].map((prompt) => (
									<Card
										key={prompt}
										component={motion.div}
										whileHover={{ x: 8 }}
										whileTap={{ scale: 0.98 }}
										onClick={() => sendMessage(prompt)}
										sx={{
											p: 1.5,
											cursor: "pointer",
											transition: "border-color 0.2s",
											"&:hover": {
												bgcolor: "action.hover",
												borderColor: "primary.main",
											},
										}}
									>
										<Typography variant="body2">{prompt}</Typography>
									</Card>
								))}
							</Box>
						</Card>
					</Box>
				)}
			</Box>
		</PageTransition>
	);
}
