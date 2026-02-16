/**
 * Bugs API Endpoints
 */

import type {
    BugAutomationEmitRequest,
    BugAutomationEmitResponse,
    BugAutomationPreviewResponse,
    BugAutomationReplayResponse,
    BugCreateRequest,
    BugEntry,
    BugListResponse,
    BugsFilter,
    BugStats,
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
        autoCreated: Boolean(data.auto_created),
        source: (data.source as string) || null,
        fingerprint: (data.fingerprint as string) || null,
        occurrenceCount: (data.occurrence_count as number) || 1,
        firstSeenAt: (data.first_seen_at as string) || null,
        lastSeenAt: (data.last_seen_at as string) || null,
        lastLevel: (data.last_level as string) || null,
        lastLoggerName: (data.last_logger_name as string) || null,
        lastModule: (data.last_module as string) || null,
        lastFunction: (data.last_function as string) || null,
        lastLine: (data.last_line as number) || null,
        lastRequestId: (data.last_request_id as string) || null,
        lastUserId: (data.last_user_id as string) || null,
        lastMessage: (data.last_message as string) || null,
        lastTraceback: (data.last_traceback as string) || null,
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
        if (params?.autoCreated !== undefined)
            apiParams.auto_created = params.autoCreated;
        if (params?.source) apiParams.source = params.source;
        if (params?.search) apiParams.search = params.search;
        if (params?.page) apiParams.page = params.page;
        if (params?.pageSize) apiParams.page_size = params.pageSize;

        const response = await apiClient.get<{
            bugs: Record<string, unknown>[];
            total: number;
            page: number;
            page_size: number;
        }>("/admin/bugs", {params: apiParams});

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
            autoCreatedCount: response.data.auto_created_count as number,
            manualCount: response.data.manual_count as number,
            openAutoCreatedCount: response.data.open_auto_created_count as number,
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

    async emitTestError(
        data?: BugAutomationEmitRequest,
    ): Promise<BugAutomationEmitResponse> {
        const response = await apiClient.post<Record<string, unknown>>(
            "/admin/bug-automation/emit-test-error",
            {
                message: data?.message,
                fingerprint_seed: data?.fingerprintSeed,
            },
        );
        return {
            ok: Boolean(response.data.ok),
            level: response.data.level as string,
            emittedAt: response.data.emitted_at as string,
        };
    },

    async emitTestCritical(
        data?: BugAutomationEmitRequest,
    ): Promise<BugAutomationEmitResponse> {
        const response = await apiClient.post<Record<string, unknown>>(
            "/admin/bug-automation/emit-test-critical",
            {
                message: data?.message,
                fingerprint_seed: data?.fingerprintSeed,
            },
        );
        return {
            ok: Boolean(response.data.ok),
            level: response.data.level as string,
            emittedAt: response.data.emitted_at as string,
        };
    },

    async getAutomationPreview(
        limit = 20,
    ): Promise<BugAutomationPreviewResponse> {
        const response = await apiClient.get<Record<string, unknown>>(
            "/admin/bug-automation/preview",
            {params: {limit}},
        );

        const recentRaw = (response.data.recent as Record<string, unknown>[]) || [];
        return {
            totalAutoCreated: response.data.total_auto_created as number,
            openAutoCreated: response.data.open_auto_created as number,
            recent: recentRaw.map((item) => ({
                id: item.id as string,
                title: item.title as string,
                severity: item.severity as string,
                status: item.status as string,
                category: (item.category as string) || null,
                source: (item.source as string) || null,
                fingerprint: (item.fingerprint as string) || null,
                occurrenceCount: (item.occurrence_count as number) || 1,
                lastSeenAt: (item.last_seen_at as string) || null,
                updatedAt: item.updated_at as string,
            })),
        };
    },

    async replayBug(id: string): Promise<BugAutomationReplayResponse> {
        const response = await apiClient.post<Record<string, unknown>>(
            `/admin/bug-automation/replay/${id}`,
        );
        return {
            ok: Boolean(response.data.ok),
            bugId: response.data.bug_id as string,
            level: response.data.level as string,
            replayedAt: response.data.replayed_at as string,
        };
    },
};

export default bugsApi;
