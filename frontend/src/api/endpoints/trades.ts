/**
 * Trades API Endpoints - P&L Tracking
 */

import apiClient from '../client';
import type {
    TradeWithPnL,
    TradeSummary,
    TradesBySymbol,
    TradesFilter,
    TradeListResponse,
    TradesBySymbolResponse,
    ExportFormat,
} from '@/types';

// Transform snake_case API response to camelCase
function transformTrade(trade: Record<string, unknown>): TradeWithPnL {
    return {
        id: trade.id as string,
        symbol: trade.symbol as string,
        side: trade.side as 'buy' | 'sell',
        entryPrice: trade.entry_price as number,
        exitPrice: trade.exit_price as number | undefined,
        quantity: trade.quantity as number,
        realizedPnl: trade.realized_pnl as number | undefined,
        realizedPnlPercent: trade.realized_pnl_percent as number | undefined,
        feesPaid: trade.fees_paid as number | undefined,
        netPnl: trade.net_pnl as number | undefined,
        entryTime: trade.entry_time as string,
        exitTime: trade.exit_time as string | undefined,
        status: trade.status as 'open' | 'closed',
        relatedOrderId: trade.related_order_id as string | undefined,
    };
}

function transformSummary(summary: Record<string, unknown>): TradeSummary {
    return {
        totalPnl: summary.total_pnl as number,
        totalPnlPercent: summary.total_pnl_percent as number,
        totalFees: summary.total_fees as number,
        netPnl: summary.net_pnl as number,
        totalTrades: summary.total_trades as number,
        winningTrades: summary.winning_trades as number,
        losingTrades: summary.losing_trades as number,
        winRate: summary.win_rate as number,
        avgWin: summary.avg_win as number,
        avgLoss: summary.avg_loss as number,
        bestTrade: summary.best_trade as number,
        worstTrade: summary.worst_trade as number,
        profitFactor: summary.profit_factor as number,
        avgTradePnl: summary.avg_trade_pnl as number,
        totalVolume: summary.total_volume as number,
    };
}

function transformTradesBySymbol(data: Record<string, unknown>): TradesBySymbol {
    const trades = (data.trades as Record<string, unknown>[]) || [];
    return {
        symbol: data.symbol as string,
        totalPnl: data.total_pnl as number,
        totalPnlPercent: data.total_pnl_percent as number,
        netPnl: data.net_pnl as number,
        tradeCount: data.trade_count as number,
        winningTrades: data.winning_trades as number,
        losingTrades: data.losing_trades as number,
        winRate: data.win_rate as number,
        trades: trades.map(transformTrade),
    };
}

export interface DateRangeParams {
    startDate?: string;
    endDate?: string;
}

export const tradesApi = {
    /**
     * Get trades with P&L information
     */
    async getTrades(params?: TradesFilter): Promise<TradeListResponse> {
        const apiParams: Record<string, unknown> = {};
        if (params?.symbol) apiParams.symbol = params.symbol;
        if (params?.side) apiParams.side = params.side;
        if (params?.status) apiParams.status = params.status;
        if (params?.startDate) apiParams.start_date = params.startDate;
        if (params?.endDate) apiParams.end_date = params.endDate;
        if (params?.page) apiParams.page = params.page;
        if (params?.pageSize) apiParams.page_size = params.pageSize;

        const response = await apiClient.get<{
            trades: Record<string, unknown>[];
            total: number;
            page: number;
            page_size: number;
        }>('/orders/trades', {params: apiParams});

        return {
            trades: response.data.trades.map(transformTrade),
            total: response.data.total,
            page: response.data.page,
            pageSize: response.data.page_size,
        };
    },

    /**
     * Get aggregated trade statistics
     */
    async getSummary(params?: DateRangeParams): Promise<TradeSummary> {
        const apiParams: Record<string, unknown> = {};
        if (params?.startDate) apiParams.start_date = params.startDate;
        if (params?.endDate) apiParams.end_date = params.endDate;

        const response = await apiClient.get<Record<string, unknown>>(
            '/orders/trades/summary',
            {params: apiParams}
        );

        return transformSummary(response.data);
    },

    /**
     * Get trades grouped by symbol
     */
    async getBySymbol(params?: DateRangeParams): Promise<TradesBySymbol[]> {
        const apiParams: Record<string, unknown> = {};
        if (params?.startDate) apiParams.start_date = params.startDate;
        if (params?.endDate) apiParams.end_date = params.endDate;

        const response = await apiClient.get<{
            symbols: Record<string, unknown>[];
        }>('/orders/trades/by-symbol', {params: apiParams});

        return response.data.symbols.map(transformTradesBySymbol);
    },

    /**
     * Export trades to CSV or JSON
     */
    async exportTrades(format: ExportFormat, params?: DateRangeParams): Promise<Blob> {
        const apiParams: Record<string, unknown> = {format};
        if (params?.startDate) apiParams.start_date = params.startDate;
        if (params?.endDate) apiParams.end_date = params.endDate;

        const response = await apiClient.get('/orders/trades/export', {
            params: apiParams,
            responseType: 'blob',
        });

        return response.data;
    },
};

export default tradesApi;
