/**
 * Orders Store
 */

import { create } from "zustand";
import type { Order, Position } from "@/types";

interface OrderState {
	// Data
	orders: Order[];
	positions: Position[];

	// Loading states
	isLoadingOrders: boolean;
	isLoadingPositions: boolean;

	// Actions
	setOrders: (orders: Order[]) => void;
	updateOrder: (order: Order) => void;
	removeOrder: (orderId: string) => void;

	setPositions: (positions: Position[]) => void;
	updatePosition: (position: Position) => void;
	removePosition: (symbol: string) => void;

	setLoadingOrders: (loading: boolean) => void;
	setLoadingPositions: (loading: boolean) => void;

	clearOrders: () => void;
}

export const useOrderStore = create<OrderState>((set) => ({
	orders: [],
	positions: [],
	isLoadingOrders: false,
	isLoadingPositions: false,

	setOrders: (orders) => set({ orders }),

	updateOrder: (order) =>
		set((state) => ({
			orders: state.orders.map((o) => (o.id === order.id ? order : o)),
		})),

	removeOrder: (orderId) =>
		set((state) => ({
			orders: state.orders.filter((o) => o.id !== orderId),
		})),

	setPositions: (positions) => set({ positions }),

	updatePosition: (position) =>
		set((state) => {
			const exists = state.positions.find((p) => p.symbol === position.symbol);
			if (exists) {
				return {
					positions: state.positions.map((p) =>
						p.symbol === position.symbol ? position : p,
					),
				};
			}
			return {
				positions: [...state.positions, position],
			};
		}),

	removePosition: (symbol) =>
		set((state) => ({
			positions: state.positions.filter((p) => p.symbol !== symbol),
		})),

	setLoadingOrders: (isLoadingOrders) => set({ isLoadingOrders }),
	setLoadingPositions: (isLoadingPositions) => set({ isLoadingPositions }),

	clearOrders: () =>
		set({
			orders: [],
			positions: [],
		}),
}));

export default useOrderStore;
