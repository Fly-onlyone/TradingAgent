/**
 * Admin API — Strategy Auto-Discovery
 *
 * Kicks off and inspects cycles of the Explorer + Extractor subagent pipeline.
 */

import apiClient from "../client";

export interface DiscoveryCycleSummary {
	id: string;
	status: "running" | "ok" | "failed";
	manual: boolean;
	triggeredByUserId: string | null;
	explorerSessionId: string | null;
	extractorSessionIds: string[];
	candidatesFound: number;
	strategiesSaved: number;
	strategiesSkippedLowConfidence: number;
	strategiesFailed: number;
	error: string | null;
	startedAt: string;
	endedAt: string | null;
}

export interface CycleListResponse {
	cycles: DiscoveryCycleSummary[];
	total: number;
	page: number;
	pageSize: number;
}

export interface CycleRunResult {
	cycleId: string;
	explorerSessionId: string | null;
	candidatesFound: number;
	strategiesSaved: number;
	strategiesSkippedLowConfidence: number;
	strategiesFailed: number;
	error: string | null;
}

function transformCycle(data: Record<string, unknown>): DiscoveryCycleSummary {
	return {
		id: data.id as string,
		status: data.status as DiscoveryCycleSummary["status"],
		manual: Boolean(data.manual),
		triggeredByUserId: (data.triggered_by_user_id as string | null) ?? null,
		explorerSessionId: (data.explorer_session_id as string | null) ?? null,
		extractorSessionIds: Array.isArray(data.extractor_session_ids)
			? (data.extractor_session_ids as string[])
			: [],
		candidatesFound: (data.candidates_found as number) ?? 0,
		strategiesSaved: (data.strategies_saved as number) ?? 0,
		strategiesSkippedLowConfidence:
			(data.strategies_skipped_low_confidence as number) ?? 0,
		strategiesFailed: (data.strategies_failed as number) ?? 0,
		error: (data.error as string | null) ?? null,
		startedAt: data.started_at as string,
		endedAt: (data.ended_at as string | null) ?? null,
	};
}

export const strategyDiscoveryApi = {
	async runCycle(): Promise<CycleRunResult> {
		const response = await apiClient.post<{
			cycle_id: string;
			explorer_session_id: string | null;
			candidates_found: number;
			strategies_saved: number;
			strategies_skipped_low_confidence: number;
			strategies_failed: number;
			error: string | null;
		}>("/admin/strategy-discovery/run");
		return {
			cycleId: response.data.cycle_id,
			explorerSessionId: response.data.explorer_session_id,
			candidatesFound: response.data.candidates_found,
			strategiesSaved: response.data.strategies_saved,
			strategiesSkippedLowConfidence:
				response.data.strategies_skipped_low_confidence,
			strategiesFailed: response.data.strategies_failed,
			error: response.data.error,
		};
	},

	async listCycles(
		params: { page?: number; pageSize?: number } = {},
	): Promise<CycleListResponse> {
		const apiParams: Record<string, unknown> = {};
		if (params.page) apiParams.page = params.page;
		if (params.pageSize) apiParams.page_size = params.pageSize;
		const response = await apiClient.get<{
			cycles: Record<string, unknown>[];
			total: number;
			page: number;
			page_size: number;
		}>("/admin/strategy-discovery/cycles", { params: apiParams });
		return {
			cycles: response.data.cycles.map(transformCycle),
			total: response.data.total,
			page: response.data.page,
			pageSize: response.data.page_size,
		};
	},
};
