/**
 * Market Monitor Page
 *
 * Read-only view of live market data used by the trading agent for automated decisions.
 */

import ShowChartIcon from "@mui/icons-material/ShowChart";
import TimelineIcon from "@mui/icons-material/Timeline";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import {
	Alert,
	Box,
	Card,
	CardContent,
	Grid2 as Grid,
	ToggleButton,
	ToggleButtonGroup,
	Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ordersApi } from "@/api/endpoints/orders";
import {
	marketOverviewQueryOptions,
	marketTickerQueryOptions,
} from "@/api/queryOptions/market";
import { PageTransition } from "@/components/common/PageTransition";
import { SectionHeader } from "@/components/common/SectionHeader";
import { StatCard } from "@/components/data-display/StatCard";
import {
	MarketOverviewPanel,
	PositionCard,
	RecentOrderActivity,
	TickerCard,
} from "@/components/trading";
import { useMarketStore } from "@/store/marketStore";
import { useOrderStore } from "@/store/orderStore";

import { spring } from "@/utils/animations/variants";
import { TIMEFRAMES } from "@/utils/constants";
import { getErrorMessage } from "@/utils/errors";
import {
	formatPercent,
	formatPrice,
	formatVolume,
} from "@/utils/formatters";
import { requireAuth } from "./-guards";

export const Route = createFileRoute("/trading")({
	beforeLoad: requireAuth,
	component: TradingPage,
});

function TradingPage() {
	const selectedSymbol = useMarketStore((state) => state.selectedSymbol);
	const selectedTimeframe = useMarketStore((state) => state.selectedTimeframe);
	const setSelectedTimeframe = useMarketStore(
		(state) => state.setSelectedTimeframe,
	);
	const setSelectedSymbol = useMarketStore((state) => state.setSelectedSymbol);
	const watchlist = useMarketStore((state) => state.watchlist);
	const liveTicker = useMarketStore(
		(state) => state.tickers[state.selectedSymbol],
	);

	const currentPosition = useOrderStore((state) =>
		state.positions.find((position) => position.symbol === selectedSymbol),
	);

	const tickerQuery = useQuery({
		...marketTickerQueryOptions(selectedSymbol),
		refetchInterval: 15_000,
		retry: 1,
	});

	const overviewQuery = useQuery({
		...marketOverviewQueryOptions(),
		refetchInterval: 120_000,
		retry: 1,
	});

	const orderHistoryQuery = useQuery({
		queryKey: ["orders", "okx", "history", selectedSymbol, 20],
		queryFn: () =>
			ordersApi.getOkxOrderHistory({ symbol: selectedSymbol, limit: 20 }),
		staleTime: 15_000,
		refetchInterval: 20_000,
		retry: 1,
	});

	const resolvedTicker = liveTicker ?? tickerQuery.data;
	const currentPrice =
		typeof resolvedTicker?.lastPrice === "number" &&
		Number.isFinite(resolvedTicker.lastPrice)
			? resolvedTicker.lastPrice
			: 0;

	const overviewError =
		overviewQuery.data?.error ||
		(overviewQuery.isError ? getErrorMessage(overviewQuery.error) : null);
	const pageError = overviewError || null;

	const orderHistoryError =
		orderHistoryQuery.data?.error ||
		(orderHistoryQuery.isError
			? getErrorMessage(orderHistoryQuery.error)
			: null);

	return (
		<PageTransition pageKey="trading">
			<Box>
				<SectionHeader
					title="Market Monitor"
					subtitle="Live market data — the agent uses this data for automated decisions"
				/>

				<Alert severity="info" sx={{ mb: 2 }} icon={false}>
					<Typography variant="body2">
						This is a read-only view of market data. All trading is handled
						automatically by the agent.
					</Typography>
				</Alert>

				<motion.div
					initial={{ opacity: 0, x: -40 }}
					animate={{ opacity: 1, x: 0 }}
					transition={{ ...spring.snappy, delay: 0.1 }}
				>
					<Box
						sx={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							mb: 2,
						}}
					>
						<Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
							<Typography variant="h5" fontWeight={700}>
								{selectedSymbol.replace("-", "/")}
							</Typography>
							{resolvedTicker ? (
								<Typography
									variant="h5"
									sx={{
										color:
											resolvedTicker.priceChangePercent >= 0
												? "success.main"
												: "error.main",
										fontFamily: (theme) => theme.trading.mono,
									}}
								>
									${formatPrice(currentPrice)}
								</Typography>
							) : null}
						</Box>

						<ToggleButtonGroup
							value={selectedTimeframe}
							exclusive
							onChange={(_, value) => value && setSelectedTimeframe(value)}
							size="small"
							sx={{ flexWrap: "wrap" }}
						>
							{TIMEFRAMES.map((timeframe) => (
								<ToggleButton key={timeframe.value} value={timeframe.value}>
									{timeframe.label}
								</ToggleButton>
							))}
						</ToggleButtonGroup>
					</Box>
				</motion.div>

				{pageError ? (
					<Alert severity="warning" sx={{ mb: 2 }}>
						{pageError}
					</Alert>
				) : null}

				<Grid container spacing={2}>
					<Grid size={{ xs: 12 }}>
						<Grid container spacing={2}>
							<Grid size={{ xs: 12, sm: 6, md: 4 }}>
								<StatCard
									title="Last Price"
									value={resolvedTicker ? `$${formatPrice(currentPrice)}` : "-"}
									icon={<ShowChartIcon />}
									loading={tickerQuery.isLoading && !resolvedTicker}
								/>
							</Grid>
							<Grid size={{ xs: 12, sm: 6, md: 4 }}>
								<StatCard
									title="24h Change"
									value={
										resolvedTicker
											? formatPercent(resolvedTicker.priceChangePercent)
											: "-"
									}
									icon={<TrendingUpIcon />}
									trend={
										(resolvedTicker?.priceChangePercent ?? 0) >= 0
											? "up"
											: "down"
									}
									loading={tickerQuery.isLoading && !resolvedTicker}
								/>
							</Grid>
							<Grid size={{ xs: 12, sm: 6, md: 4 }}>
								<StatCard
									title="24h Volume"
									value={
										resolvedTicker
											? `$${formatVolume(resolvedTicker.volume24h)}`
											: "-"
									}
									icon={<TimelineIcon />}
									loading={tickerQuery.isLoading && !resolvedTicker}
								/>
							</Grid>
						</Grid>
					</Grid>

					<Grid size={{ xs: 12, lg: 8 }}>
						<MarketOverviewPanel
							overview={overviewQuery.data ?? null}
							isLoading={overviewQuery.isLoading}
						/>
					</Grid>

					<Grid size={{ xs: 12, lg: 4 }}>
						<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
							<Card>
								<CardContent>
									<Typography variant="h6" gutterBottom>
										Agent Watchlist
									</Typography>
									<Box
										sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}
									>
										{watchlist.length > 0 ? (
											watchlist.map((symbol) => (
												<TickerCard
													key={symbol}
													symbol={symbol}
													compact
													onClick={() => setSelectedSymbol(symbol)}
												/>
											))
										) : (
											<Typography variant="body2" color="text.secondary">
												No symbols in watchlist.
											</Typography>
										)}
									</Box>
								</CardContent>
							</Card>

							{currentPosition ? (
								<PositionCard position={currentPosition} />
							) : (
								<Card>
									<CardContent>
										<Typography variant="h6" gutterBottom>
											Current Position
										</Typography>
										<Typography variant="body2" color="text.secondary">
											No open position for {selectedSymbol.replace("-", "/")}.
										</Typography>
									</CardContent>
								</Card>
							)}
						</Box>
					</Grid>

					<Grid size={{ xs: 12 }}>
						<RecentOrderActivity
							orders={orderHistoryQuery.data?.orders ?? []}
							isLoading={orderHistoryQuery.isLoading}
							error={orderHistoryError}
						/>
					</Grid>
				</Grid>
			</Box>
		</PageTransition>
	);
}
