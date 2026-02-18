/**
 * Log Store - UI state for Log Viewer
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { LogEntry, LogsFilter } from "@/types/log";

interface LogState {
	filters: LogsFilter;
	autoRefresh: boolean;
	selectedLog: LogEntry | null;

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
			filters: initialFilters,
			autoRefresh: false,
			selectedLog: null,

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

			toggleAutoRefresh: () =>
				set(
					(state) => ({ autoRefresh: !state.autoRefresh }),
					false,
					"toggleAutoRefresh",
				),

			setSelectedLog: (log) =>
				set({ selectedLog: log }, false, "setSelectedLog"),

			reset: () =>
				set(
					{
						filters: initialFilters,
						autoRefresh: false,
						selectedLog: null,
					},
					false,
					"reset",
				),
		}),
		{ name: "LogStore" },
	),
);

export default useLogStore;
