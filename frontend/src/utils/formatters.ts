/**
 * Formatting utilities for numbers, dates, prices
 */

import { format, formatDistanceToNow, parseISO } from "date-fns";

function toFiniteNumber(
	value: number | null | undefined,
	fallback = 0,
): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return fallback;
	}
	return value;
}

// Number formatting
export function formatNumber(
	value: number,
	options?: Intl.NumberFormatOptions,
): string {
	return new Intl.NumberFormat("en-US", options).format(value);
}

export function formatCompact(value: number): string {
	return new Intl.NumberFormat("en-US", {
		notation: "compact",
		maximumFractionDigits: 2,
	}).format(value);
}

export function formatPercent(
	value: number | null | undefined,
	decimals = 2,
): string {
	const safeValue = toFiniteNumber(value);
	return `${safeValue >= 0 ? "+" : ""}${safeValue.toFixed(decimals)}%`;
}

// Price formatting
export function formatPrice(price: number, decimals?: number): string {
	// Auto-determine decimals based on price magnitude
	const autoDecimals =
		price >= 1000 ? 2 : price >= 1 ? 4 : price >= 0.01 ? 6 : 8;
	const d = decimals ?? autoDecimals;

	return new Intl.NumberFormat("en-US", {
		minimumFractionDigits: d,
		maximumFractionDigits: d,
	}).format(price);
}

export function formatUSD(value: number): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(value);
}

export function formatCrypto(value: number, symbol = ""): string {
	const formatted = formatNumber(value, {
		minimumFractionDigits: 0,
		maximumFractionDigits: 8,
	});
	return symbol ? `${formatted} ${symbol}` : formatted;
}

// Volume formatting
export function formatVolume(value: number | null | undefined): string {
	const safeValue = toFiniteNumber(value);

	if (safeValue >= 1_000_000_000) {
		return `${(safeValue / 1_000_000_000).toFixed(2)}B`;
	}
	if (safeValue >= 1_000_000) {
		return `${(safeValue / 1_000_000).toFixed(2)}M`;
	}
	if (safeValue >= 1_000) {
		return `${(safeValue / 1_000).toFixed(2)}K`;
	}
	return safeValue.toFixed(2);
}

// Date formatting

export function safeParseDate(
	date: string | Date | null | undefined,
): Date | null {
	if (date == null) return null;
	let input = date;
	// MongoDB stores UTC but pymongo returns naive datetimes (no timezone).
	// Pydantic serializes them without "Z", so parseISO treats them as local time.
	// Fix: append "Z" to bare ISO strings so they're correctly parsed as UTC.
	if (typeof input === "string" && !/[Z+-]\d{0,4}$/.test(input)) {
		input = `${input}Z`;
	}
	const d = typeof input === "string" ? parseISO(input) : input;
	if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
	return d;
}

export function formatDate(
	date: string | Date,
	formatStr = "MMM d, yyyy",
): string {
	const d = safeParseDate(date);
	return d ? format(d, formatStr) : "-";
}

export function formatDateTime(date: string | Date): string {
	const d = safeParseDate(date);
	return d ? format(d, "MMM d, yyyy HH:mm") : "-";
}

export function formatTime(date: string | Date): string {
	const d = safeParseDate(date);
	return d ? format(d, "HH:mm:ss") : "-";
}

export function formatRelativeTime(date: string | Date): string {
	const d = safeParseDate(date);
	return d ? formatDistanceToNow(d, { addSuffix: true }) : "-";
}

export function formatTimestamp(timestamp: number): string {
	const d = new Date(timestamp);
	return Number.isNaN(d.getTime()) ? "-" : format(d, "HH:mm:ss");
}

// PnL formatting with color
export function formatPnL(value: number): {
	text: string;
	isPositive: boolean;
} {
	const isPositive = value >= 0;
	const text = `${isPositive ? "+" : ""}${formatUSD(value)}`;
	return { text, isPositive };
}

export function formatPnLPercent(value: number): {
	text: string;
	isPositive: boolean;
} {
	const isPositive = value >= 0;
	const text = formatPercent(value);
	return { text, isPositive };
}

// Order side formatting
export function formatOrderSide(side: "buy" | "sell"): string {
	return side.toUpperCase();
}

// Symbol formatting
export function formatSymbol(symbol: string): string {
	// Convert BTC-USDT to BTC/USDT
	return symbol.replace("-", "/");
}

export function parseSymbol(symbol: string): { base: string; quote: string } {
	const [base, quote] = symbol.split("-");
	return { base, quote };
}

// Truncate address/hash
export function truncateAddress(address: string, chars = 4): string {
	if (address.length <= chars * 2 + 3) return address;
	return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

// Byte size formatting
export function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

// Uptime formatting from seconds
export function formatUptime(seconds: number): string {
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const mins = Math.floor((seconds % 3600) / 60);
	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${mins}m`;
	return `${mins}m`;
}
