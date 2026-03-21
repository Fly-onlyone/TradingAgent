/**
 * Tasks API Endpoints
 */

import apiClient from '../client';
import type {
  AgentTask,
  TaskCreate,
  TaskUpdate,
  TaskListResponse,
  TaskExecutionListResponse,
  TaskStatus,
} from '@/types/task';
import type { PaginationParams } from '@/types';

export interface TasksFilter extends PaginationParams {
  status?: TaskStatus;
}

export const tasksApi = {
  /**
   * Create a new task
   */
  async createTask(data: TaskCreate): Promise<AgentTask> {
    const response = await apiClient.post<AgentTask>('/agent/tasks', data);
    return response.data;
  },

  /**
   * Get task by ID
   */
  async getTask(taskId: string): Promise<AgentTask> {
    const response = await apiClient.get<AgentTask>(`/agent/tasks/${taskId}`);
    return response.data;
  },

  /**
   * Get all tasks with filters
   */
  async getTasks(params?: TasksFilter): Promise<TaskListResponse> {
    const response = await apiClient.get<TaskListResponse>('/agent/tasks', { params });
    return response.data;
  },

  /**
   * Update a task
   */
  async updateTask(taskId: string, data: TaskUpdate): Promise<AgentTask> {
    const response = await apiClient.put<AgentTask>(`/agent/tasks/${taskId}`, data);
    return response.data;
  },

  /**
   * Delete a task
   */
  async deleteTask(taskId: string): Promise<void> {
    await apiClient.delete(`/agent/tasks/${taskId}`);
  },

  /**
   * Pause a task
   */
  async pauseTask(taskId: string): Promise<AgentTask> {
    const response = await apiClient.post<AgentTask>(`/agent/tasks/${taskId}/pause`);
    return response.data;
  },

  /**
   * Resume a task
   */
  async resumeTask(taskId: string): Promise<AgentTask> {
    const response = await apiClient.post<AgentTask>(`/agent/tasks/${taskId}/resume`);
    return response.data;
  },

  /**
   * Run task immediately
   */
  async runTaskNow(taskId: string): Promise<{ message: string }> {
    const response = await apiClient.post<{ message: string }>(`/agent/tasks/${taskId}/run-now`);
    return response.data;
  },

  /**
   * Get task execution history
   */
  async getTaskHistory(taskId: string, params?: PaginationParams): Promise<TaskExecutionListResponse> {
    const response = await apiClient.get<TaskExecutionListResponse>(
      `/agent/tasks/${taskId}/history`,
      { params }
    );
    return response.data;
  },
};

export default tasksApi;
