/**
 * API Response Types
 */

// Generic API response wrapper
export interface ApiResponse<T> {
	data: T;
	message?: string;
	success: boolean;
}

// Pagination
export interface PaginatedResponse<T> {
	items: T[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
}

// Error response
export interface ApiError {
	detail: string;
	code?: string;
	field?: string;
}

// Auth tokens
export interface AuthTokens {
	access_token: string;
	token_type: string;
	expires_in?: number;
}

// WebSocket message types
export interface WebSocketMessage<T = unknown> {
	type: string;
	channel?: string;
	data: T;
	timestamp: number;
}

// Request params
export interface PaginationParams {
	page?: number;
	pageSize?: number;
	sortBy?: string;
	sortOrder?: "asc" | "desc";
}

export interface DateRangeParams {
	startDate?: string;
	endDate?: string;
}
