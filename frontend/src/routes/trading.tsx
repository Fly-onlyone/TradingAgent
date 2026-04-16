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
	marketCandlesQueryOptions,
	marketOverviewQueryOptions,
	marketTickerQueryOptions,
	userPreferencesQueryOptions,
} from "@/api/queryOptions/market";
import { CoinIcon } from "@/components/common/CoinIcon";
import { PageTransition } from "@/components/common/PageTransition";
import { SaveIndicator } from "@/components/common/SaveIndicator";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ZoomAwareAutocomplete } from "@/components/common/ZoomAwareAutocomplete";
import { Sparkline } from "@/components/effects/Sparkline";
import {
	HoldingsTab,
	MarketOverviewPanel,
	PositionsTab,
	RecentOrderActivity,
} from "@/components/trading";
import { useDebouncedSave } from "@/hooks/useDebouncedSave";
import { useSymbolOptions } from "@/hooks/useSymbolOptions";
import { useMarketStore } from "@/store/marketStore";
import { usePageVisibility } from "@/utils/animations/hooks";
import { spring, tabSwitch } from "@/utils/animations/variants";
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
	const liveTicker = useMarketStore(
		(state) => state.tickers[state.selectedSymbol],
	);
	const watchlist = useMarketStore((state) => state.watchlist);
	const tickers = useMarketStore((state) => state.tickers);
	const addToWatchlist = useMarketStore((state) => state.addToWatchlist);

	const queryClient = useQueryClient();
	const isPageVisible = usePageVisibility();

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
		refetchInterval: isPageVisible ? 15_000 : false,
		retry: 1,
	});

	const sparklineQuery = useQuery({
		...marketCandlesQueryOptions(selectedSymbol, "1h", 24),
		refetchInterval: isPageVisible ? 120_000 : false,
		retry: 1,
	});

	const overviewQuery = useQuery({
		...marketOverviewQueryOptions(),
		refetchInterval: isPageVisible ? 120_000 : false,
		retry: 1,
	});

	const accountQuery = useQuery({
		...marketAccountQueryOptions(),
		refetchInterval: isPageVisible ? 60_000 : false,
		retry: 1,
	});

	const orderHistoryQuery = useQuery({
		queryKey: ["orders", "okx", "history", selectedSymbol, 20],
		queryFn: () =>
			ordersApi.getOkxOrderHistory({ symbol: selectedSymbol, limit: 20 }),
		staleTime: 15_000,
		refetchInterval: isPageVisible && bottomTab === 2 ? 20_000 : false,
		retry: 1,
	});

	const resolvedTicker = liveTicker ?? tickerQuery.data;
	const currentPrice =
		typeof resolvedTicker?.lastPrice === "number" &&
		Number.isFinite(resolvedTicker.lastPrice)
			? resolvedTicker.lastPrice
			: 0;

	const sparklineData = useMemo(
		() => (sparklineQuery.data ?? []).map((candle) => candle.close),
		[sparklineQuery.data],
	);

	const spread =
		resolvedTicker && resolvedTicker.askPrice > 0 && resolvedTicker.bidPrice > 0
			? resolvedTicker.askPrice - resolvedTicker.bidPrice
			: null;

	const rangePosition = useMemo(() => {
		if (!resolvedTicker) return null;
		const { high24h, low24h } = resolvedTicker;
		if (!(high24h > low24h)) return null;
		const pct = ((currentPrice - low24h) / (high24h - low24h)) * 100;
		return Math.max(0, Math.min(100, pct));
	}, [resolvedTicker, currentPrice]);

	const spreadPct =
		spread !== null && currentPrice > 0 ? (spread / currentPrice) * 100 : null;

	const volumeActivityPct = useMemo(() => {
		const candles = sparklineQuery.data;
		if (!candles || candles.length < 2) return null;
		const volumes = candles.map((c) => c.volume);
		const max = Math.max(...volumes);
		if (!(max > 0)) return null;
		const last = volumes[volumes.length - 1];
		return (last / max) * 100;
	}, [sparklineQuery.data]);

	const orderHistoryError =
		orderHistoryQuery.data?.error ||
		(orderHistoryQuery.isError
			? getErrorMessage(orderHistoryQuery.error)
			: null);

	const account = accountQuery.data;
	const isPositive = (resolvedTicker?.priceChangePercent ?? 0) >= 0;

	return (
		<PageTransition pageKey="trading" heavy>
			<Box
				sx={{
					flex: 1,
					minHeight: 0,
					minWidth: 0,
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
				}}
			>
				<SectionHeader
					title="Market Monitor"
					subtitle="Live market data — the agent uses this data for automated decisions"
				/>

				<Box
					sx={{
						flex: 1,
						minHeight: 0,
						display: "flex",
						gap: 3,
						flexDirection: { xs: "column", md: "row" },
						overflow: { xs: "auto", md: "hidden" },
					}}
				>
					{/* ====== LEFT SIDEBAR ====== */}
					<Box
						sx={{
							width: { xs: "100%", md: 300 },
							flexShrink: 0,
							display: { xs: "block", md: "flex" },
							minHeight: { md: 0 },
						}}
					>
						<Card
							component={motion.div}
							initial={{ opacity: 0, x: -30 }}
							animate={{ opacity: 1, x: 0 }}
							transition={spring.snappy}
							sx={{
								width: "100%",
								display: { xs: "block", md: "flex" },
								flexDirection: "column",
								minHeight: { md: 0 },
								flex: { md: 1 },
							}}
						>
							<CardContent
								sx={{
									p: 2.5,
									"&:last-child": { pb: 2.5 },
									flex: { md: 1 },
									minHeight: { md: 0 },
									overflowY: { md: "auto" },
								}}
							>
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

								{/* Coin-identity hero block */}
								<Box
									sx={{
										mt: 1,
										borderRadius: 2,
										background: (theme) =>
											`linear-gradient(135deg, rgba(${theme.trading.primaryRgb}, 0.10) 0%, rgba(${theme.trading.primaryRgb}, 0.02) 100%)`,
										border: "1px solid",
										borderColor: "divider",
										overflow: "hidden",
									}}
								>
									<Box
										sx={{
											p: 1.5,
											display: "flex",
											alignItems: "center",
											gap: 1.25,
										}}
									>
										<CoinIcon
											symbol={selectedOption?.base ?? selectedSymbol}
											size={36}
										/>
										<Box sx={{ minWidth: 0, flex: 1 }}>
											<Typography
												variant="caption"
												fontWeight={700}
												noWrap
												sx={{
													display: "block",
													letterSpacing: "0.04em",
													lineHeight: 1.2,
												}}
											>
												{selectedSymbol}
											</Typography>
											<Typography
												variant="caption"
												color="text.secondary"
												noWrap
												sx={{ display: "block", fontSize: "0.7rem" }}
											>
												{selectedOption?.base ?? selectedSymbol} /{" "}
												{selectedOption?.quote ?? "USDT"}
											</Typography>
										</Box>
										<Box sx={{ textAlign: "right", minWidth: 0 }}>
											{resolvedTicker ? (
												<>
													<Typography
														fontWeight={700}
														noWrap
														sx={{
															fontFamily: (theme) => theme.trading.mono,
															lineHeight: 1.05,
															fontSize: "1.35rem",
														}}
													>
														${formatPrice(currentPrice)}
													</Typography>
													<Typography
														fontWeight={700}
														sx={{
															color: isPositive ? "success.main" : "error.main",
															display: "block",
															lineHeight: 1.2,
															fontSize: "0.95rem",
														}}
													>
														{formatPercent(resolvedTicker.priceChangePercent)}{" "}
														<Typography
															component="span"
															sx={{
																fontSize: "0.7rem",
																color: "text.secondary",
																fontWeight: 500,
															}}
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
										</Box>
									</Box>

									{/* Full-width sparkline strip */}
									{sparklineData.length >= 2 && (
										<Box
											sx={{
												display: "block",
												lineHeight: 0,
												"& svg": { display: "block", width: "100%" },
											}}
										>
											<Sparkline
												data={sparklineData}
												width={300}
												height={40}
												strokeColor={
													isPositive ? "rgb(38, 166, 154)" : "rgb(239, 83, 80)"
												}
												fillColor={
													isPositive
														? "rgba(38, 166, 154, 0.25)"
														: "rgba(239, 83, 80, 0.25)"
												}
											/>
										</Box>
									)}
								</Box>

								<Divider sx={{ my: 1.5 }} />

								{/* Timeframe selector */}
								<Box
									sx={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "center",
										mb: 0.5,
									}}
								>
									<Typography
										variant="caption"
										color="text.secondary"
										fontWeight={700}
										sx={{ letterSpacing: "0.08em" }}
									>
										TIMEFRAME
									</Typography>
									<SaveIndicator status={prefsStatus} />
								</Box>
								{[TIMEFRAMES.slice(0, 5), TIMEFRAMES.slice(5)].map(
									(row, rowIdx) => (
										<ToggleButtonGroup
											// biome-ignore lint/suspicious/noArrayIndexKey: fixed 2-row split
											key={rowIdx}
											value={prefTimeframe}
											exclusive
											onChange={(_, value) => {
												if (value) {
													setPrefTimeframe(value);
													setSelectedTimeframe(value);
												}
											}}
											size="small"
											fullWidth
											sx={{
												mt: rowIdx === 1 ? "-1px" : 0,
												"& .MuiToggleButton-root:first-of-type": {
													borderTopLeftRadius: rowIdx === 0 ? undefined : 0,
													borderBottomLeftRadius: rowIdx === 1 ? undefined : 0,
												},
												"& .MuiToggleButton-root:last-of-type": {
													borderTopRightRadius: rowIdx === 0 ? undefined : 0,
													borderBottomRightRadius: rowIdx === 1 ? undefined : 0,
												},
											}}
										>
											{row.map((tf) => (
												<ToggleButton
													key={tf.value}
													value={tf.value}
													sx={{ py: 0.5, fontSize: "0.75rem" }}
												>
													{tf.label}
												</ToggleButton>
											))}
										</ToggleButtonGroup>
									),
								)}

								<Divider sx={{ my: 1.5 }} />

								{/* Market stats: range bar + volume + spread */}
								{resolvedTicker && (
									<Card
										variant="outlined"
										sx={{
											mb: 0.5,
											overflow: "hidden",
											bgcolor: "action.hover",
											borderColor: "divider",
										}}
									>
										{/* 24h range bar */}
										<Box sx={{ p: 1.5 }}>
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
													sx={{
														letterSpacing: "0.08em",
														fontSize: "0.65rem",
														textTransform: "uppercase",
													}}
												>
													24h Range
												</Typography>
												{rangePosition !== null && (
													<Typography
														variant="caption"
														fontWeight={700}
														sx={{
															color:
																rangePosition >= 50
																	? "success.main"
																	: "error.main",
															fontSize: "0.7rem",
															fontFamily: (theme) => theme.trading.mono,
														}}
													>
														{rangePosition.toFixed(0)}%
													</Typography>
												)}
											</Box>

											<Box
												sx={{
													position: "relative",
													height: 6,
													borderRadius: 3,
													background: (theme) =>
														`linear-gradient(90deg, ${theme.trading.colors.bearish} 0%, rgba(${theme.trading.primaryRgb}, 0.25) 50%, ${theme.trading.colors.bullish} 100%)`,
													mb: 1,
												}}
											>
												{rangePosition !== null && (
													<Box
														component={motion.div}
														animate={{ left: `${rangePosition}%` }}
														transition={{
															type: "spring",
															stiffness: 260,
															damping: 22,
														}}
														sx={{
															position: "absolute",
															top: "50%",
															transform: "translate(-50%, -50%)",
															width: 14,
															height: 14,
															borderRadius: "50%",
															bgcolor: "background.paper",
															border: "2px solid",
															borderColor: isPositive
																? "success.main"
																: "error.main",
															boxShadow:
																"0 0 0 2px rgba(0,0,0,0.35), 0 0 8px rgba(0,0,0,0.4)",
														}}
													/>
												)}
											</Box>

											<Box
												sx={{
													display: "flex",
													justifyContent: "space-between",
													alignItems: "flex-end",
												}}
											>
												<Box>
													<Typography
														variant="caption"
														color="text.secondary"
														sx={{
															fontSize: "0.6rem",
															display: "block",
															letterSpacing: "0.1em",
															lineHeight: 1,
														}}
													>
														LOW
													</Typography>
													<Typography
														variant="caption"
														fontWeight={600}
														sx={{
															fontFamily: (theme) => theme.trading.mono,
															fontSize: "0.75rem",
															lineHeight: 1.3,
														}}
													>
														${formatPrice(resolvedTicker.low24h)}
													</Typography>
												</Box>
												<Box sx={{ textAlign: "right" }}>
													<Typography
														variant="caption"
														color="text.secondary"
														sx={{
															fontSize: "0.6rem",
															display: "block",
															letterSpacing: "0.1em",
															lineHeight: 1,
														}}
													>
														HIGH
													</Typography>
													<Typography
														variant="caption"
														fontWeight={600}
														sx={{
															fontFamily: (theme) => theme.trading.mono,
															fontSize: "0.75rem",
															lineHeight: 1.3,
														}}
													>
														${formatPrice(resolvedTicker.high24h)}
													</Typography>
												</Box>
											</Box>
										</Box>

										<Divider />

										{/* Volume | Spread split row */}
										<Box
											sx={{
												display: "grid",
												gridTemplateColumns: "1fr 1fr",
											}}
										>
											<Box
												sx={{
													p: 1.25,
													borderRight: 1,
													borderColor: "divider",
												}}
											>
												<Typography
													variant="caption"
													color="text.secondary"
													fontWeight={700}
													sx={{
														letterSpacing: "0.08em",
														fontSize: "0.6rem",
														textTransform: "uppercase",
														display: "block",
														mb: 0.25,
													}}
												>
													24h Volume
												</Typography>
												<Typography
													fontWeight={700}
													sx={{
														fontFamily: (theme) => theme.trading.mono,
														lineHeight: 1.2,
														fontSize: "0.9rem",
													}}
													noWrap
												>
													${formatVolume(resolvedTicker.quoteVolume24h)}
												</Typography>
												{volumeActivityPct !== null && (
													<Box
														sx={{
															mt: 0.75,
															height: 3,
															borderRadius: 1.5,
															bgcolor: "rgba(255,255,255,0.05)",
															overflow: "hidden",
														}}
													>
														<Box
															component={motion.div}
															initial={{ width: 0 }}
															animate={{ width: `${volumeActivityPct}%` }}
															transition={{ duration: 0.8, ease: "easeOut" }}
															sx={{
																height: "100%",
																bgcolor: "primary.main",
																borderRadius: 1.5,
															}}
														/>
													</Box>
												)}
											</Box>
											<Box sx={{ p: 1.25 }}>
												<Typography
													variant="caption"
													color="text.secondary"
													fontWeight={700}
													sx={{
														letterSpacing: "0.08em",
														fontSize: "0.6rem",
														textTransform: "uppercase",
														display: "block",
														mb: 0.25,
													}}
												>
													Spread
												</Typography>
												<Box
													sx={{
														display: "flex",
														alignItems: "baseline",
														gap: 0.5,
													}}
												>
													<Typography
														fontWeight={700}
														sx={{
															fontFamily: (theme) => theme.trading.mono,
															lineHeight: 1.2,
															fontSize: "0.9rem",
														}}
														noWrap
													>
														{spread !== null ? `$${formatPrice(spread)}` : "-"}
													</Typography>
												</Box>
												{spreadPct !== null && (
													<Typography
														variant="caption"
														color="text.secondary"
														sx={{
															fontSize: "0.65rem",
															fontFamily: (theme) => theme.trading.mono,
															display: "block",
															mt: 0.5,
														}}
													>
														{spreadPct.toFixed(3)}%
													</Typography>
												)}
											</Box>
										</Box>
									</Card>
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
					<Box
						sx={{
							flex: 1,
							minWidth: 0,
							display: { xs: "block", md: "flex" },
							flexDirection: "column",
							minHeight: { md: 0 },
							gap: { md: 3 },
						}}
					>
						{/* Market Overview (Gainers / Losers) */}
						<Box sx={{ flexShrink: 0 }}>
							<MarketOverviewPanel
								overview={overviewQuery.data ?? null}
								isLoading={overviewQuery.isLoading}
							/>
						</Box>

						{/* Tabbed content: Holdings / Positions / Orders */}
						<Card
							sx={{
								mt: { xs: 3, md: 0 },
								flex: { md: 1 },
								minHeight: { md: 0 },
								display: { md: "flex" },
								flexDirection: { md: "column" },
								overflow: { md: "hidden" },
							}}
						>
							<Tabs
								value={bottomTab}
								onChange={(_, v) => setBottomTab(v)}
								sx={{
									borderBottom: 1,
									borderColor: "divider",
									px: 2,
									flexShrink: 0,
								}}
							>
								<Tab label="Holdings" />
								<Tab label="Positions" />
								<Tab label="Orders" />
							</Tabs>
							<CardContent
								sx={{
									flex: { md: 1 },
									minHeight: { md: 0 },
									overflowY: { md: "auto" },
									"&:last-child": { pb: 2 },
								}}
							>
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
