/**
 * Market overview panel for top gainers and losers.
 */

import { motion } from "framer-motion";

import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { MarketOverview, MarketOverviewTicker } from "@/types";
import {
	formatPercent,
	formatPrice,
	formatSymbol,
	formatVolume,
} from "@/utils/formatters";

interface MarketOverviewPanelProps {
	overview: MarketOverview | null;
	isLoading?: boolean;
}

interface OverviewTableProps {
	title: string;
	tickers: MarketOverviewTicker[];
	trend: "up" | "down";
}

function OverviewTable({ title, tickers, trend }: OverviewTableProps) {
	const trendColor =
		trend === "up"
			? "text-[var(--trading-bullish)]"
			: "text-[var(--trading-bearish)]";
	const dotBg =
		trend === "up"
			? "bg-[var(--trading-bullish)]"
			: "bg-[var(--trading-bearish)]";

	return (
		<div>
			<div className="mb-2 flex items-center gap-2">
				<motion.div
					animate={{ scale: [1, 1.35, 1], opacity: [0.7, 1, 0.7] }}
					transition={{
						duration: 2,
						repeat: Number.POSITIVE_INFINITY,
					}}
					className={cn("size-2 rounded-full", dotBg)}
				/>
				<span className={cn("text-sm font-medium", trendColor)}>{title}</span>
			</div>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Symbol</TableHead>
						<TableHead className="text-right">Price</TableHead>
						<TableHead className="text-right">24h</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{tickers.length > 0 ? (
						tickers.map((ticker) => (
							<TableRow key={ticker.symbol}>
								<TableCell>{formatSymbol(ticker.symbol)}</TableCell>
								<TableCell className="text-right">
									${formatPrice(ticker.lastPrice)}
								</TableCell>
								<TableCell
									className={cn("text-right font-semibold", trendColor)}
								>
									{formatPercent(ticker.changePct24h)}
								</TableCell>
							</TableRow>
						))
					) : (
						<TableRow>
							<TableCell colSpan={3} className="text-center">
								<span className="text-sm text-muted-foreground">
									No data available
								</span>
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>
		</div>
	);
}

export function MarketOverviewPanel({
	overview,
	isLoading = false,
}: MarketOverviewPanelProps) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 30 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{
				type: "spring",
				stiffness: 380,
				damping: 30,
				delay: 0.15,
			}}
		>
			<Card
				className="h-full border-t-2 border-t-transparent"
				style={{
					borderImage:
						"linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--secondary)) 100%) 1",
				}}
			>
				<CardContent>
					<div className="mb-4 flex items-center justify-between">
						<h3 className="text-lg font-semibold">Market Overview</h3>
						<span className="text-sm text-muted-foreground">
							24h Volume: ${formatVolume(overview?.totalVolume24h ?? 0)}
						</span>
					</div>

					{isLoading ? (
						<div>
							{[1, 2, 3, 4, 5, 6].map((value) => (
								<ShimmerSkeleton
									key={`market-overview-skeleton-${value}`}
									shimmerVariant="table-row"
								/>
							))}
						</div>
					) : (
						<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
							<OverviewTable
								title="Top Gainers"
								tickers={overview?.topGainers ?? []}
								trend="up"
							/>
							<OverviewTable
								title="Top Losers"
								tickers={overview?.topLosers ?? []}
								trend="down"
							/>
						</div>
					)}
				</CardContent>
			</Card>
		</motion.div>
	);
}

export default MarketOverviewPanel;
