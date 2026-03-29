/**
 * Zod validation schemas
 */

import { z } from "zod";

// Auth schemas
export const loginSchema = z.object({
	email: z.string().email("Invalid email address"),
	password: z.string().min(6, "Password must be at least 6 characters"),
});

export const registerSchema = z
	.object({
		email: z.string().email("Invalid email address"),
		password: z.string().min(8, "Password must be at least 8 characters"),
		confirmPassword: z.string(),
		username: z
			.string()
			.min(3, "Username must be at least 3 characters")
			.optional(),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: "Passwords don't match",
		path: ["confirmPassword"],
	});

// Strategy schemas
export const strategySchema = z.object({
	name: z.string().min(1, "Name is required").max(100),
	description: z.string().max(500).optional(),
	symbol: z.string().optional(),
	timeframe: z.string().optional(),
	riskParams: z.object({
		maxPositionSize: z.number().positive(),
		riskPerTrade: z.number().min(0.1).max(10),
		maxDrawdown: z.number().min(1).max(50),
		maxDailyLoss: z.number().min(1).max(20).optional(),
		maxOpenPositions: z.number().min(1).max(20).optional(),
	}),
});

// Settings schemas
export const settingsSchema = z.object({
	email: z.string().email("Invalid email address").optional(),
	username: z.string().min(3).max(50).optional(),
	notifications: z
		.object({
			email: z.boolean(),
			push: z.boolean(),
			orderFilled: z.boolean(),
			priceAlerts: z.boolean(),
			newsAlerts: z.boolean(),
		})
		.optional(),
});

// Search schemas
export const searchSchema = z.object({
	query: z.string().min(1, "Search query is required"),
	limit: z.number().min(1).max(100).optional(),
});

// Knowledge schemas
export const knowledgeQuerySchema = z.object({
	query: z.string().min(1, "Query is required"),
	limitPerType: z.number().min(1).max(20).optional(),
	minSimilarity: z.number().min(0).max(1).optional(),
	symbol: z.string().optional(),
	patternType: z
		.enum(["technical", "sentiment", "correlation", "fundamental"])
		.optional(),
});

// Forgot password schema
export const forgotPasswordSchema = z.object({
	email: z.string().email("Invalid email address"),
});

// Reset password schema
export const resetPasswordSchema = z
	.object({
		password: z.string().min(8, "Password must be at least 8 characters"),
		confirmPassword: z.string(),
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: "Passwords don't match",
		path: ["confirmPassword"],
	});

// Change password schema
export const changePasswordSchema = z
	.object({
		currentPassword: z.string().min(1, "Current password is required"),
		newPassword: z.string().min(8, "Password must be at least 8 characters"),
		confirmNewPassword: z.string(),
	})
	.refine((data) => data.newPassword === data.confirmNewPassword, {
		message: "Passwords don't match",
		path: ["confirmNewPassword"],
	});

// Agent settings schema
export const agentSettingsSchema = z
	.object({
		authMode: z.enum(["subscription", "api_key"]),
		apiKey: z.string().optional(),
		model: z.string().min(1, "Model is required"),
	})
	.refine(
		(data) => {
			if (
				data.authMode === "api_key" &&
				(!data.apiKey || data.apiKey.trim() === "")
			) {
				return false;
			}
			return true;
		},
		{
			message: "API key is required when using API Key mode",
			path: ["apiKey"],
		},
	);

// Type exports
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type AgentSettingsInput = z.infer<typeof agentSettingsSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type StrategyInput = z.infer<typeof strategySchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
export type SearchInput = z.infer<typeof searchSchema>;
export type KnowledgeQueryInput = z.infer<typeof knowledgeQuerySchema>;
