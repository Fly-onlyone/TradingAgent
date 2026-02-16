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
    autoCreated: boolean;
    source: string | null;
    fingerprint: string | null;
    occurrenceCount: number;
    firstSeenAt: string | null;
    lastSeenAt: string | null;
    lastLevel: string | null;
    lastLoggerName: string | null;
    lastModule: string | null;
    lastFunction: string | null;
    lastLine: number | null;
    lastRequestId: string | null;
    lastUserId: string | null;
    lastMessage: string | null;
    lastTraceback: string | null;
    createdAt: string;
    updatedAt: string;
    resolvedAt: string | null;
}

export interface BugsFilter {
    status?: string;
    severity?: string;
    autoCreated?: boolean;
    source?: string;
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
    autoCreatedCount: number;
    manualCount: number;
    openAutoCreatedCount: number;
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

export interface BugAutomationEmitRequest {
    message?: string;
    fingerprintSeed?: string;
}

export interface BugAutomationEmitResponse {
    ok: boolean;
    level: string;
    emittedAt: string;
}

export interface BugAutomationPreviewEntry {
    id: string;
    title: string;
    severity: string;
    status: string;
    category: string | null;
    source: string | null;
    fingerprint: string | null;
    occurrenceCount: number;
    lastSeenAt: string | null;
    updatedAt: string;
}

export interface BugAutomationPreviewResponse {
    totalAutoCreated: number;
    openAutoCreated: number;
    recent: BugAutomationPreviewEntry[];
}

export interface BugAutomationReplayResponse {
    ok: boolean;
    bugId: string;
    level: string;
    replayedAt: string;
}
