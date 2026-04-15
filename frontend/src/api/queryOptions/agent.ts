import type { DecisionsFilter } from "@/api/endpoints/decisions";
import { decisionsApi } from "@/api/endpoints/decisions";
import { sessionsApi } from "@/api/endpoints/sessions";
import { settingsApi } from "@/api/endpoints/settings";
import { createQueryOptionsFactory } from "./_factory";

const AGENT_STALE_TIME = 60_000;
const AGENT_GC_TIME = 10 * 60_000;

const agentQuery = createQueryOptionsFactory({
	staleTime: AGENT_STALE_TIME,
	gcTime: AGENT_GC_TIME,
	refetchOnMount: false,
});

export function agentConfigQueryOptions() {
	return agentQuery({
		queryKey: ["agent-config"] as const,
		queryFn: () => settingsApi.getAgentConfig(),
	});
}

export function agentSessionsGroupedQueryOptions(limit = 50) {
	return agentQuery({
		queryKey: ["agent-sessions-grouped", limit] as const,
		queryFn: () => sessionsApi.getSessionsGrouped(limit),
	});
}

export function agentDecisionsQueryOptions(
	filters: DecisionsFilter,
	page: number,
	pageSize = 20,
) {
	return agentQuery({
		queryKey: ["agent-decisions", filters, page, pageSize] as const,
		queryFn: () =>
			decisionsApi.getDecisions({
				...filters,
				page,
				pageSize,
			}),
	});
}

export function agentDecisionSymbolsQueryOptions() {
	return agentQuery({
		queryKey: ["agent-decision-symbols"] as const,
		queryFn: () => decisionsApi.getDecisionSymbols(),
	});
}

export function agentPendingDecisionsQueryOptions() {
	return agentQuery({
		queryKey: ["agent-decisions-pending"] as const,
		queryFn: () => decisionsApi.getPendingDecisions({ page: 1, pageSize: 1 }),
	});
}

export function agentSessionQueryOptions(sessionId: string) {
	return agentQuery({
		queryKey: ["agent-session", sessionId] as const,
		queryFn: () => sessionsApi.getSession(sessionId),
	});
}
