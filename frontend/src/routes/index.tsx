/**
 * Dashboard Page
 */

import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import {
    Alert,
    Box,
    Card,
    CardContent,
    Chip,
    Grid2 as Grid,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Typography,
} from "@mui/material";
import {useQuery} from "@tanstack/react-query";
import {createFileRoute} from "@tanstack/react-router";
import {motion} from "framer-motion";
import {tradesApi} from "@/api/endpoints/trades";
import {marketAccountQueryOptions, marketOverviewQueryOptions,} from "@/api/queryOptions/market";
import {PageTransition} from "@/components/common/PageTransition";
import {ShimmerSkeleton} from "@/components/common/ShimmerSkeleton";
import {StatCard} from "@/components/data-display/StatCard";
import {TickerCard} from "@/components/trading/TickerCard";
import {useMarketStore} from "@/store/marketStore";
import type {MarketOverviewTicker} from "@/types";
import {staggerCascade} from "@/utils/animations/variants";
import {
    formatPercent,
    formatPrice,
    formatRelativeTime,
    formatSymbol,
    formatUSD,
    formatVolume,
} from "@/utils/formatters";
import {requireAuth} from "./-guards";

export const Route = createFileRoute("/")({
    beforeLoad: requireAuth,
    component: Dashboard,
});

function Dashboard() {
    const watchlist = useMarketStore((state) => state.watchlist);

    const accountQuery = useQuery({
        ...marketAccountQueryOptions(),
        refetchInterval: 60_000,
    });

    const summaryQuery = useQuery({
        queryKey: ["trades", "summary"],
        queryFn: () => tradesApi.getSummary(),
        staleTime: 30_000,
    });

    const overviewQuery = useQuery({
        ...marketOverviewQueryOptions(),
        refetchInterval: 120_000,
    });

    const recentTradesQuery = useQuery({
        queryKey: ["trades", "recent"],
        queryFn: () => tradesApi.getTrades({pageSize: 5}),
        staleTime: 30_000,
    });

    const accountError = accountQuery.isError || accountQuery.data?.error;
    const overviewError = overviewQuery.isError || overviewQuery.data?.error;

    return (
        <PageTransition pageKey="dashboard">
            <Box>
                <motion.div
                    initial={{opacity: 0, x: -60}}
                    animate={{opacity: 1, x: 0}}
                    transition={{type: "spring", stiffness: 400, damping: 30}}
                >
                    <Typography variant="h4" fontWeight={700} gutterBottom>
                        Dashboard
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{mb: 4}}>
                        Welcome back! Here's an overview of your trading activity.
                    </Typography>
                </motion.div>

                {(accountError || overviewError) && (
                    <Alert severity="warning" sx={{mb: 3}}>
                        {accountQuery.data?.error ??
                            (accountError
                                ? "Unable to fetch account balance from OKX. "
                                : "")}
                        {overviewQuery.data?.error ??
                            (overviewError ? "Unable to fetch market overview. " : "")}
                        {!accountQuery.data?.error &&
                            !overviewQuery.data?.error &&
                            "Check your API key configuration."}
                    </Alert>
                )}

                {/* Stats Grid */}
                <motion.div
                    variants={staggerCascade.container}
                    initial="hidden"
                    animate="visible"
                >
                    <Grid container spacing={3} sx={{mb: 4}}>
                        <Grid size={{xs: 12, sm: 6, md: 3}}>
                            <motion.div variants={staggerCascade.item}>
                                <StatCard
                                    title="Total Equity"
                                    value={formatUSD(accountQuery.data?.totalEquity ?? 0)}
                                    icon={<AccountBalanceWalletIcon/>}
                                    loading={accountQuery.isLoading}
                                />
                            </motion.div>
                        </Grid>
                        <Grid size={{xs: 12, sm: 6, md: 3}}>
                            <motion.div variants={staggerCascade.item}>
                                <StatCard
                                    title="Unrealized P&L"
                                    value={formatUSD(accountQuery.data?.unrealizedPnl ?? 0)}
                                    change={
                                        accountQuery.data?.totalEquity
                                            ? (accountQuery.data.unrealizedPnl /
                                                accountQuery.data.totalEquity) *
                                            100
                                            : undefined
                                    }
                                    icon={<TrendingUpIcon/>}
                                    trend={
                                        (accountQuery.data?.unrealizedPnl ?? 0) >= 0 ? "up" : "down"
                                    }
                                    loading={accountQuery.isLoading}
                                />
                            </motion.div>
                        </Grid>
                        <Grid size={{xs: 12, sm: 6, md: 3}}>
                            <motion.div variants={staggerCascade.item}>
                                <StatCard
                                    title="Realized P&L"
                                    value={formatUSD(summaryQuery.data?.netPnl ?? 0)}
                                    change={summaryQuery.data?.totalPnlPercent}
                                    icon={<ShowChartIcon/>}
                                    trend={(summaryQuery.data?.netPnl ?? 0) >= 0 ? "up" : "down"}
                                    loading={summaryQuery.isLoading}
                                />
                            </motion.div>
                        </Grid>
                        <Grid size={{xs: 12, sm: 6, md: 3}}>
                            <motion.div variants={staggerCascade.item}>
                                <StatCard
                                    title="Total Trades"
                                    value={summaryQuery.data?.totalTrades ?? 0}
                                    changeLabel={
                                        summaryQuery.data
                                            ? `${formatPercent(summaryQuery.data.winRate, 0)} win rate`
                                            : undefined
                                    }
                                    icon={<SwapHorizIcon/>}
                                    loading={summaryQuery.isLoading}
                                />
                            </motion.div>
                        </Grid>
                    </Grid>
                </motion.div>

                <Grid container spacing={3}>
                    {/* Market Overview */}
                    <Grid size={{xs: 12, md: 8}}>
                        <Card
                            component={motion.div}
                            initial={{opacity: 0, y: 60}}
                            animate={{opacity: 1, y: 0}}
                            transition={{
                                type: "spring",
                                stiffness: 400,
                                damping: 30,
                                delay: 0.3,
                            }}
                            sx={{
                                height: "100%",
                                borderTop: "2px solid",
                                borderImage:
                                    "linear-gradient(135deg, #F97316 0%, #8B5CF6 100%) 1",
                            }}
                        >
                            <CardContent>
                                <Box
                                    sx={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        mb: 2,
                                    }}
                                >
                                    <Typography variant="h6">Market Overview</Typography>
                                    {overviewQuery.data && (
                                        <Typography variant="body2" color="text.secondary">
                                            24h Volume: $
                                            {formatVolume(overviewQuery.data.totalVolume24h)}
                                        </Typography>
                                    )}
                                </Box>

                                {overviewQuery.isLoading ? (
                                    <Box>
                                        {Array.from({length: 5}).map((_, i) => (
                                            <ShimmerSkeleton
                                                key={`skel-${String(i)}`}
                                                shimmerVariant="table-row"
                                            />
                                        ))}
                                    </Box>
                                ) : overviewQuery.data &&
                                (overviewQuery.data.topGainers.length > 0 ||
                                    overviewQuery.data.topLosers.length > 0) ? (
                                    <Grid container spacing={3}>
                                        <Grid size={{xs: 12, sm: 6}}>
                                            <Box
                                                sx={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 1,
                                                    mb: 1,
                                                }}
                                            >
                                                <Box
                                                    component={motion.div}
                                                    animate={{
                                                        scale: [1, 1.4, 1],
                                                        opacity: [0.7, 1, 0.7],
                                                    }}
                                                    transition={{duration: 2, repeat: Infinity}}
                                                    sx={{
                                                        width: 8,
                                                        height: 8,
                                                        borderRadius: "50%",
                                                        bgcolor: "success.main",
                                                    }}
                                                />
                                                <Typography variant="subtitle2" color="success.main">
                                                    Top Gainers
                                                </Typography>
                                            </Box>
                                            <OverviewTable
                                                tickers={overviewQuery.data.topGainers}
                                                colorField="success"
                                            />
                                        </Grid>
                                        <Grid size={{xs: 12, sm: 6}}>
                                            <Box
                                                sx={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 1,
                                                    mb: 1,
                                                }}
                                            >
                                                <Box
                                                    component={motion.div}
                                                    animate={{
                                                        scale: [1, 1.4, 1],
                                                        opacity: [0.7, 1, 0.7],
                                                    }}
                                                    transition={{duration: 2, repeat: Infinity}}
                                                    sx={{
                                                        width: 8,
                                                        height: 8,
                                                        borderRadius: "50%",
                                                        bgcolor: "error.main",
                                                    }}
                                                />
                                                <Typography variant="subtitle2" color="error.main">
                                                    Top Losers
                                                </Typography>
                                            </Box>
                                            <OverviewTable
                                                tickers={overviewQuery.data.topLosers}
                                                colorField="error"
                                            />
                                        </Grid>
                                    </Grid>
                                ) : (
                                    <Typography variant="body2" color="text.secondary">
                                        No market data available.
                                    </Typography>
                                )}
                            </CardContent>
                        </Card>
                    </Grid>

                    {/* Watchlist */}
                    <Grid size={{xs: 12, md: 4}}>
                        <Card
                            component={motion.div}
                            initial={{opacity: 0, x: 60}}
                            animate={{opacity: 1, x: 0}}
                            transition={{
                                type: "spring",
                                stiffness: 400,
                                damping: 30,
                                delay: 0.35,
                            }}
                            sx={{height: "100%"}}
                        >
                            <CardContent>
                                <Typography variant="h6" gutterBottom>
                                    Watchlist
                                </Typography>
                                <Box sx={{display: "flex", flexDirection: "column", gap: 2}}>
                                    {watchlist.map((symbol) => (
                                        <TickerCard key={symbol} symbol={symbol} compact/>
                                    ))}
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>

                    {/* Recent Activity */}
                    <Grid size={{xs: 12}}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>
                                    Recent Activity
                                </Typography>

                                {recentTradesQuery.isLoading ? (
                                    <Box>
                                        {Array.from({length: 3}).map((_, i) => (
                                            <ShimmerSkeleton
                                                key={`skel-${String(i)}`}
                                                shimmerVariant="table-row"
                                            />
                                        ))}
                                    </Box>
                                ) : recentTradesQuery.data &&
                                recentTradesQuery.data.trades.length > 0 ? (
                                    <TableContainer>
                                        <Table size="small">
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell>Side</TableCell>
                                                    <TableCell>Symbol</TableCell>
                                                    <TableCell align="right">Price</TableCell>
                                                    <TableCell align="right">Quantity</TableCell>
                                                    <TableCell align="right">P&L</TableCell>
                                                    <TableCell align="right">Time</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {recentTradesQuery.data.trades.map((trade) => (
                                                    <TableRow key={trade.id}>
                                                        <TableCell>
                                                            <Chip
                                                                label={trade.side.toUpperCase()}
                                                                size="small"
                                                                color={
                                                                    trade.side === "buy" ? "success" : "error"
                                                                }
                                                                sx={{fontWeight: 600, minWidth: 48}}
                                                            />
                                                        </TableCell>
                                                        <TableCell>{formatSymbol(trade.symbol)}</TableCell>
                                                        <TableCell align="right">
                                                            ${formatPrice(trade.entryPrice)}
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            {trade.quantity}
                                                        </TableCell>
                                                        <TableCell
                                                            align="right"
                                                            sx={{
                                                                color:
                                                                    (trade.netPnl ?? 0) >= 0
                                                                        ? "success.main"
                                                                        : "error.main",
                                                                fontWeight: 500,
                                                            }}
                                                        >
                                                            {trade.netPnl !== undefined
                                                                ? formatUSD(trade.netPnl)
                                                                : "-"}
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            <Typography
                                                                variant="body2"
                                                                color="text.secondary"
                                                            >
                                                                {formatRelativeTime(trade.entryTime)}
                                                            </Typography>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                ) : (
                                    <Typography variant="body2" color="text.secondary">
                                        No trades yet. Start trading to see your activity here.
                                    </Typography>
                                )}
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            </Box>
        </PageTransition>
    );
}

function OverviewTable({
                           tickers,
                           colorField,
                       }: {
    tickers: MarketOverviewTicker[];
    colorField: "success" | "error";
}) {
    return (
        <Table size="small">
            <TableBody>
                {tickers.map((t) => (
                    <TableRow key={t.symbol} sx={{"&:last-child td": {border: 0}}}>
                        <TableCell sx={{py: 0.75, pl: 0}}>
                            <Typography variant="body2" fontWeight={500}>
                                {formatSymbol(t.symbol)}
                            </Typography>
                        </TableCell>
                        <TableCell align="right" sx={{py: 0.75}}>
                            <Typography variant="body2">
                                ${formatPrice(t.lastPrice)}
                            </Typography>
                        </TableCell>
                        <TableCell align="right" sx={{py: 0.75, pr: 0}}>
                            <Chip
                                label={formatPercent(t.changePct24h)}
                                size="small"
                                color={colorField}
                                variant="outlined"
                                sx={{fontWeight: 600, minWidth: 72}}
                            />
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
