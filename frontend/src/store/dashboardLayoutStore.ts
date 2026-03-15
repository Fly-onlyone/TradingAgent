/**
 * Dashboard section order persistence for drag-to-reorder.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

const DEFAULT_ORDER = ["stats", "positions-decisions", "activity"];

interface DashboardLayoutState {
	sectionOrder: string[];
	setSectionOrder: (order: string[]) => void;
	resetOrder: () => void;
}

export const useDashboardLayoutStore = create<DashboardLayoutState>()(
	persist(
		(set) => ({
			sectionOrder: DEFAULT_ORDER,
			setSectionOrder: (sectionOrder) => set({ sectionOrder }),
			resetOrder: () => set({ sectionOrder: DEFAULT_ORDER }),
		}),
		{
			name: "dashboard-layout",
		},
	),
);
