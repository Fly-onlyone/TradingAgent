/**
 * Agent chat store with per-session runtime state.
 */

import {create} from "zustand";
import {persist} from "zustand/middleware";
import type {AgentDecision, AgentMessage, ToolCall,} from "@/api/websocket/useAgentSocket";
import type {AgentDecisionSummary, AgentStatus, DecisionFilters, DecisionStatus,} from "@/types/session";

interface SessionRuntimeState {
    messages: AgentMessage[];
    toolCalls: ToolCall[];
    currentTurnToolCalls: ToolCall[];
    thinkingContent: string;
    streamingText: string;
    isThinking: boolean;
    isCancelling: boolean;
    lastDecision: AgentDecision | null;
    hasLocalUpdates: boolean;
}

interface AgentState {
    selectedSessionId: string | null;
    activeRunSessionId: string | null;
    sessionStates: Record<string, SessionRuntimeState>;

    decisions: AgentDecisionSummary[];
    decisionSymbols: string[];
    decisionFilters: DecisionFilters;
    isLoadingDecisions: boolean;
    hasMoreDecisions: boolean;
    pendingDecisionsCount: number;

    status: AgentStatus;

    showThinkingContent: boolean;

    setSelectedSessionId: (sessionId: string | null) => void;
    setActiveRunSessionId: (sessionId: string | null) => void;
    createDraftSession: () => string;
    replaceSessionId: (oldSessionId: string, newSessionId: string) => void;
    removeSession: (sessionId: string) => void;
    hydrateSessionMessages: (sessionId: string, messages: AgentMessage[]) => void;
    addMessage: (sessionId: string, message: AgentMessage) => void;
    addToolCall: (sessionId: string, toolCall: ToolCall) => void;
    updateToolCallResult: (
        sessionId: string,
        toolCallId: string,
        result: unknown,
    ) => void;
    appendThinkingContent: (sessionId: string, delta: string) => void;
    appendStreamingText: (sessionId: string, delta: string) => void;
    setThinking: (sessionId: string, thinking: boolean) => void;
    setCancelling: (sessionId: string, value: boolean) => void;

    setDecisions: (decisions: AgentDecisionSummary[]) => void;
    appendDecisions: (decisions: AgentDecisionSummary[]) => void;
    setDecisionSymbols: (symbols: string[]) => void;
    setDecisionFilters: (filters: DecisionFilters) => void;
    setIsLoadingDecisions: (loading: boolean) => void;
    setHasMoreDecisions: (hasMore: boolean) => void;
    setPendingDecisionsCount: (count: number) => void;
    updateDecisionStatus: (decisionId: string, status: DecisionStatus) => void;

    updateStatus: (status: string) => void;
    toggleThinkingContent: () => void;
}

const MAX_MESSAGES = 100;
const MAX_TOOL_CALLS = 200;
const MAX_DECISIONS = 100;

function createEmptySessionState(): SessionRuntimeState {
    return {
        messages: [],
        toolCalls: [],
        currentTurnToolCalls: [],
        thinkingContent: "",
        streamingText: "",
        isThinking: false,
        isCancelling: false,
        lastDecision: null,
        hasLocalUpdates: false,
    };
}

function mergeSessionState(
    existing: SessionRuntimeState | undefined,
    next: SessionRuntimeState,
): SessionRuntimeState {
    if (!existing) {
        return next;
    }

    return {
        ...next,
        toolCalls: [...existing.toolCalls, ...next.toolCalls].slice(-MAX_TOOL_CALLS),
        lastDecision: next.lastDecision ?? existing.lastDecision,
        hasLocalUpdates: existing.hasLocalUpdates || next.hasLocalUpdates,
    };
}

export const useAgentStore = create<AgentState>()(
    persist(
        (set) => ({
            selectedSessionId: null,
            activeRunSessionId: null,
            sessionStates: {},

            decisions: [],
            decisionSymbols: [],
            decisionFilters: {},
            isLoadingDecisions: false,
            hasMoreDecisions: false,
            pendingDecisionsCount: 0,

            status: "disconnected",

            showThinkingContent: true,

            setSelectedSessionId: (selectedSessionId) => set({selectedSessionId}),

            setActiveRunSessionId: (activeRunSessionId) => set({activeRunSessionId}),

            createDraftSession: () => {
                const sessionId = `draft-${crypto.randomUUID()}`;
                set((state) => ({
                    selectedSessionId: sessionId,
                    activeRunSessionId: sessionId,
                    sessionStates: {
                        ...state.sessionStates,
                        [sessionId]: createEmptySessionState(),
                    },
                }));
                return sessionId;
            },

            replaceSessionId: (oldSessionId, newSessionId) =>
                set((state) => {
                    if (oldSessionId === newSessionId) {
                        return {};
                    }

                    const existingState = state.sessionStates[oldSessionId];
                    const nextState = mergeSessionState(
                        state.sessionStates[newSessionId],
                        existingState ?? createEmptySessionState(),
                    );
                    const sessionStates = {...state.sessionStates};
                    delete sessionStates[oldSessionId];
                    sessionStates[newSessionId] = nextState;

                    return {
                        sessionStates,
                        selectedSessionId:
                            state.selectedSessionId === oldSessionId
                                ? newSessionId
                                : state.selectedSessionId,
                        activeRunSessionId:
                            state.activeRunSessionId === oldSessionId
                                ? newSessionId
                                : state.activeRunSessionId,
                    };
                }),

            removeSession: (sessionId) =>
                set((state) => {
                    const sessionStates = {...state.sessionStates};
                    delete sessionStates[sessionId];

                    return {
                        sessionStates,
                        selectedSessionId:
                            state.selectedSessionId === sessionId
                                ? null
                                : state.selectedSessionId,
                        activeRunSessionId:
                            state.activeRunSessionId === sessionId
                                ? null
                                : state.activeRunSessionId,
                        status:
                            state.activeRunSessionId === sessionId
                                ? "connected"
                                : state.status,
                    };
                }),

            hydrateSessionMessages: (sessionId, messages) =>
                set((state) => {
                    const existingState = state.sessionStates[sessionId];
                    if (
                        existingState?.hasLocalUpdates ||
                        existingState?.isThinking ||
                        existingState?.streamingText
                    ) {
                        return {};
                    }

                    return {
                        sessionStates: {
                            ...state.sessionStates,
                            [sessionId]: {
                                ...(existingState ?? createEmptySessionState()),
                                messages,
                                hasLocalUpdates: false,
                            },
                        },
                    };
                }),

            addMessage: (sessionId, message) =>
                set((state) => {
                    const sessionState =
                        state.sessionStates[sessionId] ?? createEmptySessionState();

                    return {
                        sessionStates: {
                            ...state.sessionStates,
                            [sessionId]: {
                                ...sessionState,
                                messages: [...sessionState.messages, message].slice(
                                    -MAX_MESSAGES,
                                ),
                                lastDecision: message.decision ?? sessionState.lastDecision,
                                isThinking: false,
                                isCancelling: false,
                                streamingText: "",
                                hasLocalUpdates: true,
                            },
                        },
                        status:
                            state.activeRunSessionId === sessionId &&
                            state.status === "thinking"
                                ? "connected"
                                : state.status,
                    };
                }),

            addToolCall: (sessionId, toolCall) =>
                set((state) => {
                    const sessionState =
                        state.sessionStates[sessionId] ?? createEmptySessionState();

                    return {
                        sessionStates: {
                            ...state.sessionStates,
                            [sessionId]: {
                                ...sessionState,
                                toolCalls: [...sessionState.toolCalls, toolCall].slice(
                                    -MAX_TOOL_CALLS,
                                ),
                                currentTurnToolCalls: [
                                    ...sessionState.currentTurnToolCalls,
                                    toolCall,
                                ],
                                hasLocalUpdates: true,
                            },
                        },
                    };
                }),

            updateToolCallResult: (sessionId, toolCallId, result) =>
                set((state) => {
                    const sessionState = state.sessionStates[sessionId];
                    if (!sessionState) {
                        return {};
                    }

                    return {
                        sessionStates: {
                            ...state.sessionStates,
                            [sessionId]: {
                                ...sessionState,
                                toolCalls: sessionState.toolCalls.map((toolCall) =>
                                    toolCall.id === toolCallId
                                        ? {
                                            ...toolCall,
                                            result,
                                        }
                                        : toolCall,
                                ),
                            },
                        },
                    };
                }),

            appendThinkingContent: (sessionId, delta) =>
                set((state) => {
                    const sessionState =
                        state.sessionStates[sessionId] ?? createEmptySessionState();

                    return {
                        sessionStates: {
                            ...state.sessionStates,
                            [sessionId]: {
                                ...sessionState,
                                thinkingContent: `${sessionState.thinkingContent}${delta}`,
                                hasLocalUpdates: true,
                            },
                        },
                    };
                }),

            appendStreamingText: (sessionId, delta) =>
                set((state) => {
                    const sessionState =
                        state.sessionStates[sessionId] ?? createEmptySessionState();

                    return {
                        sessionStates: {
                            ...state.sessionStates,
                            [sessionId]: {
                                ...sessionState,
                                streamingText: `${sessionState.streamingText}${delta}`,
                                hasLocalUpdates: true,
                            },
                        },
                    };
                }),

            setThinking: (sessionId, isThinking) =>
                set((state) => {
                    const sessionState =
                        state.sessionStates[sessionId] ?? createEmptySessionState();
                    const shouldResetTurn = isThinking && !sessionState.isThinking;

                    return {
                        sessionStates: {
                            ...state.sessionStates,
                            [sessionId]: {
                                ...sessionState,
                                isThinking,
                                isCancelling: !isThinking ? false : sessionState.isCancelling,
                                currentTurnToolCalls: shouldResetTurn
                                    ? []
                                    : sessionState.currentTurnToolCalls,
                                thinkingContent: shouldResetTurn
                                    ? ""
                                    : sessionState.thinkingContent,
                                streamingText: shouldResetTurn
                                    ? ""
                                    : sessionState.streamingText,
                                hasLocalUpdates: sessionState.hasLocalUpdates || isThinking,
                            },
                        },
                        activeRunSessionId: isThinking
                            ? sessionId
                            : state.activeRunSessionId === sessionId
                                ? null
                                : state.activeRunSessionId,
                        status: isThinking
                            ? "thinking"
                            : state.status === "thinking"
                                ? "connected"
                                : state.status,
                    };
                }),

            setCancelling: (sessionId, isCancelling) =>
                set((state) => {
                    const sessionState =
                        state.sessionStates[sessionId] ?? createEmptySessionState();

                    return {
                        sessionStates: {
                            ...state.sessionStates,
                            [sessionId]: {
                                ...sessionState,
                                isCancelling,
                            },
                        },
                    };
                }),

            setDecisions: (decisions) => set({decisions}),

            appendDecisions: (newDecisions) =>
                set((state) => ({
                    decisions: [...state.decisions, ...newDecisions].slice(
                        -MAX_DECISIONS,
                    ),
                })),

            setDecisionSymbols: (decisionSymbols) => set({decisionSymbols}),

            setDecisionFilters: (decisionFilters) => set({decisionFilters}),

            setIsLoadingDecisions: (isLoadingDecisions) =>
                set({isLoadingDecisions}),

            setHasMoreDecisions: (hasMoreDecisions) => set({hasMoreDecisions}),

            setPendingDecisionsCount: (pendingDecisionsCount) =>
                set({pendingDecisionsCount}),

            updateDecisionStatus: (decisionId, status) =>
                set((state) => ({
                    decisions: state.decisions.map((decision) =>
                        decision.id === decisionId
                            ? {
                                ...decision,
                                status,
                            }
                            : decision,
                    ),
                    pendingDecisionsCount:
                        status !== "pending"
                            ? Math.max(0, state.pendingDecisionsCount - 1)
                            : state.pendingDecisionsCount,
                })),

            updateStatus: (status) =>
                set({
                    status: status as AgentStatus,
                }),

            toggleThinkingContent: () =>
                set((state) => ({
                    showThinkingContent: !state.showThinkingContent,
                })),
        }),
        {
            name: "agent-store",
            partialize: (state) => ({
                showThinkingContent: state.showThinkingContent,
            }),
        },
    ),
);

export default useAgentStore;
