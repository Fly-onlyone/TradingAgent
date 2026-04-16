/**
 * Dashboard Page — Agent Command Center
 */

import AutoGraphIcon from "@mui/icons-material/AutoGraph";
import InsightsIcon from "@mui/icons-material/Insights";
import PsychologyIcon from "@mui/icons-material/Psychology";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import {
	Alert,
	Box,
	Card,
	Chip,
	Grid2 as Grid,
	Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion, useInView } from "framer-motion";
import {
	lazy,
	Suspense,
	startTransition,
	useEffect,
	useRef,
	useState,
} from "react";
import { tradesApi } from "@/api/endpoints/trades";
import { dashboardSummaryQueryOptions } from "@/api/queryOptions/dashboard";
import { PageTransition } from "@/components/common/PageTransition";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import {
	DeltaMetric,
	KpiMetric,
	TrendIconMetric,
} from "@/components/data-display/metric";
import { MagneticButton } from "@/components/effects/MagneticButton";
import { ScrollReveal } from "@/components/effects/ScrollReveal";
import { useOrderStore } from "@/store/orderStore";
import type { AccountBalance, DashboardSummary, TradeSummary } from "@/types";
import { usePageVisibility, useReducedMotion } from "@/utils/animations/hooks";
import { staggerCascade } from "@/utils/animations/variants";
import { formatUSD } from "@/utils/formatters";
import { requireAuth } from "./-guards";

const LazyEquityChart = lazy(() => import("@/components/charts/EquityChart"));
const LazyAgentStatusCard = lazy(
	() => import("@/components/dashboard/DashboardAgentStatusCard"),
);
const LazyAgentDecisionsSection = lazy(
	() => import("@/components/dashboard/DashboardAgentDecisionsSection"),
);
const LazyRecentTradesSection = lazy(
	() => import("@/components/dashboard/DashboardRecentTradesSection"),
);

const DASHBOARD_GC_TIME = 2 * 60_000;

export const Route = createFileRoute("/")({
	beforeLoad: requireAuth,
	component: Dashboard,
});

function StatsSection({
	account,
	summary,
	loading,
	decisionsCount,
	reducedMotion,
}: {
	account?: AccountBalance;
	summary?: TradeSummary;
	loading: boolean;
	decisionsCount: number;
	reducedMotion: boolean;
}) {
	const shouldAnimate = !reducedMotion;

	return (
		<motion.div
			variants={staggerCascade.container}
			initial={shouldAnimate ? "hidden" : false}
			animate={shouldAnimate ? "visible" : undefined}
		>
			<Grid container spacing={3} sx={{ mb: 4 }}>
				<Grid size={{ xs: 12, sm: 6, md: 3 }}>
					<motion.div
						variants={staggerCascade.item}
						initial={shouldAnimate ? undefined : false}
					>
						<KpiMetric
							label="Total Equity"
							value={formatUSD(account?.totalEquity ?? 0)}
							loading={loading}
							rolling
							icon={<AutoGraphIcon />}
						/>
					</motion.div>
				</Grid>
				<Grid size={{ xs: 12, sm: 6, md: 3 }}>
					<motion.div
						variants={staggerCascade.item}
						initial={shouldAnimate ? undefined : false}
					>
						<DeltaMetric
							label="Unrealized P&L"
							value={formatUSD(account?.unrealizedPnl ?? 0)}
							change={
								account?.totalEquity
									? (account.unrealizedPnl / account.totalEquity) * 100
									: undefined
							}
							loading={loading}
							icon={<TrendingUpIcon />}
						/>
					</motion.div>
				</Grid>
				<Grid size={{ xs: 12, sm: 6, md: 3 }}>
					<motion.div
						variants={staggerCascade.item}
						initial={shouldAnimate ? undefined : false}
					>
						<TrendIconMetric
							label="Agent Win Rate"
							value={
								summary && summary.totalTrades > 0
									? `${summary.winRate.toFixed(1)}%`
									: "—"
							}
							subtitle={
								summary && summary.totalTrades > 0
									? `${summary.winningTrades} of ${summary.totalTrades} trades`
									: "No trades yet"
							}
							icon={<InsightsIcon />}
							tone={
								!summary || summary.totalTrades === 0
									? "neutral"
									: summary.winRate >= 50
										? "success"
										: "warning"
							}
							loading={loading}
						/>
					</motion.div>
				</Grid>
				<Grid size={{ xs: 12, sm: 6, md: 3 }}>
					<motion.div
						variants={staggerCascade.item}
						initial={shouldAnimate ? undefined : false}
					>
						<KpiMetric
							label="Decisions Today"
							value={decisionsCount}
							loading={loading}
							icon={<PsychologyIcon />}
						/>
					</motion.div>
				</Grid>
			</Grid>
		</motion.div>
	);
}

function Dashboard() {
	const navigate = useNavigate();
	const positions = useOrderStore((state) => state.positions);
	const [deferredContentReady, setDeferredContentReady] = useState(false);
	const isPageVisible = usePageVisibility();
	const reducedMotion = useReducedMotion();
	const chartRef = useRef<HTMLDivElement | null>(null);
	const statusRef = useRef<HTMLDivElement | null>(null);
	const bottomSectionsRef = useRef<HTMLDivElement | null>(null);
	const chartInView = useInView(chartRef, {
		once: true,
		margin: "0px 0px 240px 0px",
	});
	const statusInView = useInView(statusRef, {
		once: true,
		margin: "0px 0px 240px 0px",
	});
	const bottomSectionsInView = useInView(bottomSectionsRef, {
		once: true,
		margin: "0px 0px 240px 0px",
	});

	useEffect(() => {
		if (typeof window.requestIdleCallback === "function") {
			const idleId = window.requestIdleCallback(
				() => {
					startTransition(() => {
						setDeferredContentReady(true);
					});
				},
				{ timeout: 1500 },
			);
			return () => {
				window.cancelIdleCallback(idleId);
			};
		}

		const frameId = window.requestAnimationFrame(() => {
			startTransition(() => {
				setDeferredContentReady(true);
			});
		});

		return () => {
			window.cancelAnimationFrame(frameId);
		};
	}, []);

	const dashboardQuery = useQuery({
		...dashboardSummaryQueryOptions(),
		gcTime: DASHBOARD_GC_TIME,
		refetchInterval: isPageVisible ? 60_000 : false,
	});

	const chartTradesQuery = useQuery({
		queryKey: ["trades", "chart"],
		queryFn: () => tradesApi.getTrades({ pageSize: 50 }),
		staleTime: 60_000,
		gcTime: DASHBOARD_GC_TIME,
		enabled: deferredContentReady && chartInView,
	});

	const summaryData: DashboardSummary | undefined = dashboardQuery.data;
	const showChart = deferredContentReady && chartInView;
	const showStatusCard = deferredContentReady && statusInView;
	const showBottomSections = deferredContentReady && bottomSectionsInView;
	const accountError = dashboardQuery.isError || summaryData?.account.error;
	const decisionsCount = summaryData?.totalDecisions ?? 0;
	const tradesCount = summaryData?.recentTrades.length ?? 0;
	const isFirstTimeUser =
		deferredContentReady &&
		!dashboardQuery.isPending &&
		tradesCount === 0 &&
		decisionsCount === 0 &&
		positions.length === 0;

	return (
		<PageTransition pageKey="dashboard" heavy>
			<Box>
				<SectionHeader
					title="Dashboard"
					subtitle="Agent command center — overview of automated trading activity"
					action={
						<MagneticButton
							variant="contained"
							startIcon={<SmartToyIcon />}
							onClick={() => navigate({ to: "/agent" })}
							sx={{ fontWeight: 600 }}
						>
							Ask Agent
						</MagneticButton>
					}
				/>

				{accountError && (
					<Alert severity="warning" sx={{ mb: 3 }}>
						{summaryData?.account.error ??
							"Unable to load the dashboard summary. Check your exchange and backend configuration."}
					</Alert>
				)}

				{isFirstTimeUser && (
					<Card sx={{ mb: 3, p: 3 }}>
						<Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>
							Welcome to Trading agent
						</Typography>
						<Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
							Get started with automated trading in 3 steps:
						</Typography>
						<Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
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

				<StatsSection
					account={summaryData?.account}
					summary={summaryData?.tradeSummary}
					loading={dashboardQuery.isPending}
					decisionsCount={decisionsCount}
					reducedMotion={reducedMotion}
				/>

				<ScrollReveal direction="up" delay={0.1} heavy>
					<Grid container spacing={3} sx={{ mb: 3 }}>
						<Grid size={{ xs: 12, md: 8 }}>
							<Box ref={chartRef}>
								{showChart ? (
									<Suspense
										fallback={
											<ShimmerSkeleton variant="rectangular" height={280} />
										}
									>
										<LazyEquityChart
											trades={chartTradesQuery.data?.trades ?? []}
											loading={chartTradesQuery.isLoading}
										/>
									</Suspense>
								) : (
									<ShimmerSkeleton variant="rectangular" height={280} />
								)}
							</Box>
						</Grid>
						<Grid size={{ xs: 12, md: 4 }}>
							<Box ref={statusRef}>
								{showStatusCard ? (
									<Suspense
										fallback={
											<ShimmerSkeleton variant="rectangular" height={280} />
										}
									>
										<LazyAgentStatusCard
											activeTaskMode={summaryData?.activeTaskMode ?? null}
										/>
									</Suspense>
								) : (
									<ShimmerSkeleton variant="rectangular" height={280} />
								)}
							</Box>
						</Grid>
					</Grid>
				</ScrollReveal>

				<ScrollReveal direction="up" delay={0.2} heavy>
					<Box ref={bottomSectionsRef}>
						<Grid container spacing={3}>
							<Grid size={{ xs: 12, md: 6 }}>
								{showBottomSections ? (
									<Suspense
										fallback={
											<ShimmerSkeleton variant="rectangular" height={340} />
										}
									>
										<LazyAgentDecisionsSection
											decisions={summaryData?.recentDecisions ?? []}
											loading={dashboardQuery.isPending}
											onOpenAgent={() => navigate({ to: "/agent" })}
										/>
									</Suspense>
								) : (
									<ShimmerSkeleton variant="rectangular" height={340} />
								)}
							</Grid>
							<Grid size={{ xs: 12, md: 6 }}>
								{showBottomSections ? (
									<Suspense
										fallback={
											<ShimmerSkeleton variant="rectangular" height={340} />
										}
									>
										<LazyRecentTradesSection
											trades={summaryData?.recentTrades ?? []}
											loading={dashboardQuery.isPending}
										/>
									</Suspense>
								) : (
									<ShimmerSkeleton variant="rectangular" height={340} />
								)}
							</Grid>
						</Grid>
					</Box>
				</ScrollReveal>
			</Box>
		</PageTransition>
	);
}
