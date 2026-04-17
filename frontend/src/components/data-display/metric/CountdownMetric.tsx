/**
 * Live countdown — time delta is the hero ("14h 3m" / "45 sec"), with a compact
 * subtitle combining state + absolute date/time in one line.
 */

import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import NotificationImportantIcon from "@mui/icons-material/NotificationImportant";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutline";
import ScheduleIcon from "@mui/icons-material/Schedule";
import { Box, Typography, useTheme } from "@mui/material";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { safeParseDate } from "@/utils/formatters";
import { MetricShell } from "./MetricShell";
import { getToneTokens, type MetricTone } from "./types";

interface CountdownMetricProps {
	label: string;
	targetAt: string | Date | null | undefined;
	icon?: ReactNode;
	tone?: MetricTone;
	loading?: boolean;
	paused?: boolean;
}

function formatDelta(ms: number): string {
	const abs = Math.abs(ms);
	const total = Math.max(0, Math.floor(abs / 1000));
	const days = Math.floor(total / 86400);
	const hours = Math.floor((total % 86400) / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const seconds = total % 60;

	if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
	if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
	if (minutes > 0) return `${minutes}m`;
	return `${seconds}s`;
}

export function CountdownMetric({
	label,
	targetAt,
	icon,
	tone = "primary",
	loading,
	paused,
}: CountdownMetricProps) {
	const theme = useTheme();
	const target = useMemo(() => safeParseDate(targetAt), [targetAt]);
	const targetMs = target?.getTime() ?? null;

	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (paused || targetMs === null) return;
		const id = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(id);
	}, [targetMs, paused]);

	if (paused || !target || targetMs === null) {
		const inactiveText = paused ? "Paused" : "Not scheduled";
		const inactiveIcon =
			icon ?? (paused ? <PauseCircleOutlineIcon /> : <ScheduleIcon />);
		const { main: neutralMain, rgb: neutralRgb } = getToneTokens(
			theme,
			"neutral",
		);
		return (
			<MetricShell label={label} tone="neutral" loading={loading}>
				<Box
					sx={{
						flex: 1,
						display: "flex",
						alignItems: "center",
						gap: 1.5,
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
							color: neutralMain,
							bgcolor: `rgba(${neutralRgb}, 0.14)`,
							border: `1px solid rgba(${neutralRgb}, 0.3)`,
							"& svg": { fontSize: 22 },
						}}
					>
						{inactiveIcon}
					</Box>
					<Typography
						sx={{
							fontFamily: (t) => t.trading.mono,
							fontSize: "1.5rem",
							fontWeight: 700,
							color: "text.disabled",
						}}
					>
						{inactiveText}
					</Typography>
				</Box>
			</MetricShell>
		);
	}

	const remaining = targetMs - now;
	const overdue = remaining <= 0;
	const critical = !overdue && remaining < 60_000;

	const hero = formatDelta(remaining);
	const effectiveTone: MetricTone = overdue
		? "error"
		: critical
			? "warning"
			: tone;
	const stateWord = overdue ? "past due" : critical ? "imminent" : "scheduled";
	const dateStr = target.toLocaleDateString([], {
		month: "short",
		day: "numeric",
	});
	const timeStr = target.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});
	const effectiveIcon =
		icon ?? (overdue ? <NotificationImportantIcon /> : <HourglassTopIcon />);
	const { main: toneMain, rgb: toneRgb } = getToneTokens(theme, effectiveTone);

	return (
		<MetricShell
			label={label}
			tone={effectiveTone}
			loading={loading}
			flashKey={overdue ? "overdue" : hero}
		>
			<Box
				sx={{
					flex: 1,
					display: "flex",
					alignItems: "center",
					gap: 1.5,
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
					{effectiveIcon}
				</Box>
				<Box
					sx={{
						flex: 1,
						display: "flex",
						flexDirection: "column",
						minWidth: 0,
						gap: 0.375,
					}}
				>
					<Typography
						component="div"
						sx={{
							fontFamily: (t) => t.trading.mono,
							fontSize: "1.75rem",
							fontWeight: 700,
							lineHeight: 1,
							color: toneMain,
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
						}}
					>
						{hero}
					</Typography>
					<Typography
						sx={{
							fontSize: "0.8125rem",
							fontWeight: 500,
							color: "text.secondary",
							overflow: "hidden",
							textOverflow: "ellipsis",
							whiteSpace: "nowrap",
							"& .state": {
								color: toneMain,
								fontWeight: 700,
								textTransform: "uppercase",
								letterSpacing: "0.04em",
							},
						}}
					>
						<span className="state">{stateWord}</span>
						{` · ${dateStr}, ${timeStr}`}
					</Typography>
				</Box>
			</Box>
		</MetricShell>
	);
}

export default CountdownMetric;
