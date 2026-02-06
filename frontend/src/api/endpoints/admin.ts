/**
 * Admin API Endpoints - Database Management
 */

import apiClient from '../client';
import type {
    CollectionInfo,
    DatabaseInfo,
    DocumentListResponse,
    AdminDocumentFilter,
} from '@/types';

// Transform snake_case API response to camelCase
function transformCollection(data: Record<string, unknown>): CollectionInfo {
    return {
        name: data.name as string,
        displayName: data.display_name as string,
        documentCount: data.document_count as number,
        storageSize: (data.storage_size as number) || 0,
        indexCount: (data.index_count as number) || 0,
        avgDocumentSize: (data.avg_document_size as number) || 0,
    };
}

export const adminApi = {
    /**
     * Get list of all collections with document counts
     */
    async getCollections(): Promise<CollectionInfo[]> {
        const response = await apiClient.get<{
            collections: Record<string, unknown>[];
        }>('/admin/collections');

        return response.data.collections.map(transformCollection);
    },

    /**
     * Get documents from a collection with pagination
     */
    async getCollectionDocuments(
        collectionName: string,
        params?: AdminDocumentFilter
    ): Promise<DocumentListResponse> {
        const apiParams: Record<string, unknown> = {};
        if (params?.page) apiParams.page = params.page;
        if (params?.pageSize) apiParams.page_size = params.pageSize;
        if (params?.search) apiParams.search = params.search;

        const response = await apiClient.get<{
            documents: Record<string, unknown>[];
            total: number;
            page: number;
            page_size: number;
            collection: string;
        }>(`/admin/collections/${collectionName}`, {params: apiParams});

        return {
            documents: response.data.documents,
            total: response.data.total,
            page: response.data.page,
            pageSize: response.data.page_size,
            collection: response.data.collection,
        };
    },

    /**
     * Get a single document by ID
     */
    async getDocument(
        collectionName: string,
        documentId: string
    ): Promise<Record<string, unknown>> {
        const response = await apiClient.get<Record<string, unknown>>(
            `/admin/collections/${collectionName}/${documentId}`
        );

        return response.data;
    },

    /**
     * Get database connection info and stats
     */
    async getDatabaseInfo(): Promise<DatabaseInfo> {
        const response = await apiClient.get<Record<string, unknown>>('/admin/db-info');
        const d = response.data;
        return {
            databaseName: d.database_name as string,
            host: d.host as string,
            totalCollections: d.total_collections as number,
            totalDocuments: d.total_documents as number,
            totalStorageSize: d.total_storage_size as number,
            totalIndexSize: d.total_index_size as number,
            serverVersion: d.server_version as string,
            uptimeSeconds: d.uptime_seconds as number,
        };
    },

    /**
     * Delete a document by ID
     */
    async deleteDocument(
        collectionName: string,
        documentId: string
    ): Promise<{ deleted: boolean }> {
        const response = await apiClient.delete<{ deleted: boolean }>(
            `/admin/collections/${collectionName}/${documentId}`
        );
        return response.data;
    },

    /**
     * Update a document by ID
     */
    async updateDocument(
        collectionName: string,
        documentId: string,
        document: Record<string, unknown>
    ): Promise<Record<string, unknown>> {
        const response = await apiClient.put<Record<string, unknown>>(
            `/admin/collections/${collectionName}/${documentId}`,
            {document}
        );
        return response.data;
    },
};

export default adminApi;
