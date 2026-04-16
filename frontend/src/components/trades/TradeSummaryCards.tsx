/**
 * Trade Summary Cards — P&L statistics built from the shared metric family.
 */

import PercentIcon from "@mui/icons-material/Percent";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import { Grid2 as Grid } from "@mui/material";
import { TrendIconMetric } from "@/components/data-display/metric";
import type { TradeSummary } from "@/types";
import { formatPercent, formatPnL } from "@/utils/formatters";

interface TradeSummaryCardsProps {
	summary: TradeSummary | null;
	isLoading?: boolean;
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
		<Grid container spacing={2}>
			<Grid size={{ xs: 12, sm: 6, md: 3 }}>
				<TrendIconMetric
					label="Total P&L"
					value={formatPnL(totalPnl).text}
					icon={totalPnl >= 0 ? <TrendingUpIcon /> : <TrendingDownIcon />}
					tone={totalPnl >= 0 ? "success" : "error"}
					subtitle={
						summary ? formatPercent(summary.totalPnlPercent) : undefined
					}
					loading={isLoading}
				/>
			</Grid>
			<Grid size={{ xs: 12, sm: 6, md: 3 }}>
				<TrendIconMetric
					label="Win Rate"
					value={`${winRate.toFixed(1)}%`}
					icon={<PercentIcon />}
					tone={winRate >= 50 ? "success" : "warning"}
					subtitle={
						summary
							? `${summary.winningTrades}W / ${summary.losingTrades}L`
							: undefined
					}
					loading={isLoading}
				/>
			</Grid>
			<Grid size={{ xs: 12, sm: 6, md: 3 }}>
				<TrendIconMetric
					label="Total Trades"
					value={totalTrades}
					icon={<ShowChartIcon />}
					tone="primary"
					subtitle={
						summary ? `Avg: ${formatPnL(summary.avgTradePnl).text}` : undefined
					}
					loading={isLoading}
				/>
			</Grid>
			<Grid size={{ xs: 12, sm: 6, md: 3 }}>
				<TrendIconMetric
					label="Best / Worst"
					value={summary ? formatPnL(summary.bestTrade).text : "+$0.00"}
					icon={<TrendingUpIcon />}
					tone={profitFactor >= 1 ? "success" : "warning"}
					subtitle={
						summary ? `Worst: ${formatPnL(summary.worstTrade).text}` : undefined
					}
					loading={isLoading}
				/>
			</Grid>
		</Grid>
	);
}

export default TradeSummaryCards;
