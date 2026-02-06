/**
 * Trades By Symbol Accordion Component
 * Displays trades grouped by symbol in expandable sections
 */

import {
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Box,
    Typography,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Paper,
    Skeleton,
    IconButton,
    Tooltip,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import type {TradesBySymbol} from '@/types';

interface TradesBySymbolAccordionProps {
    data: TradesBySymbol[];
    expandedSymbols: Set<string>;
    onToggleSymbol: (symbol: string) => void;
    onExpandAll: () => void;
    onCollapseAll: () => void;
    isLoading?: boolean;
}

function formatCurrency(value: number): { text: string; color: string } {
    const prefix = value >= 0 ? '+' : '';
    return {
        text: `${prefix}$${Math.abs(value).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}`,
        color: value >= 0 ? 'success.main' : 'error.main',
    };
}

function formatPercent(value: number): string {
    const prefix = value >= 0 ? '+' : '';
    return `${prefix}${value.toFixed(2)}%`;
}

function formatPrice(price: number | undefined): string {
    if (price === undefined || price === null) return '-';
    return price.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
    });
}

function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
    });
}

export function TradesBySymbolAccordion({
                                            data,
                                            expandedSymbols,
                                            onToggleSymbol,
                                            onExpandAll,
                                            onCollapseAll,
                                            isLoading,
                                        }: TradesBySymbolAccordionProps) {
    if (isLoading) {
        return (
            <Box sx={{display: 'flex', flexDirection: 'column', gap: 1}}>
                {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} variant="rounded" height={60}/>
                ))}
            </Box>
        );
    }

    if (data.length === 0) {
        return (
            <Paper sx={{p: 4, textAlign: 'center'}}>
                <Typography color="text.secondary">No trades found</Typography>
            </Paper>
        );
    }

    return (
        <Box>
            <Box sx={{display: 'flex', justifyContent: 'flex-end', mb: 1, gap: 1}}>
                <Tooltip title="Expand all">
                    <IconButton size="small" onClick={onExpandAll}>
                        <UnfoldMoreIcon fontSize="small"/>
                    </IconButton>
                </Tooltip>
                <Tooltip title="Collapse all">
                    <IconButton size="small" onClick={onCollapseAll}>
                        <UnfoldLessIcon fontSize="small"/>
                    </IconButton>
                </Tooltip>
            </Box>

            {data.map((group) => {
                const pnl = formatCurrency(group.totalPnl);
                const isExpanded = expandedSymbols.has(group.symbol);

                return (
                    <Accordion
                        key={group.symbol}
                        expanded={isExpanded}
                        onChange={() => onToggleSymbol(group.symbol)}
                        sx={{mb: 1}}
                    >
                        <AccordionSummary expandIcon={<ExpandMoreIcon/>}>
                            <Box
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    width: '100%',
                                    pr: 2,
                                }}
                            >
                                <Box sx={{display: 'flex', alignItems: 'center', gap: 2}}>
                                    <Typography variant="subtitle1" fontWeight={700}>
                                        {group.symbol}
                                    </Typography>
                                    <Chip
                                        label={`${group.tradeCount} trade${group.tradeCount !== 1 ? 's' : ''}`}
                                        size="small"
                                        variant="outlined"
                                    />
                                    <Chip
                                        label={`${group.winRate.toFixed(0)}% win`}
                                        size="small"
                                        color={group.winRate >= 50 ? 'success' : 'warning'}
                                        variant="outlined"
                                    />
                                </Box>
                                <Box sx={{textAlign: 'right'}}>
                                    <Typography variant="subtitle1" fontWeight={700} sx={{color: pnl.color}}>
                                        {pnl.text}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {formatPercent(group.totalPnlPercent)}
                                    </Typography>
                                </Box>
                            </Box>
                        </AccordionSummary>
                        <AccordionDetails>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Side</TableCell>
                                        <TableCell align="right">Entry</TableCell>
                                        <TableCell align="right">Exit</TableCell>
                                        <TableCell align="right">Qty</TableCell>
                                        <TableCell align="right">P&L</TableCell>
                                        <TableCell align="right">Date</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {group.trades.map((trade) => {
                                        const tradePnl = formatCurrency(trade.realizedPnl ?? 0);
                                        return (
                                            <TableRow key={trade.id}>
                                                <TableCell>
                                                    <Chip
                                                        label={trade.side.toUpperCase()}
                                                        size="small"
                                                        color={trade.side === 'buy' ? 'success' : 'error'}
                                                        variant="outlined"
                                                    />
                                                </TableCell>
                                                <TableCell align="right">{formatPrice(trade.entryPrice)}</TableCell>
                                                <TableCell align="right">{formatPrice(trade.exitPrice)}</TableCell>
                                                <TableCell align="right">{trade.quantity.toFixed(4)}</TableCell>
                                                <TableCell align="right">
                                                    <Typography variant="body2" sx={{color: tradePnl.color}}>
                                                        {tradePnl.text}
                                                    </Typography>
                                                    {trade.realizedPnlPercent !== undefined && (
                                                        <Typography variant="caption" sx={{color: tradePnl.color}}>
                                                            {formatPercent(trade.realizedPnlPercent)}
                                                        </Typography>
                                                    )}
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Typography variant="body2" color="text.secondary">
                                                        {formatDate(trade.entryTime)}
                                                    </Typography>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </AccordionDetails>
                    </Accordion>
                );
            })}
        </Box>
    );
}

export default TradesBySymbolAccordion;
