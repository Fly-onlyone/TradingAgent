import { Box, Chip, keyframes, Typography } from "@mui/material";
import {
	addDays,
	addHours,
	addMinutes,
	format,
	formatDistanceToNowStrict,
	setDay,
	setHours,
	setMinutes,
	setSeconds,
} from "date-fns";
import { useMemo } from "react";
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

	const enabledSchedules = schedules.filter((s) => s.enabled !== false);
	if (enabledSchedules.length === 0) {
		return (
			<Box sx={{ py: 2, textAlign: "center", color: "text.secondary" }}>
				<Typography variant="body2">No active schedules</Typography>
			</Box>
		);
	}

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

						{upcomingRuns.map((run, i) => {
							const isNext = i === 0;
							const opacity = Math.max(0.4, 1 - i * 0.15);

							return (
								<Box
									key={`run-${run.time.getTime()}`}
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

									{/* Relative time badge */}
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
											{formatDistanceToNowStrict(run.time, {
												addSuffix: false,
											})}
										</Typography>
									</Box>

									{/* Date + time */}
									<Typography
										fontFamily="JetBrains Mono, monospace"
										sx={{
											fontSize: "0.8rem",
											color: isNext ? "text.primary" : "text.secondary",
											fontWeight: isNext ? 600 : 400,
										}}
									>
										{format(run.time, "EEE d MMM")}
									</Typography>
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
							);
						})}
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
