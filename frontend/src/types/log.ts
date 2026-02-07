/**
 * Log Types
 */

export interface LogEntry {
    id: string;
    timestamp: string;
    level: string;
    loggerName: string;
    message: string;
    module: string | null;
    function: string | null;
    line: number | null;
    requestId: string | null;
    userId: string | null;
    extra: Record<string, unknown> | null;
    traceback: string | null;
}

export interface LogsFilter {
    level?: string;
    search?: string;
    module?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
}

export interface LogListResponse {
    logs: LogEntry[];
    total: number;
    page: number;
    pageSize: number;
}

export interface LogStats {
    totalCount: number;
    levelCounts: Record<string, number>;
    moduleCounts: Record<string, number>;
}
