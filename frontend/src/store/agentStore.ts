/**
 * Agent chat store with per-session runtime state.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
	AgentDecision,
	AgentMessage,
	ToolCall,
} from "@/api/websocket/useAgentSocket";
import type {
	AgentDecisionSummary,
	AgentStatus,
	DecisionFilters,
	DecisionStatus,
	PendingQuestion,
} from "@/types/session";

interface SessionRuntimeState {
	messages: AgentMessage[];
	toolCalls: ToolCall[];
	currentTurnToolCalls: ToolCall[];
	thinkingContent: string;
	streamingText: string;
	totalTokens: number | null;
	sessionModel: string | null;
	isThinking: boolean;
	isCancelling: boolean;
	lastDecision: AgentDecision | null;
	pendingQuestion: PendingQuestion | null;
	hasLocalUpdates: boolean;
}

interface AgentState {
	isSocketConnected: boolean;
	selectedSessionId: string | null;
	activeRunSessionId: string | null;
	sessionStates: Record<string, SessionRuntimeState>;

	decisions: AgentDecisionSummary[];
	decisionSymbols: string[];
	decisionFilters: DecisionFilters;
	isLoadingDecisions: boolean;
	hasMoreDecisions: boolean;
	pendingDecisionsCount: number;

	mainTab: "chat" | "decisions";

	status: AgentStatus;

	showThinkingContent: boolean;
	expandAllTools: boolean;

	setSelectedSessionId: (sessionId: string | null) => void;
	setActiveRunSessionId: (sessionId: string | null) => void;
	createDraftSession: () => string;
	replaceSessionId: (oldSessionId: string, newSessionId: string) => void;
	removeSession: (sessionId: string) => void;
	hydrateSessionMessages: (sessionId: string, messages: AgentMessage[]) => void;
	setSessionTotalTokens: (sessionId: string, totalTokens: number) => void;
	setSessionModel: (sessionId: string, model: string) => void;
	addMessage: (sessionId: string, message: AgentMessage) => void;
	updateMessage: (
		sessionId: string,
		messageId: string,
		patch: Partial<Pick<AgentMessage, "content" | "toolCalls">>,
	) => void;
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
	setDecisionTaskFilter: (taskId: string) => void;
	setMainTab: (tab: "chat" | "decisions") => void;
	setIsLoadingDecisions: (loading: boolean) => void;
	setHasMoreDecisions: (hasMore: boolean) => void;
	setPendingDecisionsCount: (count: number) => void;
	updateDecisionStatus: (decisionId: string, status: DecisionStatus) => void;

	updateStatus: (status: string) => void;
	toggleThinkingContent: () => void;
	toggleExpandAllTools: () => void;
	setSocketConnected: (isConnected: boolean) => void;
	setSessionPendingQuestion: (
		sessionId: string,
		question: PendingQuestion | null,
	) => void;
	clearSessionPendingQuestion: (sessionId: string) => void;
	finalizeInterruptedTurns: () => void;
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
		totalTokens: null,
		sessionModel: null,
		isThinking: false,
		isCancelling: false,
		lastDecision: null,
		pendingQuestion: null,
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
		toolCalls: [...existing.toolCalls, ...next.toolCalls].slice(
			-MAX_TOOL_CALLS,
		),
		lastDecision: next.lastDecision ?? existing.lastDecision,
		hasLocalUpdates: existing.hasLocalUpdates || next.hasLocalUpdates,
	};
}

export const useAgentStore = create<AgentState>()(
	persist(
		(set) => ({
			isSocketConnected: false,
			selectedSessionId: null,
			activeRunSessionId: null,
			sessionStates: {},

			decisions: [],
			decisionSymbols: [],
			decisionFilters: {},
			isLoadingDecisions: false,
			hasMoreDecisions: false,
			pendingDecisionsCount: 0,

			mainTab: "chat",

			status: "disconnected",

			showThinkingContent: true,
			expandAllTools: false,

			setSelectedSessionId: (selectedSessionId) => set({ selectedSessionId }),

			setActiveRunSessionId: (activeRunSessionId) =>
				set({ activeRunSessionId }),

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
					const sessionStates = { ...state.sessionStates };
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
					const sessionStates = { ...state.sessionStates };
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
					// Only skip when the agent is actively text-streaming a
					// reply — replacing messages mid-stream would lose the
					// in-flight content. Otherwise MERGE REST-fetched messages
					// with any WS-arrived ones already in the store.
					if (existingState?.streamingText) {
						return {};
					}

					// DB ObjectId = 24 hex chars. REST wins on ObjectId
					// collisions (DB is canonical for mutated rows). Local-only
					// messages (WS arrived post-fetch) are kept; semantic
					// fallback dedups legacy / non-DB messages.
					const isDbId = (id: string | undefined) =>
						!!id && /^[a-f\d]{24}$/i.test(id);
					const fallbackKey = (m: AgentMessage) =>
						`${m.role}:${m.content}:${Math.floor((m.timestamp ?? 0) / 1000)}`;

					const byDbId = new Map<string, AgentMessage>();
					const bySemantic = new Map<string, AgentMessage>();

					const add = (msg: AgentMessage, restWins: boolean) => {
						if (isDbId(msg.id)) {
							if (restWins || !byDbId.has(msg.id)) byDbId.set(msg.id, msg);
						} else {
							const k = fallbackKey(msg);
							if (restWins || !bySemantic.has(k)) bySemantic.set(k, msg);
						}
					};
					for (const msg of messages) add(msg, true);
					for (const msg of existingState?.messages ?? []) add(msg, false);

					const merged = [...byDbId.values(), ...bySemantic.values()].sort(
						(a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0),
					);

					return {
						sessionStates: {
							...state.sessionStates,
							[sessionId]: {
								...(existingState ?? createEmptySessionState()),
								messages: merged,
								pendingQuestion: existingState?.pendingQuestion ?? null,
								hasLocalUpdates: false,
							},
						},
					};
				}),

			setSessionTotalTokens: (sessionId, totalTokens) =>
				set((state) => {
					const sessionState =
						state.sessionStates[sessionId] ?? createEmptySessionState();

					return {
						sessionStates: {
							...state.sessionStates,
							[sessionId]: {
								...sessionState,
								totalTokens,
							},
						},
					};
				}),

			setSessionModel: (sessionId, model) =>
				set((state) => {
					const sessionState =
						state.sessionStates[sessionId] ?? createEmptySessionState();

					return {
						sessionStates: {
							...state.sessionStates,
							[sessionId]: {
								...sessionState,
								sessionModel: model,
							},
						},
					};
				}),

			addMessage: (sessionId, message) =>
				set((state) => {
					const sessionState =
						state.sessionStates[sessionId] ?? createEmptySessionState();
					const preserveInFlightTurn =
						message.role === "user" && sessionState.isThinking;

					// Merge result data from currentTurnToolCalls into message toolCalls
					if (
						message.toolCalls &&
						sessionState.currentTurnToolCalls.length > 0
					) {
						const resultMap = new Map(
							sessionState.currentTurnToolCalls
								.filter((tc) => tc.resultSummary)
								.map((tc) => [tc.id, tc]),
						);
						message.toolCalls = message.toolCalls.map((tc) => {
							const enriched = resultMap.get(tc.id);
							if (enriched && !tc.resultSummary) {
								return {
									...tc,
									resultSummary: enriched.resultSummary,
									executionTimeMs: enriched.executionTimeMs,
								};
							}
							return tc;
						});
					}

					return {
						sessionStates: {
							...state.sessionStates,
							[sessionId]: {
								...sessionState,
								messages: [...sessionState.messages, message].slice(
									-MAX_MESSAGES,
								),
								lastDecision: message.decision ?? sessionState.lastDecision,
								isThinking: preserveInFlightTurn
									? sessionState.isThinking
									: false,
								isCancelling: preserveInFlightTurn
									? sessionState.isCancelling
									: false,
								streamingText: preserveInFlightTurn
									? sessionState.streamingText
									: "",
								hasLocalUpdates: true,
							},
						},
						status:
							!preserveInFlightTurn &&
							state.activeRunSessionId === sessionId &&
							state.status === "thinking"
								? "connected"
								: state.status,
					};
				}),

			updateMessage: (sessionId, messageId, patch) =>
				set((state) => {
					const sessionState = state.sessionStates[sessionId];
					if (!sessionState) return {};
					const idx = sessionState.messages.findIndex(
						(m) => m.id === messageId,
					);
					if (idx === -1) return {};
					const current = sessionState.messages[idx];
					// No-op guard: skip the set() if the patch produces the same
					// values, otherwise Zustand notifies subscribers and all
					// chat message children re-render for nothing.
					const changed = (Object.keys(patch) as (keyof typeof patch)[]).some(
						(k) => patch[k] !== current[k],
					);
					if (!changed) return {};
					const merged = [...sessionState.messages];
					merged[idx] = { ...current, ...patch };
					return {
						sessionStates: {
							...state.sessionStates,
							[sessionId]: {
								...sessionState,
								messages: merged,
							},
						},
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

			setDecisions: (decisions) => set({ decisions }),

			appendDecisions: (newDecisions) =>
				set((state) => ({
					decisions: [...state.decisions, ...newDecisions].slice(
						-MAX_DECISIONS,
					),
				})),

			setDecisionSymbols: (decisionSymbols) => set({ decisionSymbols }),

			setDecisionFilters: (decisionFilters) => set({ decisionFilters }),

			setDecisionTaskFilter: (taskId) =>
				set({ decisionFilters: { taskId }, mainTab: "decisions" }),

			setMainTab: (mainTab) => set({ mainTab }),

			setIsLoadingDecisions: (isLoadingDecisions) =>
				set({ isLoadingDecisions }),

			setHasMoreDecisions: (hasMoreDecisions) => set({ hasMoreDecisions }),

			setPendingDecisionsCount: (pendingDecisionsCount) =>
				set({ pendingDecisionsCount }),

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
			toggleExpandAllTools: () =>
				set((state) => ({
					expandAllTools: !state.expandAllTools,
				})),
			setSocketConnected: (isSocketConnected) => set({ isSocketConnected }),
			setSessionPendingQuestion: (sessionId, question) =>
				set((state) => {
					const sessionState =
						state.sessionStates[sessionId] ?? createEmptySessionState();

					return {
						sessionStates: {
							...state.sessionStates,
							[sessionId]: {
								...sessionState,
								pendingQuestion: question,
							},
						},
					};
				}),
			clearSessionPendingQuestion: (sessionId) =>
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
								pendingQuestion: null,
							},
						},
					};
				}),
			finalizeInterruptedTurns: () =>
				set((state) => {
					const sessionStates = Object.fromEntries(
						Object.entries(state.sessionStates).map(
							([sessionId, sessionState]) => {
								if (
									!sessionState.isThinking &&
									!sessionState.isCancelling &&
									!sessionState.streamingText &&
									sessionState.currentTurnToolCalls.length === 0
								) {
									return [sessionId, sessionState];
								}

								const partialContent = sessionState.streamingText.trim();
								const lastMessage = sessionState.messages.at(-1);
								const shouldAppendPartialMessage =
									Boolean(partialContent) &&
									!(
										lastMessage?.role === "assistant" &&
										lastMessage.content === partialContent
									);
								const messages = shouldAppendPartialMessage
									? [
											...sessionState.messages,
											{
												id: crypto.randomUUID(),
												role: "assistant" as const,
												content: partialContent,
												timestamp: Date.now(),
												toolCalls:
													sessionState.currentTurnToolCalls.length > 0
														? sessionState.currentTurnToolCalls
														: undefined,
												thinkingContent:
													sessionState.thinkingContent || undefined,
												model: sessionState.sessionModel || undefined,
											},
										].slice(-MAX_MESSAGES)
									: sessionState.messages;

								return [
									sessionId,
									{
										...sessionState,
										messages,
										currentTurnToolCalls: [],
										thinkingContent: "",
										streamingText: "",
										isThinking: false,
										isCancelling: false,
										hasLocalUpdates: true,
									},
								];
							},
						),
					) as Record<string, SessionRuntimeState>;

					return {
						sessionStates,
						activeRunSessionId: null,
						status: (state.status === "auth_required" ||
						state.status === "error"
							? state.status
							: "disconnected") as AgentStatus,
					};
				}),
		}),
		{
			name: "agent-store",
			partialize: (state) => ({
				showThinkingContent: state.showThinkingContent,
				expandAllTools: state.expandAllTools,
			}),
		},
	),
);

export default useAgentStore;
