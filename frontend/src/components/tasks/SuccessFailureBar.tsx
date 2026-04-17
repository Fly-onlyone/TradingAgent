import { Box, Tooltip, useTheme } from "@mui/material";
import { motion, useReducedMotion } from "framer-motion";

interface SuccessFailureBarProps {
	success: number;
	failure: number;
	total: number;
}

const MAX_SEGMENTS = 20;

export function SuccessFailureBar({
	success,
	failure,
	total,
}: SuccessFailureBarProps) {
	const theme = useTheme();
	const prefersReduced = useReducedMotion() ?? false;

	const bullish = theme.trading.colors.bullish;
	const bearish = theme.trading.colors.bearish;
	const bullishRgb = theme.trading.colors.bullishRgb;
	const bearishRgb = theme.trading.colors.bearishRgb;

	if (total === 0) {
		return (
			<Box
				aria-label="No runs yet"
				sx={{
					flex: 1,
					height: 4,
					borderRadius: 999,
					bgcolor: "action.hover",
					opacity: 0.35,
				}}
			/>
		);
	}

	const displayTotal = Math.min(total, MAX_SEGMENTS);
	const successSegments = Math.round((success / total) * displayTotal);
	const failureSegments = Math.max(0, displayTotal - successSegments);

	const segments: Array<{ id: string; kind: "s" | "f" }> = [];
	for (let i = 0; i < successSegments; i++)
		segments.push({ id: `s-${i}`, kind: "s" });
	for (let i = 0; i < failureSegments; i++)
		segments.push({ id: `f-${i}`, kind: "f" });

	return (
		<Tooltip
			title={`${success} succeeded · ${failure} failed${
				total > MAX_SEGMENTS ? ` (of ${total} runs)` : ""
			}`}
			arrow
		>
			<Box
				aria-label={`${success} successful, ${failure} failed`}
				sx={{
					flex: 1,
					display: "flex",
					gap: 0.375,
					alignItems: "center",
					minHeight: 4,
				}}
			>
				{segments.map((seg, idx) => {
					const isSuccess = seg.kind === "s";
					const color = isSuccess ? bullish : bearish;
					const glowRgb = isSuccess ? bullishRgb : bearishRgb;
					return (
						<motion.span
							key={seg.id}
							initial={prefersReduced ? undefined : { scaleY: 0.2, opacity: 0 }}
							animate={{ scaleY: 1, opacity: 1 }}
							transition={{
								delay: prefersReduced ? 0 : idx * 0.02,
								duration: prefersReduced ? 0 : 0.25,
								ease: "easeOut",
							}}
							style={{
								display: "block",
								flex: 1,
								height: 4,
								borderRadius: 2,
								background: color,
								boxShadow: `0 0 4px rgba(${glowRgb}, 0.45)`,
								transformOrigin: "center",
							}}
						/>
					);
				})}
			</Box>
		</Tooltip>
	);
}

export default SuccessFailureBar;
