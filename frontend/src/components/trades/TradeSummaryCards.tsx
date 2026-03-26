/**
 * Trade Summary Cards Component
 * Displays key P&L statistics in card format
 */

import { LineChart, Percent, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { TradeSummary } from "@/types";
import { formatPercent, formatPnL } from "@/utils/formatters";

interface TradeSummaryCardsProps {
	summary: TradeSummary | null;
	isLoading?: boolean;
}

interface StatCardProps {
	title: string;
	value: string | number;
	subtitle?: string;
	icon: React.ReactNode;
	color?: "success" | "error" | "primary" | "warning";
	isLoading?: boolean;
}

const colorClasses = {
	success: {
		text: "text-success",
		bg: "bg-success/10 text-success",
	},
	error: {
		text: "text-destructive",
		bg: "bg-destructive/10 text-destructive",
	},
	primary: {
		text: "text-primary",
		bg: "bg-primary/10 text-primary",
	},
	warning: {
		text: "text-warning",
		bg: "bg-warning/10 text-warning",
	},
} as const;

function StatCard({
	title,
	value,
	subtitle,
	icon,
	color = "primary",
	isLoading,
}: StatCardProps) {
	const colors = colorClasses[color];

	return (
		<Card className="h-full">
			<CardContent>
				<div className="flex items-start justify-between">
					<div>
						<span className="text-sm text-muted-foreground">
							{title}
						</span>
						{isLoading ? (
							<Skeleton className="mt-1 h-8 w-24" />
						) : (
							<p
								className={cn(
									"text-xl font-bold",
									colors.text,
								)}
							>
								{value}
							</p>
						)}
						{subtitle && !isLoading && (
							<span className="text-xs text-muted-foreground">
								{subtitle}
							</span>
						)}
					</div>
					<div className={cn("rounded-lg p-2", colors.bg)}>
						{icon}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

export function TradeSummaryCards({
	summary,
	isLoading,
}: TradeSummaryCardsProps) {
	const totalPnl = summary?.totalPnl ?? 0;
	const winRate = summary?.winRate ?? 0;
	const totalTrades = summary?.totalTrades ?? 0;
	const profitFactor = summary?.profitFactor ?? 0;

	return (
		<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4">
			<StatCard
				title="Total P&L"
				value={formatPnL(totalPnl).text}
				subtitle={
					summary
						? formatPercent(summary.totalPnlPercent)
						: undefined
				}
				icon={
					totalPnl >= 0 ? (
						<TrendingUp className="size-5" />
					) : (
						<TrendingDown className="size-5" />
					)
				}
				color={totalPnl >= 0 ? "success" : "error"}
				isLoading={isLoading}
			/>
			<StatCard
				title="Win Rate"
				value={`${winRate.toFixed(1)}%`}
				subtitle={
					summary
						? `${summary.winningTrades}W / ${summary.losingTrades}L`
						: undefined
				}
				icon={<Percent className="size-5" />}
				color={winRate >= 50 ? "success" : "warning"}
				isLoading={isLoading}
			/>
			<StatCard
				title="Total Trades"
				value={totalTrades}
				subtitle={
					summary
						? `Avg: ${formatPnL(summary.avgTradePnl).text}`
						: undefined
				}
				icon={<LineChart className="size-5" />}
				color="primary"
				isLoading={isLoading}
			/>
			<StatCard
				title="Best / Worst"
				value={
					summary ? formatPnL(summary.bestTrade).text : "+$0.00"
				}
				subtitle={
					summary
						? `Worst: ${formatPnL(summary.worstTrade).text}`
						: undefined
				}
				icon={<TrendingUp className="size-5" />}
				color={profitFactor >= 1 ? "success" : "warning"}
				isLoading={isLoading}
			/>
		</div>
	);
}

export default TradeSummaryCards;
