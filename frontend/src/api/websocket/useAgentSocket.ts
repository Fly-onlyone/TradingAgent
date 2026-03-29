/**
 * Agent Chat WebSocket Hook
 */

import * as Sentry from "@sentry/react";
import { useCallback, useRef, useState } from "react";
import { getAccessToken } from "@/api/client";
import { useAgentStore } from "@/store/agentStore";
import type { WebSocketMessage } from "@/types";
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
}

export interface ToolCall {
	id: string;
	name: string;
	arguments: Record<string, unknown>;
	result?: unknown;
}

export interface AgentDecision {
	action: "buy" | "sell" | "hold" | "wait";
	symbol?: string;
	confidence: number;
	reasoning: string;
	riskAssessment?: string;
}

interface UsageData {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
}

interface AgentSocketMessage extends WebSocketMessage {
	type:
		| "message"
		| "thinking"
		| "text_delta"
		| "tool_call"
		| "decision"
		| "chart_data"
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
		| UsageData
		| { status: string }
		| { error: string }
		| { content?: string }
		| {
				sessionId: string;
		  };
}

export function useAgentSocket() {
	const {
		addMessage,
		updateStatus,
		setThinking,
		setCancelling,
		addToolCall,
		setThinkingContent,
		appendStreamingText,
		setCurrentSessionId,
		addSession,
		currentSessionId,
	} = useAgentStore();
	const recentIncomingMessageKeysRef = useRef<Map<string, number>>(new Map());
	const pendingChartDataRef = useRef<ChartData | null>(null);
	const [sessionTokens, setSessionTokens] = useState(0);

	const handleMessage = useCallback(
		(message: WebSocketMessage) => {
			const agentMessage = message as AgentSocketMessage;

			switch (agentMessage.type) {
				case "message": {
					const msg = agentMessage.data as AgentMessage;
					// Attach accumulated thinking content from the store as fallback
					// (backend also sends it, but store has the real-time accumulated version)
					if (msg.role === "assistant") {
						const storeThinking = useAgentStore.getState().thinkingContent;
						if (!msg.thinkingContent && storeThinking) {
							msg.thinkingContent = storeThinking;
						}
						// Attach any pending chart data from tool results
						if (pendingChartDataRef.current) {
							msg.chartData = pendingChartDataRef.current;
							pendingChartDataRef.current = null;
						}
					}

					// Guard against duplicated incoming payloads that can happen during reconnect races.
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
							setThinking(false);
							break;
						}

						recentKeys.set(messageKey, now);
					}

					addMessage(msg);
					setThinking(false);
					break;
				}
				case "thinking": {
					const thinkingData = agentMessage.data as {
						content?: string;
					};
					setThinking(true);
					if (thinkingData?.content) {
						setThinkingContent(thinkingData.content);
					}
					break;
				}
				case "text_delta": {
					const delta = agentMessage.data as { content: string };
					if (delta?.content) {
						appendStreamingText(delta.content);
					}
					break;
				}
				case "tool_call":
					addToolCall(agentMessage.data as ToolCall);
					break;
				case "decision": {
					// Handle trading decision
					const decision = agentMessage.data as AgentDecision;
					addMessage({
						id: crypto.randomUUID(),
						role: "assistant",
						content: `Trading Decision: ${decision.action.toUpperCase()}`,
						timestamp: Date.now(),
						decision,
					});
					break;
				}
				case "chart_data": {
					// Buffer chart data to attach to the next assistant message
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
					setCurrentSessionId(sessionId);
					addSession({
						id: sessionId,
						isActive: true,
						totalMessages: 0,
						userMessages: 0,
						assistantMessages: 0,
						decisionsMade: 0,
						tradesExecuted: 0,
						totalTokens: 0,
						symbolsDiscussed: [],
						startedAt: new Date().toISOString(),
					});
					break;
				}
				case "usage": {
					const usage = agentMessage.data as UsageData;
					setSessionTokens(usage.totalTokens);
					break;
				}
				case "cancel_ack":
					setThinking(false);
					setCancelling(false);
					break;
				case "error":
					addMessage({
						id: crypto.randomUUID(),
						role: "system",
						content: `Error: ${(agentMessage.data as { error: string }).error}`,
						timestamp: Date.now(),
					});
					setThinking(false);
					break;
			}
		},
		[
			addMessage,
			updateStatus,
			setThinking,
			setCancelling,
			addToolCall,
			setThinkingContent,
			appendStreamingText,
			setCurrentSessionId,
			addSession,
		],
	);

	const token = getAccessToken();

	const { isConnected, send, disconnect, reconnect } = useWebSocket({
		url: `${getWsUrl("/ws/agent/chat")}?token=${token}`,
		enabled: !!token,
		onMessage: handleMessage,
		onOpen: () => {
			console.log("Agent WebSocket connected");
			// Don't set 'connected' here — the backend sends an explicit status
			// message after create_agent_with_tools() succeeds. This prevents
			// the UI from flickering between states during reconnect attempts.
		},
		onClose: () => {
			console.log("Agent WebSocket disconnected");
			updateStatus("disconnected");
			setThinking(false);
		},
		onError: (error) => {
			Sentry.captureException(error, {
				tags: { component: "agent-websocket" },
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
			addMessage(message);
			send({
				type: "message",
				content,
				sessionId: currentSessionId || undefined,
			});
		},
		[send, addMessage, currentSessionId],
	);

	const requestAnalysis = useCallback(
		(
			symbol?: string,
			analysisType?: "technical" | "fundamental" | "combined",
		) => {
			send({
				type: "analyze",
				symbol: symbol || "BTC-USDT",
				analysisType: analysisType || "combined",
				sessionId: currentSessionId || undefined,
			});
		},
		[send, currentSessionId],
	);

	const requestRecommendation = useCallback(
		(symbol?: string) => {
			send({
				type: "recommend",
				symbol,
				sessionId: currentSessionId || undefined,
			});
		},
		[send, currentSessionId],
	);

	const requestStrategyReview = useCallback(() => {
		send({
			type: "message",
			content:
				"Review my trading strategies. List all inactive strategies, evaluate each against current market conditions, and recommend which ones I should activate. Explain your reasoning for each recommendation.",
			sessionId: currentSessionId || undefined,
		});
	}, [send, currentSessionId]);

	const executeDecision = useCallback(
		(decision: AgentDecision) => {
			send({
				type: "execute",
				decision,
				sessionId: currentSessionId || undefined,
			});
		},
		[send, currentSessionId],
	);

	const sendCancel = useCallback(() => {
		setCancelling(true);
		send({ type: "cancel" });
	}, [send, setCancelling]);

	return {
		isConnected,
		sendMessage,
		requestAnalysis,
		requestRecommendation,
		requestStrategyReview,
		executeDecision,
		sendCancel,
		disconnect,
		reconnect,
		sessionTokens,
	};
}

export default useAgentSocket;
