/**
 * Order Types
 */

export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop" | "stop_limit";
export type OrderStatus =
	| "pending"
	| "open"
	| "filled"
	| "partially_filled"
	| "cancelled"
	| "rejected";
export type PositionSide = "long" | "short";

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

export interface OkxOrder {
	orderId: string;
	clientOrderId?: string;
	symbol: string;
	side: string;
	orderType: string;
	status: string;
	rawStatus: string;
	quantity: number;
	filledQuantity: number;
	price?: number;
	avgFillPrice?: number;
	createdAtMs: number;
	updatedAtMs: number;
}

export interface OkxOrderListResponse {
	orders: OkxOrder[];
	count: number;
	error?: string | null;
}

export interface OkxCancelOrderRequest {
	symbol: string;
	orderId: string;
}

export interface OkxCancelOrderResponse {
	success: boolean;
	message: string;
	error?: string | null;
}
