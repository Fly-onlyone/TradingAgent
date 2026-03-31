/**
 * Market Monitor Page
 *
 * Sidebar + main content layout for live market data used by the trading agent.
 */

import StarBorderIcon from "@mui/icons-material/StarBorder";
import {
	Box,
	Card,
	CardContent,
	CircularProgress,
	Divider,
	Grid2 as Grid,
	Tab,
	Tabs,
	TextField,
	ToggleButton,
	ToggleButtonGroup,
	Typography,
} from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { SaveIndicator } from "@/components/common/SaveIndicator";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ZoomAwareAutocomplete } from "@/components/common/ZoomAwareAutocomplete";
import { StatCard } from "@/components/data-display/StatCard";
import {
	HoldingsTab,
	MarketOverviewPanel,
	PositionsTab,
	RecentOrderActivity,
} from "@/components/trading";
import { useDebouncedSave } from "@/hooks/useDebouncedSave";
import { useSymbolOptions } from "@/hooks/useSymbolOptions";
import { useMarketStore } from "@/store/marketStore";
import { spring, tabSwitch } from "@/utils/animations/variants";
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
	const loadPreferences = useMarketStore((state) => state.loadPreferences);
	const liveTicker = useMarketStore(
		(state) => state.tickers[state.selectedSymbol],
	);
	const watchlist = useMarketStore((state) => state.watchlist);
	const tickers = useMarketStore((state) => state.tickers);
	const addToWatchlist = useMarketStore((state) => state.addToWatchlist);

	const queryClient = useQueryClient();

	const [bottomTab, setBottomTab] = useState(0);
	const [showAddSymbol, setShowAddSymbol] = useState(false);

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
			// Mark init complete after a tick so auto-save doesn't fire on load
			requestAnimationFrame(() => {
				prefsInitRef.current = true;
			});
		}
	}, [prefsQuery.data, loadPreferences]);

	const { symbolOptions, isLoading: symbolsLoading } = useSymbolOptions();

	// Find the currently selected option for Autocomplete
	const selectedOption = useMemo<SymbolOption | null>(() => {
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

	// Filter out symbols already in watchlist for add autocomplete
	const availableOptions = useMemo(
		() => symbolOptions.filter((o) => !watchlist.includes(o.symbol)),
		[symbolOptions, watchlist],
	);

	const prefsInitRef = useRef(false);

	// Auto-save preferences via debounce
	const { triggerSave: triggerPrefsSave, saveStatus: prefsStatus } =
		useDebouncedSave<{ defaultSymbol: string; defaultTimeframe: string }>({
			mutationFn: async (prefs) => {
				const data = await marketApi.updateUserPreferences(prefs);
				queryClient.invalidateQueries({ queryKey: ["user", "preferences"] });
				loadPreferences(data.defaultSymbol, data.defaultTimeframe);
				return data;
			},
		});

	// Auto-save when prefSymbol or prefTimeframe changes (after initial load)
	useEffect(() => {
		if (!prefsInitRef.current) return;
		triggerPrefsSave({
			defaultSymbol: prefSymbol,
			defaultTimeframe: prefTimeframe,
		});
	}, [prefSymbol, prefTimeframe, triggerPrefsSave]);

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

	const orderHistoryError =
		orderHistoryQuery.data?.error ||
		(orderHistoryQuery.isError
			? getErrorMessage(orderHistoryQuery.error)
			: null);

	const account = accountQuery.data;
	const isPositive = (resolvedTicker?.priceChangePercent ?? 0) >= 0;

	return (
		<PageTransition pageKey="trading">
			<Box>
				<SectionHeader
					title="Market Monitor"
					subtitle="Live market data — the agent uses this data for automated decisions"
				/>

				<Box
					sx={{
						display: "flex",
						gap: 3,
						flexDirection: { xs: "column", md: "row" },
					}}
				>
					{/* ====== LEFT SIDEBAR ====== */}
					<Box sx={{ width: { xs: "100%", md: 300 }, flexShrink: 0 }}>
						<Card
							component={motion.div}
							initial={{ opacity: 0, x: -30 }}
							animate={{ opacity: 1, x: 0 }}
							transition={spring.snappy}
						>
							<CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
								{/* Symbol selector */}
								<Typography
									variant="caption"
									color="text.secondary"
									fontWeight={700}
									sx={{ letterSpacing: "0.08em", mb: 0.5, display: "block" }}
								>
									SYMBOL
								</Typography>
								<ZoomAwareAutocomplete<SymbolOption, false, false, false>
									value={selectedOption}
									onChange={(_, newValue) => {
										if (newValue) {
											setPrefSymbol(newValue.symbol);
											setSelectedSymbol(newValue.symbol);
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
												<CoinIcon symbol={option.base} size={24} />
												<Box>
													<Typography variant="body2" fontWeight={600}>
														{option.symbol}
													</Typography>
													<Typography variant="caption" color="text.secondary">
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
									size="small"
									renderInput={(params) => (
										<TextField
											{...params}
											size="small"
											placeholder="Search symbol..."
											slotProps={{
												input: {
													...params.InputProps,
													endAdornment: (
														<>
															{symbolsLoading ? (
																<CircularProgress size={16} />
															) : null}
															{params.InputProps.endAdornment}
														</>
													),
												},
											}}
										/>
									)}
									sx={{ mb: 2 }}
								/>

								{/* Timeframe selector */}
								<Typography
									variant="caption"
									color="text.secondary"
									fontWeight={700}
									sx={{ letterSpacing: "0.08em", mb: 0.5, display: "block" }}
								>
									TIMEFRAME
								</Typography>
								<ToggleButtonGroup
									value={prefTimeframe}
									exclusive
									onChange={(_, value) => {
										if (value) {
											setPrefTimeframe(value);
											setSelectedTimeframe(value);
										}
									}}
									size="small"
									sx={{ flexWrap: "wrap", mb: 0.5 }}
								>
									{TIMEFRAMES.map((tf) => (
										<ToggleButton
											key={tf.value}
											value={tf.value}
											sx={{ px: 1.5, py: 0.5, fontSize: "0.75rem" }}
										>
											{tf.label}
										</ToggleButton>
									))}
								</ToggleButtonGroup>
								<Box
									sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}
								>
									<SaveIndicator status={prefsStatus} />
								</Box>

								<Divider sx={{ my: 1.5 }} />

								{/* Price display */}
								<Typography
									variant="caption"
									color="text.secondary"
									fontWeight={700}
									sx={{ letterSpacing: "0.08em", display: "block" }}
								>
									LAST PRICE
								</Typography>
								{resolvedTicker ? (
									<>
										<Typography
											variant="h4"
											fontWeight={700}
											sx={{
												fontFamily: (theme) => theme.trading.mono,
												lineHeight: 1.2,
											}}
										>
											${formatPrice(currentPrice)}
										</Typography>
										<Typography
											variant="body2"
											fontWeight={600}
											sx={{
												color: isPositive ? "success.main" : "error.main",
												mb: 0.5,
											}}
										>
											{formatPercent(resolvedTicker.priceChangePercent)}{" "}
											<Typography
												component="span"
												variant="caption"
												color="text.secondary"
											>
												24h
											</Typography>
										</Typography>
									</>
								) : (
									<Typography variant="h5" color="text.secondary">
										{tickerQuery.isLoading ? "..." : "-"}
									</Typography>
								)}

								<Divider sx={{ my: 1.5 }} />

								{/* Quick stats */}
								{resolvedTicker && (
									<Box
										sx={{
											display: "flex",
											flexDirection: "column",
											gap: 1,
											mb: 1.5,
										}}
									>
										{[
											{
												label: "24h High",
												value: `$${formatPrice(resolvedTicker.high24h)}`,
											},
											{
												label: "24h Low",
												value: `$${formatPrice(resolvedTicker.low24h)}`,
											},
											{
												label: "24h Volume",
												value: `$${formatVolume(resolvedTicker.volume24h)}`,
											},
											{
												label: "Bid",
												value: `$${formatPrice(resolvedTicker.bidPrice)}`,
												color: "success.main" as const,
											},
											{
												label: "Ask",
												value: `$${formatPrice(resolvedTicker.askPrice)}`,
												color: "error.main" as const,
											},
										].map((stat) => (
											<Box
												key={stat.label}
												sx={{
													display: "flex",
													justifyContent: "space-between",
													alignItems: "center",
												}}
											>
												<Typography variant="body2" color="text.secondary">
													{stat.label}
												</Typography>
												<Typography
													variant="body2"
													fontWeight={500}
													sx={{
														fontFamily: (theme) => theme.trading.mono,
														color: stat.color,
													}}
												>
													{stat.value}
												</Typography>
											</Box>
										))}
									</Box>
								)}

								<Divider sx={{ my: 1.5 }} />

								{/* Sidebar Watchlist */}
								<Box
									sx={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "center",
										mb: 1,
									}}
								>
									<Typography
										variant="caption"
										color="text.secondary"
										fontWeight={700}
										sx={{ letterSpacing: "0.08em" }}
									>
										WATCHLIST
									</Typography>
								</Box>

								{watchlist.length === 0 ? (
									<Box sx={{ textAlign: "center", py: 2 }}>
										<StarBorderIcon
											sx={{ fontSize: 32, color: "text.disabled" }}
										/>
										<Typography
											variant="caption"
											color="text.secondary"
											display="block"
										>
											No symbols tracked
										</Typography>
									</Box>
								) : (
									<Box
										sx={{
											display: "flex",
											flexDirection: "column",
											gap: 0.5,
										}}
									>
										{watchlist.map((symbol) => {
											const t = tickers[symbol];
											const positive = (t?.priceChangePercent ?? 0) >= 0;
											return (
												<Box
													key={symbol}
													onClick={() => {
														setSelectedSymbol(symbol);
														setPrefSymbol(symbol);
													}}
													sx={{
														display: "flex",
														alignItems: "center",
														justifyContent: "space-between",
														py: 0.75,
														px: 1,
														borderRadius: 1,
														cursor: "pointer",
														bgcolor: "action.hover",
														transition: "background-color 0.15s",
														"&:hover": { bgcolor: "action.selected" },
													}}
												>
													<Typography
														variant="body2"
														fontWeight={500}
														sx={{ minWidth: 90 }}
													>
														{symbol.replace("-", "/")}
													</Typography>
													<Typography
														variant="caption"
														color="text.secondary"
														sx={{
															fontFamily: (theme) => theme.trading.mono,
															flex: 1,
															textAlign: "right",
															mr: 1,
														}}
													>
														{t ? `$${formatPrice(t.lastPrice)}` : "..."}
													</Typography>
													<Typography
														variant="caption"
														fontWeight={600}
														sx={{
															color: positive ? "success.main" : "error.main",
															fontFamily: (theme) => theme.trading.mono,
															minWidth: 52,
															textAlign: "right",
														}}
													>
														{t ? formatPercent(t.priceChangePercent) : "-"}
													</Typography>
												</Box>
											);
										})}
									</Box>
								)}

								{/* Add symbol */}
								{showAddSymbol ? (
									<Box sx={{ mt: 1 }}>
										<ZoomAwareAutocomplete<SymbolOption, false, false, false>
											value={null}
											onChange={(_, newValue) => {
												if (newValue) {
													addToWatchlist(newValue.symbol);
													setShowAddSymbol(false);
												}
											}}
											options={availableOptions}
											groupBy={(option) => option.group}
											getOptionLabel={(option) => option.symbol}
											isOptionEqualToValue={(option, value) =>
												option.symbol === value.symbol &&
												option.group === value.group
											}
											loading={symbolsLoading}
											size="small"
											renderInput={(params) => (
												<TextField
													{...params}
													size="small"
													placeholder="Add symbol..."
													autoFocus
													slotProps={{
														input: {
															...params.InputProps,
															endAdornment: (
																<>
																	{symbolsLoading ? (
																		<CircularProgress size={14} />
																	) : null}
																	{params.InputProps.endAdornment}
																</>
															),
														},
													}}
												/>
											)}
										/>
									</Box>
								) : (
									<Typography
										variant="body2"
										color="primary"
										sx={{
											mt: 1,
											cursor: "pointer",
											"&:hover": { textDecoration: "underline" },
										}}
										onClick={() => setShowAddSymbol(true)}
									>
										+ Add Symbol
									</Typography>
								)}
							</CardContent>
						</Card>
					</Box>

					{/* ====== MAIN CONTENT ====== */}
					<Box sx={{ flex: 1, minWidth: 0 }}>
						{/* Account Summary Cards */}
						<Grid container spacing={2} sx={{ mb: 3 }}>
							<Grid size={{ xs: 12, sm: 6, lg: 3 }}>
								<StatCard
									title="Total Equity"
									value={
										account?.totalEquity ? formatUSD(account.totalEquity) : "-"
									}
									loading={accountQuery.isPending}
								/>
							</Grid>
							<Grid size={{ xs: 12, sm: 6, lg: 3 }}>
								<StatCard
									title="Available Balance"
									value={
										account?.availableBalance
											? formatUSD(account.availableBalance)
											: "-"
									}
									loading={accountQuery.isPending}
								/>
							</Grid>
							<Grid size={{ xs: 12, sm: 6, lg: 3 }}>
								<StatCard
									title="Unrealized PnL"
									value={
										account?.unrealizedPnl !== undefined
											? formatUSD(account.unrealizedPnl)
											: "-"
									}
									trend={(account?.unrealizedPnl ?? 0) >= 0 ? "up" : "down"}
									loading={accountQuery.isPending}
								/>
							</Grid>
							<Grid size={{ xs: 12, sm: 6, lg: 3 }}>
								<StatCard
									title="Margin Ratio"
									value={
										account?.marginRatio != null
											? `${(account.marginRatio * 100).toFixed(1)}%`
											: "-"
									}
									loading={accountQuery.isPending}
								/>
							</Grid>
						</Grid>

						{/* Market Overview (Gainers / Losers) */}
						<MarketOverviewPanel
							overview={overviewQuery.data ?? null}
							isLoading={overviewQuery.isLoading}
						/>

						{/* Tabbed content: Holdings / Positions / Orders */}
						<Card sx={{ mt: 3 }}>
							<Tabs
								value={bottomTab}
								onChange={(_, v) => setBottomTab(v)}
								sx={{ borderBottom: 1, borderColor: "divider", px: 2 }}
							>
								<Tab label="Holdings" />
								<Tab label="Positions" />
								<Tab label="Orders" />
							</Tabs>
							<CardContent>
								<AnimatePresence mode="wait">
									<motion.div
										key={bottomTab}
										variants={tabSwitch}
										initial="initial"
										animate="animate"
										exit="exit"
									>
										{bottomTab === 0 && (
											<HoldingsTab
												currencies={account?.currencies ?? []}
												isLoading={accountQuery.isPending}
												error={account?.error ?? null}
												onSelectSymbol={setSelectedSymbol}
											/>
										)}
										{bottomTab === 1 && (
											<PositionsTab onSelectSymbol={setSelectedSymbol} />
										)}
										{bottomTab === 2 && (
											<RecentOrderActivity
												orders={orderHistoryQuery.data?.orders ?? []}
												isLoading={orderHistoryQuery.isLoading}
												error={orderHistoryError}
												embedded
											/>
										)}
									</motion.div>
								</AnimatePresence>
							</CardContent>
						</Card>
					</Box>
				</Box>
			</Box>
		</PageTransition>
	);
}
