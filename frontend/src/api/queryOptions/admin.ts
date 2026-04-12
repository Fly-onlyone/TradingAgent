import { queryOptions } from "@tanstack/react-query";

import { adminApi } from "@/api/endpoints/admin";
import { logsApi } from "@/api/endpoints/logs";
import { strategyDiscoveryApi } from "@/api/endpoints/strategyDiscovery";
import type { AdminDocumentFilter } from "@/types";
import type { LogsFilter } from "@/types/log";

const ADMIN_STALE_TIME = 60_000;
const ADMIN_GC_TIME = 10 * 60_000;

export const defaultAdminLogFilters: LogsFilter = {
	page: 1,
	pageSize: 50,
};

export function adminLogsQueryOptions(filters: LogsFilter) {
	return queryOptions({
		queryKey: ["admin-logs", filters] as const,
		queryFn: () => logsApi.getLogs(filters),
		staleTime: ADMIN_STALE_TIME,
		gcTime: ADMIN_GC_TIME,
		refetchOnMount: false,
	});
}

export function adminLogStatsQueryOptions() {
	return queryOptions({
		queryKey: ["admin-logs-stats"] as const,
		queryFn: () => logsApi.getLogStats(),
		staleTime: ADMIN_STALE_TIME,
		gcTime: ADMIN_GC_TIME,
		refetchOnMount: false,
	});
}

export function adminDbInfoQueryOptions() {
	return queryOptions({
		queryKey: ["admin-db-info"] as const,
		queryFn: () => adminApi.getDatabaseInfo(),
		staleTime: ADMIN_STALE_TIME,
		gcTime: ADMIN_GC_TIME,
		refetchOnMount: false,
	});
}

export function adminCollectionsQueryOptions() {
	return queryOptions({
		queryKey: ["admin-collections"] as const,
		queryFn: () => adminApi.getCollections(),
		staleTime: ADMIN_STALE_TIME,
		gcTime: ADMIN_GC_TIME,
		refetchOnMount: false,
	});
}

export function strategyDiscoveryCyclesQueryOptions(
	params: { page?: number; pageSize?: number } = {},
) {
	return queryOptions({
		queryKey: [
			"admin-strategy-discovery-cycles",
			params.page ?? 1,
			params.pageSize ?? 20,
		] as const,
		queryFn: () => strategyDiscoveryApi.listCycles(params),
		staleTime: ADMIN_STALE_TIME,
		gcTime: ADMIN_GC_TIME,
		refetchOnMount: false,
	});
}

export function adminDocumentsQueryOptions(
	collectionName: string | null,
	params: AdminDocumentFilter,
) {
	return queryOptions({
		queryKey: [
			"admin-documents",
			collectionName,
			params.page,
			params.pageSize,
			params.search,
		] as const,
		queryFn: () =>
			collectionName
				? adminApi.getCollectionDocuments(collectionName, params)
				: Promise.resolve(null),
		staleTime: ADMIN_STALE_TIME,
		gcTime: ADMIN_GC_TIME,
		refetchOnMount: false,
	});
}
