/**
 * Symbol chip cloud with an optional direction icon and graceful empty state.
 */

import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import TrendingFlatIcon from "@mui/icons-material/TrendingFlat";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import { Box, Typography, useTheme } from "@mui/material";
import type { ReactNode } from "react";
import { MetricShell } from "./MetricShell";
import { getToneTokens, type MetricTone } from "./types";

interface AssetListMetricProps {
	label: string;
	assets: string[];
	direction?: "up" | "down" | "flat";
	loading?: boolean;
	/** When assets is empty, show this instead of the chip row. */
	emptyLabel?: string;
	emptyHint?: string;
	maxVisible?: number;
	icon?: ReactNode;
}

export function AssetListMetric({
	label,
	assets,
	direction = "flat",
	loading,
	emptyLabel = "No signal yet",
	emptyHint,
	maxVisible = 6,
	icon,
}: AssetListMetricProps) {
	const theme = useTheme();
	const tone: MetricTone =
		direction === "up" ? "success" : direction === "down" ? "error" : "neutral";
	const { main: toneMain, rgb: toneRgb } = getToneTokens(theme, tone);
	const DirIcon =
		direction === "up"
			? TrendingUpIcon
			: direction === "down"
				? TrendingDownIcon
				: TrendingFlatIcon;

	const visible = assets.slice(0, maxVisible);
	const overflow = Math.max(0, assets.length - visible.length);
	const hasAssets = assets.length > 0;

	return (
		<MetricShell
			label={label}
			tone={tone}
			icon={icon ?? <DirIcon />}
			loading={loading}
		>
			{hasAssets ? (
				<>
					<Box sx={{ display: "flex", alignItems: "baseline", gap: 1 }}>
						<Typography
							component="span"
							sx={{
								fontFamily: (t) => t.trading.mono,
								fontSize: "1.75rem",
								fontWeight: 700,
								color: toneMain,
								lineHeight: 1,
							}}
						>
							{assets.length}
						</Typography>
						<Typography variant="body2" color="text.secondary">
							{direction === "up"
								? "trending up"
								: direction === "down"
									? "trending down"
									: "assets"}
						</Typography>
					</Box>

					<Box
						sx={{
							mt: 1.25,
							display: "flex",
							flexWrap: "wrap",
							gap: 0.75,
						}}
					>
						{visible.map((symbol) => (
							<Box
								key={symbol}
								sx={{
									display: "inline-flex",
									alignItems: "center",
									gap: 0.5,
									px: 1,
									py: 0.375,
									borderRadius: 999,
									bgcolor: `rgba(${toneRgb}, 0.12)`,
									border: `1px solid rgba(${toneRgb}, 0.3)`,
								}}
							>
								<Box
									sx={{
										width: 4,
										height: 4,
										borderRadius: "50%",
										bgcolor: toneMain,
									}}
								/>
								<Typography
									sx={{
										fontFamily: (t) => t.trading.mono,
										fontSize: "0.6875rem",
										fontWeight: 600,
										color: "text.primary",
									}}
								>
									{symbol}
								</Typography>
							</Box>
						))}
						{overflow > 0 && (
							<Box
								sx={{
									display: "inline-flex",
									alignItems: "center",
									px: 1,
									py: 0.375,
									borderRadius: 999,
									bgcolor: "rgba(255, 255, 255, 0.04)",
								}}
							>
								<Typography
									sx={{
										fontFamily: (t) => t.trading.mono,
										fontSize: "0.6875rem",
										color: "text.secondary",
									}}
								>
									+{overflow}
								</Typography>
							</Box>
						)}
					</Box>
				</>
			) : (
				<Box
					sx={{
						flex: 1,
						display: "flex",
						flexDirection: "column",
						justifyContent: "center",
						gap: 0.5,
					}}
				>
					<Typography
						sx={{
							fontFamily: (t) => t.trading.mono,
							fontSize: "1.125rem",
							fontWeight: 600,
							color: "text.disabled",
						}}
					>
						{emptyLabel}
					</Typography>
					{emptyHint && (
						<Typography
							variant="caption"
							color="text.disabled"
							sx={{ fontSize: "0.6875rem" }}
						>
							{emptyHint}
						</Typography>
					)}
				</Box>
			)}
		</MetricShell>
	);
}

export default AssetListMetric;
