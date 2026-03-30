/**
 * Market overview panel for top gainers and losers.
 */

import {
	Box,
	Card,
	CardContent,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	type Theme,
	Typography,
} from "@mui/material";
import { motion } from "framer-motion";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
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
	const trendColor = trend === "up" ? "success.main" : "error.main";

	return (
		<Box>
			<Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
				<Box
					component={motion.div}
					animate={{ scale: [1, 1.35, 1], opacity: [0.7, 1, 0.7] }}
					transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
					sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: trendColor }}
				/>
				<Typography variant="subtitle2" sx={{ color: trendColor }}>
					{title}
				</Typography>
			</Box>
			<TableContainer>
				<Table size="small">
					<TableHead>
						<TableRow>
							<TableCell>Symbol</TableCell>
							<TableCell align="right">Price</TableCell>
							<TableCell align="right">24h</TableCell>
						</TableRow>
					</TableHead>
					<TableBody>
						{tickers.length > 0 ? (
							tickers.map((ticker) => (
								<TableRow key={ticker.symbol}>
									<TableCell>{formatSymbol(ticker.symbol)}</TableCell>
									<TableCell align="right">
										${formatPrice(ticker.lastPrice)}
									</TableCell>
									<TableCell
										align="right"
										sx={{ color: trendColor, fontWeight: 600 }}
									>
										{formatPercent(ticker.changePct24h)}
									</TableCell>
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell colSpan={3} align="center">
									<Typography variant="body2" color="text.secondary">
										No data available
									</Typography>
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</TableContainer>
		</Box>
	);
}

export function MarketOverviewPanel({
	overview,
	isLoading = false,
}: MarketOverviewPanelProps) {
	return (
		<Card
			component={motion.div}
			initial={{ opacity: 0, y: 30 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ type: "spring", stiffness: 380, damping: 30, delay: 0.15 }}
			sx={{
				height: "100%",
				borderTop: "2px solid",
				borderImage: (theme: Theme) =>
					`linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%) 1`,
			}}
		>
			<CardContent>
				<Box
					sx={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						mb: 2,
					}}
				>
					<Typography variant="h6">Market Overview</Typography>
					<Typography variant="body2" color="text.secondary">
						24h Volume: ${formatVolume(overview?.totalVolume24h ?? 0)}
					</Typography>
				</Box>

				{isLoading ? (
					<Box>
						{[1, 2, 3, 4, 5, 6].map((value) => (
							<ShimmerSkeleton
								key={`market-overview-skeleton-${value}`}
								shimmerVariant="table-row"
							/>
						))}
					</Box>
				) : (
					<Box
						sx={{
							display: "grid",
							gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
							gap: 2,
						}}
					>
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
					</Box>
				)}
			</CardContent>
		</Card>
	);
}

export default MarketOverviewPanel;
