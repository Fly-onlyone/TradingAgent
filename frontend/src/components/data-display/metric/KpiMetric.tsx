/**
 * Hero KPI — scalar number, optional rolling digits, optional delta footer.
 */

import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import ArrowDropUpIcon from "@mui/icons-material/ArrowDropUp";
import { Box, Chip, Typography, useTheme } from "@mui/material";
import type { ReactNode } from "react";
import { RollingDigits } from "@/components/effects/RollingDigits";
import { MetricShell } from "./MetricShell";
import { getToneTokens, type MetricDensity, type MetricTone } from "./types";

interface KpiMetricProps {
	label: string;
	value: string | number;
	tone?: MetricTone;
	icon?: ReactNode;
	prefix?: string;
	suffix?: string;
	loading?: boolean;
	rolling?: boolean;
	density?: MetricDensity;
	/** Relative change (%) rendered as a compact pill below the value. */
	change?: number;
	changeCaption?: string;
	footer?: ReactNode;
}

export function KpiMetric({
	label,
	value,
	tone = "primary",
	icon,
	prefix,
	suffix,
	loading,
	rolling = false,
	density,
	change,
	changeCaption,
	footer,
}: KpiMetricProps) {
	const theme = useTheme();
	const changeTone: MetricTone | undefined =
		change === undefined || change === 0
			? undefined
			: change > 0
				? "success"
				: "error";
	const changeColor = changeTone
		? getToneTokens(theme, changeTone).main
		: theme.palette.text.secondary;
	const ChangeArrow =
		change !== undefined && change > 0
			? ArrowDropUpIcon
			: change !== undefined && change < 0
				? ArrowDropDownIcon
				: null;

	return (
		<MetricShell
			label={label}
			tone={tone}
			icon={icon}
			loading={loading}
			density={density}
			flashKey={typeof value === "number" ? value : String(value)}
		>
			<Typography
				component="div"
				sx={{
					fontFamily: (t) => t.trading.mono,
					fontSize: "1.75rem",
					fontWeight: 700,
					lineHeight: 1.15,
					color: "text.primary",
				}}
			>
				{rolling && typeof value === "string" ? (
					<>
						{prefix}
						<RollingDigits value={value} fontSize={28} fontWeight={700} />
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

			{(change !== undefined || changeCaption || footer) && (
				<Box
					sx={{
						display: "flex",
						alignItems: "center",
						gap: 1,
						mt: 1.25,
						minHeight: change !== undefined || changeCaption ? 20 : 4,
					}}
				>
					{change !== undefined && ChangeArrow && (
						<Chip
							size="small"
							icon={<ChangeArrow sx={{ color: `${changeColor} !important` }} />}
							label={`${change > 0 ? "+" : ""}${change.toFixed(2)}%`}
							sx={{
								height: 20,
								borderRadius: 1,
								fontFamily: (t) => t.trading.mono,
								fontSize: "0.6875rem",
								fontWeight: 600,
								color: changeColor,
								bgcolor: (t) =>
									changeTone
										? `rgba(${getToneTokens(t, changeTone).rgb}, 0.14)`
										: "transparent",
								"& .MuiChip-icon": { ml: 0.25, mr: -0.5, fontSize: 16 },
								"& .MuiChip-label": { px: 0.75 },
							}}
						/>
					)}
					{changeCaption && (
						<Typography
							variant="caption"
							color="text.disabled"
							sx={{ fontSize: "0.6875rem" }}
						>
							{changeCaption}
						</Typography>
					)}
					{footer}
				</Box>
			)}
		</MetricShell>
	);
}

export default KpiMetric;
