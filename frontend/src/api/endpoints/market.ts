/**
 * Market Data API Endpoints
 */

import apiClient from '../client';
import type { Candle, OrderBook, Ticker, Timeframe, TechnicalIndicators } from '@/types';

export interface CandlesParams {
  symbol: string;
  timeframe: Timeframe;
  limit?: number;
  startTime?: number;
  endTime?: number;
}

export const marketApi = {
  /**
   * Get ticker for a symbol
   */
  async getTicker(symbol: string): Promise<Ticker> {
    const response = await apiClient.get<Ticker>(`/market/ticker/${symbol}`);
    return response.data;
  },

  /**
   * Get all tickers
   */
  async getAllTickers(): Promise<Ticker[]> {
    const response = await apiClient.get<Ticker[]>('/market/tickers');
    return response.data;
  },

  /**
   * Get OHLCV candles
   */
  async getCandles(params: CandlesParams): Promise<Candle[]> {
    const response = await apiClient.get<Candle[]>('/market/candles', { params });
    return response.data;
  },

  /**
   * Get order book
   */
  async getOrderBook(symbol: string, limit?: number): Promise<OrderBook> {
    const response = await apiClient.get<OrderBook>(`/market/orderbook/${symbol}`, {
      params: { limit },
    });
    return response.data;
  },

  /**
   * Get technical indicators
   */
  async getIndicators(symbol: string, timeframe: Timeframe): Promise<TechnicalIndicators> {
    const response = await apiClient.get<TechnicalIndicators>(`/market/indicators/${symbol}`, {
      params: { timeframe },
    });
    return response.data;
  },

  /**
   * Get available symbols
   */
  async getSymbols(): Promise<string[]> {
    const response = await apiClient.get<string[]>('/market/symbols');
    return response.data;
  },
};

export default marketApi;
