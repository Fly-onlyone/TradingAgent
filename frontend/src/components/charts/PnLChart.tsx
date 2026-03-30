/**
 * Per-trade P&L histogram chart for the trades page.
 * Green bars for profitable trades, red for losses.
 * Uses lightweight-charts v4 with theme-aware colors and resize handling.
 */

import { Box, Card, CardContent, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { motion, useReducedMotion } from "framer-motion";
import {
	ColorType,
	createChart,
	type IChartApi,
	type Time,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";

interface PnLChartProps {
	trades: Array<{ entryTime: string; netPnl?: number }>;
	loading: boolean;
}

/** Convert ISO date string to lightweight-charts UTCTimestamp (seconds). */
function toUTCTimestamp(isoString: string): Time {
	return Math.floor(new Date(isoString).getTime() / 1000) as Time;
}

export function PnLChart({ trades, loading }: PnLChartProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<IChartApi | null>(null);
	const theme = useTheme();
	const reducedMotion = useReducedMotion();

	useEffect(() => {
		const container = containerRef.current;
		if (!container || trades.length === 0) return;

		// Filter and sort trades with defined P&L
		const sorted = [...trades]
			.filter((t) => t.entryTime && t.netPnl !== undefined)
			.sort(
				(a, b) =>
					new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime(),
			);

		if (sorted.length === 0) return;

		const isDark = theme.palette.mode === "dark";
		const greenColor = theme.palette.success.main;
		const redColor = theme.palette.error.main;

		const histogramData = sorted.map((trade) => ({
			time: toUTCTimestamp(trade.entryTime),
			value: trade.netPnl ?? 0,
			color: (trade.netPnl ?? 0) >= 0 ? greenColor : redColor,
		}));

		const chart = createChart(container, {
			width: container.clientWidth,
			height: 200,
			layout: {
				background: { type: ColorType.Solid, color: "transparent" },
				textColor: theme.palette.text.secondary,
				fontFamily: theme.typography.fontFamily as string,
			},
			grid: {
				vertLines: {
					color: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)",
				},
				horzLines: {
					color: isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)",
				},
			},
			crosshair: {
				vertLine: { labelBackgroundColor: theme.palette.primary.main },
				horzLine: { labelBackgroundColor: theme.palette.primary.main },
			},
			rightPriceScale: {
				borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)",
			},
			timeScale: {
				borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)",
				timeVisible: true,
				secondsVisible: false,
			},
			handleScroll: !reducedMotion,
			handleScale: !reducedMotion,
		});

		chartRef.current = chart;

		const histogramSeries = chart.addHistogramSeries({
			priceLineVisible: false,
			lastValueVisible: false,
		});

		histogramSeries.setData(histogramData);
		chart.timeScale().fitContent();

		// ResizeObserver for responsive sizing
		const resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const { width } = entry.contentRect;
				if (width > 0) {
					chart.resize(width, 200);
				}
			}
		});

		resizeObserver.observe(container);

		return () => {
			resizeObserver.disconnect();
			chart.remove();
			chartRef.current = null;
		};
	}, [trades, theme, reducedMotion]);

	const hasTrades = trades.some((t) => t.netPnl !== undefined);

	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			transition={{ duration: 0.3 }}
		>
			<Card sx={{ mb: 3 }}>
				<CardContent>
					<Typography variant="h6" sx={{ mb: 2 }}>
						P&L Performance
					</Typography>
					{loading ? (
						<ShimmerSkeleton variant="rectangular" height={200} />
					) : !hasTrades ? (
						<Box
							sx={{
								height: 200,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								border: (t) => `1px dashed ${t.trading.border.subtle}`,
								borderRadius: 1,
							}}
						>
							<Typography variant="body2" color="text.secondary">
								No trade data
							</Typography>
						</Box>
					) : (
						<Box
							ref={containerRef}
							sx={{
								width: "100%",
								height: 200,
								borderRadius: 1,
								overflow: "hidden",
							}}
						/>
					)}
				</CardContent>
			</Card>
		</motion.div>
	);
}

export default PnLChart;
