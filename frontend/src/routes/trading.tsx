/**
 * Market Monitor Page
 *
 * Read-only view of live market data used by the trading agent for automated decisions.
 */

import SaveIcon from "@mui/icons-material/Save";
import {
	Alert,
	Box,
	Button,
	Card,
	CardContent,
	CircularProgress,
	Grid2 as Grid,
	TextField,
	ToggleButton,
	ToggleButtonGroup,
	Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import type { SymbolOption } from "@/api/endpoints/market";
import { marketApi } from "@/api/endpoints/market";
import { ordersApi } from "@/api/endpoints/orders";
import {
	marketAccountQueryOptions,
	marketOverviewQueryOptions,
	marketTickerQueryOptions,
	userPreferencesQueryOptions,
} from "@/api/queryOptions/market";
import { CoinIcon } from "@/components/common/CoinIcon";
import { PageTransition } from "@/components/common/PageTransition";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ZoomAwareAutocomplete } from "@/components/common/ZoomAwareAutocomplete";
import { StatCard } from "@/components/data-display/StatCard";
import {
	HoldingsCard,
	MarketOverviewPanel,
	PositionCard,
	RecentOrderActivity,
	TickerCard,
} from "@/components/trading";
import { useSymbolOptions } from "@/hooks/useSymbolOptions";
import { useMarketStore } from "@/store/marketStore";
import { useOrderStore } from "@/store/orderStore";
import { notify } from "@/store/uiStore";
import { spring } from "@/utils/animations/variants";
import { TIMEFRAMES } from "@/utils/constants";
import { getErrorMessage } from "@/utils/errors";
import { formatPercent, formatPrice, formatVolume } from "@/utils/formatters";
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
	const loadPreferences = useMarketStore((state) => state.loadPreferences);
	const watchlist = useMarketStore((state) => state.watchlist);
	const liveTicker = useMarketStore(
		(state) => state.tickers[state.selectedSymbol],
	);

	const currentPosition = useOrderStore((state) =>
		state.positions.find((position) => position.symbol === selectedSymbol),
	);

	const queryClient = useQueryClient();

	// Local state for the preferences form
	const [prefSymbol, setPrefSymbol] = useState(selectedSymbol);
	const [prefTimeframe, setPrefTimeframe] = useState(selectedTimeframe);

	// Load user preferences from backend on mount
	const prefsQuery = useQuery({
		...userPreferencesQueryOptions(),
		refetchOnMount: "always",
	});

	useEffect(() => {
		if (prefsQuery.data) {
			loadPreferences(
				prefsQuery.data.defaultSymbol,
				prefsQuery.data.defaultTimeframe,
			);
			setPrefSymbol(prefsQuery.data.defaultSymbol);
			setPrefTimeframe(prefsQuery.data.defaultTimeframe);
		}
	}, [prefsQuery.data, loadPreferences]);

	const { symbolOptions, isLoading: symbolsLoading } = useSymbolOptions();

	// Find the currently selected option for Autocomplete
	const selectedOption = useMemo<SymbolOption | null>(() => {
		// Prefer the Popular group entry
		return (
			symbolOptions.find(
				(o) => o.symbol === prefSymbol && o.group === "Popular",
			) ??
			symbolOptions.find((o) => o.symbol === prefSymbol) ?? {
				symbol: prefSymbol,
				base: prefSymbol.split("-")[0] ?? prefSymbol,
				quote: prefSymbol.split("-")[1] ?? "USDT",
				group: "Popular",
			}
		);
	}, [symbolOptions, prefSymbol]);

	// Save preferences mutation
	const savePrefsMutation = useMutation({
		mutationFn: () =>
			marketApi.updateUserPreferences({
				defaultSymbol: prefSymbol,
				defaultTimeframe: prefTimeframe,
			}),
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ["user", "preferences"] });
			loadPreferences(data.defaultSymbol, data.defaultTimeframe);
			notify.success("Trading preferences saved");
		},
		onError: (error) => {
			notify.error("Failed to save preferences", getErrorMessage(error));
		},
	});

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

	const accountQuery = useQuery({
		...marketAccountQueryOptions(),
		refetchInterval: 60_000,
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

				{/* Trading Preferences */}
				<motion.div
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ ...spring.snappy, delay: 0.15 }}
				>
					<Card sx={{ mb: 2 }}>
						<CardContent>
							<Typography variant="h6" gutterBottom>
								Trading Preferences
							</Typography>
							<Grid container spacing={2} alignItems="center">
								<Grid size={{ xs: 12, sm: 5 }}>
									<ZoomAwareAutocomplete<SymbolOption, false, false, false>
										value={selectedOption}
										onChange={(_, newValue) => {
											if (newValue) {
												setPrefSymbol(newValue.symbol);
											}
										}}
										options={symbolOptions}
										groupBy={(option) => option.group}
										getOptionLabel={(option) => option.symbol}
										renderOption={(props, option) => (
											<li {...props} key={`${option.group}-${option.symbol}`}>
												<Box
													sx={{
														display: "flex",
														alignItems: "center",
														gap: 1.5,
													}}
												>
													<CoinIcon symbol={option.base} size={28} />
													<Box>
														<Typography variant="body2" fontWeight={600}>
															{option.symbol}
														</Typography>
														<Typography
															variant="caption"
															color="text.secondary"
														>
															{option.base} / {option.quote}
														</Typography>
													</Box>
												</Box>
											</li>
										)}
										isOptionEqualToValue={(option, value) =>
											option.symbol === value.symbol &&
											option.group === value.group
										}
										loading={symbolsLoading}
										renderInput={(params) => (
											<TextField
												{...params}
												label="Default Symbol"
												size="small"
												helperText="Search OKX instruments"
												slotProps={{
													input: {
														...params.InputProps,
														endAdornment: (
															<>
																{symbolsLoading ? (
																	<CircularProgress size={18} />
																) : null}
																{params.InputProps.endAdornment}
															</>
														),
													},
												}}
											/>
										)}
									/>
								</Grid>
								<Grid size={{ xs: 12, sm: 5 }}>
									<ToggleButtonGroup
										value={prefTimeframe}
										exclusive
										onChange={(_, value) => {
											if (value) setPrefTimeframe(value);
										}}
										size="small"
										sx={{ flexWrap: "wrap" }}
									>
										{TIMEFRAMES.map((tf) => (
											<ToggleButton key={tf.value} value={tf.value}>
												{tf.label}
											</ToggleButton>
										))}
									</ToggleButtonGroup>
								</Grid>
								<Grid size={{ xs: 12, sm: 2 }}>
									<Button
										variant="contained"
										startIcon={
											savePrefsMutation.isPending ? (
												<CircularProgress size={18} />
											) : (
												<SaveIcon />
											)
										}
										onClick={() => savePrefsMutation.mutate()}
										disabled={savePrefsMutation.isPending}
										fullWidth
									>
										Save
									</Button>
								</Grid>
							</Grid>
						</CardContent>
					</Card>
				</motion.div>

				<Grid container spacing={2}>
					<Grid size={{ xs: 12 }}>
						<Grid container spacing={2}>
							<Grid size={{ xs: 12, sm: 6, md: 4 }}>
								<StatCard
									title="Last Price"
									value={resolvedTicker ? `$${formatPrice(currentPrice)}` : "-"}
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

							<HoldingsCard
								currencies={accountQuery.data?.currencies ?? []}
								isLoading={accountQuery.isPending}
								error={accountQuery.data?.error ?? null}
								onSelectSymbol={setSelectedSymbol}
							/>
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
