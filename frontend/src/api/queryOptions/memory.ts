import type { MemoriesFilter } from "@/api/endpoints/memory";
import { memoryApi } from "@/api/endpoints/memory";
import { createQueryOptionsFactory } from "./_factory";

const MEMORY_STALE_TIME = 60_000;
const MEMORY_GC_TIME = 10 * 60_000;

const memoryQuery = createQueryOptionsFactory({
	staleTime: MEMORY_STALE_TIME,
	gcTime: MEMORY_GC_TIME,
	refetchOnMount: false,
});

export function memoryListQueryOptions(
	filters?: MemoriesFilter,
	page = 1,
	pageSize = 20,
) {
	return memoryQuery({
		queryKey: ["agent-memories", filters, page, pageSize] as const,
		queryFn: () => memoryApi.getMemories({ ...filters, page, pageSize }),
	});
}

export function memoryStatsQueryOptions() {
	return memoryQuery({
		queryKey: ["agent-memory-stats"] as const,
		queryFn: () => memoryApi.getMemoryStats(),
	});
}
