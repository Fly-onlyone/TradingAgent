/**
 * Trading Page
 */

import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import InsightsIcon from "@mui/icons-material/Insights";
import MonetizationOnIcon from "@mui/icons-material/MonetizationOn";
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
	marketAccountQueryOptions,
	marketOverviewQueryOptions,
	marketTickerQueryOptions,
} from "@/api/queryOptions/market";
import { PageTransition } from "@/components/common/PageTransition";
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
	formatUSD,
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

	const accountQuery = useQuery({
		...marketAccountQueryOptions(),
		refetchInterval: 60_000,
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

	const accountError =
		accountQuery.data?.error ||
		(accountQuery.isError ? getErrorMessage(accountQuery.error) : null);
	const overviewError =
		overviewQuery.data?.error ||
		(overviewQuery.isError ? getErrorMessage(overviewQuery.error) : null);
	const pageError = accountError || overviewError || null;

	const orderHistoryError =
		orderHistoryQuery.data?.error ||
		(orderHistoryQuery.isError
			? getErrorMessage(orderHistoryQuery.error)
			: null);

	return (
		<PageTransition pageKey="trading">
			<Box>
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
						>
							{TIMEFRAMES.slice(0, 6).map((timeframe) => (
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
							<Grid size={{ xs: 12, sm: 6, md: 4 }}>
								<StatCard
									title="Account Equity"
									value={formatUSD(accountQuery.data?.totalEquity ?? 0)}
									icon={<AccountBalanceWalletIcon />}
									loading={accountQuery.isLoading}
								/>
							</Grid>
							<Grid size={{ xs: 12, sm: 6, md: 4 }}>
								<StatCard
									title="Available Balance"
									value={formatUSD(accountQuery.data?.availableBalance ?? 0)}
									icon={<MonetizationOnIcon />}
									loading={accountQuery.isLoading}
								/>
							</Grid>
							<Grid size={{ xs: 12, sm: 6, md: 4 }}>
								<StatCard
									title="Margin / UPL"
									value={formatUSD(accountQuery.data?.unrealizedPnl ?? 0)}
									changeLabel={
										accountQuery.data?.marginRatio !== null &&
										accountQuery.data?.marginRatio !== undefined
											? `Margin Ratio: ${accountQuery.data.marginRatio.toFixed(2)}`
											: "Margin Ratio: -"
									}
									icon={<InsightsIcon />}
									trend={
										(accountQuery.data?.unrealizedPnl ?? 0) >= 0 ? "up" : "down"
									}
									loading={accountQuery.isLoading}
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
										Watchlist
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
