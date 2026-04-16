import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import RepeatIcon from "@mui/icons-material/Repeat";
import ScheduleIcon from "@mui/icons-material/Schedule";
import {
	Box,
	Button,
	FormControl,
	IconButton,
	InputLabel,
	MenuItem,
	Switch,
	TextField,
	Tooltip,
	Typography,
} from "@mui/material";
import { TimePicker } from "@mui/x-date-pickers";
import { format, parse } from "date-fns";
import { useCallback, useEffect, useState } from "react";
import { ZoomAwareSelect } from "@/components/common/ZoomAwareSelect";
import { GlassAccordion } from "@/components/tasks/sections/GlassAccordion";
import { ScheduleTimeline } from "@/components/tasks/sections/ScheduleTimeline";
import {
	DAYS_OF_WEEK,
	formatScheduleSummary,
} from "@/components/tasks/sections/scheduleUtils";
import { useTaskConfig } from "@/components/tasks/TaskConfigContext";
import type { TaskFrequency, TaskSchedule } from "@/types/task";

export function ScheduleSection() {
	const { formData, setFormData } = useTaskConfig();

	const [scheduleKeys, setScheduleKeys] = useState<string[]>(() =>
		formData.schedules.map(() => crypto.randomUUID()),
	);

	// Re-sync keys when backend hydration changes the schedule count
	const schedulesLen = formData.schedules.length;
	useEffect(() => {
		setScheduleKeys((prev) => {
			if (prev.length === schedulesLen) return prev;
			return Array.from(
				{ length: schedulesLen },
				(_, i) => prev[i] ?? crypto.randomUUID(),
			);
		});
	}, [schedulesLen]);

	const updateSchedule = useCallback(
		(idx: number, patch: Partial<TaskSchedule>) => {
			setFormData((prev) => {
				const updated = [...prev.schedules];
				updated[idx] = { ...updated[idx], ...patch };
				return { ...prev, schedules: updated };
			});
		},
		[setFormData],
	);

	const removeSchedule = useCallback(
		(idx: number) => {
			setScheduleKeys((prev) => prev.filter((_, i) => i !== idx));
			setFormData((prev) => ({
				...prev,
				schedules: prev.schedules.filter((_, i) => i !== idx),
			}));
		},
		[setFormData],
	);

	const addSchedule = useCallback(() => {
		setScheduleKeys((prev) => [...prev, crypto.randomUUID()]);
		setFormData((prev) => ({
			...prev,
			schedules: [
				...prev.schedules,
				{ frequency: "daily", scheduledTime: "09:00", enabled: true },
			],
		}));
	}, [setFormData]);

	const summaryText =
		formData.schedules
			.filter((s) => s.enabled !== false)
			.map(formatScheduleSummary)
			.join(" \u00b7 ") || "No schedules";

	return (
		<GlassAccordion
			defaultExpanded
			icon={<ScheduleIcon fontSize="small" color="primary" />}
			title="Schedule"
			summary={summaryText}
		>
			<ScheduleTimeline schedules={formData.schedules} />

			<Box
				sx={{
					display: "flex",
					flexDirection: "column",
					gap: 1.5,
				}}
			>
				{formData.schedules.map((schedule, idx) => (
					<Box
						key={scheduleKeys[idx] as string}
						sx={{
							display: "flex",
							gap: 1,
							alignItems: "center",
							flexWrap: "wrap",
							p: 1.5,
							border: 1,
							borderColor: "divider",
							borderRadius: 1,
							opacity: schedule.enabled === false ? 0.5 : 1,
						}}
					>
						<Switch
							checked={schedule.enabled !== false}
							onChange={(e) =>
								updateSchedule(idx, { enabled: e.target.checked })
							}
							size="small"
						/>

						<FormControl sx={{ minWidth: 130 }}>
							<InputLabel>Frequency</InputLabel>
							<ZoomAwareSelect
								value={schedule.frequency}
								label="Frequency"
								size="small"
								onChange={(e) => {
									const freq = e.target.value as TaskFrequency;
									const patch: Partial<TaskSchedule> = { frequency: freq };
									if (
										freq !== "interval" &&
										freq !== "daily" &&
										freq !== "weekly"
									) {
										patch.intervalValue = undefined;
										patch.intervalUnit = undefined;
									}
									if (freq !== "daily" && freq !== "weekly") {
										patch.scheduledTime = undefined;
									}
									if (freq !== "weekly") {
										patch.dayOfWeek = undefined;
									}
									if (freq !== "custom") {
										patch.cronExpression = undefined;
									}
									updateSchedule(idx, patch);
								}}
							>
								<MenuItem value="once">Once</MenuItem>
								<MenuItem value="interval">Every</MenuItem>
								<MenuItem value="daily">Daily</MenuItem>
								<MenuItem value="weekly">Weekly</MenuItem>
								<MenuItem value="custom">Custom</MenuItem>
							</ZoomAwareSelect>
						</FormControl>

						{schedule.frequency === "interval" && (
							<>
								<TextField
									label="Value"
									type="number"
									size="small"
									value={schedule.intervalValue ?? ""}
									onChange={(e) =>
										updateSchedule(idx, {
											intervalValue: e.target.value
												? Number(e.target.value)
												: undefined,
										})
									}
									slotProps={{
										htmlInput: {
											min: 1,
											onFocus: (e: React.FocusEvent<HTMLInputElement>) =>
												e.target.select(),
										},
									}}
									sx={{ width: 90 }}
								/>
								<FormControl size="small" sx={{ minWidth: 110 }}>
									<InputLabel>Unit</InputLabel>
									<ZoomAwareSelect
										value={schedule.intervalUnit ?? "hours"}
										label="Unit"
										onChange={(e) =>
											updateSchedule(idx, {
												intervalUnit: e.target
													.value as TaskSchedule["intervalUnit"],
											})
										}
									>
										<MenuItem value="minutes">Minutes</MenuItem>
										<MenuItem value="hours">Hours</MenuItem>
									</ZoomAwareSelect>
								</FormControl>
							</>
						)}

						{(schedule.frequency === "daily" ||
							schedule.frequency === "weekly") && (
							<TimePicker
								label="Time"
								value={parse(
									schedule.scheduledTime || "09:00",
									"HH:mm",
									new Date(),
								)}
								onChange={(val) => {
									if (val) {
										updateSchedule(idx, {
											scheduledTime: format(val, "HH:mm"),
										});
									}
								}}
								slotProps={{
									textField: { size: "small" },
								}}
								slots={{
									openPickerButton: (props) => (
										<Tooltip title="Pick time">
											<IconButton {...props} />
										</Tooltip>
									),
								}}
								sx={{ width: 170 }}
							/>
						)}

						{schedule.frequency === "weekly" && (
							<FormControl size="small" sx={{ minWidth: 120 }}>
								<InputLabel>Day</InputLabel>
								<ZoomAwareSelect
									value={schedule.dayOfWeek ?? 0}
									label="Day"
									onChange={(e) =>
										updateSchedule(idx, {
											dayOfWeek: e.target.value as number,
										})
									}
								>
									{DAYS_OF_WEEK.map((day) => (
										<MenuItem key={day.value} value={day.value}>
											{day.label}
										</MenuItem>
									))}
								</ZoomAwareSelect>
							</FormControl>
						)}

						{schedule.frequency === "custom" && (
							<TextField
								label="Cron"
								size="small"
								value={schedule.cronExpression || ""}
								onChange={(e) =>
									updateSchedule(idx, {
										cronExpression: e.target.value,
									})
								}
								placeholder="0 9 * * *"
								sx={{ flex: 1 }}
							/>
						)}

						{(schedule.frequency === "daily" ||
							schedule.frequency === "weekly") && (
							<Box
								sx={{
									display: "flex",
									gap: 1,
									alignItems: "center",
									bgcolor:
										schedule.intervalValue != null
											? "rgba(255, 255, 255, 0.04)"
											: "transparent",
									borderRadius: 2,
									px: 1,
									py: 0.5,
									transition: "background-color 0.2s",
								}}
							>
								<Tooltip
									title={
										schedule.intervalValue != null
											? "Disable repeat"
											: "Enable repeat"
									}
								>
									<IconButton
										size="small"
										onClick={() => {
											const enabling = schedule.intervalValue == null;
											updateSchedule(
												idx,
												enabling
													? {
															intervalValue: 1,
															intervalUnit: "hours" as const,
														}
													: {
															intervalValue: undefined,
															intervalUnit: undefined,
														},
											);
										}}
										sx={{
											color:
												schedule.intervalValue != null
													? "primary.main"
													: "text.disabled",
										}}
									>
										<RepeatIcon fontSize="small" />
									</IconButton>
								</Tooltip>
								{schedule.intervalValue != null && (
									<>
										<Typography variant="body2" color="text.secondary">
											every
										</Typography>
										<TextField
											type="number"
											size="small"
											value={schedule.intervalValue ?? ""}
											onChange={(e) =>
												updateSchedule(idx, {
													intervalValue: e.target.value
														? Number(e.target.value)
														: undefined,
												})
											}
											slotProps={{
												htmlInput: {
													min: 1,
													onFocus: (e: React.FocusEvent<HTMLInputElement>) =>
														e.target.select(),
												},
											}}
											sx={{ width: 70 }}
										/>
										<FormControl size="small" sx={{ minWidth: 100 }}>
											<InputLabel>Unit</InputLabel>
											<ZoomAwareSelect
												value={schedule.intervalUnit ?? "hours"}
												label="Unit"
												onChange={(e) =>
													updateSchedule(idx, {
														intervalUnit: e.target
															.value as TaskSchedule["intervalUnit"],
													})
												}
											>
												<MenuItem value="minutes">Min</MenuItem>
												<MenuItem value="hours">Hrs</MenuItem>
											</ZoomAwareSelect>
										</FormControl>
									</>
								)}
							</Box>
						)}

						{formData.schedules.length > 1 && (
							<Tooltip title="Remove schedule">
								<IconButton
									size="small"
									color="error"
									onClick={() => removeSchedule(idx)}
									sx={{ ml: "auto" }}
								>
									<RemoveCircleOutlineIcon />
								</IconButton>
							</Tooltip>
						)}
					</Box>
				))}

				<Button
					size="small"
					startIcon={<AddCircleOutlineIcon />}
					onClick={addSchedule}
					sx={{ alignSelf: "flex-start" }}
				>
					Add Schedule
				</Button>
			</Box>
		</GlassAccordion>
	);
}
