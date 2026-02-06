/**
 * Trade Summary Cards Component
 * Displays key P&L statistics in card format
 */

import {Box, Card, CardContent, Grid2 as Grid, Typography, Skeleton} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import PercentIcon from '@mui/icons-material/Percent';
import type {TradeSummary} from '@/types';

interface TradeSummaryCardsProps {
    summary: TradeSummary | null;
    isLoading?: boolean;
}

interface StatCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ReactNode;
    color?: 'success' | 'error' | 'primary' | 'warning';
    isLoading?: boolean;
}

function StatCard({title, value, subtitle, icon, color = 'primary', isLoading}: StatCardProps) {
    const colorMap = {
        success: '#4caf50',
        error: '#f44336',
        primary: '#2196f3',
        warning: '#ff9800',
    };

    return (
        <Card sx={{height: '100%'}}>
            <CardContent>
                <Box sx={{display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between'}}>
                    <Box>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                            {title}
                        </Typography>
                        {isLoading ? (
                            <Skeleton width={100} height={40}/>
                        ) : (
                            <Typography variant="h5" fontWeight={700} sx={{color: colorMap[color]}}>
                                {value}
                            </Typography>
                        )}
                        {subtitle && !isLoading && (
                            <Typography variant="caption" color="text.secondary">
                                {subtitle}
                            </Typography>
                        )}
                    </Box>
                    <Box
                        sx={{
                            p: 1,
                            borderRadius: 2,
                            bgcolor: `${colorMap[color]}20`,
                            color: colorMap[color],
                        }}
                    >
                        {icon}
                    </Box>
                </Box>
            </CardContent>
        </Card>
    );
}

function formatCurrency(value: number): string {
    const prefix = value >= 0 ? '+' : '';
    return `${prefix}$${Math.abs(value).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;
}

function formatPercent(value: number): string {
    const prefix = value >= 0 ? '+' : '';
    return `${prefix}${value.toFixed(2)}%`;
}

export function TradeSummaryCards({summary, isLoading}: TradeSummaryCardsProps) {
    const totalPnl = summary?.totalPnl ?? 0;
    const winRate = summary?.winRate ?? 0;
    const totalTrades = summary?.totalTrades ?? 0;
    const profitFactor = summary?.profitFactor ?? 0;

    return (
        <Grid container spacing={2}>
            <Grid size={{xs: 12, sm: 6, md: 3}}>
                <StatCard
                    title="Total P&L"
                    value={formatCurrency(totalPnl)}
                    subtitle={summary ? formatPercent(summary.totalPnlPercent) : undefined}
                    icon={totalPnl >= 0 ? <TrendingUpIcon/> : <TrendingDownIcon/>}
                    color={totalPnl >= 0 ? 'success' : 'error'}
                    isLoading={isLoading}
                />
            </Grid>
            <Grid size={{xs: 12, sm: 6, md: 3}}>
                <StatCard
                    title="Win Rate"
                    value={`${winRate.toFixed(1)}%`}
                    subtitle={summary ? `${summary.winningTrades}W / ${summary.losingTrades}L` : undefined}
                    icon={<PercentIcon/>}
                    color={winRate >= 50 ? 'success' : 'warning'}
                    isLoading={isLoading}
                />
            </Grid>
            <Grid size={{xs: 12, sm: 6, md: 3}}>
                <StatCard
                    title="Total Trades"
                    value={totalTrades}
                    subtitle={summary ? `Avg: ${formatCurrency(summary.avgTradePnl)}` : undefined}
                    icon={<ShowChartIcon/>}
                    color="primary"
                    isLoading={isLoading}
                />
            </Grid>
            <Grid size={{xs: 12, sm: 6, md: 3}}>
                <StatCard
                    title="Best / Worst"
                    value={summary ? formatCurrency(summary.bestTrade) : '$0.00'}
                    subtitle={summary ? `Worst: ${formatCurrency(summary.worstTrade)}` : undefined}
                    icon={<TrendingUpIcon/>}
                    color={profitFactor >= 1 ? 'success' : 'warning'}
                    isLoading={isLoading}
                />
            </Grid>
        </Grid>
    );
}

export default TradeSummaryCards;
