/**
 * Log Store - Log Viewer State Management
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { LogEntry, LogsFilter, LogStats } from '@/types/log';

interface LogState {
    // Data
    logs: LogEntry[];
    stats: LogStats | null;

    // UI State
    filters: LogsFilter;
    total: number;
    page: number;
    pageSize: number;
    autoRefresh: boolean;
    selectedLog: LogEntry | null;

    // Actions
    setLogs: (logs: LogEntry[], total: number) => void;
    setStats: (stats: LogStats | null) => void;
    setFilters: (filters: Partial<LogsFilter>) => void;
    resetFilters: () => void;
    setPage: (page: number) => void;
    setPageSize: (pageSize: number) => void;
    toggleAutoRefresh: () => void;
    setSelectedLog: (log: LogEntry | null) => void;
    reset: () => void;
}

const initialFilters: LogsFilter = {
    page: 1,
    pageSize: 50,
};

export const useLogStore = create<LogState>()(
    devtools(
        (set) => ({
            logs: [],
            stats: null,
            filters: initialFilters,
            total: 0,
            page: 1,
            pageSize: 50,
            autoRefresh: false,
            selectedLog: null,

            setLogs: (logs, total) =>
                set({ logs, total }, false, 'setLogs'),

            setStats: (stats) =>
                set({ stats }, false, 'setStats'),

            setFilters: (newFilters) =>
                set(
                    (state) => ({
                        filters: { ...state.filters, ...newFilters },
                        page: newFilters.page ?? 1,
                    }),
                    false,
                    'setFilters',
                ),

            resetFilters: () =>
                set({ filters: initialFilters, page: 1 }, false, 'resetFilters'),

            setPage: (page) =>
                set(
                    (state) => ({
                        page,
                        filters: { ...state.filters, page },
                    }),
                    false,
                    'setPage',
                ),

            setPageSize: (pageSize) =>
                set(
                    (state) => ({
                        pageSize,
                        page: 1,
                        filters: { ...state.filters, pageSize, page: 1 },
                    }),
                    false,
                    'setPageSize',
                ),

            toggleAutoRefresh: () =>
                set((state) => ({ autoRefresh: !state.autoRefresh }), false, 'toggleAutoRefresh'),

            setSelectedLog: (log) =>
                set({ selectedLog: log }, false, 'setSelectedLog'),

            reset: () =>
                set(
                    {
                        logs: [],
                        stats: null,
                        filters: initialFilters,
                        total: 0,
                        page: 1,
                        pageSize: 50,
                        autoRefresh: false,
                        selectedLog: null,
                    },
                    false,
                    'reset',
                ),
        }),
        { name: 'LogStore' },
    ),
);

export default useLogStore;
