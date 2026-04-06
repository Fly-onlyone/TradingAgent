/**
 * Generic WebSocket Hook
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { WebSocketMessage } from "@/types";

export interface UseWebSocketOptions {
	url: string;
	enabled?: boolean;
	onOpen?: () => void;
	onClose?: (event: CloseEvent) => void;
	onError?: (error: Event) => void;
	onMessage?: (data: WebSocketMessage) => void;
	reconnect?: boolean;
	reconnectInterval?: number;
	maxReconnectAttempts?: number;
	heartbeatMessage?: string | null;
	heartbeatIntervalMs?: number;
}

export interface UseWebSocketReturn {
	isConnected: boolean;
	send: (data: unknown) => void;
	disconnect: () => void;
	reconnect: () => void;
}

export function useWebSocket({
	url,
	enabled = true,
	onOpen,
	onClose,
	onError,
	onMessage,
	reconnect = true,
	reconnectInterval = 3000,
	maxReconnectAttempts = 5,
	heartbeatMessage = null,
	heartbeatIntervalMs = 20000,
}: UseWebSocketOptions): UseWebSocketReturn {
	const wsRef = useRef<WebSocket | null>(null);
	const reconnectAttemptsRef = useRef(0);
	const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const mountedRef = useRef(false);
	const [isConnected, setIsConnected] = useState(false);
	const [reconnectKey, setReconnectKey] = useState(0);

	// Store callbacks in refs so they don't trigger reconnections
	const onOpenRef = useRef(onOpen);
	const onCloseRef = useRef(onClose);
	const onErrorRef = useRef(onError);
	const onMessageRef = useRef(onMessage);

	onOpenRef.current = onOpen;
	onCloseRef.current = onClose;
	onErrorRef.current = onError;
	onMessageRef.current = onMessage;

	// Cleanup a WebSocket: null out handlers then close
	const cleanupWs = useCallback((ws: WebSocket | null) => {
		if (!ws) return;
		ws.onopen = null;
		ws.onclose = null;
		ws.onerror = null;
		ws.onmessage = null;
		if (
			ws.readyState === WebSocket.OPEN ||
			ws.readyState === WebSocket.CONNECTING
		) {
			ws.close();
		}
	}, []);

	const clearHeartbeat = useCallback(() => {
		if (heartbeatIntervalRef.current) {
			clearInterval(heartbeatIntervalRef.current);
			heartbeatIntervalRef.current = null;
		}
	}, []);

	const send = useCallback((data: unknown) => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify(data));
		}
	}, []);

	useEffect(() => {
		if (!enabled) return;
		void reconnectKey;

		mountedRef.current = true;
		reconnectAttemptsRef.current = 0;

		const doConnect = () => {
			if (!mountedRef.current) return;

			// Clean up previous connection
			cleanupWs(wsRef.current);
			wsRef.current = null;

			const ws = new WebSocket(url);

			ws.onopen = () => {
				if (!mountedRef.current) {
					ws.close();
					return;
				}
				setIsConnected(true);
				reconnectAttemptsRef.current = 0;
				clearHeartbeat();
				if (heartbeatMessage) {
					heartbeatIntervalRef.current = setInterval(() => {
						if (ws.readyState === WebSocket.OPEN) {
							ws.send(heartbeatMessage);
						}
					}, heartbeatIntervalMs);
				}
				onOpenRef.current?.();
			};

			ws.onclose = (event: CloseEvent) => {
				if (!mountedRef.current) return;
				setIsConnected(false);
				clearHeartbeat();
				onCloseRef.current?.(event);

				// Don't reconnect for application-level close codes (4xxx) —
				// these indicate config errors that reconnecting won't fix
				const isAppClose = event.code >= 4000;

				if (
					reconnect &&
					!isAppClose &&
					mountedRef.current &&
					reconnectAttemptsRef.current < maxReconnectAttempts
				) {
					reconnectTimeoutRef.current = setTimeout(() => {
						reconnectAttemptsRef.current += 1;
						doConnect();
					}, reconnectInterval);
				}
			};

			ws.onerror = (error) => {
				onErrorRef.current?.(error);
			};

			ws.onmessage = (event) => {
				try {
					const data = JSON.parse(event.data) as WebSocketMessage;
					onMessageRef.current?.(data);
				} catch {
					console.error("Failed to parse WebSocket message:", event.data);
				}
			};

			wsRef.current = ws;
		};

		doConnect();

		return () => {
			mountedRef.current = false;
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current);
				reconnectTimeoutRef.current = null;
			}
			clearHeartbeat();
			cleanupWs(wsRef.current);
			wsRef.current = null;
			setIsConnected(false);
		};
	}, [
		url,
		enabled,
		reconnect,
		reconnectInterval,
		maxReconnectAttempts,
		heartbeatMessage,
		heartbeatIntervalMs,
		reconnectKey,
		cleanupWs,
		clearHeartbeat,
	]);

	const disconnect = useCallback(() => {
		mountedRef.current = false;
		if (reconnectTimeoutRef.current) {
			clearTimeout(reconnectTimeoutRef.current);
			reconnectTimeoutRef.current = null;
		}
		clearHeartbeat();
		cleanupWs(wsRef.current);
		wsRef.current = null;
		setIsConnected(false);
	}, [cleanupWs, clearHeartbeat]);

	const manualReconnect = useCallback(() => {
		reconnectAttemptsRef.current = 0;
		setReconnectKey((k) => k + 1);
	}, []);

	return {
		isConnected,
		send,
		disconnect,
		reconnect: manualReconnect,
	};
}

export default useWebSocket;
