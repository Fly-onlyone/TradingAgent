/**
 * Agent Memory Types
 */

export type MemoryCategory =
	| "preference"
	| "watchlist"
	| "trading_context"
	| "market_observation"
	| "decision_rationale"
	| "lesson"
	| "general";

export interface AgentMemory {
	id: string;
	category: MemoryCategory;
	content: string;
	tags: string[];
	source: string;
	sessionId: string | null;
	expiresAt: string | null;
	createdAt: string;
	updatedAt: string;
	accessCount: number;
	lastAccessedAt: string | null;
}

export interface MemoryListResponse {
	memories: AgentMemory[];
	total: number;
	page: number;
	pageSize: number;
}

export interface MemorySearchResponse {
	query: string;
	memories: AgentMemory[];
	count: number;
}

export interface MemoryStats {
	total: number;
	byCategory: Record<string, number>;
	permanentCount: number;
	expiringSoonCount: number;
}

export interface MemoryCreate {
	content: string;
	category: MemoryCategory;
	tags?: string[];
}

export interface MemoryUpdate {
	content?: string;
	category?: MemoryCategory;
	tags?: string[];
}

export interface CategoryInfo {
	value: MemoryCategory;
	label: string;
	ttlDescription: string;
}

export interface MemoryCategoryConfig {
	label: string;
	color:
		| "primary"
		| "secondary"
		| "success"
		| "warning"
		| "error"
		| "info"
		| "default";
	ttlLabel: string;
}

export const MEMORY_CATEGORY_CONFIG: Record<
	MemoryCategory,
	MemoryCategoryConfig
> = {
	preference: { label: "Preference", color: "primary", ttlLabel: "Permanent" },
	watchlist: { label: "Watchlist", color: "info", ttlLabel: "30 days" },
	trading_context: {
		label: "Trading Context",
		color: "secondary",
		ttlLabel: "7 days",
	},
	market_observation: {
		label: "Market Observation",
		color: "warning",
		ttlLabel: "24 hours",
	},
	decision_rationale: {
		label: "Decision Rationale",
		color: "default",
		ttlLabel: "14 days",
	},
	lesson: { label: "Lesson", color: "success", ttlLabel: "90 days" },
	general: { label: "General", color: "default", ttlLabel: "30 days" },
};
