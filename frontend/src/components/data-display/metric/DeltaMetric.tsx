/**
 * Value with prominent delta pill + optional sparkline baseline.
 */

import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import ArrowDropUpIcon from "@mui/icons-material/ArrowDropUp";
import { Box, Typography, useTheme } from "@mui/material";
import type { ReactNode } from "react";
import { Sparkline } from "@/components/effects/Sparkline";
import { MetricShell } from "./MetricShell";
import { getToneTokens, type MetricTone } from "./types";

interface DeltaMetricProps {
	label: string;
	value: string | number;
	icon?: ReactNode;
	/** Signed percentage. Drives tone and arrow direction. */
	change?: number;
	prefix?: string;
	suffix?: string;
	sparklineData?: number[];
	loading?: boolean;
	caption?: string;
}

export function DeltaMetric({
	label,
	value,
	icon,
	change,
	prefix,
	suffix,
	sparklineData,
	loading,
	caption,
}: DeltaMetricProps) {
	const theme = useTheme();

	const tone: MetricTone =
		change === undefined || change === 0
			? "primary"
			: change > 0
				? "success"
				: "error";
	const { main: toneMain, rgb: toneRgb } = getToneTokens(theme, tone);
	const ArrowIcon =
		change !== undefined && change >= 0 ? ArrowDropUpIcon : ArrowDropDownIcon;
	const hasSparkline = sparklineData && sparklineData.length >= 2;

	return (
		<MetricShell
			label={label}
			tone={tone}
			icon={icon}
			loading={loading}
			flashKey={typeof value === "number" ? value : String(value)}
			flashDirection={
				change === undefined || change === 0 ? null : change > 0 ? "up" : "down"
			}
		>
			<Box
				sx={{
					display: "flex",
					alignItems: "baseline",
					gap: 1,
					flexWrap: "wrap",
				}}
			>
				<Typography
					component="div"
					sx={{
						fontFamily: (t) => t.trading.mono,
						fontSize: "1.75rem",
						fontWeight: 700,
						lineHeight: 1.15,
						color:
							change !== undefined && change !== 0 ? toneMain : "text.primary",
					}}
				>
					{prefix}
					{value}
					{suffix}
				</Typography>
				{change !== undefined && (
					<Box
						sx={{
							display: "inline-flex",
							alignItems: "center",
							gap: 0.25,
							px: 0.5,
							py: 0.125,
							borderRadius: 999,
							bgcolor: `rgba(${toneRgb}, 0.16)`,
						}}
					>
						<ArrowIcon sx={{ fontSize: 14, color: toneMain }} />
						<Typography
							component="span"
							sx={{
								fontFamily: (t) => t.trading.mono,
								fontSize: "0.6875rem",
								fontWeight: 700,
								color: toneMain,
							}}
						>
							{`${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}
						</Typography>
					</Box>
				)}
			</Box>

			{(caption || hasSparkline) && (
				<Box sx={{ mt: "auto", pt: 0.75 }}>
					{hasSparkline ? (
						<Sparkline
							data={sparklineData}
							width={220}
							height={22}
							strokeColor={toneMain}
							fillColor={`rgba(${toneRgb}, 0.18)`}
						/>
					) : (
						caption && (
							<Typography
								variant="caption"
								color="text.disabled"
								sx={{ fontSize: "0.6875rem" }}
							>
								{caption}
							</Typography>
						)
					)}
				</Box>
			)}
		</MetricShell>
	);
}

export default DeltaMetric;
