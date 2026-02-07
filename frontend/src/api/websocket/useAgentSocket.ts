/**
 * Agent Chat WebSocket Hook
 */

import {useCallback} from 'react';
import {useWebSocket} from './useWebSocket';
import {useAgentStore} from '@/store/agentStore';
import {getAccessToken} from '@/api/client';
import type {WebSocketMessage} from '@/types';

export interface AgentMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    toolCalls?: ToolCall[];
    decision?: AgentDecision;
}

export interface ToolCall {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
    result?: unknown;
}

export interface AgentDecision {
    action: 'buy' | 'sell' | 'hold' | 'wait';
    symbol?: string;
    confidence: number;
    reasoning: string;
    riskAssessment?: string;
}

interface AgentSocketMessage extends WebSocketMessage {
    type: 'message' | 'thinking' | 'tool_call' | 'decision' | 'error' | 'status';
    data: AgentMessage | ToolCall | AgentDecision | { status: string } | { error: string };
}

export function useAgentSocket() {
    const {addMessage, updateStatus, setThinking, addToolCall} = useAgentStore();

    const handleMessage = useCallback(
        (message: WebSocketMessage) => {
            const agentMessage = message as AgentSocketMessage;

            switch (agentMessage.type) {
                case 'message':
                    addMessage(agentMessage.data as AgentMessage);
                    setThinking(false);
                    break;
                case 'thinking':
                    setThinking(true);
                    break;
                case 'tool_call':
                    addToolCall(agentMessage.data as ToolCall);
                    break;
                case 'decision':
                    // Handle trading decision
                    const decision = agentMessage.data as AgentDecision;
                    addMessage({
                        id: crypto.randomUUID(),
                        role: 'assistant',
                        content: `Trading Decision: ${decision.action.toUpperCase()}`,
                        timestamp: Date.now(),
                        decision,
                    });
                    break;
                case 'status': {
                    const statusData = agentMessage.data as { status: string; message?: string };
                    updateStatus(statusData.status);
                    break;
                }
                case 'error':
                    addMessage({
                        id: crypto.randomUUID(),
                        role: 'system',
                        content: `Error: ${(agentMessage.data as { error: string }).error}`,
                        timestamp: Date.now(),
                    });
                    setThinking(false);
                    break;
            }
        },
        [addMessage, updateStatus, setThinking, addToolCall]
    );

    const token = getAccessToken();

    const {isConnected, send, disconnect, reconnect} = useWebSocket({
        url: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/agent/chat?token=${token}`,
        enabled: !!token,
        onMessage: handleMessage,
        onOpen: () => {
            console.log('Agent WebSocket connected');
            // Don't set 'connected' here — the backend sends an explicit status
            // message after create_agent_with_tools() succeeds. This prevents
            // the UI from flickering between states during reconnect attempts.
        },
        onClose: () => {
            console.log('Agent WebSocket disconnected');
            updateStatus('disconnected');
        },
        onError: (error) => {
            console.error('Agent WebSocket error:', error);
            updateStatus('error');
        },
    });

    const sendMessage = useCallback(
        (content: string) => {
            const message: AgentMessage = {
                id: crypto.randomUUID(),
                role: 'user',
                content,
                timestamp: Date.now(),
            };
            addMessage(message);
            send({type: 'message', content});
        },
        [send, addMessage]
    );

    const requestAnalysis = useCallback(
        (symbol?: string, analysisType?: 'technical' | 'fundamental' | 'combined') => {
            send({type: 'analyze', symbol: symbol || 'BTC-USDT', analysisType: analysisType || 'combined'});
        },
        [send]
    );

    const requestRecommendation = useCallback(
        (symbol?: string) => {
            send({type: 'recommend', symbol});
        },
        [send]
    );

    const executeDecision = useCallback(
        (decision: AgentDecision) => {
            send({type: 'execute', decision});
        },
        [send]
    );

    return {
        isConnected,
        sendMessage,
        requestAnalysis,
        requestRecommendation,
        executeDecision,
        disconnect,
        reconnect,
    };
}

export default useAgentSocket;
