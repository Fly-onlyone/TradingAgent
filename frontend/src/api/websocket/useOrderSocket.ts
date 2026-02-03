/**
 * Order Updates WebSocket Hook
 */

import { useCallback, useEffect } from 'react';
import { useWebSocket } from './useWebSocket';
import { useOrderStore } from '@/store/orderStore';
import { getAccessToken } from '@/api/client';
import type { Order, Position, WebSocketMessage } from '@/types';

interface OrderSocketMessage extends WebSocketMessage {
  type: 'order_update' | 'position_update' | 'fill' | 'error';
  data: Order | Position | { message: string };
}

export function useOrderSocket() {
  const { updateOrder, updatePosition } = useOrderStore();

  const handleMessage = useCallback(
    (message: WebSocketMessage) => {
      const orderMessage = message as OrderSocketMessage;

      switch (orderMessage.type) {
        case 'order_update':
          updateOrder(orderMessage.data as Order);
          break;
        case 'position_update':
          updatePosition(orderMessage.data as Position);
          break;
        case 'fill':
          // Handle fill notifications
          const order = orderMessage.data as Order;
          updateOrder(order);
          break;
        case 'error':
          console.error('Order WebSocket error:', orderMessage.data);
          break;
      }
    },
    [updateOrder, updatePosition]
  );

  const token = getAccessToken();

  const { isConnected, send, disconnect, reconnect } = useWebSocket({
    url: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/orders?token=${token}`,
    onMessage: handleMessage,
    onOpen: () => console.log('Order WebSocket connected'),
    onClose: () => console.log('Order WebSocket disconnected'),
    onError: (error) => console.error('Order WebSocket error:', error),
  });

  const subscribeToOrders = useCallback(() => {
    send({ action: 'subscribe', channel: 'orders' });
  }, [send]);

  const subscribeToPositions = useCallback(() => {
    send({ action: 'subscribe', channel: 'positions' });
  }, [send]);

  useEffect(() => {
    if (isConnected) {
      subscribeToOrders();
      subscribeToPositions();
    }
  }, [isConnected, subscribeToOrders, subscribeToPositions]);

  return {
    isConnected,
    disconnect,
    reconnect,
  };
}

export default useOrderSocket;
