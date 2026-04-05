import { queryOptions } from "@tanstack/react-query";

import type { MemoriesFilter } from "@/api/endpoints/memory";
import { memoryApi } from "@/api/endpoints/memory";

const MEMORY_STALE_TIME = 60_000;
const MEMORY_GC_TIME = 10 * 60_000;

export function memoryListQueryOptions(
	filters?: MemoriesFilter,
	page = 1,
	pageSize = 20,
) {
	return queryOptions({
		queryKey: ["agent-memories", filters, page, pageSize] as const,
		queryFn: () => memoryApi.getMemories({ ...filters, page, pageSize }),
		staleTime: MEMORY_STALE_TIME,
		gcTime: MEMORY_GC_TIME,
		refetchOnMount: false,
	});
}

export function memoryStatsQueryOptions() {
	return queryOptions({
		queryKey: ["agent-memory-stats"] as const,
		queryFn: () => memoryApi.getMemoryStats(),
		staleTime: MEMORY_STALE_TIME,
		gcTime: MEMORY_GC_TIME,
		refetchOnMount: false,
	});
}
