/**
 * Formatting utilities for numbers, dates, prices
 */

import { format, formatDistanceToNow, parseISO } from 'date-fns';

// Number formatting
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat('en-US', options).format(value);
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number, decimals = 2): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}

// Price formatting
export function formatPrice(price: number, decimals?: number): string {
  // Auto-determine decimals based on price magnitude
  const autoDecimals = price >= 1000 ? 2 : price >= 1 ? 4 : price >= 0.01 ? 6 : 8;
  const d = decimals ?? autoDecimals;
  
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(price);
}

export function formatUSD(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatCrypto(value: number, symbol = ''): string {
  const formatted = formatNumber(value, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 8,
  });
  return symbol ? `${formatted} ${symbol}` : formatted;
}

// Volume formatting
export function formatVolume(value: number): string {
  if (value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(2)}K`;
  }
  return value.toFixed(2);
}

// Date formatting
export function formatDate(date: string | Date, formatStr = 'MMM d, yyyy'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, formatStr);
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'MMM d, yyyy HH:mm');
}

export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'HH:mm:ss');
}

export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}

export function formatTimestamp(timestamp: number): string {
  return format(new Date(timestamp), 'HH:mm:ss');
}

// PnL formatting with color
export function formatPnL(value: number): { text: string; isPositive: boolean } {
  const isPositive = value >= 0;
  const text = `${isPositive ? '+' : ''}${formatUSD(value)}`;
  return { text, isPositive };
}

export function formatPnLPercent(value: number): { text: string; isPositive: boolean } {
  const isPositive = value >= 0;
  const text = formatPercent(value);
  return { text, isPositive };
}

// Order side formatting
export function formatOrderSide(side: 'buy' | 'sell'): string {
  return side.toUpperCase();
}

// Symbol formatting
export function formatSymbol(symbol: string): string {
  // Convert BTC-USDT to BTC/USDT
  return symbol.replace('-', '/');
}

export function parseSymbol(symbol: string): { base: string; quote: string } {
  const [base, quote] = symbol.split('-');
  return { base, quote };
}

// Truncate address/hash
export function truncateAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}
