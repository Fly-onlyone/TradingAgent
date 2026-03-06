/**
 * Orders API Endpoints
 */

import type {
	OkxCancelOrderRequest,
	OkxCancelOrderResponse,
	OkxOrder,
	OkxOrderListResponse,
} from "@/types";
import { toNumber, toOptionalNumber, toTimestamp } from "@/utils/transformers";
import apiClient from "../client";

interface OkxOrderParams {
	symbol?: string;
	limit?: number;
}

function transformOkxOrder(order: Record<string, unknown>): OkxOrder {
	return {
		orderId: String(order.order_id ?? ""),
		clientOrderId: order.client_order_id
			? String(order.client_order_id)
			: undefined,
		symbol: String(order.symbol ?? ""),
		side: String(order.side ?? ""),
		orderType: String(order.order_type ?? ""),
		status: String(order.status ?? "pending"),
		rawStatus: String(order.raw_status ?? ""),
		quantity: toNumber(order.quantity),
		filledQuantity: toNumber(order.filled_quantity),
		price: toOptionalNumber(order.price),
		avgFillPrice: toOptionalNumber(order.avg_fill_price),
		createdAtMs: toTimestamp(order.created_at_ms),
		updatedAtMs: toTimestamp(order.updated_at_ms),
	};
}

export const ordersApi = {
	/**
	 * Get open orders directly from OKX
	 */
	async getOkxOpenOrders(
		params?: OkxOrderParams,
	): Promise<OkxOrderListResponse> {
		const response = await apiClient.get<{
			orders: Record<string, unknown>[];
			count: number;
			error?: string | null;
		}>("/orders/okx/open", {
			params: {
				symbol: params?.symbol || undefined,
				limit: params?.limit ?? 50,
			},
		});
		return {
			orders: (response.data.orders || []).map(transformOkxOrder),
			count: toNumber(response.data.count),
			error: response.data.error ?? null,
		};
	},

	/**
	 * Get recent order history directly from OKX
	 */
	async getOkxOrderHistory(
		params?: OkxOrderParams,
	): Promise<OkxOrderListResponse> {
		const response = await apiClient.get<{
			orders: Record<string, unknown>[];
			count: number;
			error?: string | null;
		}>("/orders/okx/history", {
			params: {
				symbol: params?.symbol || undefined,
				limit: params?.limit ?? 50,
			},
		});
		return {
			orders: (response.data.orders || []).map(transformOkxOrder),
			count: toNumber(response.data.count),
			error: response.data.error ?? null,
		};
	},

	/**
	 * Cancel an open OKX order
	 */
	async cancelOkxOrder(
		payload: OkxCancelOrderRequest,
	): Promise<OkxCancelOrderResponse> {
		const response = await apiClient.post<Record<string, unknown>>(
			"/orders/okx/cancel",
			{
				symbol: payload.symbol,
				order_id: payload.orderId,
			},
		);
		return {
			success: Boolean(response.data.success),
			message: String(response.data.message ?? ""),
			error: response.data.error ? String(response.data.error) : null,
		};
	},
};

export default ordersApi;
