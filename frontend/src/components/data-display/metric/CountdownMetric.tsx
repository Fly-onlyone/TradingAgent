/**
 * Live countdown — coarse "26 min" / "5h 23m" / "overdue" value, ticks every second.
 * Renders through TrendIconMetric for visual parity with the rest of the KPI row.
 */

import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import NotificationImportantIcon from "@mui/icons-material/NotificationImportant";
import ScheduleIcon from "@mui/icons-material/Schedule";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { safeParseDate } from "@/utils/formatters";
import { TrendIconMetric } from "./TrendIconMetric";
import type { MetricTone } from "./types";

interface CountdownMetricProps {
	label: string;
	targetAt: string | Date | null | undefined;
	icon?: ReactNode;
	tone?: MetricTone;
	loading?: boolean;
}

function formatRemaining(ms: number): string {
	const total = Math.max(0, Math.floor(ms / 1000));
	const days = Math.floor(total / 86400);
	const hours = Math.floor((total % 86400) / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const seconds = total % 60;

	if (days > 0) return `${days} ${days === 1 ? "day" : "days"}`;
	if (hours > 0)
		return minutes > 0
			? `${hours}h ${minutes}m`
			: `${hours} ${hours === 1 ? "hour" : "hours"}`;
	if (minutes > 0) return `${minutes} min`;
	return `${seconds} sec`;
}

export function CountdownMetric({
	label,
	targetAt,
	icon,
	tone = "primary",
	loading,
}: CountdownMetricProps) {
	const target = useMemo(() => safeParseDate(targetAt), [targetAt]);
	const targetMs = target?.getTime() ?? null;

	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (targetMs === null) return;
		const id = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(id);
	}, [targetMs]);

	if (!target || targetMs === null) {
		return (
			<TrendIconMetric
				label={label}
				value="Not scheduled"
				icon={icon ?? <ScheduleIcon />}
				tone="neutral"
				loading={loading}
			/>
		);
	}

	const remaining = targetMs - now;
	const overdue = remaining <= 0;
	const critical = !overdue && remaining < 60_000;

	const timeStr = target.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
	});
	const dateStr = target.toLocaleDateString([], {
		month: "short",
		day: "numeric",
	});

	const value = overdue ? "overdue" : formatRemaining(remaining);
	const subtitle = overdue
		? `was due ${dateStr} · ${timeStr}`
		: `at ${timeStr} · ${dateStr}`;

	const effectiveTone: MetricTone = overdue
		? "error"
		: critical
			? "warning"
			: tone;
	const effectiveIcon =
		icon ?? (overdue ? <NotificationImportantIcon /> : <HourglassTopIcon />);

	return (
		<TrendIconMetric
			label={label}
			value={value}
			subtitle={subtitle}
			icon={effectiveIcon}
			tone={effectiveTone}
			loading={loading}
		/>
	);
}

export default CountdownMetric;
