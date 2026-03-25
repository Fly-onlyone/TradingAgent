/**
 * Agent Chat Page with Session History and Decision Tracking
 */

import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import AnalyticsIcon from "@mui/icons-material/Analytics";
import BarChartIcon from "@mui/icons-material/BarChart";
import CloseIcon from "@mui/icons-material/Close";
import HistoryIcon from "@mui/icons-material/History";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import MenuIcon from "@mui/icons-material/Menu";
import PsychologyIcon from "@mui/icons-material/Psychology";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import SettingsIcon from "@mui/icons-material/Settings";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import TuneIcon from "@mui/icons-material/Tune";
import {
    Badge,
    Box,
    Card,
    CardContent,
    Chip,
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
import {keepPreviousData, useMutation, useQuery, useQueryClient,} from "@tanstack/react-query";
import {createFileRoute} from "@tanstack/react-router";
import {AnimatePresence} from "framer-motion";
import {useCallback, useEffect, useRef, useState} from "react";
import {decisionsApi} from "@/api/endpoints/decisions";
import {sessionsApi} from "@/api/endpoints/sessions";
import {
    agentDecisionsQueryOptions,
    agentDecisionSymbolsQueryOptions,
    agentPendingDecisionsQueryOptions,
    agentSessionQueryOptions,
    agentSessionsGroupedQueryOptions,
} from "@/api/queryOptions/agent";
import {useAgentSocket} from "@/api/websocket/useAgentSocket";
import {AgentConfigPanel} from "@/components/agent/AgentConfigPanel";
import {AgentStatusBadge} from "@/components/agent/AgentStatusBadge";
import {ChatInput} from "@/components/agent/ChatInput";
import {ChatMessage} from "@/components/agent/ChatMessage";

import {DecisionHistoryPanel} from "@/components/agent/DecisionHistoryPanel";
import {SessionList} from "@/components/agent/SessionList";
import {ThinkingIndicator} from "@/components/agent/ThinkingIndicator";
import {PageTransition} from "@/components/common/PageTransition";
import {useAgentStore} from "@/store/agentStore";
import type {SessionMessage} from "@/types/session";
import {requireAuth} from "./-guards";

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
    const {isConnected, sendMessage, requestAnalysis, requestRecommendation} =
        useAgentSocket();

    // Fetch sessions grouped by date
    const {data: sessionsData, isLoading: sessionsLoading} = useQuery(
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
    const {data: decisionsData, isLoading: decisionsLoading} = useQuery({
        ...agentDecisionsQueryOptions(decisionFilters, decisionPage, 20),
        placeholderData: keepPreviousData,
        enabled: isDecisionsTabActive,
    });

    // Fetch decision symbols for filter dropdown only when needed
    const {data: symbolsData} = useQuery({
        ...agentDecisionSymbolsQueryOptions(),
        enabled: isDecisionsTabActive,
    });

    // Fetch pending decisions count
    const {data: pendingData} = useQuery({
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
        mutationFn: ({sessionId, title}: { sessionId: string; title: string }) =>
            sessionsApi.updateSession(sessionId, {title}),
        onSuccess: (updatedSession) => {
            updateSessionTitle(updatedSession.id, updatedSession.title || "");
        },
    });

    const confirmDecisionMutation = useMutation({
        mutationFn: (decisionId: string) =>
            Sentry.startSpan(
                {name: "decision.confirm", op: "ui.action"},
                () => decisionsApi.confirmDecision(decisionId),
            ),
        onSuccess: (decision) => {
            updateDecisionStatus(decision.id, "confirmed");
            void queryClient.invalidateQueries({queryKey: ["agent-decisions"]});
            void queryClient.invalidateQueries({
                queryKey: ["agent-decisions-pending"],
            });
        },
    });

    const rejectDecisionMutation = useMutation({
        mutationFn: (decisionId: string) =>
            Sentry.startSpan(
                {name: "decision.reject", op: "ui.action"},
                () => decisionsApi.rejectDecision(decisionId),
            ),
        onSuccess: (decision) => {
            updateDecisionStatus(decision.id, "rejected");
            void queryClient.invalidateQueries({queryKey: ["agent-decisions"]});
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
        }) => decisionsApi.addFeedback(decisionId, {feedback}),
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
            updateSessionMutation.mutate({sessionId, title: newTitle});
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
                sx={{borderBottom: 1, borderColor: "divider"}}
            >
                <Tab
                    value="sessions"
                    icon={<HistoryIcon fontSize="small"/>}
                    label="History"
                    iconPosition="start"
                    sx={{minHeight: 48}}
                />
                <Tab
                    value="decisions"
                    icon={
                        <Badge badgeContent={pendingDecisionsCount} color="warning">
                            <AnalyticsIcon fontSize="small"/>
                        </Badge>
                    }
                    label="Pending Decisions"
                    iconPosition="start"
                    sx={{minHeight: 48}}
                />
            </Tabs>

            <Box sx={{flex: 1, overflow: "hidden"}}>
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
                            feedbackMutation.mutate({decisionId: id, feedback})
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
            <Box
                sx={{
                    flex: 1,
                    minHeight: 0,
                    minWidth: 0,
                    display: "flex",
                    gap: {xs: 1.5, lg: 2},
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
                                    width: {xs: "min(100vw, 360px)", sm: 320},
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
                            alignItems: {xs: "flex-start", sm: "center"},
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
                                    <MenuIcon/>
                                </IconButton>
                            )}
                            <SmartToyIcon sx={{color: "primary.main"}}/>
                            <Box sx={{minWidth: 0}}>
                                <Typography variant="h6" noWrap>
                                    Trading Agent
                                </Typography>
                                {currentSessionId && sessionData && (
                                    <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        noWrap
                                        sx={{display: "block"}}
                                    >
                                        {sessionData.title || "New Chat"}
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
                                width: {xs: "100%", sm: "auto"},
                            }}
                        >
                            <AgentStatusBadge status={status}/>
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
                                    <PsychologyIcon fontSize="small"/>
                                </IconButton>
                            </Tooltip>
                            <Tooltip title="Agent Configuration" arrow placement="bottom-end">
                                <IconButton
                                    onClick={() => setConfigDrawerOpen(true)}
                                    size="small"
                                >
                                    <SettingsIcon fontSize="small"/>
                                </IconButton>
                            </Tooltip>
                        </Box>
                    </Box>

                    {/* Agent Configuration Drawer */}
                    <Drawer
                        anchor="right"
                        open={configDrawerOpen}
                        onClose={() => setConfigDrawerOpen(false)}
                        slotProps={{paper: {sx: {width: {xs: "100%", sm: 420}}}}}
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
                                <CloseIcon fontSize="small"/>
                            </IconButton>
                        </Box>
                        <Box sx={{overflow: "auto", flex: 1}}>
                            <AgentConfigPanel showThinkingBudget/>
                        </Box>
                    </Drawer>

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
                                    p: {xs: 2.5, sm: 4},
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
                                <Typography variant="h6" sx={{mb: 1}}>
                                    Trading Agent
                                </Typography>
                                <Typography
                                    variant="body2"
                                    color="text.secondary"
                                    sx={{mb: 4, textAlign: "center"}}
                                >
                                    {status === "connected" || status === "thinking"
                                        ? "Your AI assistant for automated trading"
                                        : status === "auth_required"
                                            ? "Click the gear icon above to configure authentication, then refresh."
                                            : "Check agent configuration via the gear icon above."}
                                </Typography>
                                {(status === "connected" || status === "thinking") && (
                                    <Grid
                                        container
                                        spacing={2}
                                        sx={{width: "100%", maxWidth: 500}}
                                    >
                                        {quickActions.map((action) => {
                                            const Icon = action.icon;
                                            return (
                                                <Grid size={{xs: 12, sm: 6}} key={action.label}>
                                                    <Card
                                                        sx={{
                                                            cursor: "pointer",
                                                            textAlign: "center",
                                                            p: 2,
                                                            transition: "transform 0.2s, box-shadow 0.2s",
                                                            "&:hover": {
                                                                transform: "translateY(-2px)",
                                                                boxShadow: (t) => t.trading.glow.primary,
                                                            },
                                                        }}
                                                        onClick={() => handleQuickAction(action.label)}
                                                    >
                                                        <Box sx={{mb: 0.5}}>
                                                            <Icon
                                                                sx={{fontSize: 32, color: "primary.main"}}
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
                                <KeyboardArrowDownIcon/>
                            </Fab>
                        )}
                    </CardContent>

                    <Divider/>

                    <Box
                        sx={{
                            flexShrink: 0,
                        }}
                    >
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
                                "Analyze the market",
                                "Check market sentiment",
                                "Get trading recommendation",
                                "Review my portfolio",
                            ].map((prompt) => (
                                <Chip
                                    key={prompt}
                                    label={prompt}
                                    size="small"
                                    variant="outlined"
                                    onClick={() => handleSendMessage(prompt)}
                                    sx={{
                                        cursor: "pointer",
                                        borderColor: "divider",
                                        color: "text.secondary",
                                        fontSize: "0.7rem",
                                        "&:hover": {
                                            borderColor: "primary.main",
                                            color: "primary.main",
                                            bgcolor: "action.hover",
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
                                    boxShadow: (theme) =>
                                        `0 0 0 3px rgba(${theme.trading.primaryRgb}, 0.15)`,
                                    borderRadius: 1,
                                },
                            }}
                        >
                            <ChatInput
                                onSendMessage={handleSendMessage}
                                onRequestAnalysis={handleRequestAnalysis}
                                onRequestRecommendation={handleRequestRecommendation}
                                isThinking={isThinking}
                                disabled={!isConnected}
                            />
                        </Box>
                    </Box>
                </Card>
            </Box>
        </PageTransition>
    );
}
