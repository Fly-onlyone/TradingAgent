/**
 * Dashboard Page — Agent Command Center
 */

import { Bot, Sparkles, TrendingUp, Wallet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { tradesApi } from "@/api/endpoints/trades";
import { agentDecisionsQueryOptions } from "@/api/queryOptions/agent";
import { marketAccountQueryOptions } from "@/api/queryOptions/market";
import { EmptyState } from "@/components/common/EmptyState";
import { MetricRow } from "@/components/common/MetricRow";
import { PageTransition } from "@/components/common/PageTransition";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import { StatusDot } from "@/components/common/StatusDot";
import { StatCard } from "@/components/data-display/StatCard";
import { MagneticButton } from "@/components/effects/MagneticButton";
import { ScrollReveal } from "@/components/effects/ScrollReveal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/store/agentStore";
import { useOrderStore } from "@/store/orderStore";
import { staggerCascade } from "@/utils/animations/variants";
import {
	formatPercent,
	formatPrice,
	formatRelativeTime,
	formatSymbol,
	formatUSD,
} from "@/utils/formatters";
import { requireAuth } from "./-guards";

export const Route = createFileRoute("/")({
	beforeLoad: requireAuth,
	component: Dashboard,
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
			<div className="mb-8 grid grid-cols-12 gap-6">
				<div className="col-span-12 sm:col-span-6 md:col-span-3">
					<motion.div variants={staggerCascade.item}>
						<StatCard
							title="Total Equity"
							value={formatUSD(accountQuery.data?.totalEquity ?? 0)}
							icon={<Wallet className="size-5" />}
							loading={accountQuery.isPending}
							useRolling
						/>
					</motion.div>
				</div>
				<div className="col-span-12 sm:col-span-6 md:col-span-3">
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
							icon={<TrendingUp className="size-5" />}
							trend={
								(accountQuery.data?.unrealizedPnl ?? 0) >= 0 ? "up" : "down"
							}
							loading={accountQuery.isPending}
							useRolling
						/>
					</motion.div>
				</div>
				<div className="col-span-12 sm:col-span-6 md:col-span-3">
					<motion.div variants={staggerCascade.item}>
						<StatCard
							title="Agent Win Rate"
							value={formatPercent(summaryQuery.data?.winRate ?? 0, 1)}
							icon={<Sparkles className="size-5" />}
							loading={summaryQuery.isPending}
						/>
					</motion.div>
				</div>
				<div className="col-span-12 sm:col-span-6 md:col-span-3">
					<motion.div variants={staggerCascade.item}>
						<StatCard
							title="Decisions Today"
							value={decisionsCount}
							icon={<Bot className="size-5" />}
							loading={false}
						/>
					</motion.div>
				</div>
			</div>
		</motion.div>
	);
}

function EquityChartPlaceholder() {
	return (
		<Card className="h-[280px]">
			<CardContent>
				<h6 className="mb-4 text-base font-semibold">Portfolio Equity</h6>
				<div className="flex h-[200px] items-center justify-center rounded border border-dashed border-[var(--border-subtle)]">
					<span className="text-sm text-[var(--text-secondary)]">
						Equity chart — coming soon
					</span>
				</div>
			</CardContent>
		</Card>
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
		<Card className="h-[280px]">
			<CardContent>
				<div className="mb-4 flex items-center gap-2">
					<Bot className="size-5 text-[var(--primary)]" />
					<h6 className="text-base font-semibold">Agent Status</h6>
				</div>
				<div className="flex flex-col gap-4">
					<MetricRow
						label="Status"
						value={
							<div className="flex items-center gap-2">
								<StatusDot
									status={agentConnected ? "online" : "offline"}
									size={7}
								/>
								<span className="text-sm">
									{agentConnected ? "Connected" : "Disconnected"}
								</span>
							</div>
						}
					/>
					<MetricRow
						label="Active Task"
						value={isThinking ? "Running" : "None"}
					/>
					<MetricRow label="Mode" value="Automated" />
				</div>
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
		<Card className="h-full">
			<CardContent>
				<div className="mb-4 flex items-center gap-2">
					<Sparkles className="size-5 text-[var(--secondary)]" />
					<h6 className="text-base font-semibold">Agent Decisions</h6>
					<MagneticButton
						size="small"
						onClick={() => navigate({ to: "/agent" })}
						sx={{ ml: "auto", fontSize: "0.75rem" }}
					>
						Open Agent
					</MagneticButton>
				</div>

				{decisionsQuery.isLoading ? (
					<div className="flex flex-col gap-3">
						{[0, 1, 2].map((i) => (
							<ShimmerSkeleton
								key={`d-${String(i)}`}
								variant="text"
								height={64}
							/>
						))}
					</div>
				) : decisionsQuery.data?.decisions.length ? (
					<div className="flex flex-col gap-3">
						{decisionsQuery.data.decisions.map((decision: any) => (
							<div
								key={decision.id}
								className="rounded-lg border border-[var(--border-subtle)] bg-[var(--card-tint)] p-3 transition-colors duration-200 hover:bg-[rgba(var(--primary-rgb),0.06)]"
							>
								<div className="mb-1 flex justify-between">
									<Badge
										variant={
											decision.action === "buy"
												? "default"
												: decision.action === "sell"
													? "destructive"
													: "secondary"
										}
										className={cn(
											"text-[0.65rem] font-bold uppercase",
											decision.action === "buy" &&
												"bg-green-500/10 text-green-500",
										)}
									>
										{decision.action}
									</Badge>
									<span className="text-xs text-[var(--text-secondary)]">
										{decision.symbol} ·{" "}
										{formatRelativeTime(decision.createdAt)}
									</span>
								</div>
								{decision.summary && (
									<span className="mt-1 block text-xs leading-snug text-[var(--text-secondary)]">
										{decision.summary.length > 120
											? `${decision.summary.slice(0, 120)}…`
											: decision.summary}
									</span>
								)}
							</div>
						))}
						<Button variant="link" className="mt-1 self-start" asChild>
							<Link to="/agent">View all →</Link>
						</Button>
					</div>
				) : (
					<EmptyState
						icon={<Bot className="size-16" />}
						title="No recent decisions"
						description="The agent hasn't made any decisions yet."
						sx={{ py: 4 }}
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
		<Card className="h-full">
			<CardContent>
				<h6 className="mb-4 text-base font-semibold">Recent Agent Trades</h6>

				{recentTradesQuery.isLoading ? (
					<div>
						{Array.from({ length: 3 }).map((_, i) => (
							<ShimmerSkeleton
								key={`skel-${String(i)}`}
								shimmerVariant="table-row"
							/>
						))}
					</div>
				) : recentTradesQuery.data?.trades.length ? (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Side</TableHead>
								<TableHead>Symbol</TableHead>
								<TableHead className="text-right">Price</TableHead>
								<TableHead className="text-right">Quantity</TableHead>
								<TableHead className="text-right">P&L</TableHead>
								<TableHead className="text-right">Time</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{recentTradesQuery.data.trades.map((trade: any) => (
								<TableRow key={trade.id}>
									<TableCell>
										<Badge
											variant={
												trade.side === "buy" ? "default" : "destructive"
											}
											className={cn(
												"min-w-12 font-semibold",
												trade.side === "buy" &&
													"bg-green-500/10 text-green-500",
											)}
										>
											{trade.side.toUpperCase()}
										</Badge>
									</TableCell>
									<TableCell>{formatSymbol(trade.symbol)}</TableCell>
									<TableCell className="text-right">
										${formatPrice(trade.entryPrice)}
									</TableCell>
									<TableCell className="text-right">
										{trade.quantity}
									</TableCell>
									<TableCell
										className={cn(
											"text-right font-medium",
											(trade.netPnl ?? 0) >= 0
												? "text-green-500"
												: "text-red-500",
										)}
									>
										{trade.netPnl !== undefined
											? formatUSD(trade.netPnl)
											: "-"}
									</TableCell>
									<TableCell className="text-right">
										<span className="text-sm text-[var(--text-secondary)]">
											{formatRelativeTime(trade.entryTime)}
										</span>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				) : (
					<EmptyState
						icon={<TrendingUp className="size-16" />}
						title="No agent trades yet"
						description="The agent will log trades here as it executes."
						sx={{ py: 4 }}
					/>
				)}
			</CardContent>
		</Card>
	);
}

function Dashboard() {
	const navigate = useNavigate();
	const positions = useOrderStore((state) => state.positions);

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
		queryFn: () => tradesApi.getTrades({ pageSize: 5 }),
		staleTime: 30_000,
	});

	const decisionsQuery = useQuery({
		...agentDecisionsQueryOptions({}, 1, 5),
		refetchInterval: 60_000,
	});

	const accountError = accountQuery.isError || accountQuery.data?.error;

	const decisionsCount = decisionsQuery.data?.decisions?.length ?? 0;
	const tradesCount = recentTradesQuery.data?.trades?.length ?? 0;
	const isFirstTimeUser =
		!accountQuery.isPending &&
		!recentTradesQuery.isPending &&
		!decisionsQuery.isPending &&
		tradesCount === 0 &&
		decisionsCount === 0 &&
		positions.length === 0;

	return (
		<PageTransition pageKey="dashboard">
			<div>
				<SectionHeader
					title="Dashboard"
					subtitle="Agent command center — overview of automated trading activity"
					action={
						<MagneticButton
							variant="contained"
							startIcon={<Bot className="size-5" />}
							onClick={() => navigate({ to: "/agent" })}
							sx={{ fontWeight: 600 }}
						>
							Ask Agent
						</MagneticButton>
					}
				/>

				{accountError && (
					<Alert variant="destructive" className="mb-6">
						<AlertDescription>
							{accountQuery.data?.error ??
								"Unable to fetch account balance from OKX. Check your API key configuration."}
						</AlertDescription>
					</Alert>
				)}

				{/* Get Started hero for first-time users */}
				{isFirstTimeUser && (
					<Card className="mb-6 p-6">
						<h5 className="mb-2 text-xl font-bold">
							Welcome to Trading Agent
						</h5>
						<p className="mb-6 text-sm text-[var(--text-secondary)]">
							Get started with automated trading in 3 steps:
						</p>
						<div className="flex flex-wrap gap-4">
							<Link to="/settings">
								<Badge variant="outline" className="cursor-pointer">
									1. Configure Exchange
								</Badge>
							</Link>
							<Link to="/strategies/create">
								<Badge variant="outline" className="cursor-pointer">
									2. Import Strategy
								</Badge>
							</Link>
							<Link to="/tasks">
								<Badge variant="outline" className="cursor-pointer">
									3. Create Task
								</Badge>
							</Link>
						</div>
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
					<div className="mb-6 grid grid-cols-12 gap-6">
						<div className="col-span-12 md:col-span-8">
							<EquityChartPlaceholder />
						</div>
						<div className="col-span-12 md:col-span-4">
							<AgentStatusCard />
						</div>
					</div>
				</ScrollReveal>

				{/* Bottom Row: Decisions + Recent Trades */}
				<ScrollReveal direction="up" delay={0.2}>
					<div className="grid grid-cols-12 gap-6">
						<div className="col-span-12 md:col-span-6">
							<AgentDecisionsSection
								decisionsQuery={decisionsQuery}
								navigate={navigate}
							/>
						</div>
						<div className="col-span-12 md:col-span-6">
							<RecentTradesSection
								recentTradesQuery={recentTradesQuery}
							/>
						</div>
					</div>
				</ScrollReveal>
			</div>
		</PageTransition>
	);
}
