import type {QueryClient} from '@tanstack/react-query';

import {
    adminCollectionsQueryOptions,
    adminDbInfoQueryOptions,
    adminLogsQueryOptions,
    adminLogStatsQueryOptions,
    defaultAdminLogFilters,
} from '@/api/queryOptions/admin';
import {
    agentDecisionSymbolsQueryOptions,
    agentPendingDecisionsQueryOptions,
    agentSessionsGroupedQueryOptions,
} from '@/api/queryOptions/agent';

type RouterPreloader = {
    preloadRoute: (opts: { to: string }) => Promise<unknown>;
};

export async function preloadNavigationTarget(
    to: string,
    router: RouterPreloader,
    queryClient: QueryClient,
): Promise<void> {
    const tasks: Array<Promise<unknown>> = [router.preloadRoute({to})];

    if (to === '/agent') {
        tasks.push(queryClient.prefetchQuery(agentSessionsGroupedQueryOptions(50)));
        tasks.push(queryClient.prefetchQuery(agentDecisionSymbolsQueryOptions()));
        tasks.push(queryClient.prefetchQuery(agentPendingDecisionsQueryOptions()));
    }

    if (to === '/admin/logs') {
        tasks.push(queryClient.prefetchQuery(adminLogsQueryOptions(defaultAdminLogFilters)));
        tasks.push(queryClient.prefetchQuery(adminLogStatsQueryOptions()));
    }

    if (to === '/admin/database') {
        tasks.push(queryClient.prefetchQuery(adminDbInfoQueryOptions()));
        tasks.push(queryClient.prefetchQuery(adminCollectionsQueryOptions()));
    }

    await Promise.allSettled(tasks);
}
