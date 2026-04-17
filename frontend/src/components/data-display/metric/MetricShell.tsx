/**
 * Shared chrome for every metric variant — accent strip, corner glow, icon badge.
 */

import { Box, Card, Typography, useTheme } from "@mui/material";
import { motion, useReducedMotion } from "framer-motion";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import { getToneTokens, type MetricDensity, type MetricTone } from "./types";

interface MetricShellProps {
	label: string;
	tone?: MetricTone;
	icon?: ReactNode;
	topRightSlot?: ReactNode;
	children: ReactNode;
	loading?: boolean;
	density?: MetricDensity;
	/** When this value changes, the card briefly flashes tone-colored. */
	flashKey?: string | number;
	flashDirection?: "up" | "down" | null;
}

export function MetricShell({
	label,
	tone = "primary",
	icon,
	topRightSlot,
	children,
	loading = false,
	density = "default",
	flashKey,
	flashDirection,
}: MetricShellProps) {
	const theme = useTheme();
	const prefersReduced = useReducedMotion();
	const { rgb: toneRgb, main: toneMain } = getToneTokens(theme, tone);

	const prevFlashRef = useRef(flashKey);
	const [flashTick, setFlashTick] = useState(0);
	useEffect(() => {
		if (flashKey !== undefined && flashKey !== prevFlashRef.current) {
			prevFlashRef.current = flashKey;
			setFlashTick((t) => t + 1);
		}
	}, [flashKey]);

	const bullishRgb = theme.trading.colors.bullishRgb;
	const bearishRgb = theme.trading.colors.bearishRgb;
	const flashRgb =
		flashDirection === "up"
			? bullishRgb
			: flashDirection === "down"
				? bearishRgb
				: toneRgb;

	const padding = density === "compact" ? 1.5 : 2;
	const minHeight = density === "compact" ? 96 : 120;

	return (
		<Card
			component={motion.div}
			animate={
				flashTick > 0 && !prefersReduced
					? {
							backgroundColor: [
								`rgba(${flashRgb}, 0)`,
								`rgba(${flashRgb}, 0.12)`,
								`rgba(${flashRgb}, 0)`,
							],
							transition: { duration: 0.6 },
						}
					: undefined
			}
			sx={{
				position: "relative",
				height: "100%",
				minHeight,
				overflow: "hidden",
				backdropFilter: "blur(12px)",
				transition: prefersReduced
					? undefined
					: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
				"&:hover": prefersReduced
					? undefined
					: {
							transform: "translateY(-2px)",
							borderColor: `rgba(${toneRgb}, 0.35)`,
							boxShadow: `0 12px 32px rgba(0, 0, 0, 0.35), 0 0 24px rgba(${toneRgb}, 0.18)`,
						},
			}}
		>
			{/* Left accent strip (2px gradient) */}
			<Box
				aria-hidden
				sx={{
					position: "absolute",
					top: 0,
					left: 0,
					width: 2,
					height: "100%",
					background: `linear-gradient(180deg, rgba(${toneRgb}, 0.85) 0%, rgba(${toneRgb}, 0.1) 100%)`,
					pointerEvents: "none",
				}}
			/>

			{/* Top inner highlight */}
			<Box
				aria-hidden
				sx={{
					position: "absolute",
					top: 0,
					left: 0,
					right: 0,
					height: 1,
					background: "rgba(255, 255, 255, 0.05)",
					pointerEvents: "none",
				}}
			/>

			{/* Asymmetric corner glow (top-right only) */}
			<Box
				aria-hidden
				sx={{
					position: "absolute",
					top: -80,
					right: -80,
					width: 220,
					height: 220,
					borderRadius: "50%",
					background: `radial-gradient(circle, rgba(${toneRgb}, 0.22) 0%, rgba(${toneRgb}, 0) 65%)`,
					filter: "blur(10px)",
					pointerEvents: "none",
				}}
			/>

			<Box
				sx={{
					position: "relative",
					height: "100%",
					display: "flex",
					flexDirection: "column",
					p: padding,
					pl: padding + 0.25,
				}}
			>
				{/* Header row: label + icon/badge */}
				<Box
					sx={{
						display: "flex",
						alignItems: "flex-start",
						justifyContent: "space-between",
						mb: 1,
						gap: 1,
					}}
				>
					<Typography
						variant="caption"
						sx={{
							fontSize: "0.6875rem",
							fontWeight: 500,
							letterSpacing: "0.08em",
							textTransform: "uppercase",
							color: "text.secondary",
							lineHeight: 1.2,
						}}
					>
						{label}
					</Typography>
					{topRightSlot ??
						(icon && (
							<Box
								sx={{
									flexShrink: 0,
									width: 28,
									height: 28,
									borderRadius: 1.5,
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									color: toneMain,
									bgcolor: `rgba(${toneRgb}, 0.14)`,
									border: `1px solid rgba(${toneRgb}, 0.3)`,
									"& svg": { fontSize: 16 },
								}}
							>
								{icon}
							</Box>
						))}
				</Box>

				{/* Body */}
				<Box
					sx={{
						flex: 1,
						display: "flex",
						flexDirection: "column",
						justifyContent: "center",
						minHeight: 0,
					}}
				>
					{loading ? (
						<Box
							sx={{ flex: 1, display: "flex", flexDirection: "column", gap: 1 }}
						>
							<ShimmerSkeleton variant="text" width="70%" height={28} />
							<ShimmerSkeleton variant="text" width="40%" height={16} />
						</Box>
					) : (
						children
					)}
				</Box>
			</Box>
		</Card>
	);
}

export default MetricShell;
