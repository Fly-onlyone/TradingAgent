/**
 * Strategies API Endpoints
 */

import apiClient from '../client';
import type { Strategy, StrategyCreate, StrategyUpdate, StrategySignal, BacktestResults } from '@/types';

export interface BacktestParams {
  strategyId: string;
  symbol: string;
  timeframe: string;
  startDate: string;
  endDate: string;
  initialCapital?: number;
}

export const strategiesApi = {
  /**
   * Get all strategies
   */
  async getStrategies(): Promise<Strategy[]> {
    const response = await apiClient.get<Strategy[]>('/strategies');
    return response.data;
  },

  /**
   * Get strategy by ID
   */
  async getStrategy(strategyId: string): Promise<Strategy> {
    const response = await apiClient.get<Strategy>(`/strategies/${strategyId}`);
    return response.data;
  },

  /**
   * Create new strategy
   */
  async createStrategy(data: StrategyCreate): Promise<Strategy> {
    const response = await apiClient.post<Strategy>('/strategies', data);
    return response.data;
  },

  /**
   * Update strategy
   */
  async updateStrategy(strategyId: string, data: StrategyUpdate): Promise<Strategy> {
    const response = await apiClient.patch<Strategy>(`/strategies/${strategyId}`, data);
    return response.data;
  },

  /**
   * Delete strategy
   */
  async deleteStrategy(strategyId: string): Promise<void> {
    await apiClient.delete(`/strategies/${strategyId}`);
  },

  /**
   * Activate/deactivate strategy
   */
  async toggleStrategy(strategyId: string, active: boolean): Promise<Strategy> {
    const response = await apiClient.patch<Strategy>(`/strategies/${strategyId}`, {
      isActive: active,
    });
    return response.data;
  },

  /**
   * Run backtest on strategy
   */
  async runBacktest(params: BacktestParams): Promise<BacktestResults> {
    const response = await apiClient.post<BacktestResults>(
      `/strategies/${params.strategyId}/backtest`,
      params
    );
    return response.data;
  },

  /**
   * Get strategy signals
   */
  async getSignals(strategyId: string): Promise<StrategySignal[]> {
    const response = await apiClient.get<StrategySignal[]>(`/strategies/${strategyId}/signals`);
    return response.data;
  },
};

export default strategiesApi;
