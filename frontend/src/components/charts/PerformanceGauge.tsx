/**
 * Performance Gauge Component
 */

import { Box, CircularProgress, Typography } from "@mui/material";

interface PerformanceGaugeProps {
	value: number; // 0-100
	label: string;
	size?: number;
	thickness?: number;
	showValue?: boolean;
	colorScale?: "default" | "inverted";
}

export function PerformanceGauge({
	value,
	label,
	size = 120,
	thickness = 4,
	showValue = true,
	colorScale = "default",
}: PerformanceGaugeProps) {
	// Clamp value between 0 and 100
	const clampedValue = Math.min(100, Math.max(0, value));

	// Determine color based on value
	const getColor = () => {
		const effectiveValue =
			colorScale === "inverted" ? 100 - clampedValue : clampedValue;

		if (effectiveValue >= 70) return "success.main";
		if (effectiveValue >= 40) return "warning.main";
		return "error.main";
	};

	return (
		<Box
			sx={{
				position: "relative",
				display: "inline-flex",
				flexDirection: "column",
				alignItems: "center",
			}}
		>
			<Box sx={{ position: "relative", display: "inline-flex" }}>
				{/* Background circle */}
				<CircularProgress
					variant="determinate"
					value={100}
					size={size}
					thickness={thickness}
					sx={{
						color: (theme) => theme.trading.colors.grid,
					}}
				/>
				{/* Value circle */}
				<CircularProgress
					variant="determinate"
					value={clampedValue}
					size={size}
					thickness={thickness}
					sx={{
						color: getColor(),
						position: "absolute",
						left: 0,
						"& .MuiCircularProgress-circle": {
							strokeLinecap: "round",
						},
					}}
				/>
				{/* Center content */}
				<Box
					sx={{
						top: 0,
						left: 0,
						bottom: 0,
						right: 0,
						position: "absolute",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					{showValue && (
						<Typography
							variant="h5"
							component="div"
							fontWeight={700}
							sx={{
								fontFamily: (theme) => theme.trading.mono,
							}}
						>
							{clampedValue.toFixed(0)}%
						</Typography>
					)}
				</Box>
			</Box>
			<Typography
				variant="caption"
				color="text.secondary"
				sx={{ mt: 1, textAlign: "center" }}
			>
				{label}
			</Typography>
		</Box>
	);
}

export default PerformanceGauge;
