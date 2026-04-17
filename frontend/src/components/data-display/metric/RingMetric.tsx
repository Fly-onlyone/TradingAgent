/**
 * Ring metric — percentage donut ring with centered value and subtitle.
 * Used for success-rate style stats where the ratio visualizes the whole.
 */

import { Box, Typography, useTheme } from "@mui/material";
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { MetricShell } from "./MetricShell";
import { getToneTokens, type MetricDensity, type MetricTone } from "./types";

interface RingMetricProps {
	label: string;
	/** Percentage 0-100. Null = no data yet. */
	percent: number | null;
	subtitle?: string;
	tone?: MetricTone;
	size?: number;
	loading?: boolean;
	density?: MetricDensity;
	/** Rich content replacing the subtitle text to the right of the ring. */
	rightContent?: ReactNode;
}

function ProgressRing({
	percent,
	size,
	toneMain,
	toneRgb,
	prefersReduced,
}: {
	percent: number;
	size: number;
	toneMain: string;
	toneRgb: string;
	prefersReduced: boolean;
}) {
	const stroke = Math.max(3, Math.round(size * 0.085));
	const r = (size - stroke) / 2;
	const cx = size / 2;
	const cy = size / 2;
	const circumference = 2 * Math.PI * r;
	const clamped = Math.max(0, Math.min(100, percent));
	const dashOffset = circumference * (1 - clamped / 100);

	return (
		<svg
			width={size}
			height={size}
			viewBox={`0 0 ${size} ${size}`}
			role="img"
			aria-label={`${Math.round(clamped)} percent`}
			style={{ display: "block" }}
		>
			<title>Ring</title>
			{/* Track */}
			<circle
				cx={cx}
				cy={cy}
				r={r}
				fill="none"
				stroke={`rgba(${toneRgb}, 0.16)`}
				strokeWidth={stroke}
			/>
			{/* Progress */}
			<motion.circle
				cx={cx}
				cy={cy}
				r={r}
				fill="none"
				stroke={toneMain}
				strokeWidth={stroke}
				strokeLinecap="round"
				strokeDasharray={circumference}
				initial={
					prefersReduced
						? { strokeDashoffset: dashOffset }
						: { strokeDashoffset: circumference }
				}
				animate={{ strokeDashoffset: dashOffset }}
				transition={{ duration: prefersReduced ? 0 : 1, ease: "easeOut" }}
				transform={`rotate(-90 ${cx} ${cy})`}
				style={{
					filter: `drop-shadow(0 0 6px rgba(${toneRgb}, 0.45))`,
				}}
			/>
		</svg>
	);
}

export function RingMetric({
	label,
	percent,
	subtitle,
	tone = "primary",
	size = 64,
	loading,
	density,
	rightContent,
}: RingMetricProps) {
	const theme = useTheme();
	const prefersReduced = useReducedMotion() ?? false;
	const { main: toneMain, rgb: toneRgb } = getToneTokens(theme, tone);
	const hasData = percent !== null;

	return (
		<MetricShell
			label={label}
			tone={tone}
			loading={loading}
			density={density}
			flashKey={percent ?? "none"}
		>
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					gap: 1.5,
					flex: 1,
					minWidth: 0,
				}}
			>
				<Box sx={{ position: "relative", flexShrink: 0 }}>
					{hasData ? (
						<ProgressRing
							percent={percent ?? 0}
							size={size}
							toneMain={toneMain}
							toneRgb={toneRgb}
							prefersReduced={prefersReduced}
						/>
					) : (
						<Box
							sx={{
								width: size,
								height: size,
								borderRadius: "50%",
								border: "2px dashed",
								borderColor: "divider",
							}}
						/>
					)}
					<Box
						sx={{
							position: "absolute",
							inset: 0,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							flexDirection: "column",
						}}
					>
						<Typography
							component="div"
							sx={{
								fontFamily: (t) => t.trading.mono,
								fontSize: "1rem",
								fontWeight: 700,
								lineHeight: 1,
								color: hasData ? toneMain : "text.disabled",
							}}
						>
							{hasData ? `${Math.round(percent ?? 0)}%` : "—"}
						</Typography>
					</Box>
				</Box>

				<Box sx={{ minWidth: 0, flex: 1 }}>
					{rightContent
						? rightContent
						: subtitle && (
								<Typography
									variant="caption"
									color="text.secondary"
									sx={{
										fontSize: "0.75rem",
										display: "block",
										lineHeight: 1.35,
									}}
								>
									{subtitle}
								</Typography>
							)}
				</Box>
			</Box>
		</MetricShell>
	);
}

export default RingMetric;
