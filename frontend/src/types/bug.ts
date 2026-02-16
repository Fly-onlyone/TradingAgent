/**
 * Bug Tracker Types
 */

export interface BugEntry {
	id: string;
	title: string;
	description: string | null;
	severity: string;
	status: string;
	category: string | null;
	createdAt: string;
	updatedAt: string;
	resolvedAt: string | null;
}

export interface BugsFilter {
	status?: string;
	severity?: string;
	search?: string;
	page?: number;
	pageSize?: number;
}

export interface BugListResponse {
	bugs: BugEntry[];
	total: number;
	page: number;
	pageSize: number;
}

export interface BugStats {
	total: number;
	statusCounts: Record<string, number>;
	severityCounts: Record<string, number>;
}

export interface BugCreateRequest {
	title: string;
	description?: string;
	severity: string;
	status?: string;
	category?: string;
}

export interface BugUpdateRequest {
	title?: string;
	description?: string;
	severity?: string;
	status?: string;
	category?: string;
}
