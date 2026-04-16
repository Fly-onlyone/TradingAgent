import type { TaskSchedule } from "@/types/task";

export const DAYS_OF_WEEK = [
	{ value: 0, label: "Monday" },
	{ value: 1, label: "Tuesday" },
	{ value: 2, label: "Wednesday" },
	{ value: 3, label: "Thursday" },
	{ value: 4, label: "Friday" },
	{ value: 5, label: "Saturday" },
	{ value: 6, label: "Sunday" },
] as const;

export function formatScheduleSummary(schedule: TaskSchedule): string {
	if (schedule.frequency === "interval")
		return `Every ${schedule.intervalValue ?? "?"} ${schedule.intervalUnit ?? "min"}`;
	if (schedule.frequency === "daily")
		return `Daily at ${schedule.scheduledTime || "09:00"}`;
	if (schedule.frequency === "weekly") {
		const dayName = DAYS_OF_WEEK[schedule.dayOfWeek ?? 0]?.label ?? "Monday";
		return `Weekly on ${dayName} at ${schedule.scheduledTime || "09:00"}`;
	}
	if (schedule.frequency === "custom")
		return `Cron: ${schedule.cronExpression || "?"}`;
	return schedule.frequency;
}
