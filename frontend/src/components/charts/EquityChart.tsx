/**
 * Cumulative P&L area chart for the dashboard equity section.
 * Uses lightweight-charts v4 with theme-aware colors and resize handling.
 */

import { Box, Card, CardContent, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { motion } from "framer-motion";
import { useReducedMotion } from "framer-motion";
import { ColorType, createChart, type IChartApi, type Time } from "lightweight-charts";
import { useEffect, useRef } from "react";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";

interface EquityChartProps {
	trades: Array<{ entryTime: string; netPnl?: number }>;
	loading: boolean;
}

/** Convert ISO date string to lightweight-charts UTCTimestamp (seconds). */
function toUTCTimestamp(isoString: string): Time {
	return (Math.floor(new Date(isoString).getTime() / 1000)) as Time;
}

export function EquityChart({ trades, loading }: EquityChartProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<IChartApi | null>(null);
	const theme = useTheme();
	const reducedMotion = useReducedMotion();

	useEffect(() => {
		const container = containerRef.current;
		if (!container || trades.length === 0) return;

		// Compute equity curve: sort by time, accumulate netPnl
		const sorted = [...trades]
			.filter((t) => t.entryTime && t.netPnl !== undefined)
			.sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());

		if (sorted.length === 0) return;

		let cumulative = 0;
		const equityData = sorted.map((trade) => {
			cumulative += trade.netPnl ?? 0;
			return {
				time: toUTCTimestamp(trade.entryTime),
				value: cumulative,
			};
		});

		const isDark = theme.palette.mode === "dark";
		const greenColor = theme.palette.success.main;

		const chart = createChart(container, {
			width: container.clientWidth,
			height: 220,
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

		const areaSeries = chart.addAreaSeries({
			lineColor: greenColor,
			topColor: `${greenColor}40`,
			bottomColor: `${greenColor}05`,
			lineWidth: 2,
			priceLineVisible: false,
			lastValueVisible: true,
			crosshairMarkerVisible: true,
		});

		areaSeries.setData(equityData);
		chart.timeScale().fitContent();

		// ResizeObserver for responsive sizing
		const resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const { width } = entry.contentRect;
				if (width > 0) {
					chart.resize(width, 220);
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
			<Card sx={{ height: 280 }}>
				<CardContent>
					<Typography variant="h6" sx={{ mb: 2 }}>
						Portfolio Equity
					</Typography>
					{loading ? (
						<ShimmerSkeleton variant="rectangular" height={220} />
					) : !hasTrades ? (
						<Box
							sx={{
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								height: 220,
								borderRadius: 1,
								border: (t) => `1px dashed ${t.trading.border.subtle}`,
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
								height: 220,
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

export default EquityChart;
