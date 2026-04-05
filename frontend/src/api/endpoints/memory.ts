/**
 * Memory API Endpoints
 */

import type { PaginationParams } from "@/types";
import type {
	AgentMemory,
	CategoryInfo,
	MemoryCategory,
	MemoryCreate,
	MemoryListResponse,
	MemorySearchResponse,
	MemoryStats,
	MemoryUpdate,
} from "@/types/memory";
import apiClient from "../client";

export interface MemoriesFilter extends PaginationParams {
	category?: MemoryCategory;
	tag?: string;
}

function transformMemory(data: Record<string, unknown>): AgentMemory {
	return {
		id: data.id as string,
		category: data.category as MemoryCategory,
		content: data.content as string,
		tags: (data.tags as string[]) ?? [],
		source: data.source as string,
		sessionId: (data.session_id as string) ?? null,
		expiresAt: (data.expires_at as string) ?? null,
		createdAt: data.created_at as string,
		updatedAt: data.updated_at as string,
		accessCount: (data.access_count as number) ?? 0,
		lastAccessedAt: (data.last_accessed_at as string) ?? null,
	};
}

function transformMemoryListResponse(
	data: Record<string, unknown>,
): MemoryListResponse {
	return {
		memories: (
			(data.memories as Array<Record<string, unknown>> | undefined) ?? []
		).map(transformMemory),
		total: data.total as number,
		page: data.page as number,
		pageSize: data.page_size as number,
	};
}

function transformMemorySearchResponse(
	data: Record<string, unknown>,
): MemorySearchResponse {
	return {
		query: data.query as string,
		memories: (
			(data.memories as Array<Record<string, unknown>> | undefined) ?? []
		).map(transformMemory),
		count: data.count as number,
	};
}

function transformMemoryStats(data: Record<string, unknown>): MemoryStats {
	return {
		total: data.total as number,
		byCategory: data.by_category as Record<string, number>,
		permanentCount: data.permanent_count as number,
		expiringSoonCount: data.expiring_soon_count as number,
	};
}

function transformCategoryInfo(data: Record<string, unknown>): CategoryInfo {
	return {
		value: data.value as MemoryCategory,
		label: data.label as string,
		ttlDescription: data.ttl_description as string,
	};
}

export const memoryApi = {
	async getMemories(params?: MemoriesFilter): Promise<MemoryListResponse> {
		const queryParams: Record<string, unknown> = {};
		if (params?.page) queryParams.page = params.page;
		if (params?.pageSize) queryParams.page_size = params.pageSize;
		if (params?.category) queryParams.category = params.category;
		if (params?.tag) queryParams.tag = params.tag;

		const response = await apiClient.get<Record<string, unknown>>(
			"/agent/memories",
			{ params: queryParams },
		);
		return transformMemoryListResponse(response.data);
	},

	async getMemoryStats(): Promise<MemoryStats> {
		const response = await apiClient.get<Record<string, unknown>>(
			"/agent/memories/stats",
		);
		return transformMemoryStats(response.data);
	},

	async getCategories(): Promise<CategoryInfo[]> {
		const response = await apiClient.get<Array<Record<string, unknown>>>(
			"/agent/memories/categories",
		);
		return response.data.map(transformCategoryInfo);
	},

	async createMemory(data: MemoryCreate): Promise<AgentMemory> {
		const response = await apiClient.post<Record<string, unknown>>(
			"/agent/memories",
			{
				content: data.content,
				category: data.category,
				tags: data.tags ?? [],
			},
		);
		return transformMemory(response.data);
	},

	async updateMemory(
		memoryId: string,
		data: MemoryUpdate,
	): Promise<AgentMemory> {
		const payload: Record<string, unknown> = {};
		if (data.content !== undefined) payload.content = data.content;
		if (data.category !== undefined) payload.category = data.category;
		if (data.tags !== undefined) payload.tags = data.tags;

		const response = await apiClient.put<Record<string, unknown>>(
			`/agent/memories/${memoryId}`,
			payload,
		);
		return transformMemory(response.data);
	},

	async deleteMemory(memoryId: string): Promise<void> {
		await apiClient.delete(`/agent/memories/${memoryId}`);
	},

	async searchMemories(
		query: string,
		category?: string,
		limit = 10,
	): Promise<MemorySearchResponse> {
		const response = await apiClient.post<Record<string, unknown>>(
			"/agent/memories/search",
			{ query, category: category ?? null, limit },
		);
		return transformMemorySearchResponse(response.data);
	},
};
