/**
 * Trade Store - P&L State Management
 */

import {create} from 'zustand';
import {devtools} from 'zustand/middleware';
import type {
    TradeWithPnL,
    TradeSummary,
    TradesBySymbol,
    TradesFilter,
    TradeViewMode,
} from '@/types';

interface TradeState {
    // Data
    trades: TradeWithPnL[];
    summary: TradeSummary | null;
    bySymbol: TradesBySymbol[];

    // UI State
    filters: TradesFilter;
    viewMode: TradeViewMode;
    isLoading: boolean;
    error: string | null;
    total: number;
    page: number;
    pageSize: number;

    // Expanded symbols in grouped view
    expandedSymbols: Set<string>;

    // Actions
    setTrades: (trades: TradeWithPnL[], total: number) => void;
    setSummary: (summary: TradeSummary | null) => void;
    setBySymbol: (bySymbol: TradesBySymbol[]) => void;
    setFilters: (filters: Partial<TradesFilter>) => void;
    resetFilters: () => void;
    setViewMode: (viewMode: TradeViewMode) => void;
    setPage: (page: number) => void;
    setPageSize: (pageSize: number) => void;
    setLoading: (isLoading: boolean) => void;
    setError: (error: string | null) => void;
    toggleSymbolExpanded: (symbol: string) => void;
    expandAllSymbols: () => void;
    collapseAllSymbols: () => void;
    reset: () => void;
}

const initialFilters: TradesFilter = {
    page: 1,
    pageSize: 20,
};

export const useTradeStore = create<TradeState>()(
    devtools(
        (set, get) => ({
            // Initial State
            trades: [],
            summary: null,
            bySymbol: [],
            filters: initialFilters,
            viewMode: 'table',
            isLoading: false,
            error: null,
            total: 0,
            page: 1,
            pageSize: 20,
            expandedSymbols: new Set<string>(),

            // Actions
            setTrades: (trades, total) =>
                set({trades, total, error: null}, false, 'setTrades'),

            setSummary: (summary) =>
                set({summary, error: null}, false, 'setSummary'),

            setBySymbol: (bySymbol) =>
                set({bySymbol, error: null}, false, 'setBySymbol'),

            setFilters: (newFilters) =>
                set(
                    (state) => ({
                        filters: {...state.filters, ...newFilters},
                        // Reset to page 1 when filters change (except page)
                        page: newFilters.page ?? 1,
                    }),
                    false,
                    'setFilters'
                ),

            resetFilters: () =>
                set({filters: initialFilters, page: 1}, false, 'resetFilters'),

            setViewMode: (viewMode) =>
                set({viewMode}, false, 'setViewMode'),

            setPage: (page) =>
                set(
                    (state) => ({
                        page,
                        filters: {...state.filters, page},
                    }),
                    false,
                    'setPage'
                ),

            setPageSize: (pageSize) =>
                set(
                    (state) => ({
                        pageSize,
                        page: 1,
                        filters: {...state.filters, pageSize, page: 1},
                    }),
                    false,
                    'setPageSize'
                ),

            setLoading: (isLoading) =>
                set({isLoading}, false, 'setLoading'),

            setError: (error) =>
                set({error, isLoading: false}, false, 'setError'),

            toggleSymbolExpanded: (symbol) =>
                set(
                    (state) => {
                        const newExpanded = new Set(state.expandedSymbols);
                        if (newExpanded.has(symbol)) {
                            newExpanded.delete(symbol);
                        } else {
                            newExpanded.add(symbol);
                        }
                        return {expandedSymbols: newExpanded};
                    },
                    false,
                    'toggleSymbolExpanded'
                ),

            expandAllSymbols: () =>
                set(
                    (state) => ({
                        expandedSymbols: new Set(state.bySymbol.map((s) => s.symbol)),
                    }),
                    false,
                    'expandAllSymbols'
                ),

            collapseAllSymbols: () =>
                set({expandedSymbols: new Set()}, false, 'collapseAllSymbols'),

            reset: () =>
                set(
                    {
                        trades: [],
                        summary: null,
                        bySymbol: [],
                        filters: initialFilters,
                        viewMode: 'table',
                        isLoading: false,
                        error: null,
                        total: 0,
                        page: 1,
                        pageSize: 20,
                        expandedSymbols: new Set(),
                    },
                    false,
                    'reset'
                ),
        }),
        {name: 'TradeStore'}
    )
);

// Selectors
export const selectTrades = (state: TradeState) => state.trades;
export const selectSummary = (state: TradeState) => state.summary;
export const selectBySymbol = (state: TradeState) => state.bySymbol;
export const selectFilters = (state: TradeState) => state.filters;
export const selectViewMode = (state: TradeState) => state.viewMode;
export const selectIsLoading = (state: TradeState) => state.isLoading;
export const selectPagination = (state: TradeState) => ({
    page: state.page,
    pageSize: state.pageSize,
    total: state.total,
});

// Computed selectors
export const selectWinningTrades = (state: TradeState) =>
    state.trades.filter((t) => (t.realizedPnl ?? 0) > 0);

export const selectLosingTrades = (state: TradeState) =>
    state.trades.filter((t) => (t.realizedPnl ?? 0) < 0);

export const selectOpenTrades = (state: TradeState) =>
    state.trades.filter((t) => t.status === 'open');

export const selectClosedTrades = (state: TradeState) =>
    state.trades.filter((t) => t.status === 'closed');

export const selectTradesBySymbol = (symbol: string) => (state: TradeState) =>
    state.trades.filter((t) => t.symbol === symbol);

export const selectIsSymbolExpanded = (symbol: string) => (state: TradeState) =>
    state.expandedSymbols.has(symbol);

export default useTradeStore;
