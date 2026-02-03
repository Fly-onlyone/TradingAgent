/**
 * Orders API Endpoints
 */

import apiClient from '../client';
import type { Order, OrderCreate, Position, TradeExecution, PaginatedResponse, PaginationParams } from '@/types';

export interface OrdersFilter extends PaginationParams {
  symbol?: string;
  status?: string;
  side?: string;
  startDate?: string;
  endDate?: string;
}

export const ordersApi = {
  /**
   * Create a new order
   */
  async createOrder(data: OrderCreate): Promise<Order> {
    const response = await apiClient.post<Order>('/orders', data);
    return response.data;
  },

  /**
   * Get order by ID
   */
  async getOrder(orderId: string): Promise<Order> {
    const response = await apiClient.get<Order>(`/orders/${orderId}`);
    return response.data;
  },

  /**
   * Get all orders with filters
   */
  async getOrders(params?: OrdersFilter): Promise<PaginatedResponse<Order>> {
    const response = await apiClient.get<PaginatedResponse<Order>>('/orders', { params });
    return response.data;
  },

  /**
   * Cancel an order
   */
  async cancelOrder(orderId: string): Promise<Order> {
    const response = await apiClient.delete<Order>(`/orders/${orderId}`);
    return response.data;
  },

  /**
   * Get open positions
   */
  async getPositions(): Promise<Position[]> {
    const response = await apiClient.get<Position[]>('/orders/positions');
    return response.data;
  },

  /**
   * Close a position
   */
  async closePosition(symbol: string): Promise<Order> {
    const response = await apiClient.post<Order>(`/orders/positions/${symbol}/close`);
    return response.data;
  },

  /**
   * Get trade executions
   */
  async getExecutions(orderId?: string): Promise<TradeExecution[]> {
    const params = orderId ? { orderId } : undefined;
    const response = await apiClient.get<TradeExecution[]>('/orders/executions', { params });
    return response.data;
  },
};

export default ordersApi;
