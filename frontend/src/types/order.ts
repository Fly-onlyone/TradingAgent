/**
 * Order Types
 */

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit';
export type OrderStatus = 'pending' | 'open' | 'filled' | 'partially_filled' | 'cancelled' | 'rejected';
export type PositionSide = 'long' | 'short';

export interface Order {
  id: string;
  userId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  quantity: number;
  price?: number;
  stopPrice?: number;
  filledQuantity: number;
  avgFillPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  leverage?: number;
  exchangeOrderId?: string;
  agentReasoning?: string;
  createdAt: string;
  updatedAt?: string;
  filledAt?: string;
}

export interface OrderCreate {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price?: number;
  stopPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  leverage?: number;
}

export interface Position {
  id: string;
  symbol: string;
  side: PositionSide;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  leverage: number;
  liquidationPrice?: number;
  margin: number;
  createdAt: string;
}

export interface TradeExecution {
  id: string;
  orderId: string;
  symbol: string;
  side: OrderSide;
  price: number;
  quantity: number;
  fee: number;
  feeCurrency: string;
  timestamp: string;
}

// Risk parameters
export interface RiskParams {
  riskPercent: number;
  maxPositionSize: number;
  stopLossDistance?: number;
  takeProfitDistance?: number;
}

export interface CalculatedRisk {
  positionSize: number;
  stopLoss: number;
  takeProfit: number;
  riskAmount: number;
  rewardAmount: number;
  riskRewardRatio: number;
}
