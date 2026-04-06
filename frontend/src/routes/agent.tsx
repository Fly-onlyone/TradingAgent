/**
 * Agent Chat Page with Session History and Decision Tracking
 */

import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import AnalyticsIcon from "@mui/icons-material/Analytics";
import BarChartIcon from "@mui/icons-material/BarChart";
import HistoryIcon from "@mui/icons-material/History";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import MenuIcon from "@mui/icons-material/Menu";
import PsychologyIcon from "@mui/icons-material/Psychology";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import TuneIcon from "@mui/icons-material/Tune";
import {
	Badge,
	Box,
	Card,
	CardContent,
	Divider,
	Drawer,
	Fab,
	Grid2 as Grid,
	IconButton,
	Tab,
	Tabs,
	Tooltip,
	Typography,
	useMediaQuery,
	useTheme,
} from "@mui/material";
import * as Sentry from "@sentry/react";
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
import { notificationsApi } from "@/api/endpoints/notifications";
import { sessionsApi } from "@/api/endpoints/sessions";
import {
	agentDecisionSymbolsQueryOptions,
	agentDecisionsQueryOptions,
	agentPendingDecisionsQueryOptions,
	agentSessionQueryOptions,
	agentSessionsGroupedQueryOptions,
} from "@/api/queryOptions/agent";
import { useAgentSocket } from "@/api/websocket/useAgentSocket";
import { AgentStatusBadge } from "@/components/agent/AgentStatusBadge";
import { AskUserBlock } from "@/components/agent/AskUserBlock";
import { ChatInput } from "@/components/agent/ChatInput";
import { ChatMessage } from "@/components/agent/ChatMessage";

import { DecisionHistoryPanel } from "@/components/agent/DecisionHistoryPanel";
import { SessionList } from "@/components/agent/SessionList";
import { ThinkingIndicator } from "@/components/agent/ThinkingIndicator";
import { PageTransition } from "@/components/common/PageTransition";
import { useAgentStore } from "@/store/agentStore";
import type { SessionMessage } from "@/types/session";
import {
	AGENT_SESSIONS_GROUP_LIMIT,
	isDraftSessionId,
	removeSessionFromGroups,
	renameSessionInGroups,
} from "@/utils/agentSessionsCache";
import { usePageVisibility } from "@/utils/animations/hooks";
import { requireAuth } from "./-guards";

export const Route = createFileRoute("/agent")({
	beforeLoad: requireAuth,
	component: AgentPage,
});

// Sidebar tab type
type SidebarTab = "sessions" | "decisions";

// Quick action cards for empty state
const quickActions = [
	{
		label: "Analyze Market",
		desc: "Run market analysis",
		icon: BarChartIcon,
	},
	{
		label: "Review Portfolio",
		desc: "Check current positions",
		icon: AccountBalanceWalletIcon,
	},
	{
		label: "Adjust Strategy",
		desc: "Optimize trading strategy",
		icon: TuneIcon,
	},
	{
		label: "Start Trading",
		desc: "Begin automated trading",
		icon: RocketLaunchIcon,
	},
] as const;

function AgentPage() {
	const theme = useTheme();
	const isMobile = useMediaQuery(theme.breakpoints.down("md"));
	const useDrawerSidebar = useMediaQuery(theme.breakpoints.down("lg"));
	const isPageVisible = usePageVisibility();

	// Prefetch notification settings so useAgentSocket can read from cache
	useQuery({
		queryKey: ["notification-settings"],
		queryFn: () => notificationsApi.getSettings(),
		staleTime: 5 * 60_000,
	});

	const messagesContainerRef = useRef<HTMLDivElement>(null);
	const shouldAutoScrollRef = useRef(true);
	const queryClient = useQueryClient();

	// Store state
	const {
		status,
		selectedSessionId,
		activeRunSessionId,
		sessionStates,
		decisions,
		decisionSymbols,
		decisionFilters,
		isLoadingDecisions,
		hasMoreDecisions,
		pendingDecisionsCount,
		showThinkingContent,
		toggleThinkingContent,
		setSelectedSessionId,
		removeSession,
		hydrateSessionMessages,
		setSessionPendingQuestion,
		setSessionTotalTokens,
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
	const [decisionPage, setDecisionPage] = useState(1);
	const [showScrollBottom, setShowScrollBottom] = useState(false);
	const isDecisionsTabActive = sidebarTab === "decisions";

	// WebSocket connection
	const {
		isConnected,
		sendMessage,
		requestAnalysis,
		requestRecommendation,
		requestStrategyReview,
		sendCancel,
		sendAnswer,
	} = useAgentSocket();

	const selectedSessionState = selectedSessionId
		? sessionStates[selectedSessionId]
		: undefined;
	const hasActiveRun = Boolean(activeRunSessionId);
	const messages = selectedSessionState?.messages ?? [];
	const isThinking = selectedSessionState?.isThinking ?? false;
	const currentTurnToolCalls = selectedSessionState?.currentTurnToolCalls ?? [];
	const pendingQuestion = selectedSessionState?.pendingQuestion ?? null;
	const thinkingContent = selectedSessionState?.thinkingContent ?? "";
	const streamingText = selectedSessionState?.streamingText ?? "";
	const activeRunIsCancelling = activeRunSessionId
		? (sessionStates[activeRunSessionId]?.isCancelling ?? false)
		: false;

	// Fetch sessions grouped by date
	const { data: sessionsData, isLoading: sessionsLoading } = useQuery(
		agentSessionsGroupedQueryOptions(AGENT_SESSIONS_GROUP_LIMIT),
	);
	const displayGroups = sessionsData?.groups ?? [];

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
		refetchInterval: isPageVisible && isDecisionsTabActive ? 30_000 : false,
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
		...agentSessionQueryOptions(selectedSessionId ?? ""),
		enabled: !!selectedSessionId && !isDraftSessionId(selectedSessionId),
	});
	const sessionData = sessionQuery.data;

	// Load messages when session data changes
	useEffect(() => {
		if (!sessionData?.messages || !selectedSessionId) {
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
					resultSummary: tc.resultSummary,
					executionTimeMs: tc.executionTimeMs,
				})),
			}),
		);

		hydrateSessionMessages(selectedSessionId, agentMessages);
		setSessionPendingQuestion(
			selectedSessionId,
			sessionData.pendingQuestion ?? null,
		);
		setSessionTotalTokens(selectedSessionId, sessionData.totalTokens);
	}, [
		hydrateSessionMessages,
		selectedSessionId,
		sessionData,
		setSessionPendingQuestion,
		setSessionTotalTokens,
	]);

	// Handle stale session ID on mount (deleted session)
	useEffect(() => {
		if (sessionQuery.error && selectedSessionId) {
			setSelectedSessionId(null);
		}
	}, [sessionQuery.error, selectedSessionId, setSelectedSessionId]);

	// Mutations
	const deleteSessionMutation = useMutation({
		mutationFn: (sessionId: string) => sessionsApi.deleteSession(sessionId),
		onSuccess: (_, sessionId) => {
			removeSession(sessionId);
			queryClient.setQueryData(
				agentSessionsGroupedQueryOptions(AGENT_SESSIONS_GROUP_LIMIT).queryKey,
				(current) => removeSessionFromGroups(current, sessionId),
			);
		},
	});

	const updateSessionMutation = useMutation({
		mutationFn: ({ sessionId, title }: { sessionId: string; title: string }) =>
			sessionsApi.updateSession(sessionId, { title }),
		onSuccess: (updatedSession) => {
			queryClient.setQueryData(
				agentSessionsGroupedQueryOptions(AGENT_SESSIONS_GROUP_LIMIT).queryKey,
				(current) =>
					renameSessionInGroups(
						current,
						updatedSession.id,
						updatedSession.title || "",
					),
			);
		},
	});

	const confirmDecisionMutation = useMutation({
		mutationFn: (decisionId: string) =>
			Sentry.startSpan({ name: "decision.confirm", op: "ui.action" }, () =>
				decisionsApi.confirmDecision(decisionId),
			),
		onSuccess: (decision) => {
			updateDecisionStatus(decision.id, "confirmed");
			void queryClient.invalidateQueries({ queryKey: ["agent-decisions"] });
			void queryClient.invalidateQueries({
				queryKey: ["agent-decisions-pending"],
			});
		},
	});

	const rejectDecisionMutation = useMutation({
		mutationFn: (decisionId: string) =>
			Sentry.startSpan({ name: "decision.reject", op: "ui.action" }, () =>
				decisionsApi.rejectDecision(decisionId),
			),
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
	const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
		const el = messagesContainerRef.current;
		if (!el) {
			return;
		}

		el.scrollTo({
			top: el.scrollHeight,
			behavior,
		});
	}, []);

	const prepareForAutoScroll = useCallback(() => {
		shouldAutoScrollRef.current = true;
		setShowScrollBottom(false);
	}, []);

	const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
		const el = e.currentTarget;
		const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
		shouldAutoScrollRef.current = isNearBottom;
		setShowScrollBottom(!isNearBottom);
	}, []);

	const handleSendMessage = useCallback(
		(content: string) => {
			prepareForAutoScroll();
			sendMessage(content);
		},
		[prepareForAutoScroll, sendMessage],
	);

	const handleRequestAnalysis = useCallback(
		(symbol?: string) => {
			prepareForAutoScroll();
			requestAnalysis(symbol);
		},
		[prepareForAutoScroll, requestAnalysis],
	);

	const handleRequestRecommendation = useCallback(() => {
		prepareForAutoScroll();
		requestRecommendation();
	}, [prepareForAutoScroll, requestRecommendation]);

	const handleRequestStrategyReview = useCallback(() => {
		prepareForAutoScroll();
		requestStrategyReview();
	}, [prepareForAutoScroll, requestStrategyReview]);

	const handleQuickAction = useCallback(
		(label: string) => {
			handleSendMessage(label);
		},
		[handleSendMessage],
	);

	const handleSessionSelect = useCallback(
		(sessionId: string) => {
			prepareForAutoScroll();
			setSelectedSessionId(sessionId);
			if (isMobile) {
				setMobileDrawerOpen(false);
			}
		},
		[prepareForAutoScroll, setSelectedSessionId, isMobile],
	);

	const handleNewSession = useCallback(() => {
		prepareForAutoScroll();
		setSelectedSessionId(null);
		if (isMobile) {
			setMobileDrawerOpen(false);
		}
	}, [prepareForAutoScroll, setSelectedSessionId, isMobile]);

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
		prepareForAutoScroll();
		setSelectedSessionId(null);
	}, [prepareForAutoScroll, setSelectedSessionId]);

	// Auto-scroll to bottom on new messages or thinking state changes
	useEffect(() => {
		if (
			messages.length === 0 &&
			!isThinking &&
			currentTurnToolCalls.length === 0
		) {
			return;
		}

		if (!shouldAutoScrollRef.current) {
			return;
		}

		scrollToBottom();
	}, [
		messages.length,
		isThinking,
		currentTurnToolCalls.length,
		scrollToBottom,
	]);

	const selectedSessionSummary = displayGroups
		.flatMap((group) => group.sessions)
		.find((session) => session.id === selectedSessionId);
	const selectedSessionTitle =
		sessionData?.title || selectedSessionSummary?.title || "New Chat";
	const selectedSessionTokens =
		selectedSessionState?.totalTokens ??
		sessionData?.totalTokens ??
		selectedSessionSummary?.totalTokens ??
		0;
	const selectedSessionModel = selectedSessionState?.sessionModel ?? null;

	// Sidebar content
	const sidebarContent = (
		<Box
			sx={{
				height: "100%",
				minHeight: 0,
				display: "flex",
				flexDirection: "column",
			}}
		>
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
					label="Pending Decisions"
					iconPosition="start"
					sx={{ minHeight: 48 }}
				/>
			</Tabs>

			<Box sx={{ flex: 1, overflow: "hidden" }}>
				{sidebarTab === "sessions" ? (
					<SessionList
						groups={displayGroups}
						currentSessionId={selectedSessionId || undefined}
						activeSessionId={activeRunSessionId || undefined}
						isLoading={sessionsLoading}
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
		<PageTransition pageKey="agent" heavy>
			<Box
				sx={{
					flex: 1,
					minHeight: 0,
					minWidth: 0,
					display: "flex",
					gap: { xs: 1.5, lg: 2 },
					overflow: "hidden",
				}}
			>
				{/* Mobile Drawer */}
				{useDrawerSidebar && (
					<Drawer
						anchor="left"
						open={mobileDrawerOpen}
						onClose={() => setMobileDrawerOpen(false)}
						slotProps={{
							paper: {
								sx: {
									width: { xs: "min(100vw, 360px)", sm: 320 },
								},
							},
						}}
					>
						{sidebarContent}
					</Drawer>
				)}

				{/* Desktop Left Sidebar - Session History */}
				{!useDrawerSidebar && (
					<Card
						sx={{
							width: 300,
							minWidth: 280,
							maxWidth: 320,
							flexShrink: 0,
							minHeight: 0,
							display: "flex",
							flexDirection: "column",
						}}
					>
						{sidebarContent}
					</Card>
				)}

				{/* Main Chat Area */}
				<Card
					sx={{
						flex: 1,
						minWidth: 0,
						minHeight: 0,
						display: "grid",
						gridTemplateRows: "auto minmax(0, 1fr) auto",
						overflow: "hidden",
					}}
				>
					{/* Header */}
					<Box
						sx={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: { xs: "flex-start", sm: "center" },
							flexWrap: "wrap",
							gap: 1.5,
							p: 2,
							borderBottom: 1,
							borderColor: "divider",
						}}
					>
						<Box
							sx={{
								display: "flex",
								alignItems: "center",
								gap: 1.5,
								minWidth: 0,
								flex: "1 1 320px",
							}}
						>
							{useDrawerSidebar && (
								<IconButton
									onClick={() => setMobileDrawerOpen(true)}
									edge="start"
								>
									<MenuIcon />
								</IconButton>
							)}
							<SmartToyIcon sx={{ color: "primary.main" }} />
							<Box sx={{ minWidth: 0 }}>
								<Typography variant="h6" noWrap>
									Trading agent
								</Typography>
								{selectedSessionId && (
									<Typography
										variant="caption"
										color="text.secondary"
										noWrap
										sx={{ display: "block" }}
									>
										{selectedSessionTitle}
									</Typography>
								)}
							</Box>
						</Box>
						<Box
							sx={{
								display: "flex",
								alignItems: "center",
								justifyContent: "flex-end",
								gap: 1,
								flexWrap: "wrap",
								flex: "0 1 auto",
								width: { xs: "100%", sm: "auto" },
							}}
						>
							<AgentStatusBadge status={status} />
							<Tooltip
								title={showThinkingContent ? "Hide thinking" : "Show thinking"}
								arrow
								placement="bottom"
							>
								<IconButton
									onClick={toggleThinkingContent}
									size="small"
									color={showThinkingContent ? "primary" : "default"}
								>
									<PsychologyIcon fontSize="small" />
								</IconButton>
							</Tooltip>
						</Box>
					</Box>

					{/* Messages */}
					<CardContent
						ref={messagesContainerRef}
						onScroll={handleScroll}
						sx={{
							flex: 1,
							minHeight: 0,
							overflow: "auto",
							display: "flex",
							flexDirection: "column",
							position: "relative",
						}}
					>
						{messages.length === 0 && !isThinking ? (
							<Box
								sx={{
									display: "flex",
									flexDirection: "column",
									alignItems: "center",
									justifyContent: "center",
									flex: 1,
									minHeight: 0,
									p: { xs: 2.5, sm: 4 },
								}}
							>
								<SmartToyIcon
									sx={{
										fontSize: 48,
										color: "primary.main",
										mb: 2,
										opacity: 0.6,
									}}
								/>
								<Typography variant="h6" sx={{ mb: 1 }}>
									Trading agent
								</Typography>
								<Typography
									variant="body2"
									color="text.secondary"
									sx={{ mb: 4, textAlign: "center" }}
								>
									{status === "connected" || status === "thinking"
										? "Your AI assistant for automated trading"
										: status === "auth_required"
											? "Configure authentication in Settings, then refresh."
											: "Check agent configuration in the Settings page."}
								</Typography>
								{(status === "connected" || status === "thinking") && (
									<Grid
										container
										spacing={2}
										sx={{ width: "100%", maxWidth: 500 }}
									>
										{quickActions.map((action) => {
											const Icon = action.icon;
											return (
												<Grid size={{ xs: 12, sm: 6 }} key={action.label}>
													<Card
														sx={{
															cursor: hasActiveRun ? "default" : "pointer",
															textAlign: "center",
															p: 2,
															opacity: hasActiveRun ? 0.6 : 1,
															transition: "transform 0.2s, box-shadow 0.2s",
															"&:hover": {
																transform: hasActiveRun
																	? "none"
																	: "translateY(-2px)",
																boxShadow: hasActiveRun
																	? "none"
																	: (t) => t.trading.glow.primary,
															},
														}}
														onClick={() => {
															if (!hasActiveRun) {
																handleQuickAction(action.label);
															}
														}}
													>
														<Box sx={{ mb: 0.5 }}>
															<Icon
																sx={{ fontSize: 32, color: "primary.main" }}
															/>
														</Box>
														<Typography variant="body2" fontWeight={600}>
															{action.label}
														</Typography>
														<Typography
															variant="caption"
															color="text.secondary"
														>
															{action.desc}
														</Typography>
													</Card>
												</Grid>
											);
										})}
									</Grid>
								)}
							</Box>
						) : (
							messages.map((message) => (
								<ChatMessage
									key={message.id}
									message={message}
									showThinkingContent={showThinkingContent}
								/>
							))
						)}
						{streamingText && (
							<ChatMessage
								key="streaming"
								message={{
									id: "streaming",
									role: "assistant",
									content: streamingText,
									timestamp: Date.now(),
								}}
								showThinkingContent={false}
								isStreaming
							/>
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
						{/* Scroll to bottom FAB */}
						{showScrollBottom && (
							<Fab
								size="small"
								color="primary"
								onClick={() => {
									prepareForAutoScroll();
									scrollToBottom("smooth");
								}}
								sx={{
									position: "sticky",
									bottom: 16,
									alignSelf: "center",
									zIndex: 10,
								}}
								aria-label="Scroll to bottom"
							>
								<KeyboardArrowDownIcon />
							</Fab>
						)}
					</CardContent>

					<Divider />

					{/* Agent question (interactive menu) */}
					{pendingQuestion && (
						<AskUserBlock
							key={pendingQuestion.id}
							question={pendingQuestion}
							onAnswer={(answer) =>
								sendAnswer(
									pendingQuestion.id,
									answer,
									pendingQuestion.sessionId,
								)
							}
						/>
					)}

					{/* Input */}
					<Box sx={{ p: 2, flexShrink: 0 }}>
						<ChatInput
							onSendMessage={handleSendMessage}
							onRequestAnalysis={handleRequestAnalysis}
							onRequestRecommendation={handleRequestRecommendation}
							onRequestStrategyReview={handleRequestStrategyReview}
							onCancel={sendCancel}
							isThinking={hasActiveRun}
							isCancelling={activeRunIsCancelling}
							disabled={!isConnected}
							totalTokens={selectedSessionTokens}
							sessionModel={selectedSessionModel}
						/>
					</Box>
				</Card>
			</Box>
		</PageTransition>
	);
}
