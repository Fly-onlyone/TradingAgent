/**
 * Ticker Card Component
 */

import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Star, StarOff } from "lucide-react";
import type { MouseEvent } from "react";

import { marketTickerQueryOptions } from "@/api/queryOptions/market";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useMarketStore } from "@/store/marketStore";
import type { Ticker } from "@/types";
import { formatPercent, formatPrice, formatVolume } from "@/utils/formatters";

interface TickerCardProps {
	symbol?: string;
	ticker?: Ticker;
	loading?: boolean;
	compact?: boolean;
	onClick?: () => void;
}

export function TickerCard({
	symbol,
	ticker,
	loading = false,
	compact = false,
	onClick,
}: TickerCardProps) {
	const watchlist = useMarketStore((state) => state.watchlist);
	const addToWatchlist = useMarketStore((state) => state.addToWatchlist);
	const removeFromWatchlist = useMarketStore(
		(state) => state.removeFromWatchlist,
	);
	const liveTicker = useMarketStore((state) =>
		symbol ? state.tickers[symbol] : undefined,
	);

	const tickerQuery = useQuery({
		...marketTickerQueryOptions(symbol as string),
		enabled: Boolean(symbol && !ticker && !liveTicker),
		staleTime: 30_000,
		refetchInterval: liveTicker ? false : 45_000,
		retry: 1,
	});

	const resolvedTicker = ticker ?? liveTicker ?? tickerQuery.data;
	const isLoading =
		loading || (!!symbol && !resolvedTicker && tickerQuery.isPending);

	if (isLoading) {
		return (
			<Card className={compact ? "h-20" : "h-[120px]"}>
				<CardContent>
					<div className="mb-2 flex justify-between">
						<ShimmerSkeleton variant="text" width={80} />
						<ShimmerSkeleton variant="text" width={60} />
					</div>
					<ShimmerSkeleton variant="text" width={120} height={32} />
					{!compact && <ShimmerSkeleton variant="text" width={100} />}
				</CardContent>
			</Card>
		);
	}

	if (!resolvedTicker) {
		return (
			<Card className={compact ? "h-20" : "h-[120px]"}>
				<CardContent>
					<p
						className={cn(
							"font-semibold",
							compact ? "text-sm" : "text-base",
						)}
					>
						{symbol ? symbol.replace("-", "/") : "Ticker"}
					</p>
					<p
						className={cn(
							"text-muted-foreground",
							compact ? "text-sm" : "text-lg font-semibold",
						)}
					>
						Unavailable
					</p>
				</CardContent>
			</Card>
		);
	}

	const isInWatchlist = watchlist.includes(resolvedTicker.symbol);
	const isPositive = resolvedTicker.priceChangePercent >= 0;

	const handleWatchlistToggle = (e: MouseEvent) => {
		e.stopPropagation();

		if (isInWatchlist) {
			removeFromWatchlist(resolvedTicker.symbol);
		} else {
			addToWatchlist(resolvedTicker.symbol);
		}
	};

	return (
		<motion.div whileHover={{ y: -2 }} onClick={onClick}>
			<Card
				className={cn(
					"backdrop-blur-xl transition-all duration-200",
					onClick ? "cursor-pointer" : "cursor-default",
					compact ? "h-auto" : "h-[120px]",
					isPositive
						? "hover:border-[var(--trading-bullish)] hover:shadow-[0_0_12px_rgba(var(--trading-bullish-rgb),0.15)]"
						: "hover:border-[var(--trading-bearish)] hover:shadow-[0_0_12px_rgba(var(--trading-bearish-rgb),0.15)]",
				)}
			>
				<CardContent className={compact ? "p-3" : "p-4"}>
					<div className="mb-2 flex items-start justify-between">
						<div>
							<p
								className={cn(
									"font-semibold",
									compact ? "text-sm" : "text-base",
								)}
							>
								{resolvedTicker.symbol.replace("-", "/")}
							</p>
						</div>
						<div className="flex items-center gap-1">
							<AnimatePresence mode="wait">
								<motion.div
									key={resolvedTicker.priceChangePercent}
									initial={{ opacity: 0, y: -5 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: 5 }}
								>
									<span
										className={cn(
											"text-sm font-semibold",
											isPositive
												? "text-[var(--trading-bullish)]"
												: "text-[var(--trading-bearish)]",
										)}
									>
										{formatPercent(resolvedTicker.priceChangePercent)}
									</span>
								</motion.div>
							</AnimatePresence>
							<Button
								variant="ghost"
								size="icon-xs"
								onClick={handleWatchlistToggle}
								asChild
							>
								<motion.button whileTap={{ scale: 1.4, rotate: 15 }}>
									{isInWatchlist ? (
										<Star className="size-4 text-yellow-500" />
									) : (
										<StarOff className="size-4 text-muted-foreground" />
									)}
								</motion.button>
							</Button>
						</div>
					</div>

					<AnimatePresence mode="wait">
						<motion.div
							key={resolvedTicker.lastPrice}
							initial={{
								backgroundColor: isPositive
									? "rgba(var(--trading-bullish-rgb), 0.2)"
									: "rgba(var(--trading-bearish-rgb), 0.2)",
								boxShadow: isPositive
									? "inset 0 0 12px rgba(var(--trading-bullish-rgb), 0.3)"
									: "inset 0 0 12px rgba(var(--trading-bearish-rgb), 0.3)",
							}}
							animate={{
								backgroundColor: "transparent",
								boxShadow: "inset 0 0 0px transparent",
							}}
							transition={{ duration: 0.6 }}
						>
							<p
								className={cn(
									"font-bold font-mono",
									compact ? "text-lg" : "text-xl",
									isPositive
										? "text-[var(--trading-bullish)]"
										: "text-[var(--trading-bearish)]",
								)}
							>
								${formatPrice(resolvedTicker.lastPrice)}
							</p>
						</motion.div>
					</AnimatePresence>

					{!compact && (
						<div className="mt-2 flex gap-4">
							<span className="text-xs text-muted-foreground">
								Vol: {formatVolume(resolvedTicker.volume24h)}
							</span>
							<span className="text-xs text-muted-foreground">
								H: ${formatPrice(resolvedTicker.high24h)}
							</span>
							<span className="text-xs text-muted-foreground">
								L: ${formatPrice(resolvedTicker.low24h)}
							</span>
						</div>
					)}
				</CardContent>
			</Card>
		</motion.div>
	);
}

export default TickerCard;
