/**
 * Dashboard Page — Agent Command Center
 */

import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import {
    Alert,
    Box,
    Button,
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
import * as Sentry from "@sentry/react";
import {useQuery} from "@tanstack/react-query";
import {createFileRoute, Link, useNavigate} from "@tanstack/react-router";
import {motion} from "framer-motion";
import {startTransition, useEffect, useState} from "react";
import {tradesApi} from "@/api/endpoints/trades";
import {agentDecisionsQueryOptions} from "@/api/queryOptions/agent";
import {marketAccountQueryOptions} from "@/api/queryOptions/market";
import {EquityChart} from "@/components/charts";
import {EmptyState} from "@/components/common/EmptyState";
import {MetricRow} from "@/components/common/MetricRow";
import {PageTransition} from "@/components/common/PageTransition";
import {SectionHeader} from "@/components/common/SectionHeader";
import {ShimmerSkeleton} from "@/components/common/ShimmerSkeleton";
import {StatusDot} from "@/components/common/StatusDot";
import {StatCard} from "@/components/data-display/StatCard";
import {MagneticButton} from "@/components/effects/MagneticButton";
import {ScrollReveal} from "@/components/effects/ScrollReveal";
import {useAgentStore} from "@/store/agentStore";
import {useOrderStore} from "@/store/orderStore";
import {staggerCascade} from "@/utils/animations/variants";
import {formatPercent, formatPrice, formatRelativeTime, formatSymbol, formatUSD,} from "@/utils/formatters";
import {requireAuth} from "./-guards";

const ProfiledDashboard = Sentry.withProfiler(Dashboard);

export const Route = createFileRoute("/")({
    beforeLoad: requireAuth,
    component: ProfiledDashboard,
});

function StatsSection({
                          accountQuery,
                          summaryQuery,
                          decisionsCount,
                      }: {
    accountQuery: ReturnType<typeof useQuery<any>>;
    summaryQuery: ReturnType<typeof useQuery<any>>;
    decisionsCount: number;
}) {
    return (
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
                            loading={accountQuery.isPending}
                            sparklineData={[]}
                            useRolling
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
                            trend={
                                (accountQuery.data?.unrealizedPnl ?? 0) >= 0 ? "up" : "down"
                            }
                            loading={accountQuery.isPending}
                            useRolling
                        />
                    </motion.div>
                </Grid>
                <Grid size={{xs: 12, sm: 6, md: 3}}>
                    <motion.div variants={staggerCascade.item}>
                        <StatCard
                            title="Agent Win Rate"
                            value={formatPercent(summaryQuery.data?.winRate ?? 0, 1)}
                            loading={summaryQuery.isPending}
                        />
                    </motion.div>
                </Grid>
                <Grid size={{xs: 12, sm: 6, md: 3}}>
                    <motion.div variants={staggerCascade.item}>
                        <StatCard
                            title="Decisions Today"
                            value={decisionsCount}
                            loading={false}
                        />
                    </motion.div>
                </Grid>
            </Grid>
        </motion.div>
    );
}


function AgentStatusCard() {
    const agentStatus = useAgentStore((s) => s.status);
    const isThinking = useAgentStore((s) => s.isThinking);
    const agentConnected =
        agentStatus === "connected" ||
        agentStatus === "thinking" ||
        agentStatus === "analyzing";

    return (
        <Card sx={{height: 280}}>
            <CardContent>
                <Box sx={{display: "flex", alignItems: "center", gap: 1, mb: 2}}>
                    <SmartToyIcon sx={{color: "primary.main"}}/>
                    <Typography variant="h6">Agent Status</Typography>
                </Box>
                <Box sx={{display: "flex", flexDirection: "column", gap: 2}}>
                    <MetricRow
                        label="Status"
                        value={
                            <Box sx={{display: "flex", alignItems: "center", gap: 1}}>
                                <StatusDot
                                    status={agentConnected ? "online" : "offline"}
                                    size={7}
                                />
                                <Typography variant="body2">
                                    {agentConnected ? "Connected" : "Disconnected"}
                                </Typography>
                            </Box>
                        }
                    />
                    <MetricRow
                        label="Active Task"
                        value={isThinking ? "Running" : "None"}
                    />
                    <MetricRow label="Mode" value="Automated"/>
                </Box>
            </CardContent>
        </Card>
    );
}

function AgentDecisionsSection({
                                   decisionsQuery,
                                   navigate,
                               }: {
    decisionsQuery: ReturnType<typeof useQuery<any>>;
    navigate: ReturnType<typeof useNavigate>;
}) {
    return (
        <Card sx={{height: "100%"}}>
            <CardContent>
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        mb: 2,
                    }}
                >
                    <AutoAwesomeIcon sx={{color: "secondary.main", fontSize: 20}}/>
                    <Typography variant="h6">Agent Decisions</Typography>
                    <MagneticButton
                        size="small"
                        onClick={() => navigate({to: "/agent"})}
                        sx={{ml: "auto", fontSize: "0.75rem"}}
                    >
                        Open Agent
                    </MagneticButton>
                </Box>

                {decisionsQuery.isLoading ? (
                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 1.5,
                        }}
                    >
                        {[0, 1, 2].map((i) => (
                            <ShimmerSkeleton
                                key={`d-${String(i)}`}
                                variant="text"
                                height={64}
                            />
                        ))}
                    </Box>
                ) : decisionsQuery.data?.decisions.length ? (
                    <Box
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 1.5,
                        }}
                    >
                        {decisionsQuery.data.decisions.map((decision: any) => (
                            <Box
                                key={decision.id}
                                sx={{
                                    p: 1.5,
                                    borderRadius: 2,
                                    border: (theme) => `1px solid ${theme.trading.border.subtle}`,
                                    background: (theme) => theme.trading.cardTint,
                                    "&:hover": {
                                        background: (theme) =>
                                            `rgba(${theme.trading.primaryRgb}, 0.06)`,
                                    },
                                    transition: "background 0.2s ease",
                                }}
                            >
                                <Box
                                    sx={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        mb: 0.5,
                                    }}
                                >
                                    <Chip
                                        label={decision.action}
                                        size="small"
                                        color={
                                            decision.action === "buy"
                                                ? "success"
                                                : decision.action === "sell"
                                                    ? "error"
                                                    : "default"
                                        }
                                        sx={{
                                            fontWeight: 700,
                                            textTransform: "uppercase",
                                            fontSize: "0.65rem",
                                        }}
                                    />
                                    <Typography variant="caption" color="text.secondary">
                                        {decision.symbol} · {formatRelativeTime(decision.createdAt)}
                                    </Typography>
                                </Box>
                                {decision.summary && (
                                    <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        sx={{
                                            display: "block",
                                            lineHeight: 1.4,
                                            mt: 0.5,
                                        }}
                                    >
                                        {decision.summary.length > 120
                                            ? `${decision.summary.slice(0, 120)}…`
                                            : decision.summary}
                                    </Typography>
                                )}
                            </Box>
                        ))}
                        <Button
                            component={Link}
                            to="/agent"
                            size="small"
                            sx={{alignSelf: "flex-start", mt: 0.5}}
                        >
                            View all →
                        </Button>
                    </Box>
                ) : (
                    <EmptyState
                        icon={<SmartToyIcon/>}
                        title="No recent decisions"
                        description="The agent hasn't made any decisions yet."
                        sx={{py: 4}}
                    />
                )}
            </CardContent>
        </Card>
    );
}

function RecentTradesSection({
                                 recentTradesQuery,
                             }: {
    recentTradesQuery: ReturnType<typeof useQuery<any>>;
}) {
    return (
        <Card sx={{height: "100%"}}>
            <CardContent>
                <Typography variant="h6" gutterBottom>
                    Recent Agent Trades
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
                ) : recentTradesQuery.data?.trades.length ? (
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
                                {recentTradesQuery.data.trades.map((trade: any) => (
                                    <TableRow key={trade.id}>
                                        <TableCell>
                                            <Chip
                                                label={trade.side.toUpperCase()}
                                                size="small"
                                                color={trade.side === "buy" ? "success" : "error"}
                                                sx={{fontWeight: 600, minWidth: 48}}
                                            />
                                        </TableCell>
                                        <TableCell>{formatSymbol(trade.symbol)}</TableCell>
                                        <TableCell align="right">
                                            ${formatPrice(trade.entryPrice)}
                                        </TableCell>
                                        <TableCell align="right">{trade.quantity}</TableCell>
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
                                            <Typography variant="body2" color="text.secondary">
                                                {formatRelativeTime(trade.entryTime)}
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                ) : (
                    <EmptyState
                        icon={<TrendingUpIcon/>}
                        title="No agent trades yet"
                        description="The agent will log trades here as it executes."
                        sx={{py: 4}}
                    />
                )}
            </CardContent>
        </Card>
    );
}

function Dashboard() {
    const navigate = useNavigate();
    const positions = useOrderStore((state) => state.positions);
    const [secondaryQueriesEnabled, setSecondaryQueriesEnabled] = useState(false);

    useEffect(() => {
        const frameId = window.requestAnimationFrame(() => {
            startTransition(() => {
                setSecondaryQueriesEnabled(true);
            });
        });

        return () => {
            window.cancelAnimationFrame(frameId);
        };
    }, []);

    const accountQuery = useQuery({
        ...marketAccountQueryOptions(),
        refetchInterval: 60_000,
    });

    const summaryQuery = useQuery({
        queryKey: ["trades", "summary"],
        queryFn: () => tradesApi.getSummary(),
        staleTime: 30_000,
    });

    const recentTradesQuery = useQuery({
        queryKey: ["trades", "recent"],
        queryFn: () => tradesApi.getTrades({pageSize: 5}),
        staleTime: 30_000,
        enabled: secondaryQueriesEnabled,
    });

    const chartTradesQuery = useQuery({
        queryKey: ["trades", "chart"],
        queryFn: () => tradesApi.getTrades({pageSize: 50}),
        staleTime: 60_000,
        enabled: secondaryQueriesEnabled,
    });

    const decisionsQuery = useQuery({
        ...agentDecisionsQueryOptions({}, 1, 5),
        refetchInterval: 60_000,
        enabled: secondaryQueriesEnabled,
    });

    const accountError = accountQuery.isError || accountQuery.data?.error;

    const decisionsCount = decisionsQuery.data?.decisions?.length ?? 0;
    const tradesCount = recentTradesQuery.data?.trades?.length ?? 0;
    const isFirstTimeUser =
        secondaryQueriesEnabled &&
        !accountQuery.isPending &&
        !recentTradesQuery.isPending &&
        !decisionsQuery.isPending &&
        tradesCount === 0 &&
        decisionsCount === 0 &&
        positions.length === 0;

    return (
        <PageTransition pageKey="dashboard">
            <Box>
                <SectionHeader
                    title="Dashboard"
                    subtitle="Agent command center — overview of automated trading activity"
                    action={
                        <MagneticButton
                            variant="contained"
                            startIcon={<SmartToyIcon/>}
                            onClick={() => navigate({to: "/agent"})}
                            sx={{fontWeight: 600}}
                        >
                            Ask Agent
                        </MagneticButton>
                    }
                />

                {accountError && (
                    <Alert severity="warning" sx={{mb: 3}}>
                        {accountQuery.data?.error ??
                            "Unable to fetch account balance from OKX. Check your API key configuration."}
                    </Alert>
                )}

                {/* Get Started hero for first-time users */}
                {isFirstTimeUser && (
                    <Card sx={{mb: 3, p: 3}}>
                        <Typography variant="h5" fontWeight={700} sx={{mb: 1}}>
                            Welcome to Trading Agent
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{mb: 3}}>
                            Get started with automated trading in 3 steps:
                        </Typography>
                        <Box sx={{display: "flex", gap: 2, flexWrap: "wrap"}}>
                            <Chip
                                label="1. Configure Exchange"
                                component={Link}
                                to="/settings"
                                clickable
                            />
                            <Chip
                                label="2. Import Strategy"
                                component={Link}
                                to="/strategies/create"
                                clickable
                            />
                            <Chip
                                label="3. Create Task"
                                component={Link}
                                to="/tasks"
                                clickable
                            />
                        </Box>
                    </Card>
                )}

                {/* Top Row: Stat Cards */}
                <StatsSection
                    accountQuery={accountQuery}
                    summaryQuery={summaryQuery}
                    decisionsCount={decisionsCount}
                />

                {/* Middle Row: Equity Chart + Agent Status */}
                <ScrollReveal direction="up" delay={0.1}>
                    <Grid container spacing={3} sx={{mb: 3}}>
                        <Grid size={{xs: 12, md: 8}}>
                            <EquityChart
                                trades={chartTradesQuery.data?.trades ?? []}
                                loading={chartTradesQuery.isLoading}
                            />
                        </Grid>
                        <Grid size={{xs: 12, md: 4}}>
                            <AgentStatusCard/>
                        </Grid>
                    </Grid>
                </ScrollReveal>

                {/* Bottom Row: Decisions + Recent Trades */}
                <ScrollReveal direction="up" delay={0.2}>
                    <Grid container spacing={3}>
                        <Grid size={{xs: 12, md: 6}}>
                            <AgentDecisionsSection
                                decisionsQuery={decisionsQuery}
                                navigate={navigate}
                            />
                        </Grid>
                        <Grid size={{xs: 12, md: 6}}>
                            <RecentTradesSection recentTradesQuery={recentTradesQuery}/>
                        </Grid>
                    </Grid>
                </ScrollReveal>
            </Box>
        </PageTransition>
    );
}

