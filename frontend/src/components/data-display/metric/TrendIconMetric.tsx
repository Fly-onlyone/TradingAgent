/**
 * Icon-led metric — large tone-colored icon block on the left + value + subtitle.
 * Optional `endSlot` renders on the right for richer secondary data.
 */

import { Box, Typography, useTheme } from "@mui/material";
import type { ReactNode } from "react";
import { MetricShell } from "./MetricShell";
import { getToneTokens, type MetricTone } from "./types";

interface TrendIconMetricProps {
	label: string;
	value: string | number;
	icon: ReactNode;
	tone?: MetricTone;
	subtitle?: string;
	kicker?: string;
	loading?: boolean;
	endSlot?: ReactNode;
}

export function TrendIconMetric({
	label,
	value,
	icon,
	tone = "primary",
	subtitle,
	kicker,
	loading,
	endSlot,
}: TrendIconMetricProps) {
	const theme = useTheme();
	const { main: toneMain, rgb: toneRgb } = getToneTokens(theme, tone);

	return (
		<MetricShell
			label={kicker ?? label}
			tone={tone}
			loading={loading}
			flashKey={typeof value === "number" ? value : String(value)}
		>
			<Box
				sx={{
					display: "flex",
					gap: 1.5,
					alignItems: "center",
					flex: 1,
					minWidth: 0,
				}}
			>
				<Box
					sx={{
						flexShrink: 0,
						width: 44,
						height: 44,
						borderRadius: 2,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						color: toneMain,
						bgcolor: `rgba(${toneRgb}, 0.14)`,
						border: `1px solid rgba(${toneRgb}, 0.3)`,
						"& svg": { fontSize: 22 },
					}}
				>
					{icon}
				</Box>
				<Box sx={{ minWidth: 0, flex: 1 }}>
					{kicker && (
						<Typography
							component="div"
							sx={{
								fontSize: "0.625rem",
								fontWeight: 500,
								letterSpacing: "0.08em",
								textTransform: "uppercase",
								color: "text.secondary",
								lineHeight: 1.2,
								mb: 0.25,
							}}
						>
							{label}
						</Typography>
					)}
					<Typography
						component="div"
						sx={{
							fontFamily: (t) => t.trading.mono,
							fontSize: "1.375rem",
							fontWeight: 700,
							lineHeight: 1.15,
							color: toneMain,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
						}}
					>
						{value}
					</Typography>
					{subtitle && !endSlot && (
						<Typography
							variant="caption"
							color="text.secondary"
							sx={{ fontSize: "0.6875rem", display: "block", mt: 0.25 }}
						>
							{subtitle}
						</Typography>
					)}
				</Box>
				{endSlot && (
					<Box
						sx={{
							flexShrink: 0,
							display: "flex",
							flexDirection: "column",
							alignItems: "flex-end",
							justifyContent: "center",
							gap: 0.25,
						}}
					>
						{endSlot}
					</Box>
				)}
			</Box>
		</MetricShell>
	);
}

export default TrendIconMetric;
