/**
 * Sessions API Endpoints
 */

import type { PaginationParams } from "@/types";
import type {
	AgentSession,
	AgentSessionWithMessages,
	GroupedSessionsResponse,
	MessageCreate,
	MessageListResponse,
	PendingQuestion,
	SessionCreate,
	SessionListResponse,
	SessionMessage,
	SessionsByDateGroup,
	SessionUpdate,
	ToolCall,
} from "@/types/session";
import apiClient from "../client";

export interface SessionsFilter extends PaginationParams {
	isActive?: boolean;
	symbol?: string;
}

// ── snake_case → camelCase transforms ──────────────────────────

function transformSession(data: Record<string, unknown>): AgentSession {
	return {
		id: data.id as string,
		title: data.title as string | undefined,
		description: data.description as string | undefined,
		isActive: data.is_active as boolean,
		pendingQuestion: data.pending_question
			? transformPendingQuestion(
					data.pending_question as Record<string, unknown>,
				)
			: undefined,
		totalMessages: data.total_messages as number,
		userMessages: data.user_messages as number,
		assistantMessages: data.assistant_messages as number,
		decisionsMade: data.decisions_made as number,
		tradesExecuted: data.trades_executed as number,
		totalTokens: data.total_tokens as number,
		symbolsDiscussed: data.symbols_discussed as string[],
		startedAt: data.started_at as string,
		endedAt: data.ended_at as string | undefined,
		lastMessageAt: data.last_message_at as string | undefined,
	};
}

function transformPendingQuestion(
	data: Record<string, unknown>,
): PendingQuestion {
	return {
		id: data.id as string,
		sessionId: data.session_id as string,
		question: data.question as string,
		options: (data.options as string[]) || [],
		multiSelect: data.multi_select as boolean | undefined,
		createdAt: data.created_at as string | undefined,
	};
}

function transformMessage(data: Record<string, unknown>): SessionMessage {
	return {
		id: data.id as string | undefined,
		role: data.role as SessionMessage["role"],
		content: data.content as string,
		timestamp: data.timestamp as string,
		decisionId: data.decision_id as string | undefined,
		toolCalls: data.tool_calls as ToolCall[] | undefined,
		thinkingContent: data.thinking_content as string | undefined,
	};
}

function transformSessionWithMessages(
	data: Record<string, unknown>,
): AgentSessionWithMessages {
	return {
		...transformSession(data),
		messages: ((data.messages as Record<string, unknown>[]) || []).map(
			transformMessage,
		),
	};
}

function transformSessionGroup(
	data: Record<string, unknown>,
): SessionsByDateGroup {
	return {
		date: data.date as string,
		label: data.label as string,
		sessions: (data.sessions as Record<string, unknown>[]).map(
			transformSession,
		),
	};
}

export const sessionsApi = {
	/**
	 * Create a new session
	 */
	async createSession(data: SessionCreate): Promise<AgentSession> {
		const response = await apiClient.post<Record<string, unknown>>(
			"/agent/sessions",
			data,
		);
		return transformSession(response.data);
	},

	/**
	 * Get session by ID with all messages
	 */
	async getSession(sessionId: string): Promise<AgentSessionWithMessages> {
		const response = await apiClient.get<Record<string, unknown>>(
			`/agent/sessions/${sessionId}`,
		);
		return transformSessionWithMessages(response.data);
	},

	/**
	 * Get all sessions with filters
	 */
	async getSessions(params?: SessionsFilter): Promise<SessionListResponse> {
		const response = await apiClient.get<Record<string, unknown>>(
			"/agent/sessions",
			{ params },
		);
		return {
			sessions: (
				(response.data.sessions || response.data.items) as Record<
					string,
					unknown
				>[]
			).map(transformSession),
			total: response.data.total as number,
			page: response.data.page as number,
			pageSize: (response.data.page_size ?? response.data.pageSize) as number,
		};
	},

	/**
	 * Get sessions grouped by date for sidebar
	 */
	async getSessionsGrouped(limit?: number): Promise<GroupedSessionsResponse> {
		const response = await apiClient.get<Record<string, unknown>>(
			"/agent/sessions/grouped",
			{
				params: { limit },
			},
		);
		return {
			groups: ((response.data.groups as Record<string, unknown>[]) || []).map(
				transformSessionGroup,
			),
			total: response.data.total as number,
		};
	},

	/**
	 * Get paginated messages for a session
	 */
	async getSessionMessages(
		sessionId: string,
		params?: PaginationParams,
	): Promise<MessageListResponse> {
		const response = await apiClient.get<Record<string, unknown>>(
			`/agent/sessions/${sessionId}/messages`,
			{ params },
		);
		return {
			messages: (
				(response.data.messages || response.data.items) as Record<
					string,
					unknown
				>[]
			).map(transformMessage),
			total: response.data.total as number,
			page: response.data.page as number,
			pageSize: (response.data.page_size ?? response.data.pageSize) as number,
		};
	},

	/**
	 * Add a message to a session
	 */
	async addMessage(
		sessionId: string,
		data: MessageCreate,
	): Promise<SessionMessage> {
		const response = await apiClient.post<Record<string, unknown>>(
			`/agent/sessions/${sessionId}/messages`,
			data,
		);
		return transformMessage(response.data);
	},

	/**
	 * Update session title or description
	 */
	async updateSession(
		sessionId: string,
		data: SessionUpdate,
	): Promise<AgentSession> {
		const response = await apiClient.put<Record<string, unknown>>(
			`/agent/sessions/${sessionId}`,
			data,
		);
		return transformSession(response.data);
	},

	/**
	 * End/close a session
	 */
	async endSession(sessionId: string): Promise<AgentSession> {
		const response = await apiClient.post<Record<string, unknown>>(
			`/agent/sessions/${sessionId}/end`,
		);
		return transformSession(response.data);
	},

	/**
	 * Delete a session
	 */
	async deleteSession(sessionId: string): Promise<void> {
		await apiClient.delete(`/agent/sessions/${sessionId}`);
	},
};

export default sessionsApi;
