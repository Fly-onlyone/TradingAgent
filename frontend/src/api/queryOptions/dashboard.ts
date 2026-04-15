import { dashboardApi } from "@/api/endpoints/dashboard";
import { createQueryOptionsFactory } from "./_factory";

const DASHBOARD_STALE_TIME = 30_000;
const DASHBOARD_GC_TIME = 2 * 60_000;

const dashboardQuery = createQueryOptionsFactory({
	staleTime: DASHBOARD_STALE_TIME,
	gcTime: DASHBOARD_GC_TIME,
	refetchOnMount: false,
});

export function dashboardSummaryQueryOptions() {
	return dashboardQuery({
		queryKey: ["dashboard", "summary"] as const,
		queryFn: () => dashboardApi.getSummary(),
	});
}
