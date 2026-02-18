/**
 * Bug Store - UI state for Bug Tracker
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { BugEntry, BugsFilter } from "@/types/bug";

interface BugState {
	filters: BugsFilter;
	selectedBug: BugEntry | null;
	isAddDialogOpen: boolean;

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
			filters: initialFilters,
			selectedBug: null,
			isAddDialogOpen: false,

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

			setSelectedBug: (bug) =>
				set({ selectedBug: bug }, false, "setSelectedBug"),

			setAddDialogOpen: (open) =>
				set({ isAddDialogOpen: open }, false, "setAddDialogOpen"),

			reset: () =>
				set(
					{
						filters: initialFilters,
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
