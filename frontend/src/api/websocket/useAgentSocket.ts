/**
 * Agent chat WebSocket hook.
 */

import * as Sentry from "@sentry/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { getAccessToken } from "@/api/client";
import type { NotificationSettings } from "@/api/endpoints/notifications";
import {
	agentSessionQueryOptions,
	agentSessionsGroupedQueryOptions,
} from "@/api/queryOptions/agent";
import { useAgentStore } from "@/store/agentStore";
import { notify } from "@/store/uiStore";
import type { WebSocketMessage } from "@/types";
import type { GroupedSessionsResponse } from "@/types/session";
import {
	AGENT_SESSIONS_GROUP_LIMIT,
	createOptimisticSession,
	isDraftSessionId,
	replaceSessionIdInGroups,
	touchSessionInGroups,
	upsertSessionInGroups,
} from "@/utils/agentSessionsCache";
import { sendNativeNotification } from "@/utils/nativeNotifications";
import { getWsUrl } from "@/utils/tauriEnv";
import { useWebSocket } from "./useWebSocket";

export interface ChartData {
	symbol: string;
	timeframe: string;
	candles: {
		time: number;
		open: number;
		high: number;
		low: number;
		close: number;
	}[];
	indicators?: {
		name: string;
		data: { time: number; value: number }[];
		color?: string;
	}[];
}

export interface AgentMessage {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
	timestamp: number;
	toolCalls?: ToolCall[];
	decision?: AgentDecision;
	thinkingContent?: string;
	chartData?: ChartData;
	model?: string;
}

export interface ToolCall {
	id: string;
	name: string;
	arguments: Record<string, unknown>;
	result?: unknown;
	resultSummary?: string;
	executionTimeMs?: number;
}

export interface AgentDecision {
	action: "buy" | "sell" | "hold" | "wait";
	symbol?: string;
	confidence: number;
	reasoning: string;
	riskAssessment?: string;
}

export interface PendingQuestion {
	id: string;
	question: string;
	options: string[];
	multiSelect?: boolean;
}

interface UsageData {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	model?: string;
}

interface AgentSocketMessage extends WebSocketMessage {
	type:
		| "message"
		| "thinking"
		| "text_delta"
		| "tool_call"
		| "decision"
		| "chart_data"
		| "ask_user"
		| "error"
		| "status"
		| "session_created"
		| "cancel_ack"
		| "usage";
	data:
		| AgentMessage
		| ToolCall
		| AgentDecision
		| ChartData
		| PendingQuestion
		| UsageData
		| { status: string }
		| { error: string }
		| { content?: string }
		| {
				sessionId: string;
		  };
}

interface BeginTurnOptions {
	sessionId?: string | null;
	addUserMessage?: AgentMessage;
}

export function useAgentSocket() {
	const queryClient = useQueryClient();
	const socketBaseUrl = getWsUrl("/ws/agent/chat");
	const {
		addMessage,
		updateStatus,
		setThinking,
		setCancelling,
		addToolCall,
		appendThinkingContent,
		appendStreamingText,
		setSelectedSessionId,
		setActiveRunSessionId,
		createDraftSession,
		replaceSessionId,
		hydrateSessionMessages,
		setSessionTotalTokens,
		setSessionModel,
		selectedSessionId,
		activeRunSessionId,
	} = useAgentStore();
	const recentIncomingMessageKeysRef = useRef<Map<string, number>>(new Map());
	const pendingChartDataRef = useRef<ChartData | null>(null);

	const getTargetSessionId = useCallback(() => {
		const state = useAgentStore.getState();
		return state.activeRunSessionId ?? state.selectedSessionId;
	}, []);

	const updateGroupedSessions = useCallback(
		(
			updater: (
				current: GroupedSessionsResponse | undefined,
			) => GroupedSessionsResponse | undefined,
		) => {
			queryClient.setQueryData<GroupedSessionsResponse | undefined>(
				agentSessionsGroupedQueryOptions(AGENT_SESSIONS_GROUP_LIMIT).queryKey,
				updater,
			);
		},
		[queryClient],
	);

	const beginTurn = useCallback(
		(options: BeginTurnOptions = {}) => {
			const state = useAgentStore.getState();
			let sessionId = options.sessionId ?? state.selectedSessionId;

			if (!sessionId) {
				const draftSessionId = createDraftSession();
				sessionId = draftSessionId;
				updateGroupedSessions((current) =>
					upsertSessionInGroups(
						current,
						createOptimisticSession(
							draftSessionId,
							Boolean(options.addUserMessage),
						),
					),
				);
			} else {
				const existingSessionId = sessionId;
				setSelectedSessionId(sessionId);
				setActiveRunSessionId(sessionId);
				hydrateSessionMessages(
					existingSessionId,
					state.sessionStates[existingSessionId]?.messages ?? [],
				);

				updateGroupedSessions((current) =>
					touchSessionInGroups(current, existingSessionId, {
						includeUserMessage: Boolean(options.addUserMessage),
					}),
				);
			}

			if (options.addUserMessage) {
				addMessage(sessionId, options.addUserMessage);
			}

			setThinking(sessionId, true);
			return sessionId;
		},
		[
			addMessage,
			createDraftSession,
			hydrateSessionMessages,
			setActiveRunSessionId,
			setSelectedSessionId,
			setThinking,
			updateGroupedSessions,
		],
	);

	const handleMessage = useCallback(
		(message: WebSocketMessage) => {
			const agentMessage = message as AgentSocketMessage;

			switch (agentMessage.type) {
				case "message": {
					const msg = agentMessage.data as AgentMessage;
					const targetSessionId = getTargetSessionId();
					if (!targetSessionId) {
						break;
					}

					if (msg.role === "assistant") {
						const storeThinking =
							useAgentStore.getState().sessionStates[targetSessionId]
								?.thinkingContent;
						if (!msg.thinkingContent && storeThinking) {
							msg.thinkingContent = storeThinking;
						}
						if (pendingChartDataRef.current) {
							msg.chartData = pendingChartDataRef.current;
							pendingChartDataRef.current = null;
						}
					}

					if (msg.role === "assistant" || msg.role === "system") {
						const messageKey = `${msg.role}:${msg.content}:${Math.floor(msg.timestamp / 1000)}`;
						const now = Date.now();
						const recentKeys = recentIncomingMessageKeysRef.current;

						for (const [key, seenAt] of recentKeys.entries()) {
							if (now - seenAt > 30_000) {
								recentKeys.delete(key);
							}
						}

						if (recentKeys.has(messageKey)) {
							setThinking(targetSessionId, false);
							break;
						}

						recentKeys.set(messageKey, now);
					}

					addMessage(targetSessionId, msg);
					setThinking(targetSessionId, false);

					if (msg.role === "assistant") {
						void queryClient.invalidateQueries({
							queryKey: ["agent-sessions-grouped"],
						});
						void queryClient.invalidateQueries({
							queryKey: agentSessionQueryOptions(targetSessionId).queryKey,
						});

						// Fire "analysis ready" notification
						const notifSettings =
							queryClient.getQueryData<NotificationSettings>([
								"notification-settings",
							]);
						if (notifSettings?.analysisReady ?? true) {
							const preview =
								msg.content.length > 100
									? `${msg.content.slice(0, 100)}...`
									: msg.content;
							notify.info("Agent response ready", preview);
							if (document.hidden) {
								void sendNativeNotification("Agent response ready", preview);
							}
						}
					}
					break;
				}
				case "thinking": {
					const targetSessionId = getTargetSessionId();
					const thinkingData = agentMessage.data as {
						content?: string;
					};
					if (!targetSessionId) {
						break;
					}

					setThinking(targetSessionId, true);
					if (thinkingData?.content) {
						appendThinkingContent(targetSessionId, thinkingData.content);
					}
					break;
				}
				case "text_delta": {
					const targetSessionId = getTargetSessionId();
					const delta = agentMessage.data as { content: string };
					if (targetSessionId && delta?.content) {
						appendStreamingText(targetSessionId, delta.content);
					}
					break;
				}
				case "tool_call": {
					const targetSessionId = getTargetSessionId();
					if (targetSessionId) {
						addToolCall(targetSessionId, agentMessage.data as ToolCall);
					}
					break;
				}
				case "ask_user": {
					const { setPendingQuestion } = useAgentStore.getState();
					setPendingQuestion(agentMessage.data as PendingQuestion);
					break;
				}
				case "decision": {
					const targetSessionId = getTargetSessionId();
					if (!targetSessionId) {
						break;
					}

					const decision = agentMessage.data as AgentDecision;
					addMessage(targetSessionId, {
						id: crypto.randomUUID(),
						role: "assistant",
						content: `Trading Decision: ${decision.action.toUpperCase()}`,
						timestamp: Date.now(),
						decision,
					});
					break;
				}
				case "chart_data": {
					pendingChartDataRef.current = agentMessage.data as ChartData;
					break;
				}
				case "status": {
					const statusData = agentMessage.data as {
						status: string;
						message?: string;
					};
					updateStatus(statusData.status);
					break;
				}
				case "session_created": {
					const { sessionId } = agentMessage.data as {
						sessionId: string;
					};
					const draftSessionId = useAgentStore.getState().activeRunSessionId;
					if (draftSessionId && isDraftSessionId(draftSessionId)) {
						replaceSessionId(draftSessionId, sessionId);
						updateGroupedSessions((current) =>
							replaceSessionIdInGroups(current, draftSessionId, sessionId),
						);
					} else {
						setSelectedSessionId(sessionId);
						setActiveRunSessionId(sessionId);
					}
					break;
				}
				case "usage": {
					const targetSessionId = getTargetSessionId();
					const usage = agentMessage.data as UsageData;
					if (targetSessionId) {
						setSessionTotalTokens(targetSessionId, usage.totalTokens);
						if (usage.model) {
							setSessionModel(targetSessionId, usage.model);
						}
					}
					break;
				}
				case "cancel_ack": {
					const targetSessionId = getTargetSessionId();
					if (targetSessionId) {
						setThinking(targetSessionId, false);
						setCancelling(targetSessionId, false);
					}
					break;
				}
				case "error": {
					const targetSessionId = getTargetSessionId();
					if (targetSessionId) {
						addMessage(targetSessionId, {
							id: crypto.randomUUID(),
							role: "system",
							content: `Error: ${(agentMessage.data as { error: string }).error}`,
							timestamp: Date.now(),
						});
						setThinking(targetSessionId, false);
					}
					break;
				}
			}
		},
		[
			addMessage,
			addToolCall,
			appendStreamingText,
			appendThinkingContent,
			getTargetSessionId,
			queryClient,
			replaceSessionId,
			setActiveRunSessionId,
			setCancelling,
			setSelectedSessionId,
			setSessionModel,
			setSessionTotalTokens,
			setThinking,
			updateGroupedSessions,
			updateStatus,
		],
	);

	const token = getAccessToken();

	const { isConnected, send, disconnect, reconnect } = useWebSocket({
		url: `${socketBaseUrl}?token=${token}`,
		enabled: !!token,
		onMessage: handleMessage,
		onOpen: () => {
			console.log("Agent WebSocket connected");
		},
		onClose: () => {
			console.log("Agent WebSocket disconnected");
			const targetSessionId = useAgentStore.getState().activeRunSessionId;
			updateStatus("disconnected");
			if (targetSessionId) {
				setThinking(targetSessionId, false);
			}
		},
		onError: (error) => {
			const websocket =
				error.currentTarget instanceof WebSocket ? error.currentTarget : null;
			Sentry.captureMessage("Agent WebSocket error", {
				level: "warning",
				tags: { component: "agent-websocket" },
				fingerprint: ["agent-websocket-error"],
				extra: {
					eventType: error.type,
					route:
						typeof window === "undefined"
							? undefined
							: window.location.pathname,
					socketUrl: socketBaseUrl,
				},
				contexts: websocket
					? {
							websocket: {
								readyState: websocket.readyState,
								bufferedAmount: websocket.bufferedAmount,
								protocol: websocket.protocol || "none",
							},
						}
					: undefined,
			});
			console.error("Agent WebSocket error:", error);
			updateStatus("error");
		},
	});

	const sendMessage = useCallback(
		(content: string) => {
			const message: AgentMessage = {
				id: crypto.randomUUID(),
				role: "user",
				content,
				timestamp: Date.now(),
			};
			const sessionId = beginTurn({ addUserMessage: message });
			send({
				type: "message",
				content,
				sessionId: isDraftSessionId(sessionId) ? undefined : sessionId,
			});
		},
		[beginTurn, send],
	);

	const requestAnalysis = useCallback(
		(
			symbol?: string,
			analysisType?: "technical" | "fundamental" | "combined",
		) => {
			const sessionId = beginTurn({
				sessionId: selectedSessionId,
			});
			send({
				type: "analyze",
				symbol: symbol || "BTC-USDT",
				analysisType: analysisType || "combined",
				sessionId: isDraftSessionId(sessionId) ? undefined : sessionId,
			});
		},
		[beginTurn, selectedSessionId, send],
	);

	const requestRecommendation = useCallback(
		(symbol?: string) => {
			const sessionId = beginTurn({
				sessionId: selectedSessionId,
			});
			send({
				type: "recommend",
				symbol,
				sessionId: isDraftSessionId(sessionId) ? undefined : sessionId,
			});
		},
		[beginTurn, selectedSessionId, send],
	);

	const requestStrategyReview = useCallback(() => {
		const sessionId = beginTurn({
			sessionId: selectedSessionId,
		});
		send({
			type: "message",
			content:
				"Review my trading strategies. List all inactive strategies, evaluate each against current market conditions, and recommend which ones I should activate. Explain your reasoning for each recommendation.",
			sessionId: isDraftSessionId(sessionId) ? undefined : sessionId,
		});
	}, [beginTurn, selectedSessionId, send]);

	const executeDecision = useCallback(
		(decision: AgentDecision) => {
			const sessionId = activeRunSessionId ?? selectedSessionId;
			send({
				type: "execute",
				decision,
				sessionId:
					sessionId && !isDraftSessionId(sessionId) ? sessionId : undefined,
			});
		},
		[activeRunSessionId, selectedSessionId, send],
	);

	const sendCancel = useCallback(() => {
		const sessionId = useAgentStore.getState().activeRunSessionId;
		if (sessionId) {
			setCancelling(sessionId, true);
		}
		send({ type: "cancel" });
	}, [send, setCancelling]);

	const sendAnswer = useCallback(
		(questionId: string, answer: string) => {
			send({ type: "answer_question", data: { id: questionId, answer } });
			useAgentStore.getState().clearPendingQuestion();
		},
		[send],
	);

	return {
		isConnected,
		sendMessage,
		requestAnalysis,
		requestRecommendation,
		requestStrategyReview,
		executeDecision,
		sendCancel,
		sendAnswer,
		disconnect,
		reconnect,
	};
}

export default useAgentSocket;
