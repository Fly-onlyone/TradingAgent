/**
 * Agent Chat Page with Session History and Decision Tracking
 */

import AnalyticsIcon from "@mui/icons-material/Analytics";
import HistoryIcon from "@mui/icons-material/History";
import MenuIcon from "@mui/icons-material/Menu";
import PsychologyIcon from "@mui/icons-material/Psychology";
import SettingsIcon from "@mui/icons-material/Settings";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import {
	Badge,
	Box,
	Card,
	CardContent,
	Chip,
	Divider,
	Drawer,
	IconButton,
	Tab,
	Tabs,
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
import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { decisionsApi } from "@/api/endpoints/decisions";
import { sessionsApi } from "@/api/endpoints/sessions";
import {
	agentDecisionSymbolsQueryOptions,
	agentDecisionsQueryOptions,
	agentPendingDecisionsQueryOptions,
	agentSessionQueryOptions,
	agentSessionsGroupedQueryOptions,
} from "@/api/queryOptions/agent";
import { useAgentSocket } from "@/api/websocket/useAgentSocket";
import { AgentConfigPanel } from "@/components/agent/AgentConfigPanel";
import { AgentStatusBadge } from "@/components/agent/AgentStatusBadge";
import { ChatInput } from "@/components/agent/ChatInput";
import { ChatMessage } from "@/components/agent/ChatMessage";

import { DecisionHistoryPanel } from "@/components/agent/DecisionHistoryPanel";
import { SessionList } from "@/components/agent/SessionList";
import { ThinkingIndicator } from "@/components/agent/ThinkingIndicator";
import { EmptyState } from "@/components/common/EmptyState";
import { PageTransition } from "@/components/common/PageTransition";
import { useAgentStore } from "@/store/agentStore";
import type { SessionMessage } from "@/types/session";
import { requireAuth } from "./-guards";

export const Route = createFileRoute("/agent")({
	beforeLoad: requireAuth,
	component: AgentPage,
});

// Sidebar tab type
type SidebarTab = "sessions" | "decisions";

function AgentPage() {
	const theme = useTheme();
	const isMobile = useMediaQuery(theme.breakpoints.down("md"));

	const messagesEndRef = useRef<HTMLDivElement>(null);
	const lastSessionInvalidateMessageRef = useRef<string | null>(null);
	const queryClient = useQueryClient();

	// Store state
	const {
		messages,
		status,
		isThinking,
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
	const { isConnected, sendMessage, requestAnalysis, requestRecommendation } =
		useAgentSocket();

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
						slotProps={{ paper: { sx: { width: 280 } } }}
					>
						{sidebarContent}
					</Drawer>
				)}

				{/* Desktop Left Sidebar - Session History */}
				{!isMobile && (
					<Card sx={{ width: 280, display: "flex", flexDirection: "column" }}>
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
							<AgentConfigPanel showThinkingBudget />
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

					{/* Quick Prompts */}
					<Box
						sx={{
							px: 2,
							pt: 1.5,
							display: "flex",
							flexWrap: "wrap",
							gap: 0.75,
						}}
					>
						{[
							"Analyze BTC/USDT market",
							"Current market sentiment?",
							"Buy or sell ETH now?",
							"Support & resistance levels",
							"Today's market news",
						].map((prompt) => (
							<Chip
								key={prompt}
								label={prompt}
								size="small"
								variant="outlined"
								onClick={() => sendMessage(prompt)}
								sx={{
									cursor: "pointer",
									borderColor: "rgba(249,115,22,0.3)",
									color: "text.secondary",
									fontSize: "0.7rem",
									"&:hover": {
										borderColor: "primary.main",
										color: "primary.main",
										bgcolor: "rgba(249,115,22,0.08)",
									},
								}}
							/>
						))}
					</Box>

					{/* Input */}
					<Box
						sx={{
							p: 2,
							pt: 1,
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
			</Box>
		</PageTransition>
	);
}
