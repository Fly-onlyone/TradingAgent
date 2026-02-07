/**
 * Logs API Endpoints
 */

import apiClient from '../client';
import type { LogEntry, LogsFilter, LogListResponse, LogStats } from '@/types/log';

function transformLogEntry(data: Record<string, unknown>): LogEntry {
    return {
        id: data.id as string,
        timestamp: data.timestamp as string,
        level: data.level as string,
        loggerName: data.logger_name as string,
        message: data.message as string,
        module: (data.module as string) || null,
        function: (data.function as string) || null,
        line: (data.line as number) || null,
        requestId: (data.request_id as string) || null,
        userId: (data.user_id as string) || null,
        extra: (data.extra as Record<string, unknown>) || null,
        traceback: (data.traceback as string) || null,
    };
}

export const logsApi = {
    async getLogs(params?: LogsFilter): Promise<LogListResponse> {
        const apiParams: Record<string, unknown> = {};
        if (params?.level) apiParams.level = params.level;
        if (params?.search) apiParams.search = params.search;
        if (params?.module) apiParams.module = params.module;
        if (params?.startDate) apiParams.start_date = params.startDate;
        if (params?.endDate) apiParams.end_date = params.endDate;
        if (params?.page) apiParams.page = params.page;
        if (params?.pageSize) apiParams.page_size = params.pageSize;

        const response = await apiClient.get<{
            logs: Record<string, unknown>[];
            total: number;
            page: number;
            page_size: number;
        }>('/admin/logs', { params: apiParams });

        return {
            logs: response.data.logs.map(transformLogEntry),
            total: response.data.total,
            page: response.data.page,
            pageSize: response.data.page_size,
        };
    },

    async getLogStats(): Promise<LogStats> {
        const response = await apiClient.get<Record<string, unknown>>('/admin/logs/stats');
        return {
            totalCount: response.data.total_count as number,
            levelCounts: response.data.level_counts as Record<string, number>,
            moduleCounts: response.data.module_counts as Record<string, number>,
        };
    },
};

export default logsApi;
