import { Box, Chip, keyframes, Tooltip, Typography } from "@mui/material";
import {
	addDays,
	addHours,
	addMinutes,
	format,
	isSameDay,
	isToday,
	isTomorrow,
	setDay,
	setHours,
	setMinutes,
	setSeconds,
} from "date-fns";
import { useEffect, useMemo, useState } from "react";
import {
	DAYS_OF_WEEK,
	formatScheduleSummary,
} from "@/components/tasks/sections/scheduleUtils";
import type { TaskSchedule } from "@/types/task";

interface ScheduleTimelineProps {
	schedules: TaskSchedule[];
}

const MAX_UPCOMING = 5;

interface UpcomingRun {
	time: Date;
	label: string;
}

interface DayGroup {
	key: number;
	headerLabel: string;
	isToday: boolean;
	isTomorrow: boolean;
	runs: UpcomingRun[];
}

function parseHHMM(time?: string): { h: number; m: number } {
	if (!time) return { h: 9, m: 0 };
	const [h, m] = time.split(":").map(Number);
	return { h: h ?? 9, m: m ?? 0 };
}

function computeUpcomingRuns(schedules: TaskSchedule[]): UpcomingRun[] {
	const now = new Date();
	const runs: UpcomingRun[] = [];

	for (const schedule of schedules) {
		if (schedule.enabled === false) continue;

		if (schedule.frequency === "interval") {
			const intervalMin =
				schedule.intervalUnit === "hours"
					? (schedule.intervalValue ?? 1) * 60
					: (schedule.intervalValue ?? 60);
			if (intervalMin <= 0) continue;

			let next = now;
			for (let i = 0; i < MAX_UPCOMING + 2; i++) {
				next = addMinutes(next, i === 0 ? 0 : intervalMin);
				if (next > now) {
					runs.push({
						time: next,
						label: `Every ${schedule.intervalValue ?? "?"} ${schedule.intervalUnit ?? "min"}`,
					});
				}
				if (runs.length >= MAX_UPCOMING * 2) break;
			}
		} else if (schedule.frequency === "daily") {
			const { h, m } = parseHHMM(schedule.scheduledTime);
			for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
				const t = setSeconds(
					setMinutes(setHours(addDays(now, dayOffset), h), m),
					0,
				);
				if (t <= now) continue;
				runs.push({
					time: t,
					label: `Daily at ${schedule.scheduledTime || "09:00"}`,
				});
				if (runs.length >= MAX_UPCOMING * 2) break;

				if (schedule.intervalValue != null && schedule.intervalValue > 0) {
					const repeatMin =
						schedule.intervalUnit === "hours"
							? schedule.intervalValue * 60
							: schedule.intervalValue;
					let repeatTime = t;
					for (let r = 0; r < MAX_UPCOMING; r++) {
						repeatTime = addMinutes(repeatTime, repeatMin);
						if (repeatTime.getDate() !== t.getDate()) break;
						runs.push({
							time: repeatTime,
							label: `Daily at ${schedule.scheduledTime || "09:00"} + every ${schedule.intervalValue} ${schedule.intervalUnit ?? "hours"}`,
						});
					}
				}
			}
		} else if (schedule.frequency === "weekly") {
			const { h, m } = parseHHMM(schedule.scheduledTime);
			const targetDay = ((schedule.dayOfWeek ?? 0) + 1) % 7;
			for (let weekOffset = 0; weekOffset < 4; weekOffset++) {
				const t = setSeconds(
					setMinutes(
						setHours(setDay(addDays(now, weekOffset * 7), targetDay), h),
						m,
					),
					0,
				);
				if (t <= now) continue;
				const dayName =
					DAYS_OF_WEEK[schedule.dayOfWeek ?? 0]?.label ?? "Monday";
				runs.push({
					time: t,
					label: `Weekly on ${dayName}`,
				});
			}
		} else if (schedule.frequency === "custom") {
			runs.push({
				time: addHours(now, 1),
				label: `Custom: ${schedule.cronExpression || "?"}`,
			});
		}
	}

	runs.sort((a, b) => a.time.getTime() - b.time.getTime());
	const seen = new Set<number>();
	const unique: UpcomingRun[] = [];
	for (const run of runs) {
		const key = Math.floor(run.time.getTime() / 60_000);
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push(run);
		if (unique.length >= MAX_UPCOMING) break;
	}
	return unique;
}

function buildFrequencySummary(schedules: TaskSchedule[]): string[] {
	return schedules
		.filter((s) => s.enabled !== false)
		.map(formatScheduleSummary);
}

function formatCompactDelta(ms: number): string {
	const s = Math.max(0, Math.floor(ms / 1000));
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m`;
	const h = Math.floor(m / 60);
	const remMin = m % 60;
	if (h < 24) return remMin ? `${h}h ${remMin}m` : `${h}h`;
	const d = Math.floor(h / 24);
	const remH = h % 24;
	return remH ? `${d}d ${remH}h` : `${d}d`;
}

function groupRunsByDay(runs: UpcomingRun[]): DayGroup[] {
	const groups: DayGroup[] = [];
	for (const run of runs) {
		const last = groups[groups.length - 1];
		if (last && isSameDay(last.runs[0].time, run.time)) {
			last.runs.push(run);
			continue;
		}
		const today = isToday(run.time);
		const tomorrow = !today && isTomorrow(run.time);
		groups.push({
			key: run.time.getTime(),
			headerLabel: today
				? "Today"
				: tomorrow
					? "Tomorrow"
					: format(run.time, "EEE d MMM"),
			isToday: today,
			isTomorrow: tomorrow,
			runs: [run],
		});
	}
	return groups;
}

const pulse = keyframes`
	0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
	50% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
`;

export function ScheduleTimeline({ schedules }: ScheduleTimelineProps) {
	const upcomingRuns = useMemo(
		() => computeUpcomingRuns(schedules),
		[schedules],
	);
	const summaries = useMemo(
		() => buildFrequencySummary(schedules),
		[schedules],
	);
	const dayGroups = useMemo(() => groupRunsByDay(upcomingRuns), [upcomingRuns]);

	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (upcomingRuns.length === 0) return;
		const nextMs = upcomingRuns[0].time.getTime();
		const gap = nextMs - Date.now();
		const intervalMs = gap < 60_000 ? 1000 : 15_000;
		const id = window.setInterval(() => setNow(Date.now()), intervalMs);
		return () => window.clearInterval(id);
	}, [upcomingRuns]);

	const enabledSchedules = schedules.filter((s) => s.enabled !== false);
	if (enabledSchedules.length === 0) {
		return (
			<Box sx={{ py: 2, textAlign: "center", color: "text.secondary" }}>
				<Typography variant="body2">No active schedules</Typography>
			</Box>
		);
	}

	// Flat index over all runs so first-run ("next") styling stays stable
	// across day boundaries, and opacity fade matches the original behaviour.
	let flatIndex = 0;

	return (
		<Box
			sx={{
				borderRadius: 1.5,
				background: "rgba(255, 255, 255, 0.015)",
				border: "1px solid",
				borderColor: "divider",
				p: 2,
			}}
		>
			{/* Upcoming runs timeline */}
			{upcomingRuns.length > 0 && (
				<Box sx={{ mb: 1.5 }}>
					<Typography
						variant="caption"
						fontWeight={600}
						color="text.secondary"
						sx={{
							mb: 1.5,
							display: "block",
							letterSpacing: 0.8,
							textTransform: "uppercase",
							fontSize: "0.65rem",
						}}
					>
						Upcoming Runs
					</Typography>

					{/* Timeline with connector line */}
					<Box sx={{ position: "relative", pl: 2.5 }}>
						{/* Vertical connector line */}
						<Box
							sx={{
								position: "absolute",
								left: 5,
								top: 6,
								bottom: 6,
								width: 2,
								borderRadius: 1,
								background:
									"linear-gradient(180deg, rgba(16, 185, 129, 0.4) 0%, rgba(16, 185, 129, 0.05) 100%)",
							}}
						/>

						{dayGroups.map((group, groupIdx) => (
							<Box
								key={`group-${group.key}`}
								sx={{ mt: groupIdx === 0 ? 0 : 1 }}
							>
								{/* Day header */}
								<Typography
									sx={{
										fontFamily: "JetBrains Mono, monospace",
										fontSize: "0.625rem",
										fontWeight: 700,
										letterSpacing: "0.1em",
										textTransform: "uppercase",
										color: group.isToday
											? "rgba(16, 185, 129, 0.85)"
											: group.isTomorrow
												? "text.secondary"
												: "text.disabled",
										lineHeight: 1,
										mb: 0.75,
									}}
								>
									{group.headerLabel}
								</Typography>

								{group.runs.map((run) => {
									const isNext = flatIndex === 0;
									const opacity = Math.max(0.4, 1 - flatIndex * 0.15);
									const delta = formatCompactDelta(run.time.getTime() - now);
									flatIndex += 1;

									return (
										<Tooltip
											key={`run-${run.time.getTime()}`}
											title={format(run.time, "EEE d MMM yyyy · HH:mm")}
											arrow
											placement="right"
											enterDelay={400}
										>
											<Box
												sx={{
													display: "flex",
													alignItems: "center",
													gap: 1.5,
													py: 0.75,
													position: "relative",
													opacity,
												}}
											>
												{/* Timeline dot */}
												<Box
													sx={{
														position: "absolute",
														left: -16,
														width: isNext ? 12 : 8,
														height: isNext ? 12 : 8,
														borderRadius: "50%",
														background: isNext
															? "#10B981"
															: "rgba(148, 163, 184, 0.3)",
														border: isNext
															? "2px solid rgba(16, 185, 129, 0.3)"
															: "none",
														animation: isNext
															? `${pulse} 2s ease-in-out infinite`
															: "none",
														zIndex: 1,
													}}
												/>

												{/* Relative time badge (live-ticking on first row) */}
												<Box
													sx={{
														minWidth: 84,
														px: 1,
														py: 0.25,
														borderRadius: 1,
														background: isNext
															? "rgba(16, 185, 129, 0.12)"
															: "rgba(255, 255, 255, 0.03)",
														border: isNext
															? "1px solid rgba(16, 185, 129, 0.25)"
															: "1px solid transparent",
														textAlign: "center",
													}}
												>
													<Typography
														fontFamily="JetBrains Mono, monospace"
														fontWeight={isNext ? 700 : 400}
														sx={{
															fontSize: "0.75rem",
															color: isNext ? "#10B981" : "text.secondary",
															lineHeight: 1.4,
														}}
													>
														{delta}
													</Typography>
												</Box>

												{/* Time */}
												<Typography
													fontFamily="JetBrains Mono, monospace"
													sx={{
														fontSize: "0.8rem",
														color: isNext ? "primary.main" : "text.disabled",
														fontWeight: isNext ? 700 : 400,
													}}
												>
													{format(run.time, "HH:mm")}
												</Typography>
											</Box>
										</Tooltip>
									);
								})}
							</Box>
						))}
					</Box>
				</Box>
			)}

			{/* Frequency summary chips */}
			<Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", pt: 0.5 }}>
				{summaries.map((s) => (
					<Chip
						key={s}
						label={s}
						size="small"
						variant="outlined"
						sx={{
							fontSize: "0.7rem",
							height: 24,
							borderColor: "rgba(255, 255, 255, 0.1)",
						}}
					/>
				))}
			</Box>
		</Box>
	);
}
