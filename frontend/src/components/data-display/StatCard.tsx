/**
 * Stat Card Component for displaying metrics
 */

import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingFlatIcon from "@mui/icons-material/TrendingFlat";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import { Box, Card, CardContent, Typography } from "@mui/material";
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import { RollingDigits } from "@/components/effects/RollingDigits";
import { Sparkline } from "@/components/effects/Sparkline";
import { useTilt } from "@/hooks/useTilt";
import { glowEffects } from "@/theme/shadows";
import { staggerCascade } from "@/utils/animations/variants";

interface StatCardProps {
	title: string;
	value: string | number;
	change?: number;
	changeLabel?: string;
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
	icon,
	loading = false,
	trend,
	prefix,
	suffix,
	sparklineData,
	useRolling = false,
}: StatCardProps) {
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

	const flashColors =
		flashTrend === "up"
			? {
					backgroundColor: [
						"rgba(16,185,129,0)",
						"rgba(16,185,129,0.2)",
						"rgba(16,185,129,0)",
					],
					transition: { duration: 0.7 },
				}
			: {
					backgroundColor: [
						"rgba(239,68,68,0)",
						"rgba(239,68,68,0.2)",
						"rgba(239,68,68,0)",
					],
					transition: { duration: 0.7 },
				};

	const trendColors = {
		up: "success.main",
		down: "error.main",
		neutral: "text.secondary",
	};

	const TrendIcon =
		effectiveTrend === "up"
			? TrendingUpIcon
			: effectiveTrend === "down"
				? TrendingDownIcon
				: TrendingFlatIcon;

	const cardAccent = {
		up: {
			borderColor: "rgba(16,185,129,0.25)",
			leftColor: "#10B981",
			hoverBorder: "rgba(16,185,129,0.6)",
			hoverGlow: `0 0 0 1px rgba(16,185,129,0.35), ${glowEffects.success}`,
		},
		down: {
			borderColor: "rgba(239,68,68,0.25)",
			leftColor: "#EF4444",
			hoverBorder: "rgba(239,68,68,0.6)",
			hoverGlow: `0 0 0 1px rgba(239,68,68,0.35), ${glowEffects.error}`,
		},
		neutral: {
			borderColor: "rgba(249,115,22,0.2)",
			leftColor: "#F97316",
			hoverBorder: "rgba(249,115,22,0.7)",
			hoverGlow: `0 0 0 1px rgba(249,115,22,0.4), ${glowEffects.primary}`,
		},
	};

	const accent = cardAccent[effectiveTrend ?? "neutral"];
	const tiltRef = useRef<HTMLDivElement>(null);
	const prefersReduced = useReducedMotion();
	const {
		style: tiltStyle,
		onMouseMove: onTiltMove,
		onMouseLeave: onTiltLeave,
	} = useTilt(tiltRef);

	return (
		<motion.div
			ref={tiltRef}
			style={prefersReduced ? undefined : tiltStyle}
			onMouseMove={prefersReduced ? undefined : onTiltMove}
			onMouseLeave={prefersReduced ? undefined : onTiltLeave}
		>
			<Card
				component={motion.div}
				variants={staggerCascade.item}
				key={flashKey || undefined}
				animate={flashKey > 0 ? flashColors : undefined}
				sx={{
					height: "100%",
					background: (theme) => theme.trading.glass.card.background,
					backdropFilter: "blur(12px)",
					border: `1px solid ${accent.borderColor}`,
					borderLeft: `3px solid ${accent.leftColor}`,
					transition: "border-color 0.2s ease, box-shadow 0.2s ease",
					"&:hover": {
						borderColor: accent.hoverBorder,
						boxShadow: accent.hoverGlow,
					},
				}}
			>
				<CardContent>
					<Box
						sx={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "flex-start",
							mb: 2,
						}}
					>
						<Typography variant="body2" color="text.secondary" fontWeight={500}>
							{title}
						</Typography>
						{icon && (
							<motion.div
								animate={
									effectiveTrend === "up" || effectiveTrend === "down"
										? {
												scale: [1, 1.1, 1],
												transition: {
													duration: 2.5,
													repeat: Infinity,
													ease: "easeInOut",
												},
											}
										: undefined
								}
							>
								<Box
									sx={{
										color: "primary.contrastText",
										width: 40,
										height: 40,
										borderRadius: "50%",
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										background:
											effectiveTrend === "up"
												? "linear-gradient(135deg, #10B981, #34D399)"
												: effectiveTrend === "down"
													? "linear-gradient(135deg, #EF4444, #F87171)"
													: "linear-gradient(135deg, #F97316, #FB923C)",
										"& svg": { fontSize: 20 },
									}}
								>
									{icon}
								</Box>
							</motion.div>
						)}
					</Box>

					{loading ? (
						<>
							<ShimmerSkeleton variant="text" width="60%" height={40} />
							<ShimmerSkeleton variant="text" width="40%" height={24} />
						</>
					) : (
						<>
							<Typography
								variant="h4"
								fontWeight={700}
								component="div"
								sx={{
									fontFamily: (theme) => theme.trading.mono,
									mb: 1,
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

							{sparklineData && sparklineData.length >= 2 && (
								<Box sx={{ mb: 1 }}>
									<Sparkline
										data={sparklineData}
										strokeColor={
											effectiveTrend === "up"
												? "#10B981"
												: effectiveTrend === "down"
													? "#EF4444"
													: "#F97316"
										}
									/>
								</Box>
							)}

							{(change !== undefined || changeLabel) && (
								<Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
									{effectiveTrend && (
										<TrendIcon
											sx={{
												fontSize: 18,
												color: trendColors[effectiveTrend],
											}}
										/>
									)}
									{change !== undefined && (
										<Typography
											variant="body2"
											sx={{
												color: trendColors[effectiveTrend || "neutral"],
												fontWeight: 500,
											}}
										>
											{change > 0 ? "+" : ""}
											{change.toFixed(2)}%
										</Typography>
									)}
									{changeLabel && (
										<Typography variant="body2" color="text.secondary">
											{changeLabel}
										</Typography>
									)}
								</Box>
							)}
						</>
					)}
				</CardContent>
			</Card>
		</motion.div>
	);
}

export default StatCard;
