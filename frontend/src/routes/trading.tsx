/**
 * Market Monitor Page
 *
 * Read-only view of live market data used by the trading agent for automated decisions.
 */

import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Activity, LineChart, TrendingUp } from "lucide-react";

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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
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
			<div>
				<SectionHeader
					title="Market Monitor"
					subtitle="Live market data — the agent uses this data for automated decisions"
				/>

				<Alert className="mb-4">
					<AlertDescription>
						This is a read-only view of market data. All trading is handled
						automatically by the agent.
					</AlertDescription>
				</Alert>

				<motion.div
					initial={{ opacity: 0, x: -40 }}
					animate={{ opacity: 1, x: 0 }}
					transition={{ ...spring.snappy, delay: 0.1 }}
				>
					<div className="mb-4 flex items-center justify-between">
						<div className="flex items-center gap-4">
							<h2 className="text-xl font-bold">
								{selectedSymbol.replace("-", "/")}
							</h2>
							{resolvedTicker ? (
								<span
									className={cn(
										"text-xl font-mono",
										resolvedTicker.priceChangePercent >= 0
											? "text-[var(--trading-bullish)]"
											: "text-[var(--trading-bearish)]",
									)}
								>
									${formatPrice(currentPrice)}
								</span>
							) : null}
						</div>

						<ToggleGroup
							type="single"
							value={selectedTimeframe}
							onValueChange={(value) => value && setSelectedTimeframe(value)}
							size="sm"
							className="flex-wrap"
						>
							{TIMEFRAMES.map((timeframe) => (
								<ToggleGroupItem
									key={timeframe.value}
									value={timeframe.value}
								>
									{timeframe.label}
								</ToggleGroupItem>
							))}
						</ToggleGroup>
					</div>
				</motion.div>

				{pageError ? (
					<Alert variant="destructive" className="mb-4">
						<AlertDescription>{pageError}</AlertDescription>
					</Alert>
				) : null}

				<div className="grid grid-cols-12 gap-4">
					<div className="col-span-12">
						<div className="grid grid-cols-12 gap-4">
							<div className="col-span-12 sm:col-span-6 md:col-span-4">
								<StatCard
									title="Last Price"
									value={resolvedTicker ? `$${formatPrice(currentPrice)}` : "-"}
									icon={<LineChart />}
									loading={tickerQuery.isLoading && !resolvedTicker}
								/>
							</div>
							<div className="col-span-12 sm:col-span-6 md:col-span-4">
								<StatCard
									title="24h Change"
									value={
										resolvedTicker
											? formatPercent(resolvedTicker.priceChangePercent)
											: "-"
									}
									icon={<TrendingUp />}
									trend={
										(resolvedTicker?.priceChangePercent ?? 0) >= 0
											? "up"
											: "down"
									}
									loading={tickerQuery.isLoading && !resolvedTicker}
								/>
							</div>
							<div className="col-span-12 sm:col-span-6 md:col-span-4">
								<StatCard
									title="24h Volume"
									value={
										resolvedTicker
											? `$${formatVolume(resolvedTicker.volume24h)}`
											: "-"
									}
									icon={<Activity />}
									loading={tickerQuery.isLoading && !resolvedTicker}
								/>
							</div>
						</div>
					</div>

					<div className="col-span-12 lg:col-span-8">
						<MarketOverviewPanel
							overview={overviewQuery.data ?? null}
							isLoading={overviewQuery.isLoading}
						/>
					</div>

					<div className="col-span-12 lg:col-span-4">
						<div className="flex flex-col gap-4">
							<Card>
								<CardContent>
									<h3 className="mb-3 text-lg font-semibold">
										Agent Watchlist
									</h3>
									<div className="flex flex-col gap-3">
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
											<p className="text-sm text-muted-foreground">
												No symbols in watchlist.
											</p>
										)}
									</div>
								</CardContent>
							</Card>

							{currentPosition ? (
								<PositionCard position={currentPosition} />
							) : (
								<Card>
									<CardContent>
										<h3 className="mb-3 text-lg font-semibold">
											Current Position
										</h3>
										<p className="text-sm text-muted-foreground">
											No open position for{" "}
											{selectedSymbol.replace("-", "/")}.
										</p>
									</CardContent>
								</Card>
							)}
						</div>
					</div>

					<div className="col-span-12">
						<RecentOrderActivity
							orders={orderHistoryQuery.data?.orders ?? []}
							isLoading={orderHistoryQuery.isLoading}
							error={orderHistoryError}
						/>
					</div>
				</div>
			</div>
		</PageTransition>
	);
}
