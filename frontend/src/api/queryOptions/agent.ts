import {queryOptions} from '@tanstack/react-query';

import type {DecisionsFilter} from '@/api/endpoints/decisions';
import {decisionsApi} from '@/api/endpoints/decisions';
import {sessionsApi} from '@/api/endpoints/sessions';
import {settingsApi} from '@/api/endpoints/settings';

const AGENT_STALE_TIME = 60_000;
const AGENT_GC_TIME = 10 * 60_000;

export function agentConfigQueryOptions() {
    return queryOptions({
        queryKey: ['agent-config'] as const,
        queryFn: () => settingsApi.getAgentConfig(),
        staleTime: AGENT_STALE_TIME,
        gcTime: AGENT_GC_TIME,
        refetchOnMount: false,
    });
}

export function agentSessionsGroupedQueryOptions(limit = 50) {
    return queryOptions({
        queryKey: ['agent-sessions-grouped', limit] as const,
        queryFn: () => sessionsApi.getSessionsGrouped(limit),
        staleTime: AGENT_STALE_TIME,
        gcTime: AGENT_GC_TIME,
        refetchOnMount: false,
    });
}

export function agentDecisionsQueryOptions(
    filters: DecisionsFilter,
    page: number,
    pageSize = 20,
) {
    return queryOptions({
        queryKey: ['agent-decisions', filters, page, pageSize] as const,
        queryFn: () =>
            decisionsApi.getDecisions({
                ...filters,
                page,
                pageSize,
            }),
        staleTime: AGENT_STALE_TIME,
        gcTime: AGENT_GC_TIME,
        refetchOnMount: false,
    });
}

export function agentDecisionSymbolsQueryOptions() {
    return queryOptions({
        queryKey: ['agent-decision-symbols'] as const,
        queryFn: () => decisionsApi.getDecisionSymbols(),
        staleTime: AGENT_STALE_TIME,
        gcTime: AGENT_GC_TIME,
        refetchOnMount: false,
    });
}

export function agentPendingDecisionsQueryOptions() {
    return queryOptions({
        queryKey: ['agent-decisions-pending'] as const,
        queryFn: () => decisionsApi.getPendingDecisions({page: 1, pageSize: 1}),
        staleTime: AGENT_STALE_TIME,
        gcTime: AGENT_GC_TIME,
        refetchOnMount: false,
    });
}

export function agentSessionQueryOptions(sessionId: string) {
    return queryOptions({
        queryKey: ['agent-session', sessionId] as const,
        queryFn: () => sessionsApi.getSession(sessionId),
        staleTime: AGENT_STALE_TIME,
        gcTime: AGENT_GC_TIME,
        refetchOnMount: false,
    });
}
