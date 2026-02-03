/**
 * Zod validation schemas
 */

import { z } from 'zod';

// Auth schemas
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  username: z.string().min(3, 'Username must be at least 3 characters').optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

// Order schemas
export const orderSchema = z.object({
  symbol: z.string().min(1, 'Symbol is required'),
  side: z.enum(['buy', 'sell']),
  type: z.enum(['market', 'limit', 'stop', 'stop_limit']),
  quantity: z.number().positive('Quantity must be positive'),
  price: z.number().positive('Price must be positive').optional(),
  stopPrice: z.number().positive('Stop price must be positive').optional(),
  stopLoss: z.number().positive('Stop loss must be positive').optional(),
  takeProfit: z.number().positive('Take profit must be positive').optional(),
  leverage: z.number().min(1).max(100).optional(),
}).refine(
  (data) => {
    // Limit orders require a price
    if (data.type === 'limit' && !data.price) {
      return false;
    }
    // Stop orders require a stop price
    if ((data.type === 'stop' || data.type === 'stop_limit') && !data.stopPrice) {
      return false;
    }
    return true;
  },
  {
    message: 'Price is required for this order type',
    path: ['price'],
  }
);

// Strategy schemas
export const strategySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
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
  email: z.string().email('Invalid email address').optional(),
  username: z.string().min(3).max(50).optional(),
  defaultSymbol: z.string().optional(),
  defaultTimeframe: z.string().optional(),
  notifications: z.object({
    email: z.boolean(),
    push: z.boolean(),
    orderFilled: z.boolean(),
    priceAlerts: z.boolean(),
    newsAlerts: z.boolean(),
  }).optional(),
});

// Search schemas
export const searchSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  limit: z.number().min(1).max(100).optional(),
});

// Knowledge schemas
export const knowledgeQuerySchema = z.object({
  query: z.string().min(1, 'Query is required'),
  limitPerType: z.number().min(1).max(20).optional(),
  minSimilarity: z.number().min(0).max(1).optional(),
  symbol: z.string().optional(),
  patternType: z.enum(['technical', 'sentiment', 'correlation', 'fundamental']).optional(),
});

// Type exports
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type OrderInput = z.infer<typeof orderSchema>;
export type StrategyInput = z.infer<typeof strategySchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
export type SearchInput = z.infer<typeof searchSchema>;
export type KnowledgeQueryInput = z.infer<typeof knowledgeQuerySchema>;
