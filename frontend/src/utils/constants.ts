/**
 * Application constants
 */

// API
export const API_BASE_URL = '/api/v1';
export const WS_BASE_URL = '/ws';

// Pagination
export const DEFAULT_PAGE_SIZE = 20;
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

// Trading
export const DEFAULT_SYMBOL = 'BTC-USDT';
export const DEFAULT_TIMEFRAME = '1h';

export const TIMEFRAMES = [
    {value: '1m', label: '1m'},
    {value: '5m', label: '5m'},
    {value: '15m', label: '15m'},
    {value: '30m', label: '30m'},
    {value: '1h', label: '1H'},
    {value: '4h', label: '4H'},
    {value: '1d', label: '1D'},
    {value: '1w', label: '1W'},
    {value: '1M', label: '1M'},
] as const;

export const ORDER_TYPES = [
    {value: 'market', label: 'Market'},
    {value: 'limit', label: 'Limit'},
    {value: 'stop', label: 'Stop'},
    {value: 'stop_limit', label: 'Stop Limit'},
] as const;

export const ORDER_SIDES = [
    {value: 'buy', label: 'Buy', color: 'success'},
    {value: 'sell', label: 'Sell', color: 'error'},
] as const;

export const ORDER_STATUSES = [
    {value: 'pending', label: 'Pending', color: 'warning'},
    {value: 'open', label: 'Open', color: 'info'},
    {value: 'filled', label: 'Filled', color: 'success'},
    {value: 'partially_filled', label: 'Partial', color: 'info'},
    {value: 'cancelled', label: 'Cancelled', color: 'default'},
    {value: 'rejected', label: 'Rejected', color: 'error'},
] as const;

// Popular trading pairs
export const POPULAR_PAIRS = [
    'BTC-USDT',
    'ETH-USDT',
    'SOL-USDT',
    'BNB-USDT',
    'XRP-USDT',
    'ADA-USDT',
    'DOGE-USDT',
    'AVAX-USDT',
    'DOT-USDT',
    'MATIC-USDT',
];

// Chart settings — fallback values; prefer theme.trading.colors in components
export const CHART_COLORS = {
    bullish: '#10B981',
    bearish: '#EF4444',
    volume: '#3B82F6',
    grid: 'rgba(80, 60, 30, 0.3)',
    crosshair: '#F97316',
};

// Credibility levels
export const CREDIBILITY_LEVELS = [
    {min: 0.8, label: 'Very High', color: 'success'},
    {min: 0.6, label: 'High', color: 'success'},
    {min: 0.4, label: 'Medium', color: 'warning'},
    {min: 0.2, label: 'Low', color: 'error'},
    {min: 0, label: 'Very Low', color: 'error'},
] as const;

// Sentiment interpretation
export const SENTIMENT_THRESHOLDS = {
    strongBullish: 0.5,
    bullish: 0.2,
    neutral: -0.2,
    bearish: -0.5,
    // Below -0.5 is strongly bearish
};

// Agent actions
export const AGENT_ACTIONS = [
    {value: 'buy', label: 'Buy', color: 'success'},
    {value: 'sell', label: 'Sell', color: 'error'},
    {value: 'hold', label: 'Hold', color: 'info'},
    {value: 'wait', label: 'Wait', color: 'warning'},
] as const;

// Analysis types
export const ANALYSIS_TYPES = [
    {value: 'technical', label: 'Technical Analysis'},
    {value: 'fundamental', label: 'Fundamental Analysis'},
    {value: 'combined', label: 'Combined Analysis'},
] as const;

// Pattern types
export const PATTERN_TYPES = [
    {value: 'technical', label: 'Technical'},
    {value: 'sentiment', label: 'Sentiment'},
    {value: 'correlation', label: 'Correlation'},
    {value: 'fundamental', label: 'Fundamental'},
] as const;

// Keyboard shortcuts
export const SHORTCUTS = {
    newOrder: 'n',
    toggleSidebar: 'b',
    search: '/',
    escape: 'Escape',
} as const;

// Local storage keys
export const STORAGE_KEYS = {
    auth: 'auth-storage',
    ui: 'ui-storage',
    watchlist: 'watchlist',
    recentSymbols: 'recent-symbols',
} as const;

// Animation durations (ms)
export const ANIMATION = {
    fast: 150,
    normal: 200,
    slow: 300,
    pageTransition: 200,
} as const;
