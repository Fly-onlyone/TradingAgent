/**
 * Relative time value — coarse "4 days" / "3 hours" / "just now" with freshness-tinted
 * subtitle. Renders through TrendIconMetric for visual parity with the KPI row.
 */

import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import HistoryIcon from "@mui/icons-material/History";
import ScheduleIcon from "@mui/icons-material/Schedule";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { formatDistanceToNowStrict } from "date-fns";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { safeParseDate } from "@/utils/formatters";
import { TrendIconMetric } from "./TrendIconMetric";
import type { MetricTone } from "./types";

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

function classify(
	ageMs: number,
	thresholds: typeof DEFAULT_THRESHOLDS,
): Freshness {
	if (ageMs < thresholds.recent) return "fresh";
	if (ageMs < thresholds.stale) return "recent";
	return "stale";
}

/** Keep only the first {number} {unit} pair from date-fns output (e.g. "3 hours"). */
function coarsen(raw: string): string {
	const parts = raw.split(" ");
	return parts.length < 2 ? raw : `${parts[0]} ${parts[1]}`;
}

function formatAbsolute(date: Date): string {
	return date.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function TimeAgoMetric({
	label,
	at,
	thresholds = DEFAULT_THRESHOLDS,
	hasError = false,
	emptyLabel = "Never",
	errorHint,
}: TimeAgoMetricProps) {
	const date = useMemo(() => safeParseDate(at), [at]);
	const dateMs = date?.getTime() ?? null;

	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (dateMs === null) return;
		const id = window.setInterval(() => setNow(Date.now()), 30_000);
		return () => window.clearInterval(id);
	}, [dateMs]);

	const display = useMemo(() => {
		if (!date) {
			return {
				value: emptyLabel,
				subtitle: undefined,
				tone: "neutral" as MetricTone,
				icon: <HistoryIcon />,
			};
		}
		const ageMs = now - date.getTime();
		const freshness = classify(ageMs, thresholds);
		const value =
			ageMs < 60_000 ? "just now" : coarsen(formatDistanceToNowStrict(date));
		const absolute = formatAbsolute(date);

		if (hasError) {
			const hintPart = errorHint ? ` · ${errorHint}` : "";
			return {
				value,
				subtitle: `${absolute} · failed${hintPart}`,
				tone: "error" as MetricTone,
				icon: <WarningAmberIcon />,
			};
		}
		return {
			value,
			subtitle: `${absolute} · ${freshness}`,
			tone: FRESHNESS_TONE[freshness],
			icon: FRESHNESS_ICON[freshness],
		};
	}, [date, now, thresholds, hasError, emptyLabel, errorHint]);

	return (
		<TrendIconMetric
			label={label}
			value={display.value}
			subtitle={display.subtitle}
			icon={display.icon}
			tone={display.tone}
		/>
	);
}

export default TimeAgoMetric;
