/**
 * Agent Chat Page with Session History and Decision Tracking
 */

import {
	BarChart3,
	Bot,
	Brain,
	ChevronDown,
	History,
	LineChart,
	Menu,
	Rocket,
	Settings,
	SlidersHorizontal,
	Wallet,
	X,
} from "lucide-react";
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
import { sessionsApi } from "@/api/endpoints/sessions";
import {
	agentDecisionsQueryOptions,
	agentDecisionSymbolsQueryOptions,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { PageTransition } from "@/components/common/PageTransition";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/store/agentStore";
import type { SessionMessage } from "@/types/session";
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
		icon: BarChart3,
	},
	{
		label: "Review Portfolio",
		desc: "Check current positions",
		icon: Wallet,
	},
	{
		label: "Adjust Strategy",
		desc: "Optimize trading strategy",
		icon: SlidersHorizontal,
	},
	{
		label: "Start Trading",
		desc: "Begin automated trading",
		icon: Rocket,
	},
] as const;

function AgentPage() {
	const isMobile = useMediaQuery("(max-width: 767px)");
	const useDrawerSidebar = useMediaQuery("(max-width: 1023px)");

	const messagesContainerRef = useRef<HTMLDivElement>(null);
	const shouldAutoScrollRef = useRef(true);
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
		streamingText,
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
	const [showScrollBottom, setShowScrollBottom] = useState(false);
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
		mutationFn: ({
			sessionId,
			title,
		}: { sessionId: string; title: string }) =>
			sessionsApi.updateSession(sessionId, { title }),
		onSuccess: (updatedSession) => {
			updateSessionTitle(updatedSession.id, updatedSession.title || "");
		},
	});

	const confirmDecisionMutation = useMutation({
		mutationFn: (decisionId: string) =>
			Sentry.startSpan(
				{ name: "decision.confirm", op: "ui.action" },
				() => decisionsApi.confirmDecision(decisionId),
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
			Sentry.startSpan(
				{ name: "decision.reject", op: "ui.action" },
				() => decisionsApi.rejectDecision(decisionId),
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

	const handleQuickAction = useCallback(
		(label: string) => {
			handleSendMessage(label);
		},
		[handleSendMessage],
	);

	const handleSessionSelect = useCallback(
		(sessionId: string) => {
			prepareForAutoScroll();
			setCurrentSessionId(sessionId);
			if (isMobile) {
				setMobileDrawerOpen(false);
			}
		},
		[prepareForAutoScroll, setCurrentSessionId, isMobile],
	);

	const handleNewSession = useCallback(() => {
		// WHY: Don't create a backend session eagerly. Just clear the UI
		// so the user sees a blank chat. The backend will create the session
		// lazily when the first message is sent (via session_created WS event).
		prepareForAutoScroll();
		setCurrentSessionId(null);
		clearMessages();
		if (isMobile) {
			setMobileDrawerOpen(false);
		}
	}, [prepareForAutoScroll, setCurrentSessionId, clearMessages, isMobile]);

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
		setCurrentSessionId(null);
		clearMessages();
	}, [prepareForAutoScroll, setCurrentSessionId, clearMessages]);

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

	// Sidebar content
	const sidebarContent = (
		<div className="flex h-full min-h-0 flex-col">
			<Tabs
				value={sidebarTab}
				onValueChange={(value) => setSidebarTab(value as SidebarTab)}
			>
				<TabsList
					variant="line"
					className="w-full border-b border-border"
				>
					<TabsTrigger value="sessions" className="min-h-10 flex-1">
						<History className="size-4" />
						History
					</TabsTrigger>
					<TabsTrigger value="decisions" className="min-h-10 flex-1">
						<div className="relative inline-flex">
							<LineChart className="size-4" />
							{pendingDecisionsCount > 0 && (
								<span className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
									{pendingDecisionsCount}
								</span>
							)}
						</div>
						Pending Decisions
					</TabsTrigger>
				</TabsList>
			</Tabs>

			<div className="flex-1 overflow-hidden">
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
			</div>
		</div>
	);

	return (
		<PageTransition pageKey="agent">
			<div className="flex min-h-0 min-w-0 flex-1 gap-3 overflow-hidden lg:gap-4">
				{/* Mobile Sheet */}
				{useDrawerSidebar && (
					<Sheet
						open={mobileDrawerOpen}
						onOpenChange={setMobileDrawerOpen}
					>
						<SheetContent
							side="left"
							className="w-[min(100vw,360px)] p-0 sm:w-80"
							showCloseButton={false}
						>
							<SheetHeader className="sr-only">
								<SheetTitle>Sidebar</SheetTitle>
							</SheetHeader>
							{sidebarContent}
						</SheetContent>
					</Sheet>
				)}

				{/* Desktop Left Sidebar - Session History */}
				{!useDrawerSidebar && (
					<Card className="flex min-h-0 w-[300px] min-w-[280px] max-w-[320px] shrink-0 flex-col gap-0 py-0">
						{sidebarContent}
					</Card>
				)}

				{/* Main Chat Area */}
				<Card className="grid min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden py-0">
					{/* Header */}
					<div className="flex flex-wrap items-start gap-3 border-b border-border p-4 sm:items-center">
						<div className="flex min-w-0 flex-[1_1_320px] items-center gap-3">
							{useDrawerSidebar && (
								<Button
									variant="ghost"
									size="icon"
									onClick={() => setMobileDrawerOpen(true)}
								>
									<Menu className="size-5" />
								</Button>
							)}
							<Bot className="size-5 text-primary" />
							<div className="min-w-0">
								<h2 className="truncate text-lg font-semibold">
									Trading Agent
								</h2>
								{currentSessionId && sessionData && (
									<p className="block truncate text-xs text-muted-foreground">
										{sessionData.title || "New Chat"}
									</p>
								)}
							</div>
						</div>
						<div className="flex flex-[0_1_auto] flex-wrap items-center justify-end gap-2 max-sm:w-full">
							<AgentStatusBadge status={status} />
							<Tooltip>
								<TooltipTrigger
									render={
										<Button
											variant="ghost"
											size="icon-sm"
											onClick={toggleThinkingContent}
											className={cn(
												showThinkingContent && "text-primary",
											)}
										>
											<Brain className="size-4" />
										</Button>
									}
								/>
								<TooltipContent>
									{showThinkingContent
										? "Hide thinking"
										: "Show thinking"}
								</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger
									render={
										<Button
											variant="ghost"
											size="icon-sm"
											onClick={() => setConfigDrawerOpen(true)}
										>
											<Settings className="size-4" />
										</Button>
									}
								/>
								<TooltipContent side="bottom">
									Agent Configuration
								</TooltipContent>
							</Tooltip>
						</div>
					</div>

					{/* Agent Configuration Sheet */}
					<Sheet
						open={configDrawerOpen}
						onOpenChange={setConfigDrawerOpen}
					>
						<SheetContent
							side="right"
							className="w-full p-0 sm:w-[420px] sm:max-w-[420px]"
						>
							<SheetHeader className="border-b border-border p-4">
								<div className="flex items-center justify-between">
									<SheetTitle>Agent Configuration</SheetTitle>
									<Button
										variant="ghost"
										size="icon-sm"
										onClick={() => setConfigDrawerOpen(false)}
									>
										<X className="size-4" />
									</Button>
								</div>
							</SheetHeader>
							<div className="flex-1 overflow-auto">
								<AgentConfigPanel showThinkingBudget />
							</div>
						</SheetContent>
					</Sheet>

					{/* Messages */}
					<div
						ref={messagesContainerRef}
						onScroll={handleScroll}
						className="relative flex min-h-0 flex-1 flex-col overflow-auto px-4"
					>
						{messages.length === 0 && !isThinking ? (
							<div className="flex flex-1 flex-col items-center justify-center p-5 sm:p-8">
								<Bot className="mb-4 size-12 text-primary opacity-60" />
								<h2 className="mb-2 text-lg font-semibold">
									Trading Agent
								</h2>
								<p className="mb-8 text-center text-sm text-muted-foreground">
									{status === "connected" || status === "thinking"
										? "Your AI assistant for automated trading"
										: status === "auth_required"
											? "Click the gear icon above to configure authentication, then refresh."
											: "Check agent configuration via the gear icon above."}
								</p>
								{(status === "connected" || status === "thinking") && (
									<div className="grid w-full max-w-[500px] grid-cols-1 gap-4 sm:grid-cols-2">
										{quickActions.map((action) => {
											const Icon = action.icon;
											return (
												<div
													key={action.label}
													className="cursor-pointer rounded-xl bg-card p-4 text-center ring-1 ring-foreground/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
													onClick={() =>
														handleQuickAction(action.label)
													}
												>
													<div className="mb-1">
														<Icon className="mx-auto size-8 text-primary" />
													</div>
													<p className="text-sm font-semibold">
														{action.label}
													</p>
													<p className="text-xs text-muted-foreground">
														{action.desc}
													</p>
												</div>
											);
										})}
									</div>
								)}
							</div>
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
						{/* Scroll to bottom button */}
						{showScrollBottom && (
							<Button
								size="icon"
								onClick={() => {
									prepareForAutoScroll();
									scrollToBottom("smooth");
								}}
								className="sticky bottom-4 z-10 self-center rounded-full shadow-lg"
								aria-label="Scroll to bottom"
							>
								<ChevronDown className="size-5" />
							</Button>
						)}
					</div>

					<Separator />

					<div className="shrink-0">
						{/* Quick Prompts */}
						<div className="flex flex-wrap gap-1.5 px-4 pt-3">
							{[
								"Analyze the market",
								"Check market sentiment",
								"Get trading recommendation",
								"Review my portfolio",
							].map((prompt) => (
								<Badge
									key={prompt}
									variant="outline"
									className="cursor-pointer text-[0.7rem] text-muted-foreground transition-colors hover:border-primary hover:bg-muted hover:text-primary"
									onClick={() => handleSendMessage(prompt)}
								>
									{prompt}
								</Badge>
							))}
						</div>

						{/* Input */}
						<div className="p-4 pt-2">
							<ChatInput
								onSendMessage={handleSendMessage}
								onRequestAnalysis={handleRequestAnalysis}
								onRequestRecommendation={handleRequestRecommendation}
								isThinking={isThinking}
								disabled={!isConnected}
							/>
						</div>
					</div>
				</Card>
			</div>
		</PageTransition>
	);
}
