/**
 * Admin Types for Database Management
 */

export interface CollectionInfo {
    name: string;
    displayName: string;
    documentCount: number;
    storageSize: number;
    indexCount: number;
    avgDocumentSize: number;
}

export interface CollectionListResponse {
    collections: CollectionInfo[];
}

export interface DatabaseInfo {
    databaseName: string;
    host: string;
    totalCollections: number;
    totalDocuments: number;
    totalStorageSize: number;
    totalIndexSize: number;
    serverVersion: string;
    uptimeSeconds: number;
}

export interface DocumentListResponse {
    documents: Record<string, unknown>[];
    total: number;
    page: number;
    pageSize: number;
    collection: string;
}

export interface AdminDocumentFilter {
    page?: number;
    pageSize?: number;
    search?: string;
}

export interface DocumentUpdateRequest {
    document: Record<string, unknown>;
}
