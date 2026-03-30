/**
 * Candlestick chart component for inline display in agent chat messages.
 * Uses lightweight-charts v4 with theme-aware colors and resize handling.
 */

import { Box } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { useReducedMotion } from "framer-motion";
import {
	type CandlestickData,
	ColorType,
	createChart,
	type IChartApi,
	type ISeriesApi,
	type LineData,
	type Time,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

export interface CandleDataPoint {
	time: number;
	open: number;
	high: number;
	low: number;
	close: number;
}

export interface IndicatorLine {
	name: string;
	data: { time: number; value: number }[];
	color?: string;
}

interface AgentChartProps {
	data: CandleDataPoint[];
	indicators?: IndicatorLine[];
	height?: number;
}

/** Convert unix-seconds timestamp to lightweight-charts Time (UTCTimestamp). */
function toChartTime(ts: number): Time {
	// OKX returns milliseconds; lightweight-charts expects seconds
	const seconds = ts > 1e12 ? Math.floor(ts / 1000) : ts;
	return seconds as Time;
}

const INDICATOR_COLORS = [
	"#2196F3",
	"#FF9800",
	"#9C27B0",
	"#00BCD4",
	"#E91E63",
	"#8BC34A",
];

export function AgentChart({
	data,
	indicators,
	height = 300,
}: AgentChartProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const chartRef = useRef<IChartApi | null>(null);
	const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
	const lineSeriesRefs = useRef<ISeriesApi<"Line">[]>([]);

	const theme = useTheme();
	const reducedMotion = useReducedMotion();

	useEffect(() => {
		const container = containerRef.current;
		if (!container || data.length === 0) return;

		const isDark = theme.palette.mode === "dark";

		const chart = createChart(container, {
			width: container.clientWidth,
			height,
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

		// Candlestick series
		const upColor = theme.palette.success.main;
		const downColor = theme.palette.error.main;

		const candleSeries = chart.addCandlestickSeries({
			upColor,
			downColor,
			wickUpColor: upColor,
			wickDownColor: downColor,
			borderVisible: false,
		});

		const candleData: CandlestickData[] = data.map((d) => ({
			time: toChartTime(d.time),
			open: d.open,
			high: d.high,
			low: d.low,
			close: d.close,
		}));

		candleSeries.setData(candleData);
		candleSeriesRef.current = candleSeries;

		// Indicator overlays
		lineSeriesRefs.current = [];
		if (indicators && indicators.length > 0) {
			for (let i = 0; i < indicators.length; i++) {
				const ind = indicators[i];
				const color =
					ind.color || INDICATOR_COLORS[i % INDICATOR_COLORS.length];

				const lineSeries = chart.addLineSeries({
					color,
					lineWidth: 1,
					priceLineVisible: false,
					lastValueVisible: false,
					crosshairMarkerVisible: false,
				});

				const lineData: LineData[] = ind.data.map((d) => ({
					time: toChartTime(d.time),
					value: d.value,
				}));

				lineSeries.setData(lineData);
				lineSeriesRefs.current.push(lineSeries);
			}
		}

		chart.timeScale().fitContent();

		// ResizeObserver for responsive sizing
		const resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const { width } = entry.contentRect;
				if (width > 0) {
					chart.resize(width, height);
				}
			}
		});

		resizeObserver.observe(container);

		return () => {
			resizeObserver.disconnect();
			chart.remove();
			chartRef.current = null;
			candleSeriesRef.current = null;
			lineSeriesRefs.current = [];
		};
	}, [data, indicators, height, theme, reducedMotion]);

	return (
		<Box
			ref={containerRef}
			sx={{
				width: "100%",
				minHeight: height,
				borderRadius: 1,
				overflow: "hidden",
			}}
		/>
	);
}

export default AgentChart;
