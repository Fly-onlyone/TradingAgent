import type {QueryClient} from "@tanstack/react-query";

import {
    adminCollectionsQueryOptions,
    adminDbInfoQueryOptions,
    adminLogsQueryOptions,
    adminLogStatsQueryOptions,
    defaultAdminLogFilters,
} from "@/api/queryOptions/admin";
import {
    agentDecisionSymbolsQueryOptions,
    agentPendingDecisionsQueryOptions,
    agentSessionsGroupedQueryOptions,
} from "@/api/queryOptions/agent";
import {marketAccountQueryOptions, marketOverviewQueryOptions,} from "@/api/queryOptions/market";
import {knowledgeApi} from "@/api/endpoints/knowledge";
import {newsApi} from "@/api/endpoints/news";
import {ordersApi} from "@/api/endpoints/orders";
import {strategiesApi} from "@/api/endpoints/strategies";
import {tasksApi} from "@/api/endpoints/tasks";
import {tradesApi} from "@/api/endpoints/trades";

type RouterPreloader = {
    preloadRoute: (opts: { to: string }) => Promise<unknown>;
};

export async function preloadNavigationTarget(
    to: string,
    router: RouterPreloader,
    queryClient: QueryClient,
): Promise<void> {
    const tasks: Array<Promise<unknown>> = [router.preloadRoute({to})];
    const STALE = 60_000;

    switch (to) {
        case "/":
            tasks.push(queryClient.prefetchQuery(marketAccountQueryOptions()));
            tasks.push(queryClient.prefetchQuery({
                queryKey: ["trades", "summary"],
                queryFn: () => tradesApi.getSummary(),
                staleTime: STALE
            }));
            tasks.push(queryClient.prefetchQuery({
                queryKey: ["trades", "recent"],
                queryFn: () => tradesApi.getTrades({pageSize: 5}),
                staleTime: STALE
            }));
            break;

        case "/agent":
            tasks.push(queryClient.prefetchQuery(agentSessionsGroupedQueryOptions(50)));
            tasks.push(queryClient.prefetchQuery(agentDecisionSymbolsQueryOptions()));
            tasks.push(queryClient.prefetchQuery(agentPendingDecisionsQueryOptions()));
            break;

        case "/orders":
            tasks.push(queryClient.prefetchQuery({
                queryKey: ["orders", "okx", "open", undefined, 50],
                queryFn: () => ordersApi.getOkxOpenOrders(),
                staleTime: STALE
            }));
            tasks.push(queryClient.prefetchQuery({
                queryKey: ["orders", "okx", "history", undefined, 50],
                queryFn: () => ordersApi.getOkxOrderHistory(),
                staleTime: STALE
            }));
            break;

        case "/trades":
            tasks.push(queryClient.prefetchQuery({
                queryKey: ["trades", {}],
                queryFn: () => tradesApi.getTrades({}),
                staleTime: STALE
            }));
            tasks.push(queryClient.prefetchQuery({
                queryKey: ["trades-summary", undefined, undefined],
                queryFn: () => tradesApi.getSummary(),
                staleTime: STALE
            }));
            break;

        case "/strategies":
            tasks.push(queryClient.prefetchQuery({
                queryKey: ["strategies"],
                queryFn: () => strategiesApi.getStrategies(),
                staleTime: STALE
            }));
            break;

        case "/knowledge":
            tasks.push(queryClient.prefetchQuery({
                queryKey: ["knowledge-strategies"],
                queryFn: () => knowledgeApi.getStrategies(20),
                staleTime: STALE
            }));
            tasks.push(queryClient.prefetchQuery({
                queryKey: ["knowledge-lessons"],
                queryFn: () => knowledgeApi.getLessons({limit: 20}),
                staleTime: STALE
            }));
            tasks.push(queryClient.prefetchQuery({
                queryKey: ["knowledge-patterns"],
                queryFn: () => knowledgeApi.getPatterns({limit: 20}),
                staleTime: STALE
            }));
            break;

        case "/news":
            tasks.push(queryClient.prefetchQuery({
                queryKey: ["marketSentiment"],
                queryFn: () => newsApi.getMarketSentiment(),
                staleTime: STALE
            }));
            tasks.push(queryClient.prefetchQuery({
                queryKey: ["news", ""],
                queryFn: () => newsApi.getArticles({pageSize: 20}),
                staleTime: STALE
            }));
            break;

        case "/tasks":
            tasks.push(queryClient.prefetchQuery({
                queryKey: ["tasks"],
                queryFn: () => tasksApi.getTasks(),
                staleTime: STALE
            }));
            break;

        case "/market-monitor":
            tasks.push(queryClient.prefetchQuery(marketOverviewQueryOptions()));
            break;

        case "/trading":
            tasks.push(queryClient.prefetchQuery(marketOverviewQueryOptions()));
            break;

        case "/admin/logs":
            tasks.push(queryClient.prefetchQuery(adminLogsQueryOptions(defaultAdminLogFilters)));
            tasks.push(queryClient.prefetchQuery(adminLogStatsQueryOptions()));
            break;

        case "/admin/database":
            tasks.push(queryClient.prefetchQuery(adminDbInfoQueryOptions()));
            tasks.push(queryClient.prefetchQuery(adminCollectionsQueryOptions()));
            break;
    }

    await Promise.allSettled(tasks);
}
