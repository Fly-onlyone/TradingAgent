/**
 * Compact calendar-card tile for the right side of time-based metrics.
 * Top band: month (tone-colored). Center: day number. Bottom: time.
 */

import { Box, Typography, useTheme } from "@mui/material";
import { getToneTokens, type MetricTone } from "./types";

interface CalendarTileProps {
	date: Date;
	tone?: MetricTone;
	width?: number;
}

export function CalendarTile({
	date,
	tone = "primary",
	width = 92,
}: CalendarTileProps) {
	const theme = useTheme();
	const { main, rgb } = getToneTokens(theme, tone);

	const month = date
		.toLocaleDateString(undefined, { month: "short" })
		.toUpperCase();
	const day = date.getDate();
	const time = date.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});

	return (
		<Box
			sx={{
				display: "flex",
				flexDirection: "column",
				alignItems: "stretch",
				flexShrink: 0,
				width,
				borderRadius: 1,
				overflow: "hidden",
				border: `1px solid rgba(${rgb}, 0.38)`,
				bgcolor: `rgba(${rgb}, 0.05)`,
				boxShadow: `inset 0 1px 0 rgba(255,255,255,0.03)`,
			}}
		>
			<Box
				sx={{
					bgcolor: `rgba(${rgb}, 0.28)`,
					color: main,
					fontFamily: theme.trading.mono,
					fontSize: "0.625rem",
					fontWeight: 700,
					letterSpacing: "0.14em",
					textAlign: "center",
					py: 0.125,
					borderBottom: `1px solid rgba(${rgb}, 0.35)`,
				}}
			>
				{month}
			</Box>
			<Typography
				component="div"
				sx={{
					fontFamily: theme.trading.mono,
					fontSize: "1.375rem",
					fontWeight: 700,
					lineHeight: 1,
					color: "text.primary",
					textAlign: "center",
					py: 0.25,
				}}
			>
				{day}
			</Typography>
			<Box
				sx={{
					borderTop: `1px solid rgba(${rgb}, 0.2)`,
					color: "text.secondary",
					fontFamily: theme.trading.mono,
					fontSize: "0.6875rem",
					fontWeight: 600,
					textAlign: "center",
					py: 0.1875,
					bgcolor: `rgba(${rgb}, 0.04)`,
				}}
			>
				{time}
			</Box>
		</Box>
	);
}

export default CalendarTile;
