/**
 * Agent Chat Page with Session History and Decision Tracking
 */

import {createFileRoute} from '@tanstack/react-router';
import {useRef, useEffect, useCallback, useState} from 'react';
import {useQuery, useMutation, useQueryClient} from '@tanstack/react-query';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Divider,
    Tabs,
    Tab,
    Badge,
    IconButton,
    Tooltip,
    useMediaQuery,
    useTheme,
    Drawer,
} from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import HistoryIcon from '@mui/icons-material/History';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import MenuIcon from '@mui/icons-material/Menu';

import {PageTransition} from '@/components/common/PageTransition';
import {ChatMessage} from '@/components/agent/ChatMessage';
import {ChatInput} from '@/components/agent/ChatInput';
import {AgentStatusBadge} from '@/components/agent/AgentStatusBadge';
import {DecisionCard} from '@/components/agent/DecisionCard';
import {SessionList} from '@/components/agent/SessionList';
import {DecisionHistoryPanel} from '@/components/agent/DecisionHistoryPanel';
import {EmptyState} from '@/components/common/EmptyState';
import {useAgentSocket} from '@/api/websocket/useAgentSocket';
import {
    useAgentStore,
    selectCurrentSession,
    selectPendingDecisions,
} from '@/store/agentStore';
import {sessionsApi} from '@/api/endpoints/sessions';
import {decisionsApi} from '@/api/endpoints/decisions';
import type {AgentSession, SessionMessage} from '@/types/session';

export const Route = createFileRoute('/agent')({
    component: AgentPage,
});

// Sidebar tab type
type SidebarTab = 'sessions' | 'decisions';

function AgentPage() {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const isLargeScreen = useMediaQuery(theme.breakpoints.up('lg'));

    const messagesEndRef = useRef<HTMLDivElement>(null);
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
        setCurrentSessionId,
        setSessionGroups,
        setIsLoadingSessions,
        addSession,
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
    const [sidebarTab, setSidebarTab] = useState<SidebarTab>('sessions');
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
    const [decisionPage, setDecisionPage] = useState(1);

    // WebSocket connection
    const {
        isConnected,
        sendMessage,
        requestAnalysis,
        requestRecommendation,
        executeDecision,
    } = useAgentSocket();

    // Fetch sessions grouped by date
    const {data: sessionsData, isLoading: sessionsLoading} = useQuery({
        queryKey: ['agent-sessions-grouped'],
        queryFn: () => sessionsApi.getSessionsGrouped(50),
        staleTime: 30_000,
    });

    // Update store when sessions data changes
    useEffect(() => {
        if (sessionsData) {
            setSessionGroups(sessionsData.groups);
        }
        setIsLoadingSessions(sessionsLoading);
    }, [sessionsData, sessionsLoading, setSessionGroups, setIsLoadingSessions]);

    // Fetch decisions with filters
    const {data: decisionsData, isLoading: decisionsLoading} = useQuery({
        queryKey: ['agent-decisions', decisionFilters, decisionPage],
        queryFn: () =>
            decisionsApi.getDecisions({
                ...decisionFilters,
                page: decisionPage,
                pageSize: 20,
            }),
        staleTime: 30_000,
    });

    // Fetch decision symbols for filter dropdown
    const {data: symbolsData} = useQuery({
        queryKey: ['agent-decision-symbols'],
        queryFn: () => decisionsApi.getDecisionSymbols(),
        staleTime: 60_000,
    });

    // Fetch pending decisions count
    const {data: pendingData} = useQuery({
        queryKey: ['agent-decisions-pending'],
        queryFn: () => decisionsApi.getPendingDecisions({page: 1, pageSize: 1}),
        staleTime: 10_000,
        refetchInterval: 30_000, // Refetch every 30 seconds
    });

    // Update store when decisions data changes
    useEffect(() => {
        if (decisionsData) {
            if (decisionPage === 1) {
                setDecisions(decisionsData.decisions);
            } else {
                appendDecisions(decisionsData.decisions);
            }
            setHasMoreDecisions(
                decisionsData.total > decisionsData.page * decisionsData.pageSize
            );
        }
        setIsLoadingDecisions(decisionsLoading);
    }, [
        decisionsData,
        decisionsLoading,
        decisionPage,
        setDecisions,
        appendDecisions,
        setHasMoreDecisions,
        setIsLoadingDecisions,
    ]);

    useEffect(() => {
        if (symbolsData) {
            setDecisionSymbols(symbolsData);
        }
    }, [symbolsData, setDecisionSymbols]);

    useEffect(() => {
        if (pendingData) {
            setPendingDecisionsCount(pendingData.total);
        }
    }, [pendingData, setPendingDecisionsCount]);

    // Fetch session messages when session changes
    const {data: sessionData} = useQuery({
        queryKey: ['agent-session', currentSessionId],
        queryFn: () =>
            currentSessionId ? sessionsApi.getSession(currentSessionId) : null,
        enabled: !!currentSessionId,
        staleTime: 10_000,
    });

    // Load messages when session data changes
    useEffect(() => {
        if (sessionData?.messages) {
            // Convert session messages to agent message format
            const agentMessages = sessionData.messages.map(
                (msg: SessionMessage, index: number) => ({
                    id: `${sessionData.id}-${index}`,
                    role: msg.role,
                    content: msg.content,
                    timestamp: msg.timestamp,
                    decision: undefined, // Would need to fetch decision details
                    toolCalls: msg.toolCalls,
                })
            );
            setMessages(agentMessages);
        }
    }, [sessionData, setMessages]);

    // Mutations
    const createSessionMutation = useMutation({
        mutationFn: () => sessionsApi.createSession({}),
        onSuccess: (newSession: AgentSession) => {
            addSession(newSession);
            clearMessages();
            queryClient.invalidateQueries({queryKey: ['agent-sessions-grouped']});
        },
    });

    const deleteSessionMutation = useMutation({
        mutationFn: (sessionId: string) => sessionsApi.deleteSession(sessionId),
        onSuccess: (_, sessionId) => {
            removeSession(sessionId);
            queryClient.invalidateQueries({queryKey: ['agent-sessions-grouped']});
        },
    });

    const updateSessionMutation = useMutation({
        mutationFn: ({sessionId, title}: { sessionId: string; title: string }) =>
            sessionsApi.updateSession(sessionId, {title}),
        onSuccess: (updatedSession) => {
            updateSessionTitle(updatedSession.id, updatedSession.title || '');
        },
    });

    const confirmDecisionMutation = useMutation({
        mutationFn: (decisionId: string) => decisionsApi.confirmDecision(decisionId),
        onSuccess: (decision) => {
            updateDecisionStatus(decision.id, 'confirmed');
            queryClient.invalidateQueries({queryKey: ['agent-decisions']});
            queryClient.invalidateQueries({queryKey: ['agent-decisions-pending']});
        },
    });

    const rejectDecisionMutation = useMutation({
        mutationFn: (decisionId: string) => decisionsApi.rejectDecision(decisionId),
        onSuccess: (decision) => {
            updateDecisionStatus(decision.id, 'rejected');
            queryClient.invalidateQueries({queryKey: ['agent-decisions']});
            queryClient.invalidateQueries({queryKey: ['agent-decisions-pending']});
        },
    });

    const feedbackMutation = useMutation({
        mutationFn: ({
                         decisionId,
                         feedback,
                     }: {
            decisionId: string;
            feedback: 'thumbs_up' | 'thumbs_down';
        }) => decisionsApi.addFeedback(decisionId, {feedback}),
    });

    // Handlers
    const handleSessionSelect = useCallback(
        (sessionId: string) => {
            setCurrentSessionId(sessionId);
            if (isMobile) {
                setMobileDrawerOpen(false);
            }
        },
        [setCurrentSessionId, isMobile]
    );

    const handleNewSession = useCallback(() => {
        createSessionMutation.mutate();
        if (isMobile) {
            setMobileDrawerOpen(false);
        }
    }, [createSessionMutation, isMobile]);

    const handleDeleteSession = useCallback(
        (sessionId: string) => {
            if (confirm('Are you sure you want to delete this conversation?')) {
                deleteSessionMutation.mutate(sessionId);
            }
        },
        [deleteSessionMutation]
    );

    const handleRenameSession = useCallback(
        (sessionId: string, newTitle: string) => {
            updateSessionMutation.mutate({sessionId, title: newTitle});
        },
        [updateSessionMutation]
    );

    const handleFiltersChange = useCallback(
        (filters: typeof decisionFilters) => {
            setDecisionFilters(filters);
            setDecisionPage(1); // Reset to first page
        },
        [setDecisionFilters]
    );

    const handleLoadMoreDecisions = useCallback(() => {
        setDecisionPage((prev) => prev + 1);
    }, []);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
    }, [messages]);

    // Sidebar content
    const sidebarContent = (
        <Box sx={{height: '100%', display: 'flex', flexDirection: 'column'}}>
            <Tabs
                value={sidebarTab}
                onChange={(_, value) => setSidebarTab(value)}
                variant="fullWidth"
                sx={{borderBottom: 1, borderColor: 'divider'}}
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
                    label="Decisions"
                    iconPosition="start"
                    sx={{minHeight: 48}}
                />
            </Tabs>

            <Box sx={{flex: 1, overflow: 'hidden'}}>
                {sidebarTab === 'sessions' ? (
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
            <Box sx={{height: 'calc(100vh - 100px)', display: 'flex', gap: 2}}>
                {/* Mobile Drawer */}
                {isMobile && (
                    <Drawer
                        anchor="left"
                        open={mobileDrawerOpen}
                        onClose={() => setMobileDrawerOpen(false)}
                        PaperProps={{sx: {width: 300}}}
                    >
                        {sidebarContent}
                    </Drawer>
                )}

                {/* Desktop Left Sidebar - Session History */}
                {!isMobile && (
                    <Card sx={{width: 300, display: 'flex', flexDirection: 'column'}}>
                        {sidebarContent}
                    </Card>
                )}

                {/* Main Chat Area */}
                <Card sx={{flex: 1, display: 'flex', flexDirection: 'column'}}>
                    {/* Header */}
                    <Box
                        sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            p: 2,
                            borderBottom: 1,
                            borderColor: 'divider',
                        }}
                    >
                        <Box sx={{display: 'flex', alignItems: 'center', gap: 2}}>
                            {isMobile && (
                                <IconButton onClick={() => setMobileDrawerOpen(true)} edge="start">
                                    <MenuIcon/>
                                </IconButton>
                            )}
                            <SmartToyIcon sx={{color: 'primary.main'}}/>
                            <Box>
                                <Typography variant="h6">Trading Agent</Typography>
                                {currentSessionId && sessionData && (
                                    <Typography variant="caption" color="text.secondary">
                                        {sessionData.title || 'New Chat'}
                                    </Typography>
                                )}
                            </Box>
                        </Box>
                        <AgentStatusBadge status={status}/>
                    </Box>

                    {/* Messages */}
                    <CardContent
                        sx={{
                            flex: 1,
                            overflow: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                    >
                        {messages.length === 0 ? (
                            <EmptyState
                                icon={<SmartToyIcon sx={{fontSize: 64}}/>}
                                title="Start a conversation"
                                description="Ask the trading agent for analysis, recommendations, or help with your trading decisions."
                            />
                        ) : (
                            messages.map((message) => (
                                <ChatMessage key={message.id} message={message}/>
                            ))
                        )}
                        <div ref={messagesEndRef}/>
                    </CardContent>

                    <Divider/>

                    {/* Input */}
                    <Box sx={{p: 2}}>
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
                    <Box sx={{width: 320, display: 'flex', flexDirection: 'column', gap: 2}}>
                        {/* Latest Decision */}
                        <Card sx={{p: 2}}>
                            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                                Latest Decision
                            </Typography>
                            {lastDecision ? (
                                <DecisionCard
                                    decision={lastDecision}
                                    onExecute={() => executeDecision(lastDecision)}
                                />
                            ) : (
                                <Typography variant="body2" color="text.secondary" textAlign="center">
                                    No recent decisions. Ask the agent for a recommendation.
                                </Typography>
                            )}
                        </Card>

                        {/* Quick Prompts */}
                        <Card sx={{p: 2, flex: 1, overflow: 'auto'}}>
                            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                                Quick Prompts
                            </Typography>
                            <Box sx={{display: 'flex', flexDirection: 'column', gap: 1}}>
                                {[
                                    'Analyze BTC/USDT market conditions',
                                    'What is the current market sentiment?',
                                    'Should I buy or sell ETH right now?',
                                    'What are the key support and resistance levels?',
                                    "Summarize today's market news",
                                ].map((prompt) => (
                                    <Card
                                        key={prompt}
                                        onClick={() => sendMessage(prompt)}
                                        sx={{
                                            p: 1.5,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            '&:hover': {
                                                bgcolor: 'action.hover',
                                                borderColor: 'primary.main',
                                                transform: 'translateX(4px)',
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
