/**
 * Task Store - UI state for Tasks page
 */

import { create } from "zustand";

interface TaskUiState {
	selectedTaskId: string | null;
	setSelectedTaskId: (taskId: string | null) => void;
	reset: () => void;
}

export const useTaskStore = create<TaskUiState>((set) => ({
	selectedTaskId: null,
	setSelectedTaskId: (selectedTaskId) => set({ selectedTaskId }),
	reset: () => set({ selectedTaskId: null }),
}));

export const selectSelectedTaskId = (state: TaskUiState) =>
	state.selectedTaskId;

export default useTaskStore;
