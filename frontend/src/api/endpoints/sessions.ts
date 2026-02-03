/**
 * Sessions API Endpoints
 */

import apiClient from '../client';
import type {
    AgentSession,
    AgentSessionWithMessages,
    SessionCreate,
    SessionUpdate,
    SessionListResponse,
    GroupedSessionsResponse,
    MessageCreate,
    SessionMessage,
    MessageListResponse,
} from '@/types/session';
import type {PaginationParams} from '@/types';

export interface SessionsFilter extends PaginationParams {
    isActive?: boolean;
    symbol?: string;
}

export const sessionsApi = {
    /**
     * Create a new session
     */
    async createSession(data: SessionCreate): Promise<AgentSession> {
        const response = await apiClient.post<AgentSession>('/agent/sessions', data);
        return response.data;
    },

    /**
     * Get session by ID with all messages
     */
    async getSession(sessionId: string): Promise<AgentSessionWithMessages> {
        const response = await apiClient.get<AgentSessionWithMessages>(`/agent/sessions/${sessionId}`);
        return response.data;
    },

    /**
     * Get all sessions with filters
     */
    async getSessions(params?: SessionsFilter): Promise<SessionListResponse> {
        const response = await apiClient.get<SessionListResponse>('/agent/sessions', {params});
        return response.data;
    },

    /**
     * Get sessions grouped by date for sidebar
     */
    async getSessionsGrouped(limit?: number): Promise<GroupedSessionsResponse> {
        const response = await apiClient.get<GroupedSessionsResponse>('/agent/sessions/grouped', {
            params: {limit},
        });
        return response.data;
    },

    /**
     * Get paginated messages for a session
     */
    async getSessionMessages(sessionId: string, params?: PaginationParams): Promise<MessageListResponse> {
        const response = await apiClient.get<MessageListResponse>(
            `/agent/sessions/${sessionId}/messages`,
            {params}
        );
        return response.data;
    },

    /**
     * Add a message to a session
     */
    async addMessage(sessionId: string, data: MessageCreate): Promise<SessionMessage> {
        const response = await apiClient.post<SessionMessage>(
            `/agent/sessions/${sessionId}/messages`,
            data
        );
        return response.data;
    },

    /**
     * Update session title or description
     */
    async updateSession(sessionId: string, data: SessionUpdate): Promise<AgentSession> {
        const response = await apiClient.put<AgentSession>(`/agent/sessions/${sessionId}`, data);
        return response.data;
    },

    /**
     * End/close a session
     */
    async endSession(sessionId: string): Promise<AgentSession> {
        const response = await apiClient.post<AgentSession>(`/agent/sessions/${sessionId}/end`);
        return response.data;
    },

    /**
     * Delete a session
     */
    async deleteSession(sessionId: string): Promise<void> {
        await apiClient.delete(`/agent/sessions/${sessionId}`);
    },
};

export default sessionsApi;
