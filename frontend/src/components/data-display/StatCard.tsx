/**
 * Compact metric tile — value-first design with optional sparkline and change badge.
 */

import {
	Box,
	Card,
	CardContent,
	Chip,
	Typography,
	useTheme,
} from "@mui/material";
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import { RollingDigits } from "@/components/effects/RollingDigits";
import { Sparkline } from "@/components/effects/Sparkline";

interface StatCardProps {
	title: string;
	value: string | number;
	change?: number;
	changeLabel?: string;
	/** @deprecated No longer rendered — kept for backward compatibility */
	icon?: ReactNode;
	loading?: boolean;
	trend?: "up" | "down" | "neutral";
	prefix?: string;
	suffix?: string;
	sparklineData?: number[];
	useRolling?: boolean;
}

export function StatCard({
	title,
	value,
	change,
	changeLabel,
	loading = false,
	trend,
	prefix,
	suffix,
	sparklineData,
	useRolling = false,
}: StatCardProps) {
	const theme = useTheme();
	const primaryRgb = theme.trading.primaryRgb;
	const prefersReduced = useReducedMotion();

	// Determine trend from change if not provided
	const effectiveTrend =
		trend ||
		(change !== undefined
			? change > 0
				? "up"
				: change < 0
					? "down"
					: "neutral"
			: undefined);

	// Track value changes for flash animation
	const prevValueRef = useRef(value);
	const [flashKey, setFlashKey] = useState(0);
	const [flashTrend, setFlashTrend] = useState<"up" | "down" | null>(null);

	useEffect(() => {
		if (prevValueRef.current !== value && !loading) {
			const prev =
				typeof prevValueRef.current === "number" ? prevValueRef.current : 0;
			const curr = typeof value === "number" ? value : 0;
			setFlashTrend(curr >= prev ? "up" : "down");
			setFlashKey((k) => k + 1);
			prevValueRef.current = value;
		}
	}, [value, loading]);

	const bullishRgb = theme.trading.colors.bullishRgb;
	const bearishRgb = theme.trading.colors.bearishRgb;
	const flashColors =
		flashTrend === "up"
			? {
					backgroundColor: [
						`rgba(${bullishRgb},0)`,
						`rgba(${bullishRgb},0.15)`,
						`rgba(${bullishRgb},0)`,
					],
					transition: { duration: 0.7 },
				}
			: {
					backgroundColor: [
						`rgba(${bearishRgb},0)`,
						`rgba(${bearishRgb},0.15)`,
						`rgba(${bearishRgb},0)`,
					],
					transition: { duration: 0.7 },
				};

	const hasSparkline = sparklineData && sparklineData.length >= 2;
	const hasChange = change !== undefined;

	const sparklineColor =
		effectiveTrend === "up"
			? theme.palette.success.main
			: effectiveTrend === "down"
				? theme.palette.error.main
				: theme.palette.primary.main;

	const changeColor =
		effectiveTrend === "up"
			? "success"
			: effectiveTrend === "down"
				? "error"
				: "default";

	const changeArrow =
		effectiveTrend === "up"
			? "\u25B2"
			: effectiveTrend === "down"
				? "\u25BC"
				: "";

	return (
		<Card
			component={motion.div}
			key={flashKey || undefined}
			animate={flashKey > 0 ? flashColors : undefined}
			sx={{
				height: "100%",
				minHeight: 156,
				backdropFilter: "blur(12px)",
				transition: prefersReduced
					? undefined
					: "transform 0.2s ease, box-shadow 0.2s ease",
				"&:hover": prefersReduced
					? undefined
					: {
							transform: "scale(1.02)",
							boxShadow: `0 0 0 1px rgba(${primaryRgb},0.2), 0 4px 20px rgba(${primaryRgb},0.1)`,
						},
			}}
		>
			<CardContent
				sx={{
					height: "100%",
					display: "flex",
					flexDirection: "column",
					p: 2,
					"&:last-child": { pb: 2 },
				}}
			>
				{/* Title */}
				<Typography
					variant="caption"
					color="text.secondary"
					sx={{
						fontWeight: 500,
						letterSpacing: "0.02em",
						lineHeight: 1,
						mb: 1,
					}}
				>
					{title}
				</Typography>

				{/* Value (hero) */}
				{loading ? (
					<Box sx={{ flex: 1 }}>
						<ShimmerSkeleton variant="text" width="70%" height={36} />
						<ShimmerSkeleton
							variant="text"
							width="40%"
							height={20}
							sx={{ mt: 1 }}
						/>
					</Box>
				) : (
					<>
						<Typography
							variant="h5"
							fontWeight={700}
							component="div"
							sx={{
								fontFamily: (t) => t.trading.mono,
								fontSize: "1.6rem",
								lineHeight: 1.2,
								mb: "auto",
							}}
						>
							{useRolling && typeof value === "string" ? (
								<>
									{prefix}
									<RollingDigits value={value} />
									{suffix}
								</>
							) : (
								<>
									{prefix}
									{value}
									{suffix}
								</>
							)}
						</Typography>

						{/* Bottom area: sparkline left, change badge right */}
						<Box
							sx={{
								display: "flex",
								alignItems: "flex-end",
								justifyContent: "space-between",
								mt: 1.5,
								minHeight: 32,
							}}
						>
							{/* Sparkline */}
							<Box sx={{ flex: 1, mr: hasChange ? 1 : 0 }}>
								{hasSparkline && (
									<Sparkline
										data={sparklineData}
										width={140}
										height={28}
										strokeColor={sparklineColor}
									/>
								)}
							</Box>

							{/* Change badge */}
							{hasChange && (
								<Chip
									label={`${changeArrow}${changeArrow ? " " : ""}${change > 0 ? "+" : ""}${change.toFixed(2)}%`}
									size="small"
									color={changeColor}
									variant="outlined"
									sx={{
										fontWeight: 600,
										fontSize: "0.7rem",
										height: 22,
										flexShrink: 0,
										"& .MuiChip-label": {
											px: 0.75,
										},
									}}
								/>
							)}

							{/* Change label without numeric change */}
							{!hasChange && changeLabel && (
								<Typography
									variant="caption"
									color="text.secondary"
									sx={{ flexShrink: 0 }}
								>
									{changeLabel}
								</Typography>
							)}
						</Box>
					</>
				)}
			</CardContent>
		</Card>
	);
}

export default StatCard;
