/**
 * Dashboard Page — Agent Command Center
 */

import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
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
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useRef } from "react";
import { tradesApi } from "@/api/endpoints/trades";
import { agentDecisionsQueryOptions } from "@/api/queryOptions/agent";
import { marketAccountQueryOptions } from "@/api/queryOptions/market";
import { PageTransition } from "@/components/common/PageTransition";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import { StatCard } from "@/components/data-display/StatCard";
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

function Dashboard() {
	const navigate = useNavigate();
	const positionsRef = useRef<HTMLDivElement>(null);
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
		...agentDecisionsQueryOptions({}, 1, 3),
		refetchInterval: 60_000,
	});

	const accountError = accountQuery.isError || accountQuery.data?.error;

	return (
		<PageTransition pageKey="dashboard">
			<Box>
				{/* Page Header + Quick Actions */}
				<motion.div
					initial={{ opacity: 0, x: -60 }}
					animate={{ opacity: 1, x: 0 }}
					transition={{ type: "spring", stiffness: 400, damping: 30 }}
				>
					<Box
						sx={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "flex-start",
							mb: 3,
						}}
					>
						<Box>
							<Typography variant="h4" fontWeight={700} gutterBottom>
								Dashboard
							</Typography>
							<Typography variant="body2" color="text.secondary">
								AI agent command center — monitoring positions and decisions.
							</Typography>
						</Box>
						<Box sx={{ display: "flex", gap: 1.5, mt: 0.5 }}>
							<Button
								variant="contained"
								startIcon={<SmartToyIcon />}
								onClick={() => navigate({ to: "/agent" })}
								sx={{ fontWeight: 600 }}
							>
								Ask Agent
							</Button>
							<Button
								variant="outlined"
								startIcon={<ShowChartIcon />}
								onClick={() =>
									positionsRef.current?.scrollIntoView({ behavior: "smooth" })
								}
								sx={{ fontWeight: 600 }}
							>
								View Positions
							</Button>
						</Box>
					</Box>
				</motion.div>

				{accountError && (
					<Alert severity="warning" sx={{ mb: 3 }}>
						{accountQuery.data?.error ??
							"Unable to fetch account balance from OKX. Check your API key configuration."}
					</Alert>
				)}

				{/* Stats Grid */}
				<motion.div
					variants={staggerCascade.container}
					initial="hidden"
					animate="visible"
				>
					<Grid container spacing={3} sx={{ mb: 4 }}>
						<Grid size={{ xs: 12, sm: 6, md: 3 }}>
							<StatCard
								title="Total Equity"
								value={formatUSD(accountQuery.data?.totalEquity ?? 0)}
								icon={<AccountBalanceWalletIcon />}
								loading={accountQuery.isLoading}
							/>
						</Grid>
						<Grid size={{ xs: 12, sm: 6, md: 3 }}>
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
								icon={<TrendingUpIcon />}
								trend={
									(accountQuery.data?.unrealizedPnl ?? 0) >= 0 ? "up" : "down"
								}
								loading={accountQuery.isLoading}
							/>
						</Grid>
						<Grid size={{ xs: 12, sm: 6, md: 3 }}>
							<StatCard
								title="Realized P&L"
								value={formatUSD(summaryQuery.data?.netPnl ?? 0)}
								change={summaryQuery.data?.totalPnlPercent}
								icon={<ShowChartIcon />}
								trend={(summaryQuery.data?.netPnl ?? 0) >= 0 ? "up" : "down"}
								loading={summaryQuery.isLoading}
							/>
						</Grid>
						<Grid size={{ xs: 12, sm: 6, md: 3 }}>
							<StatCard
								title="Total Trades"
								value={summaryQuery.data?.totalTrades ?? 0}
								changeLabel={
									summaryQuery.data
										? `${formatPercent(summaryQuery.data.winRate, 0)} win rate`
										: undefined
								}
								icon={<SwapHorizIcon />}
								loading={summaryQuery.isLoading}
							/>
						</Grid>
					</Grid>
				</motion.div>

				{/* Two-column layout 60/40 */}
				<Grid container spacing={3}>
					{/* Left 60%: Active Positions */}
					<Grid size={{ xs: 12, md: 7 }} ref={positionsRef}>
						<Card
							component={motion.div}
							initial={{ opacity: 0, y: 40 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{
								type: "spring",
								stiffness: 400,
								damping: 30,
								delay: 0.2,
							}}
							sx={{
								height: "100%",
								borderTop: "2px solid",
								borderTopColor: "primary.main",
							}}
						>
							<CardContent>
								<Box
									sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}
								>
									<Box
										component={motion.div}
										animate={{ scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] }}
										transition={{ duration: 2, repeat: Infinity }}
										sx={{
											width: 8,
											height: 8,
											borderRadius: "50%",
											bgcolor: "primary.main",
										}}
									/>
									<Typography variant="h6">Active Positions</Typography>
									<Chip
										label={positions.length}
										size="small"
										sx={{ ml: "auto" }}
									/>
								</Box>

								{positions.length === 0 ? (
									<Typography variant="body2" color="text.secondary">
										No open positions. The agent will open positions based on
										market analysis.
									</Typography>
								) : (
									<TableContainer>
										<Table size="small">
											<TableHead>
												<TableRow>
													<TableCell>Symbol</TableCell>
													<TableCell>Side</TableCell>
													<TableCell align="right">Entry</TableCell>
													<TableCell align="right">Qty</TableCell>
													<TableCell align="right">Unrealized P&L</TableCell>
												</TableRow>
											</TableHead>
											<TableBody>
												{positions.map((pos) => (
													<TableRow key={pos.id}>
														<TableCell>
															<Typography variant="body2" fontWeight={600}>
																{formatSymbol(pos.symbol)}
															</Typography>
														</TableCell>
														<TableCell>
															<Chip
																label={pos.side.toUpperCase()}
																size="small"
																color={
																	pos.side === "long" ? "success" : "error"
																}
																sx={{ fontWeight: 600 }}
															/>
														</TableCell>
														<TableCell align="right">
															${formatPrice(pos.entryPrice)}
														</TableCell>
														<TableCell align="right">{pos.quantity}</TableCell>
														<TableCell
															align="right"
															sx={{
																color:
																	pos.unrealizedPnl >= 0
																		? "success.main"
																		: "error.main",
																fontWeight: 600,
															}}
														>
															<Box
																sx={{
																	display: "flex",
																	alignItems: "center",
																	justifyContent: "flex-end",
																	gap: 0.5,
																}}
															>
																{pos.unrealizedPnl >= 0 ? (
																	<TrendingUpIcon sx={{ fontSize: 14 }} />
																) : (
																	<TrendingDownIcon sx={{ fontSize: 14 }} />
																)}
																{formatUSD(pos.unrealizedPnl)}
															</Box>
														</TableCell>
													</TableRow>
												))}
											</TableBody>
										</Table>
									</TableContainer>
								)}
							</CardContent>
						</Card>
					</Grid>

					{/* Right 40%: Agent Summary */}
					<Grid size={{ xs: 12, md: 5 }}>
						<Card
							component={motion.div}
							initial={{ opacity: 0, x: 40 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{
								type: "spring",
								stiffness: 400,
								damping: 30,
								delay: 0.25,
							}}
							sx={{
								height: "100%",
								borderTop: "2px solid",
								borderTopColor: "secondary.main",
							}}
						>
							<CardContent>
								<Box
									sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}
								>
									<AutoAwesomeIcon
										sx={{ color: "secondary.main", fontSize: 20 }}
									/>
									<Typography variant="h6">Agent Decisions</Typography>
									<Button
										size="small"
										onClick={() => navigate({ to: "/agent" })}
										sx={{ ml: "auto", fontSize: "0.75rem" }}
									>
										Open Agent
									</Button>
								</Box>

								{decisionsQuery.isLoading ? (
									<Box
										sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}
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
										sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}
									>
										{decisionsQuery.data.decisions.map((decision) => (
											<Box
												key={decision.id}
												sx={{
													p: 1.5,
													borderRadius: 2,
													border: "1px solid rgba(255,255,255,0.06)",
													background: "rgba(255,255,255,0.02)",
													"&:hover": { background: "rgba(139,92,246,0.06)" },
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
														{decision.symbol} ·{" "}
														{formatRelativeTime(decision.createdAt)}
													</Typography>
												</Box>
												{decision.summary && (
													<Typography
														variant="caption"
														color="text.secondary"
														sx={{ display: "block", lineHeight: 1.4, mt: 0.5 }}
													>
														{decision.summary.length > 120
															? `${decision.summary.slice(0, 120)}…`
															: decision.summary}
													</Typography>
												)}
											</Box>
										))}
									</Box>
								) : (
									<Typography variant="body2" color="text.secondary">
										No recent decisions. Ask the agent to analyze the market.
									</Typography>
								)}
							</CardContent>
						</Card>
					</Grid>

					{/* Recent Activity */}
					<Grid size={{ xs: 12 }}>
						<Card
							component={motion.div}
							initial={{ opacity: 0, y: 40 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{
								type: "spring",
								stiffness: 400,
								damping: 30,
								delay: 0.35,
							}}
							sx={{ borderTop: "2px solid", borderTopColor: "info.main" }}
						>
							<CardContent>
								<Typography variant="h6" gutterBottom>
									Recent Activity
								</Typography>

								{recentTradesQuery.isLoading ? (
									<Box>
										{Array.from({ length: 3 }).map((_, i) => (
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
												{recentTradesQuery.data.trades.map((trade) => (
													<TableRow key={trade.id}>
														<TableCell>
															<Chip
																label={trade.side.toUpperCase()}
																size="small"
																color={
																	trade.side === "buy" ? "success" : "error"
																}
																sx={{ fontWeight: 600, minWidth: 48 }}
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
										No agent trades yet. The agent will log trades here as it
										executes.
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
