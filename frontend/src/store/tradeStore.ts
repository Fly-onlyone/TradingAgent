/**
 * Trade Store - UI state for Trades page
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { TradesFilter, TradeViewMode } from "@/types";

interface TradeState {
	filters: TradesFilter;
	viewMode: TradeViewMode;
	expandedSymbols: Set<string>;

	setFilters: (filters: Partial<TradesFilter>) => void;
	resetFilters: () => void;
	setViewMode: (viewMode: TradeViewMode) => void;
	setPage: (page: number) => void;
	setPageSize: (pageSize: number) => void;
	toggleSymbolExpanded: (symbol: string) => void;
	expandAllSymbols: (symbols: string[]) => void;
	collapseAllSymbols: () => void;
	reset: () => void;
}

const initialFilters: TradesFilter = {
	page: 1,
	pageSize: 20,
};

export const useTradeStore = create<TradeState>()(
	devtools(
		(set) => ({
			filters: initialFilters,
			viewMode: "table",
			expandedSymbols: new Set<string>(),

			setFilters: (newFilters) =>
				set(
					(state) => ({
						filters: {
							...state.filters,
							...newFilters,
							page: newFilters.page ?? 1,
						},
					}),
					false,
					"setFilters",
				),

			resetFilters: () =>
				set({ filters: initialFilters }, false, "resetFilters"),

			setViewMode: (viewMode) => set({ viewMode }, false, "setViewMode"),

			setPage: (page) =>
				set(
					(state) => ({
						filters: { ...state.filters, page },
					}),
					false,
					"setPage",
				),

			setPageSize: (pageSize) =>
				set(
					(state) => ({
						filters: { ...state.filters, pageSize, page: 1 },
					}),
					false,
					"setPageSize",
				),

			toggleSymbolExpanded: (symbol) =>
				set(
					(state) => {
						const expandedSymbols = new Set(state.expandedSymbols);
						if (expandedSymbols.has(symbol)) {
							expandedSymbols.delete(symbol);
						} else {
							expandedSymbols.add(symbol);
						}
						return { expandedSymbols };
					},
					false,
					"toggleSymbolExpanded",
				),

			expandAllSymbols: (symbols) =>
				set({ expandedSymbols: new Set(symbols) }, false, "expandAllSymbols"),

			collapseAllSymbols: () =>
				set({ expandedSymbols: new Set() }, false, "collapseAllSymbols"),

			reset: () =>
				set(
					{
						filters: initialFilters,
						viewMode: "table",
						expandedSymbols: new Set(),
					},
					false,
					"reset",
				),
		}),
		{ name: "TradeStore" },
	),
);

export const selectFilters = (state: TradeState) => state.filters;
export const selectViewMode = (state: TradeState) => state.viewMode;
export const selectIsSymbolExpanded = (symbol: string) => (state: TradeState) =>
	state.expandedSymbols.has(symbol);

export default useTradeStore;
