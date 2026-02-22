/**
 * Market Data WebSocket Hook
 */

import { useCallback, useEffect } from "react";
import { useMarketStore } from "@/store/marketStore";
import type { OrderBook, Ticker, Trade, WebSocketMessage } from "@/types";
import { getWsUrl } from "@/utils/tauriEnv";
import { useWebSocket } from "./useWebSocket";

interface MarketSocketMessage extends WebSocketMessage {
	type: "ticker" | "orderbook" | "trade" | "subscribed" | "unsubscribed";
	data: Ticker | OrderBook | Trade | { channel: string };
}

export function useMarketSocket() {
	const { updateTicker, updateOrderBook, addTrade } = useMarketStore();

	const handleMessage = useCallback(
		(message: WebSocketMessage) => {
			const marketMessage = message as MarketSocketMessage;

			switch (marketMessage.type) {
				case "ticker":
					updateTicker(marketMessage.data as Ticker);
					break;
				case "orderbook":
					updateOrderBook(marketMessage.data as OrderBook);
					break;
				case "trade":
					addTrade(marketMessage.data as Trade);
					break;
				case "subscribed":
				case "unsubscribed":
					// Handle subscription confirmations if needed
					break;
			}
		},
		[updateTicker, updateOrderBook, addTrade],
	);

	const { isConnected, send, disconnect, reconnect } = useWebSocket({
		url: getWsUrl("/ws/market"),
		onMessage: handleMessage,
		onOpen: () => console.log("Market WebSocket connected"),
		onClose: () => console.log("Market WebSocket disconnected"),
		onError: (error) => console.error("Market WebSocket error:", error),
	});

	const subscribe = useCallback(
		(channel: string, symbol?: string) => {
			send({ action: "subscribe", channel, symbol });
		},
		[send],
	);

	const unsubscribe = useCallback(
		(channel: string, symbol?: string) => {
			send({ action: "unsubscribe", channel, symbol });
		},
		[send],
	);

	return {
		isConnected,
		subscribe,
		unsubscribe,
		disconnect,
		reconnect,
	};
}

export function useTickerSubscription(symbol: string) {
	const { subscribe, unsubscribe, isConnected } = useMarketSocket();
	const ticker = useMarketStore((state) => state.tickers[symbol]);

	useEffect(() => {
		if (isConnected && symbol) {
			subscribe("ticker", symbol);
			return () => unsubscribe("ticker", symbol);
		}
	}, [isConnected, symbol, subscribe, unsubscribe]);

	return { ticker, isConnected };
}

export function useOrderBookSubscription(symbol: string) {
	const { subscribe, unsubscribe, isConnected } = useMarketSocket();
	const orderBook = useMarketStore((state) => state.orderBooks[symbol]);

	useEffect(() => {
		if (isConnected && symbol) {
			subscribe("orderbook", symbol);
			return () => unsubscribe("orderbook", symbol);
		}
	}, [isConnected, symbol, subscribe, unsubscribe]);

	return { orderBook, isConnected };
}

export default useMarketSocket;
