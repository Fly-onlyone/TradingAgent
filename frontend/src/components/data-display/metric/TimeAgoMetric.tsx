/**
 * Relative time value — coarse "4 days" / "3 hours" / "just now" as the hero,
 * with a compact subtitle combining freshness state + absolute timestamp.
 */

import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import HistoryIcon from "@mui/icons-material/History";
import ScheduleIcon from "@mui/icons-material/Schedule";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { Box, Tooltip, Typography, useTheme } from "@mui/material";
import { formatDistanceToNowStrict } from "date-fns";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { safeParseDate } from "@/utils/formatters";
import { MetricShell } from "./MetricShell";
import { getToneTokens, type MetricTone } from "./types";

type Freshness = "fresh" | "recent" | "stale";

interface TimeAgoMetricProps {
	label: string;
	at: string | Date | null | undefined;
	thresholds?: { recent: number; stale: number };
	hasError?: boolean;
	emptyLabel?: string;
	errorHint?: string;
}

const DEFAULT_THRESHOLDS = {
	recent: 60 * 60 * 1000,
	stale: 24 * 60 * 60 * 1000,
};

const FRESHNESS_TONE: Record<Freshness, MetricTone> = {
	fresh: "success",
	recent: "warning",
	stale: "error",
};

const FRESHNESS_ICON: Record<Freshness, ReactNode> = {
	fresh: <CheckCircleOutlineIcon />,
	recent: <ScheduleIcon />,
	stale: <WarningAmberIcon />,
};

const FRESHNESS_LABEL: Record<Freshness, string> = {
	fresh: "fresh",
	recent: "recent",
	stale: "stale",
};

function classify(
	ageMs: number,
	thresholds: typeof DEFAULT_THRESHOLDS,
): Freshness {
	if (ageMs < thresholds.recent) return "fresh";
	if (ageMs < thresholds.stale) return "recent";
	return "stale";
}

function coarsen(raw: string): string {
	const parts = raw.split(" ");
	return parts.length < 2 ? raw : `${parts[0]} ${parts[1]}`;
}

export function TimeAgoMetric({
	label,
	at,
	thresholds = DEFAULT_THRESHOLDS,
	hasError = false,
	emptyLabel = "Never",
	errorHint,
}: TimeAgoMetricProps) {
	const theme = useTheme();
	const date = useMemo(() => safeParseDate(at), [at]);
	const dateMs = date?.getTime() ?? null;

	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (dateMs === null) return;
		const id = window.setInterval(() => setNow(Date.now()), 30_000);
		return () => window.clearInterval(id);
	}, [dateMs]);

	if (!date) {
		return (
			<MetricShell label={label} tone="neutral" icon={<HistoryIcon />}>
				<Box sx={{ flex: 1, display: "flex", alignItems: "center" }}>
					<Typography
						sx={{
							fontFamily: (t) => t.trading.mono,
							fontSize: "1.5rem",
							fontWeight: 700,
							color: "text.disabled",
						}}
					>
						{emptyLabel}
					</Typography>
				</Box>
			</MetricShell>
		);
	}

	const ageMs = now - date.getTime();
	const freshness = classify(ageMs, thresholds);
	const hero =
		ageMs < 60_000 ? "just now" : coarsen(formatDistanceToNowStrict(date));

	const tone: MetricTone = hasError ? "error" : FRESHNESS_TONE[freshness];
	const icon: ReactNode = hasError ? (
		<WarningAmberIcon />
	) : (
		FRESHNESS_ICON[freshness]
	);
	const stateWord = hasError ? "failed" : FRESHNESS_LABEL[freshness];
	const dateStr = date.toLocaleDateString([], {
		month: "short",
		day: "numeric",
	});
	const timeStr = date.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});
	const { main: toneMain, rgb: toneRgb } = getToneTokens(theme, tone);

	return (
		<MetricShell
			label={label}
			tone={tone}
			flashKey={`${date.toISOString()}-${hasError}`}
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
					{icon}
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
					<Tooltip
						title={hasError && errorHint ? errorHint : ""}
						arrow
						disableHoverListener={!hasError || !errorHint}
					>
						<Typography
							sx={{
								fontSize: "0.8125rem",
								fontWeight: 500,
								color: "text.secondary",
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
								cursor: hasError && errorHint ? "help" : "default",
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
					</Tooltip>
				</Box>
			</Box>
		</MetricShell>
	);
}

export default TimeAgoMetric;
