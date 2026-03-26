/**
 * Stat Card Component for displaying metrics
 */

import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { ShimmerSkeleton } from "@/components/common/ShimmerSkeleton";
import { RollingDigits } from "@/components/effects/RollingDigits";
import { Sparkline } from "@/components/effects/Sparkline";
import { useTilt } from "@/hooks/useTilt";
import { useThemePreset } from "@/lib/theme";
import { cn } from "@/lib/utils";

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
	const preset = useThemePreset();
	const primaryRgb = preset.primaryRgb;

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
				typeof prevValueRef.current === "number"
					? prevValueRef.current
					: 0;
			const curr = typeof value === "number" ? value : 0;
			setFlashTrend(curr >= prev ? "up" : "down");
			setFlashKey((k) => k + 1);
			prevValueRef.current = value;
		}
	}, [value, loading]);

	const bullishRgb = preset.trading.bullishRgb;
	const bearishRgb = preset.trading.bearishRgb;
	const flashColors =
		flashTrend === "up"
			? {
					backgroundColor: [
						`rgba(${bullishRgb},0)`,
						`rgba(${bullishRgb},0.2)`,
						`rgba(${bullishRgb},0)`,
					],
					transition: { duration: 0.7 },
				}
			: {
					backgroundColor: [
						`rgba(${bearishRgb},0)`,
						`rgba(${bearishRgb},0.2)`,
						`rgba(${bearishRgb},0)`,
					],
					transition: { duration: 0.7 },
				};

	const trendColors = {
		up: "text-trading-bullish",
		down: "text-trading-bearish",
		neutral: "text-muted-foreground",
	};

	const TrendIcon =
		effectiveTrend === "up"
			? TrendingUp
			: effectiveTrend === "down"
				? TrendingDown
				: Minus;

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
			style={{
				height: "100%",
				...(prefersReduced ? undefined : tiltStyle),
			}}
			onMouseMove={prefersReduced ? undefined : onTiltMove}
			onMouseLeave={prefersReduced ? undefined : onTiltLeave}
		>
			<motion.div
				data-slot="card"
				key={flashKey || undefined}
				animate={flashKey > 0 ? flashColors : undefined}
				className={cn(
					"group/card flex h-full flex-col gap-4 overflow-hidden rounded-xl bg-card py-4 text-sm text-card-foreground ring-1 ring-foreground/10",
					"backdrop-blur-[12px] transition-[border-color,box-shadow] duration-200",
				)}
				style={{
					borderLeft: `2px solid var(--primary)`,
				}}
				onMouseEnter={(e) => {
					const el = e.currentTarget;
					el.style.borderColor = `rgba(${primaryRgb},0.7)`;
					el.style.borderLeftColor = `var(--primary)`;
					el.style.boxShadow = `0 0 0 2px rgba(${primaryRgb},0.3), 0 0 20px rgba(${primaryRgb},0.2)`;
				}}
				onMouseLeave={(e) => {
					const el = e.currentTarget;
					el.style.borderColor = "";
					el.style.borderLeftColor = "";
					el.style.boxShadow = "";
				}}
			>
				<div data-slot="card-content" className="px-4">
					<div className="mb-4 flex items-start justify-between">
							<span className="text-sm font-medium text-muted-foreground">
								{title}
							</span>
							{icon && (
								<motion.div
									animate={
										effectiveTrend === "up" ||
										effectiveTrend === "down"
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
									<div
										className={cn(
											"flex size-10 items-center justify-center rounded-full text-primary-foreground [&_svg]:size-5",
										)}
										style={{
											background:
												effectiveTrend === "up"
													? `linear-gradient(135deg, ${preset.semantics.success.main}, ${preset.semantics.success.light})`
													: effectiveTrend === "down"
														? `linear-gradient(135deg, ${preset.semantics.error.main}, ${preset.semantics.error.light})`
														: `linear-gradient(135deg, ${preset.primary.main}, ${preset.primary.light})`,
										}}
									>
										{icon}
									</div>
								</motion.div>
							)}
						</div>

						{loading ? (
							<>
								<ShimmerSkeleton
									variant="text"
									width="60%"
									height={40}
								/>
								<ShimmerSkeleton
									variant="text"
									width="40%"
									height={24}
								/>
							</>
						) : (
							<>
								<div
									className="mb-2 text-2xl font-bold"
									style={{
										fontFamily: "var(--font-mono)",
									}}
								>
									{useRolling &&
									typeof value === "string" ? (
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
								</div>

								{sparklineData &&
									sparklineData.length >= 2 && (
										<div className="mb-2">
											<Sparkline
												data={sparklineData}
												strokeColor={
													effectiveTrend === "up"
														? preset.semantics
																.success.main
														: effectiveTrend ===
															  "down"
															? preset.semantics
																	.error.main
															: preset.primary
																	.main
												}
											/>
										</div>
									)}

								{(change !== undefined || changeLabel) && (
									<div className="flex items-center gap-1">
										{effectiveTrend && (
											<TrendIcon
												className={cn(
													"size-[18px]",
													trendColors[
														effectiveTrend
													],
												)}
											/>
										)}
										{change !== undefined && (
											<span
												className={cn(
													"text-sm font-medium",
													trendColors[
														effectiveTrend ||
															"neutral"
													],
												)}
											>
												{change > 0 ? "+" : ""}
												{change.toFixed(2)}%
											</span>
										)}
										{changeLabel && (
											<span className="text-sm text-muted-foreground">
												{changeLabel}
											</span>
										)}
									</div>
								)}
							</>
						)}
				</div>
			</motion.div>
		</motion.div>
	);
}

export default StatCard;
