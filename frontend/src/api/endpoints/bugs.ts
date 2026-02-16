/**
 * Bugs API Endpoints
 */

import type {
	BugCreateRequest,
	BugEntry,
	BugListResponse,
	BugStats,
	BugsFilter,
	BugUpdateRequest,
} from "@/types/bug";
import apiClient from "../client";

function transformBugEntry(data: Record<string, unknown>): BugEntry {
	return {
		id: data.id as string,
		title: data.title as string,
		description: (data.description as string) || null,
		severity: data.severity as string,
		status: data.status as string,
		category: (data.category as string) || null,
		createdAt: data.created_at as string,
		updatedAt: data.updated_at as string,
		resolvedAt: (data.resolved_at as string) || null,
	};
}

export const bugsApi = {
	async getBugs(params?: BugsFilter): Promise<BugListResponse> {
		const apiParams: Record<string, unknown> = {};
		if (params?.status) apiParams.status = params.status;
		if (params?.severity) apiParams.severity = params.severity;
		if (params?.search) apiParams.search = params.search;
		if (params?.page) apiParams.page = params.page;
		if (params?.pageSize) apiParams.page_size = params.pageSize;

		const response = await apiClient.get<{
			bugs: Record<string, unknown>[];
			total: number;
			page: number;
			page_size: number;
		}>("/admin/bugs", { params: apiParams });

		return {
			bugs: response.data.bugs.map(transformBugEntry),
			total: response.data.total,
			page: response.data.page,
			pageSize: response.data.page_size,
		};
	},

	async getBugStats(): Promise<BugStats> {
		const response =
			await apiClient.get<Record<string, unknown>>("/admin/bugs/stats");
		return {
			total: response.data.total as number,
			statusCounts: response.data.status_counts as Record<string, number>,
			severityCounts: response.data.severity_counts as Record<string, number>,
		};
	},

	async createBug(data: BugCreateRequest): Promise<BugEntry> {
		const response = await apiClient.post<Record<string, unknown>>(
			"/admin/bugs",
			data,
		);
		return transformBugEntry(response.data);
	},

	async updateBug(id: string, data: BugUpdateRequest): Promise<BugEntry> {
		const response = await apiClient.put<Record<string, unknown>>(
			`/admin/bugs/${id}`,
			data,
		);
		return transformBugEntry(response.data);
	},

	async deleteBug(id: string): Promise<void> {
		await apiClient.delete(`/admin/bugs/${id}`);
	},
};

export default bugsApi;
