import { adminApi } from "@/api/endpoints/admin";
import { logsApi } from "@/api/endpoints/logs";
import { strategyDiscoveryApi } from "@/api/endpoints/strategyDiscovery";
import type { AdminDocumentFilter } from "@/types";
import type { LogsFilter } from "@/types/log";
import { createQueryOptionsFactory } from "./_factory";

const ADMIN_STALE_TIME = 60_000;
const ADMIN_GC_TIME = 10 * 60_000;

const adminQuery = createQueryOptionsFactory({
	staleTime: ADMIN_STALE_TIME,
	gcTime: ADMIN_GC_TIME,
	refetchOnMount: false,
});

export const defaultAdminLogFilters: LogsFilter = {
	page: 1,
	pageSize: 50,
};

export function adminLogsQueryOptions(filters: LogsFilter) {
	return adminQuery({
		queryKey: ["admin-logs", filters] as const,
		queryFn: () => logsApi.getLogs(filters),
	});
}

export function adminLogStatsQueryOptions() {
	return adminQuery({
		queryKey: ["admin-logs-stats"] as const,
		queryFn: () => logsApi.getLogStats(),
	});
}

export function adminDbInfoQueryOptions() {
	return adminQuery({
		queryKey: ["admin-db-info"] as const,
		queryFn: () => adminApi.getDatabaseInfo(),
	});
}

export function adminCollectionsQueryOptions() {
	return adminQuery({
		queryKey: ["admin-collections"] as const,
		queryFn: () => adminApi.getCollections(),
	});
}

export function strategyDiscoveryCyclesQueryOptions(
	params: { page?: number; pageSize?: number } = {},
) {
	return adminQuery({
		queryKey: [
			"admin-strategy-discovery-cycles",
			params.page ?? 1,
			params.pageSize ?? 20,
		] as const,
		queryFn: () => strategyDiscoveryApi.listCycles(params),
	});
}

export function adminDocumentsQueryOptions(
	collectionName: string | null,
	params: AdminDocumentFilter,
) {
	return adminQuery({
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
	});
}
