import type {
	AgentSession,
	GroupedSessionsResponse,
	SessionsByDateGroup,
} from "@/types/session";

export const AGENT_SESSIONS_GROUP_LIMIT = 50;

export function isDraftSessionId(sessionId?: string | null): boolean {
	return Boolean(sessionId?.startsWith("draft-"));
}

export function createOptimisticSession(
	sessionId: string,
	hasUserMessage = true,
): AgentSession {
	const now = new Date().toISOString();

	return {
		id: sessionId,
		sessionKind: "chat",
		canResume: true,
		title: "New Chat",
		isActive: true,
		totalMessages: hasUserMessage ? 1 : 0,
		userMessages: hasUserMessage ? 1 : 0,
		assistantMessages: 0,
		decisionsMade: 0,
		tradesExecuted: 0,
		totalTokens: 0,
		symbolsDiscussed: [],
		startedAt: now,
		lastMessageAt: now,
	};
}

export function upsertSessionInGroups(
	response: GroupedSessionsResponse | undefined,
	session: AgentSession,
): GroupedSessionsResponse {
	const groups = removeSessionFromGroupList(response?.groups ?? [], session.id);
	const today = new Date().toISOString().slice(0, 10);
	const sessionDate = (session.lastMessageAt ?? session.startedAt).slice(0, 10);
	const label = sessionDate === today ? "Today" : sessionDate;
	const nextGroup: SessionsByDateGroup = {
		date: sessionDate,
		label,
		sessions: [session],
	};
	const existingIndex = groups.findIndex((group) => group.date === sessionDate);
	const nextGroups = [...groups];

	if (existingIndex >= 0) {
		nextGroups[existingIndex] = {
			...nextGroups[existingIndex],
			sessions: [session, ...nextGroups[existingIndex].sessions],
		};
	} else {
		nextGroups.unshift(nextGroup);
	}

	return {
		groups: nextGroups,
		total: Math.max(response?.total ?? 0, countSessions(nextGroups)),
	};
}

export function touchSessionInGroups(
	response: GroupedSessionsResponse | undefined,
	sessionId: string,
	options?: {
		includeUserMessage?: boolean;
	},
): GroupedSessionsResponse | undefined {
	const session = findSession(response?.groups ?? [], sessionId);
	if (!session) {
		return response;
	}

	const nextLastMessageAt = new Date().toISOString();
	return upsertSessionInGroups(response, {
		...session,
		lastMessageAt: nextLastMessageAt,
		totalMessages:
			session.totalMessages + (options?.includeUserMessage ? 1 : 0),
		userMessages: session.userMessages + (options?.includeUserMessage ? 1 : 0),
	});
}

export function replaceSessionIdInGroups(
	response: GroupedSessionsResponse | undefined,
	oldSessionId: string,
	newSessionId: string,
): GroupedSessionsResponse | undefined {
	if (!response) {
		return response;
	}

	return {
		...response,
		groups: response.groups.map((group) => ({
			...group,
			sessions: group.sessions.map((session) =>
				session.id === oldSessionId
					? {
							...session,
							id: newSessionId,
						}
					: session,
			),
		})),
	};
}

export function renameSessionInGroups(
	response: GroupedSessionsResponse | undefined,
	sessionId: string,
	title: string,
): GroupedSessionsResponse | undefined {
	if (!response) {
		return response;
	}

	return {
		...response,
		groups: response.groups.map((group) => ({
			...group,
			sessions: group.sessions.map((session) =>
				session.id === sessionId
					? {
							...session,
							title,
						}
					: session,
			),
		})),
	};
}

export function removeSessionFromGroups(
	response: GroupedSessionsResponse | undefined,
	sessionId: string,
): GroupedSessionsResponse | undefined {
	if (!response) {
		return response;
	}

	const groups = removeSessionFromGroupList(response.groups, sessionId);
	return {
		groups,
		total: countSessions(groups),
	};
}

function removeSessionFromGroupList(
	groups: SessionsByDateGroup[],
	sessionId: string,
): SessionsByDateGroup[] {
	return groups
		.map((group) => ({
			...group,
			sessions: group.sessions.filter((session) => session.id !== sessionId),
		}))
		.filter((group) => group.sessions.length > 0);
}

function findSession(
	groups: SessionsByDateGroup[],
	sessionId: string,
): AgentSession | undefined {
	for (const group of groups) {
		const session = group.sessions.find((item) => item.id === sessionId);
		if (session) {
			return session;
		}
	}

	return undefined;
}

function countSessions(groups: SessionsByDateGroup[]): number {
	return groups.reduce((sum, group) => sum + group.sessions.length, 0);
}
