/**
 * Bug Store - Bug Tracker State Management
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { BugEntry, BugStats, BugsFilter } from "@/types/bug";

interface BugState {
	// Data
	bugs: BugEntry[];
	stats: BugStats | null;

	// UI State
	filters: BugsFilter;
	total: number;
	page: number;
	pageSize: number;
	selectedBug: BugEntry | null;
	isAddDialogOpen: boolean;

	// Actions
	setBugs: (bugs: BugEntry[], total: number) => void;
	setStats: (stats: BugStats | null) => void;
	setFilters: (filters: Partial<BugsFilter>) => void;
	resetFilters: () => void;
	setPage: (page: number) => void;
	setPageSize: (pageSize: number) => void;
	setSelectedBug: (bug: BugEntry | null) => void;
	setAddDialogOpen: (open: boolean) => void;
	reset: () => void;
}

const initialFilters: BugsFilter = {
	page: 1,
	pageSize: 50,
};

export const useBugStore = create<BugState>()(
	devtools(
		(set) => ({
			bugs: [],
			stats: null,
			filters: initialFilters,
			total: 0,
			page: 1,
			pageSize: 50,
			selectedBug: null,
			isAddDialogOpen: false,

			setBugs: (bugs, total) => set({ bugs, total }, false, "setBugs"),

			setStats: (stats) => set({ stats }, false, "setStats"),

			setFilters: (newFilters) =>
				set(
					(state) => ({
						filters: { ...state.filters, ...newFilters },
						page: newFilters.page ?? 1,
					}),
					false,
					"setFilters",
				),

			resetFilters: () =>
				set({ filters: initialFilters, page: 1 }, false, "resetFilters"),

			setPage: (page) =>
				set(
					(state) => ({
						page,
						filters: { ...state.filters, page },
					}),
					false,
					"setPage",
				),

			setPageSize: (pageSize) =>
				set(
					(state) => ({
						pageSize,
						page: 1,
						filters: { ...state.filters, pageSize, page: 1 },
					}),
					false,
					"setPageSize",
				),

			setSelectedBug: (bug) =>
				set({ selectedBug: bug }, false, "setSelectedBug"),

			setAddDialogOpen: (open) =>
				set({ isAddDialogOpen: open }, false, "setAddDialogOpen"),

			reset: () =>
				set(
					{
						bugs: [],
						stats: null,
						filters: initialFilters,
						total: 0,
						page: 1,
						pageSize: 50,
						selectedBug: null,
						isAddDialogOpen: false,
					},
					false,
					"reset",
				),
		}),
		{ name: "BugStore" },
	),
);

export default useBugStore;
