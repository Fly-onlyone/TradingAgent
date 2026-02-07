/**
 * Agent Chat Store with Session Management
 */

import {create} from 'zustand';
import {persist} from 'zustand/middleware';
import type {AgentMessage, ToolCall, AgentDecision} from '@/api/websocket/useAgentSocket';
import type {
    AgentSession,
    SessionsByDateGroup,
    AgentDecisionSummary,
    DecisionType,
    DecisionAction,
    DecisionStatus,
} from '@/types/session';

type AgentStatus = 'disconnected' | 'connected' | 'thinking' | 'analyzing' | 'error' | 'auth_required';

// Decision filter state
interface DecisionFilters {
    decisionType?: DecisionType;
    symbol?: string;
    action?: DecisionAction;
    status?: DecisionStatus;
}

interface AgentState {
    // Session management
    currentSessionId: string | null;
    sessionGroups: SessionsByDateGroup[];
    isLoadingSessions: boolean;

    // Chat
    messages: AgentMessage[];
    toolCalls: ToolCall[];

    // Decisions
    decisions: AgentDecisionSummary[];
    decisionSymbols: string[];
    decisionFilters: DecisionFilters;
    isLoadingDecisions: boolean;
    hasMoreDecisions: boolean;
    pendingDecisionsCount: number;

    // Status
    status: AgentStatus;
    isThinking: boolean;
    lastDecision: AgentDecision | null;

    // Session actions
    setCurrentSessionId: (sessionId: string | null) => void;
    setSessionGroups: (groups: SessionsByDateGroup[]) => void;
    setIsLoadingSessions: (loading: boolean) => void;
    addSession: (session: AgentSession) => void;
    removeSession: (sessionId: string) => void;
    updateSessionTitle: (sessionId: string, title: string) => void;

    // Chat actions
    addMessage: (message: AgentMessage) => void;
    setMessages: (messages: AgentMessage[]) => void;
    clearMessages: () => void;
    addToolCall: (toolCall: ToolCall) => void;
    updateToolCallResult: (toolCallId: string, result: unknown) => void;

    // Decision actions
    setDecisions: (decisions: AgentDecisionSummary[]) => void;
    appendDecisions: (decisions: AgentDecisionSummary[]) => void;
    setDecisionSymbols: (symbols: string[]) => void;
    setDecisionFilters: (filters: DecisionFilters) => void;
    setIsLoadingDecisions: (loading: boolean) => void;
    setHasMoreDecisions: (hasMore: boolean) => void;
    setPendingDecisionsCount: (count: number) => void;
    updateDecisionStatus: (decisionId: string, status: DecisionStatus) => void;

    // Status actions
    updateStatus: (status: string) => void;
    setThinking: (thinking: boolean) => void;
    setLastDecision: (decision: AgentDecision | null) => void;
}

const MAX_MESSAGES = 100;

export const useAgentStore = create<AgentState>()(
    persist(
        (set) => ({
            // Session management
            currentSessionId: null,
            sessionGroups: [],
            isLoadingSessions: false,

            // Chat
            messages: [],
            toolCalls: [],

            // Decisions
            decisions: [],
            decisionSymbols: [],
            decisionFilters: {},
            isLoadingDecisions: false,
            hasMoreDecisions: false,
            pendingDecisionsCount: 0,

            // Status
            status: 'disconnected',
            isThinking: false,
            lastDecision: null,

            // Session actions
            setCurrentSessionId: (sessionId) =>
                set({currentSessionId: sessionId}),

            setSessionGroups: (groups) =>
                set({sessionGroups: groups}),

            setIsLoadingSessions: (loading) =>
                set({isLoadingSessions: loading}),

            addSession: (session) =>
                set((state) => {
                    // Find or create today's group
                    const today = new Date().toISOString().split('T')[0];
                    const updatedGroups = [...state.sessionGroups];

                    const todayGroupIndex = updatedGroups.findIndex((g) => g.date === today);
                    if (todayGroupIndex >= 0) {
                        // Add to existing today group at the beginning
                        updatedGroups[todayGroupIndex] = {
                            ...updatedGroups[todayGroupIndex],
                            sessions: [session, ...updatedGroups[todayGroupIndex].sessions],
                        };
                    } else {
                        // Create new today group at the beginning
                        updatedGroups.unshift({
                            date: today,
                            label: 'Today',
                            sessions: [session],
                        });
                    }

                    return {
                        sessionGroups: updatedGroups,
                        currentSessionId: session.id,
                    };
                }),

            removeSession: (sessionId) =>
                set((state) => {
                    const updatedGroups = state.sessionGroups
                        .map((group) => ({
                            ...group,
                            sessions: group.sessions.filter((s) => s.id !== sessionId),
                        }))
                        .filter((group) => group.sessions.length > 0);

                    return {
                        sessionGroups: updatedGroups,
                        currentSessionId:
                            state.currentSessionId === sessionId ? null : state.currentSessionId,
                        messages: state.currentSessionId === sessionId ? [] : state.messages,
                    };
                }),

            updateSessionTitle: (sessionId, title) =>
                set((state) => ({
                    sessionGroups: state.sessionGroups.map((group) => ({
                        ...group,
                        sessions: group.sessions.map((s) =>
                            s.id === sessionId ? {...s, title} : s
                        ),
                    })),
                })),

            // Chat actions
            addMessage: (message) =>
                set((state) => ({
                    messages: [...state.messages, message].slice(-MAX_MESSAGES),
                    lastDecision: message.decision || state.lastDecision,
                })),

            setMessages: (messages) =>
                set({messages}),

            clearMessages: () =>
                set({
                    messages: [],
                    toolCalls: [],
                    lastDecision: null,
                }),

            addToolCall: (toolCall) =>
                set((state) => ({
                    toolCalls: [...state.toolCalls, toolCall],
                })),

            updateToolCallResult: (toolCallId, result) =>
                set((state) => ({
                    toolCalls: state.toolCalls.map((tc) =>
                        tc.id === toolCallId ? {...tc, result} : tc
                    ),
                })),

            // Decision actions
            setDecisions: (decisions) =>
                set({decisions}),

            appendDecisions: (newDecisions) =>
                set((state) => ({
                    decisions: [...state.decisions, ...newDecisions],
                })),

            setDecisionSymbols: (symbols) =>
                set({decisionSymbols: symbols}),

            setDecisionFilters: (filters) =>
                set({decisionFilters: filters}),

            setIsLoadingDecisions: (loading) =>
                set({isLoadingDecisions: loading}),

            setHasMoreDecisions: (hasMore) =>
                set({hasMoreDecisions: hasMore}),

            setPendingDecisionsCount: (count) =>
                set({pendingDecisionsCount: count}),

            updateDecisionStatus: (decisionId, status) =>
                set((state) => ({
                    decisions: state.decisions.map((d) =>
                        d.id === decisionId ? {...d, status} : d
                    ),
                    pendingDecisionsCount:
                        status !== 'pending'
                            ? Math.max(0, state.pendingDecisionsCount - 1)
                            : state.pendingDecisionsCount,
                })),

            // Status actions
            updateStatus: (status) =>
                set({
                    status: status as AgentStatus,
                }),

            setThinking: (isThinking) =>
                set({
                    isThinking,
                    status: isThinking ? 'thinking' : 'connected',
                }),

            setLastDecision: (lastDecision) => set({lastDecision}),
        }),
        {
            name: 'agent-store',
            // Only persist session-related data
            partialize: (state) => ({
                currentSessionId: state.currentSessionId,
            }),
        }
    )
);

// Selectors
export const selectRecentMessages = (state: AgentState, count = 10) =>
    state.messages.slice(-count);

export const selectUserMessages = (state: AgentState) =>
    state.messages.filter((m) => m.role === 'user');

export const selectAssistantMessages = (state: AgentState) =>
    state.messages.filter((m) => m.role === 'assistant');

export const selectDecisionMessages = (state: AgentState) =>
    state.messages.filter((m) => m.decision);

export const selectCurrentSession = (state: AgentState): AgentSession | null => {
    if (!state.currentSessionId) return null;

    for (const group of state.sessionGroups) {
        const session = group.sessions.find((s) => s.id === state.currentSessionId);
        if (session) return session;
    }
    return null;
};

export const selectTotalSessionCount = (state: AgentState): number =>
    state.sessionGroups.reduce((sum, g) => sum + g.sessions.length, 0);

export const selectPendingDecisions = (state: AgentState) =>
    state.decisions.filter((d) => d.status === 'pending');

export default useAgentStore;
