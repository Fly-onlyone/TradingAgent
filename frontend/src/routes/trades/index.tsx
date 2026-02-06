/**
 * Trades Page - P&L Tracking
 * Displays trade history with profit/loss analysis
 */

import {useEffect} from 'react';
import {createFileRoute} from '@tanstack/react-router';
import {useQuery} from '@tanstack/react-query';
import {Box, Typography, Alert} from '@mui/material';
import {PageTransition} from '@/components/common/PageTransition';
import {
    TradeSummaryCards,
    TradeTable,
    TradesBySymbolAccordion,
    TradeFilterBar,
    TradeExportButton,
} from '@/components/trades';
import {useTradeStore} from '@/store/tradeStore';
import {tradesApi} from '@/api/endpoints/trades';

export const Route = createFileRoute('/trades/')({
    component: TradesPage,
});

function TradesPage() {
    const {
        filters,
        viewMode,
        page,
        pageSize,
        expandedSymbols,
        setTrades,
        setSummary,
        setBySymbol,
        setFilters,
        resetFilters,
        setViewMode,
        setPage,
        setPageSize,
        toggleSymbolExpanded,
        expandAllSymbols,
        collapseAllSymbols,
    } = useTradeStore();

    // Fetch trades
    const tradesQuery = useQuery({
        queryKey: ['trades', filters],
        queryFn: () => tradesApi.getTrades(filters),
        staleTime: 30_000,
    });

    // Fetch summary
    const summaryQuery = useQuery({
        queryKey: ['trades-summary', filters.startDate, filters.endDate],
        queryFn: () =>
            tradesApi.getSummary({
                startDate: filters.startDate,
                endDate: filters.endDate,
            }),
        staleTime: 30_000,
    });

    // Fetch by symbol (for grouped view)
    const bySymbolQuery = useQuery({
        queryKey: ['trades-by-symbol', filters.startDate, filters.endDate],
        queryFn: () =>
            tradesApi.getBySymbol({
                startDate: filters.startDate,
                endDate: filters.endDate,
            }),
        staleTime: 30_000,
        enabled: viewMode === 'grouped',
    });

    // Update store when data changes
    useEffect(() => {
        if (tradesQuery.data) {
            setTrades(tradesQuery.data.trades, tradesQuery.data.total);
        }
    }, [tradesQuery.data, setTrades]);

    useEffect(() => {
        if (summaryQuery.data) {
            setSummary(summaryQuery.data);
        }
    }, [summaryQuery.data, setSummary]);

    useEffect(() => {
        if (bySymbolQuery.data) {
            setBySymbol(bySymbolQuery.data);
        }
    }, [bySymbolQuery.data, setBySymbol]);

    const isLoading = tradesQuery.isLoading || summaryQuery.isLoading;
    const error = tradesQuery.error || summaryQuery.error;

    return (
        <PageTransition pageKey="trades">
            <Box>
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        mb: 3,
                    }}
                >
                    <Typography variant="h4" fontWeight={700}>
                        Trade History
                    </Typography>
                    <TradeExportButton
                        startDate={filters.startDate}
                        endDate={filters.endDate}
                        disabled={isLoading || !tradesQuery.data?.trades.length}
                    />
                </Box>

                {error && (
                    <Alert severity="error" sx={{mb: 3}}>
                        Failed to load trade data. Please try again.
                    </Alert>
                )}

                {/* Summary Cards */}
                <Box sx={{mb: 3}}>
                    <TradeSummaryCards summary={summaryQuery.data ?? null} isLoading={summaryQuery.isLoading}/>
                </Box>

                {/* Filter Bar */}
                <TradeFilterBar
                    filters={filters}
                    viewMode={viewMode}
                    onFilterChange={setFilters}
                    onViewModeChange={setViewMode}
                    onResetFilters={resetFilters}
                />

                {/* Trade Data */}
                {viewMode === 'table' ? (
                    <TradeTable
                        trades={tradesQuery.data?.trades ?? []}
                        total={tradesQuery.data?.total ?? 0}
                        page={page}
                        pageSize={pageSize}
                        onPageChange={setPage}
                        onPageSizeChange={setPageSize}
                        isLoading={tradesQuery.isLoading}
                    />
                ) : (
                    <TradesBySymbolAccordion
                        data={bySymbolQuery.data ?? []}
                        expandedSymbols={expandedSymbols}
                        onToggleSymbol={toggleSymbolExpanded}
                        onExpandAll={expandAllSymbols}
                        onCollapseAll={collapseAllSymbols}
                        isLoading={bySymbolQuery.isLoading}
                    />
                )}
            </Box>
        </PageTransition>
    );
}
