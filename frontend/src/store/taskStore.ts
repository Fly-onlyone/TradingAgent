/**
 * Tasks Store
 */

import { create } from 'zustand';
import type { AgentTask, TaskExecution, TaskStatus } from '@/types/task';

interface TaskState {
  // Data
  tasks: AgentTask[];
  executions: TaskExecution[];
  selectedTaskId: string | null;

  // Loading states
  isLoadingTasks: boolean;
  isSubmitting: boolean;

  // Pagination
  totalTasks: number;
  currentPage: number;
  pageSize: number;

  // Actions
  setTasks: (tasks: AgentTask[]) => void;
  addTask: (task: AgentTask) => void;
  updateTask: (task: AgentTask) => void;
  removeTask: (taskId: string) => void;

  setExecutions: (executions: TaskExecution[]) => void;
  addExecution: (execution: TaskExecution) => void;

  setSelectedTask: (taskId: string | null) => void;

  setLoadingTasks: (loading: boolean) => void;
  setSubmitting: (submitting: boolean) => void;

  setPagination: (total: number, page: number, pageSize: number) => void;

  clearTasks: () => void;
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  executions: [],
  selectedTaskId: null,
  isLoadingTasks: false,
  isSubmitting: false,
  totalTasks: 0,
  currentPage: 1,
  pageSize: 20,

  setTasks: (tasks) => set({ tasks }),

  addTask: (task) =>
    set((state) => ({
      tasks: [task, ...state.tasks],
      totalTasks: state.totalTasks + 1,
    })),

  updateTask: (task) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === task.id ? task : t)),
    })),

  removeTask: (taskId) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId),
      totalTasks: Math.max(0, state.totalTasks - 1),
      selectedTaskId: state.selectedTaskId === taskId ? null : state.selectedTaskId,
    })),

  setExecutions: (executions) => set({ executions }),

  addExecution: (execution) =>
    set((state) => ({
      executions: [execution, ...state.executions].slice(0, 50), // Keep last 50
    })),

  setSelectedTask: (selectedTaskId) => set({ selectedTaskId }),

  setLoadingTasks: (isLoadingTasks) => set({ isLoadingTasks }),
  setSubmitting: (isSubmitting) => set({ isSubmitting }),

  setPagination: (totalTasks, currentPage, pageSize) =>
    set({ totalTasks, currentPage, pageSize }),

  clearTasks: () =>
    set({
      tasks: [],
      executions: [],
      selectedTaskId: null,
      totalTasks: 0,
    }),
}));

// Selectors
export const selectActiveTasks = (state: TaskState) =>
  state.tasks.filter((t) => t.status === 'active');

export const selectPausedTasks = (state: TaskState) =>
  state.tasks.filter((t) => t.status === 'paused');

export const selectCompletedTasks = (state: TaskState) =>
  state.tasks.filter((t) => t.status === 'completed' || t.status === 'failed');

export const selectTaskById = (state: TaskState, taskId: string) =>
  state.tasks.find((t) => t.id === taskId);

export const selectTasksByStatus = (state: TaskState, status: TaskStatus) =>
  state.tasks.filter((t) => t.status === status);

export const selectTasksBySymbol = (state: TaskState, symbol: string) =>
  state.tasks.filter((t) => t.symbols.includes(symbol));

export const selectExecutionsByTaskId = (state: TaskState, taskId: string) =>
  state.executions.filter((e) => e.taskId === taskId);

export const selectSelectedTask = (state: TaskState) =>
  state.selectedTaskId ? state.tasks.find((t) => t.id === state.selectedTaskId) : null;

export default useTaskStore;
