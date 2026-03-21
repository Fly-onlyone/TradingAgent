/**
 * Tasks Page - Single task with multiple toggleable schedules
 */

import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import AutoModeIcon from "@mui/icons-material/AutoMode";
import DeleteIcon from "@mui/icons-material/Delete";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import NotificationsIcon from "@mui/icons-material/Notifications";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import {
	Accordion,
	AccordionDetails,
	AccordionSummary,
	Alert,
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	CircularProgress,
	FormControl,
	FormControlLabel,
	IconButton,
	InputLabel,
	MenuItem,
	Select,
	Slider,
	Switch,
	TextField,
	Tooltip,
	Typography,
} from "@mui/material";
import { LocalizationProvider, TimePicker } from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { format, parse } from "date-fns";
import { useEffect, useState } from "react";
import { tasksApi } from "@/api/endpoints/tasks";
import { PageTransition } from "@/components/common/PageTransition";
import { type Column, DataTable } from "@/components/data-display/DataTable";
import { StrategyDiscoveryCard } from "@/components/tasks/StrategyDiscoveryCard";
import type {
	AgentMode,
	MonitoringCondition,
	MonitoringConditionType,
	RiskLevel,
	TaskCreate,
	TaskExecution,
	TaskFrequency,
	TaskSchedule,
} from "@/types/task";
import { MONITORING_CONDITION_CONFIG } from "@/types/task";
import { formatDateTime } from "@/utils/formatters";
import { requireAuth } from "../-guards";

export const Route = createFileRoute("/tasks/")({
	beforeLoad: requireAuth,
	component: TasksPage,
});

// Constants
const AVAILABLE_SYMBOLS = [
	"BTC-USDT",
	"ETH-USDT",
	"SOL-USDT",
	"XRP-USDT",
	"DOGE-USDT",
	"ADA-USDT",
	"AVAX-USDT",
	"DOT-USDT",
	"LINK-USDT",
	"MATIC-USDT",
];

const DAYS_OF_WEEK = [
	{ value: 0, label: "Monday" },
	{ value: 1, label: "Tuesday" },
	{ value: 2, label: "Wednesday" },
	{ value: 3, label: "Thursday" },
	{ value: 4, label: "Friday" },
	{ value: 5, label: "Saturday" },
	{ value: 6, label: "Sunday" },
];

function TasksPage() {
	const queryClient = useQueryClient();

	const [existingTaskId, setExistingTaskId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const [formData, setFormData] = useState<TaskCreate>({
		name: "",
		description: "",
		tradingEnabled: false,
		monitoringEnabled: false,
		schedules: [{ frequency: "daily", scheduledTime: "09:00", enabled: true }],
		symbols: [],
		riskLevel: "moderate",
		agentMode: "ask",
		monitoringConditions: [],
		alertCooldownMinutes: 60,
		useSubagents: false,
	});

	const tasksQuery = useQuery({
		queryKey: ["tasks"],
		queryFn: () => tasksApi.getTasks(),
		staleTime: 30_000,
	});

	const task = tasksQuery.data?.tasks?.[0] ?? null;

	// Populate form from existing task
	useEffect(() => {
		if (!task) {
			setExistingTaskId(null);
			return;
		}
		setExistingTaskId(task.id);
		setFormData({
			name: task.name,
			description: task.description,
			tradingEnabled: task.tradingEnabled,
			monitoringEnabled: task.monitoringEnabled,
			schedules:
				task.schedules.length > 0
					? task.schedules.map((s) => ({
							...s,
							enabled: s.enabled ?? true,
						}))
					: [{ frequency: "daily", scheduledTime: "09:00", enabled: true }],
			symbols: task.symbols,
			riskLevel: task.riskLevel,
			agentMode: task.agentMode,
			maxPositionSize: task.maxPositionSize,
			maxDailyTrades: task.maxDailyTrades,
			monitoringConditions: task.monitoringConditions ?? [],
			alertCooldownMinutes: task.alertCooldownMinutes ?? 60,
			useSubagents: task.useSubagents ?? false,
			customInstructions: task.customInstructions,
		});
	}, [task]);

	const historyQuery = useQuery({
		queryKey: ["tasks", "history", existingTaskId],
		queryFn: () => tasksApi.getTaskHistory(existingTaskId as string),
		enabled: !!existingTaskId,
	});

	const createTaskMutation = useMutation({
		mutationFn: (payload: TaskCreate) => tasksApi.createTask(payload),
		onSuccess: (created) => {
			setExistingTaskId(created.id);
			setError(null);
			void queryClient.invalidateQueries({ queryKey: ["tasks"] });
		},
		onError: () => {
			setError("Failed to create task");
		},
	});

	const updateTaskMutation = useMutation({
		mutationFn: ({
			taskId,
			payload,
		}: {
			taskId: string;
			payload: TaskCreate;
		}) => tasksApi.updateTask(taskId, payload),
		onSuccess: () => {
			setError(null);
			void queryClient.invalidateQueries({ queryKey: ["tasks"] });
		},
		onError: () => {
			setError("Failed to update task");
		},
	});

	const deleteTaskMutation = useMutation({
		mutationFn: (taskId: string) => tasksApi.deleteTask(taskId),
		onSuccess: () => {
			setExistingTaskId(null);
			setFormData({
				name: "",
				description: "",
				tradingEnabled: false,
				monitoringEnabled: false,
				schedules: [
					{ frequency: "daily", scheduledTime: "09:00", enabled: true },
				],
				symbols: [],
				riskLevel: "moderate",
				agentMode: "ask",
				monitoringConditions: [],
				alertCooldownMinutes: 60,
				useSubagents: false,
			});
			setError(null);
			void queryClient.invalidateQueries({ queryKey: ["tasks"] });
		},
		onError: () => {
			setError("Failed to delete task");
		},
	});

	const pauseTaskMutation = useMutation({
		mutationFn: (taskId: string) => tasksApi.pauseTask(taskId),
		onSuccess: () => {
			setError(null);
			void queryClient.invalidateQueries({ queryKey: ["tasks"] });
		},
		onError: () => {
			setError("Failed to pause task");
		},
	});

	const resumeTaskMutation = useMutation({
		mutationFn: (taskId: string) => tasksApi.resumeTask(taskId),
		onSuccess: () => {
			setError(null);
			void queryClient.invalidateQueries({ queryKey: ["tasks"] });
		},
		onError: () => {
			setError("Failed to resume task");
		},
	});

	const runTaskMutation = useMutation({
		mutationFn: (taskId: string) => tasksApi.runTaskNow(taskId),
		onSuccess: () => {
			setError(null);
			void queryClient.invalidateQueries({ queryKey: ["tasks"] });
			if (existingTaskId) {
				void queryClient.invalidateQueries({
					queryKey: ["tasks", "history", existingTaskId],
				});
			}
		},
		onError: () => {
			setError("Failed to run task");
		},
	});

	const taskHistory = historyQuery.data?.executions ?? [];
	const historyLoading = historyQuery.isLoading;
	const isLoadingTasks = tasksQuery.isLoading;

	const handleSave = async () => {
		try {
			if (existingTaskId) {
				await updateTaskMutation.mutateAsync({
					taskId: existingTaskId,
					payload: formData,
				});
			} else {
				await createTaskMutation.mutateAsync(formData);
			}
		} catch {
			// handled in mutation callbacks
		}
	};

	const handleDelete = async () => {
		if (!existingTaskId) return;
		if (!confirm("Are you sure you want to delete this task?")) return;
		try {
			await deleteTaskMutation.mutateAsync(existingTaskId);
		} catch {
			// handled in mutation callbacks
		}
	};

	const handlePause = async () => {
		if (!existingTaskId) return;
		try {
			await pauseTaskMutation.mutateAsync(existingTaskId);
		} catch {
			// handled in mutation callbacks
		}
	};

	const handleResume = async () => {
		if (!existingTaskId) return;
		try {
			await resumeTaskMutation.mutateAsync(existingTaskId);
		} catch {
			// handled in mutation callbacks
		}
	};

	const handleRunNow = async () => {
		if (!existingTaskId) return;
		try {
			await runTaskMutation.mutateAsync(existingTaskId);
		} catch {
			// handled in mutation callbacks
		}
	};

	// Schedule helpers
	const updateSchedule = (idx: number, patch: Partial<TaskSchedule>) => {
		const updated = [...formData.schedules];
		updated[idx] = { ...updated[idx], ...patch };
		setFormData({ ...formData, schedules: updated });
	};

	const removeSchedule = (idx: number) => {
		setFormData({
			...formData,
			schedules: formData.schedules.filter((_, i) => i !== idx),
		});
	};

	const addSchedule = () => {
		setFormData({
			...formData,
			schedules: [
				...formData.schedules,
				{ frequency: "daily", scheduledTime: "09:00", enabled: true },
			],
		});
	};

	const riskMarks = [
		{ value: 0, label: "Conservative" },
		{ value: 1, label: "Moderate" },
		{ value: 2, label: "Aggressive" },
	];
	const riskValues: RiskLevel[] = ["conservative", "moderate", "aggressive"];

	const getStatusChip = (status: string) => {
		const config: Record<
			string,
			{ color: "success" | "warning" | "error" | "default"; label: string }
		> = {
			active: { color: "success", label: "Active" },
			paused: { color: "warning", label: "Paused" },
			completed: { color: "default", label: "Completed" },
			failed: { color: "error", label: "Failed" },
		};
		const c = config[status] || { color: "default", label: status };
		return <Chip label={c.label} size="small" color={c.color} />;
	};

	const historyColumns: Column<TaskExecution>[] = [
		{
			id: "createdAt",
			label: "Time",
			render: (row) => formatDateTime(row.createdAt),
		},
		{ id: "symbol", label: "Symbol" },
		{
			id: "action",
			label: "Action",
			render: (row) =>
				row.action ? (
					<Chip
						label={row.action.toUpperCase()}
						size="small"
						color={
							row.action === "buy"
								? "success"
								: row.action === "sell"
									? "error"
									: "default"
						}
					/>
				) : (
					"-"
				),
		},
		{
			id: "confidence",
			label: "Confidence",
			render: (row) => (row.confidence ? `${row.confidence}%` : "-"),
		},
		{ id: "summary", label: "Summary", minWidth: 200 },
		{
			id: "status",
			label: "Status",
			render: (row) => getStatusChip(row.status),
		},
	];

	const isSaving = createTaskMutation.isPending || updateTaskMutation.isPending;
	return (
		<LocalizationProvider dateAdapter={AdapterDateFns}>
			<PageTransition pageKey="tasks">
				<Box>
					{/* Header with title + task-level actions */}
					<Box
						sx={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							mb: 3,
						}}
					>
						<Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
							<Typography variant="h4" fontWeight={700}>
								Scheduled Tasks
							</Typography>
							{task && getStatusChip(task.status)}
						</Box>
						{existingTaskId && (
							<Box sx={{ display: "flex", gap: 1 }}>
								{task?.status === "active" && (
									<>
										<Tooltip title="Run Now">
											<span>
												<Button
													variant="outlined"
													size="small"
													startIcon={<PlayArrowIcon />}
													onClick={handleRunNow}
													disabled={runTaskMutation.isPending}
												>
													Run Now
												</Button>
											</span>
										</Tooltip>
										<Tooltip title="Pause">
											<span>
												<Button
													variant="outlined"
													size="small"
													color="warning"
													startIcon={<PauseIcon />}
													onClick={handlePause}
													disabled={pauseTaskMutation.isPending}
												>
													Pause
												</Button>
											</span>
										</Tooltip>
									</>
								)}
								{task?.status === "paused" && (
									<Tooltip title="Resume">
										<span>
											<Button
												variant="outlined"
												size="small"
												color="success"
												startIcon={<PlayArrowIcon />}
												onClick={handleResume}
												disabled={resumeTaskMutation.isPending}
											>
												Resume
											</Button>
										</span>
									</Tooltip>
								)}
								<Tooltip title="Delete">
									<span>
										<Button
											variant="outlined"
											size="small"
											color="error"
											startIcon={<DeleteIcon />}
											onClick={handleDelete}
											disabled={deleteTaskMutation.isPending}
										>
											Delete
										</Button>
									</span>
								</Tooltip>
							</Box>
						)}
					</Box>

					{(error || tasksQuery.isError) && (
						<Alert
							severity="error"
							onClose={() => setError(null)}
							sx={{ mb: 2 }}
						>
							{error ?? "Failed to load tasks"}
						</Alert>
					)}

					<StrategyDiscoveryCard />

					{isLoadingTasks ? (
						<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
							<CircularProgress />
						</Box>
					) : (
						<>
							{/* Inline task form */}
							<Card sx={{ mb: 3 }}>
								<CardContent>
									<Box
										sx={{
											display: "flex",
											flexDirection: "column",
											gap: 2,
										}}
									>
										<TextField
											label="Task Name"
											value={formData.name}
											onChange={(e) =>
												setFormData({ ...formData, name: e.target.value })
											}
											fullWidth
											required
										/>

										<TextField
											label="Description"
											value={formData.description || ""}
											onChange={(e) =>
												setFormData({
													...formData,
													description: e.target.value,
												})
											}
											fullWidth
											multiline
											rows={2}
										/>

										<FormControl fullWidth>
											<InputLabel>Symbols</InputLabel>
											<Select
												multiple
												value={formData.symbols}
												label="Symbols"
												onChange={(e) =>
													setFormData({
														...formData,
														symbols: e.target.value as string[],
													})
												}
												renderValue={(selected) => (
													<Box
														sx={{
															display: "flex",
															flexWrap: "wrap",
															gap: 0.5,
														}}
													>
														{selected.map((value) => (
															<Chip key={value} label={value} size="small" />
														))}
													</Box>
												)}
											>
												{AVAILABLE_SYMBOLS.map((symbol) => (
													<MenuItem key={symbol} value={symbol}>
														{symbol}
													</MenuItem>
												))}
											</Select>
										</FormControl>

										{formData.schedules.map((schedule, idx) => (
											<Box
												key={idx}
												sx={{
													display: "flex",
													flexDirection: "column",
													gap: 1,
													p: 1.5,
													border: 1,
													borderColor: "divider",
													borderRadius: 1,
													opacity: schedule.enabled === false ? 0.5 : 1,
												}}
											>
												<Box
													sx={{
														display: "flex",
														gap: 1,
														alignItems: "center",
													}}
												>
													<Switch
														checked={schedule.enabled !== false}
														onChange={(e) =>
															updateSchedule(idx, {
																enabled: e.target.checked,
															})
														}
														size="small"
													/>

													<FormControl sx={{ minWidth: 130 }}>
														<InputLabel>Frequency</InputLabel>
														<Select
															value={schedule.frequency}
															label="Frequency"
															size="small"
															onChange={(e) =>
																updateSchedule(idx, {
																	frequency: e.target.value as TaskFrequency,
																})
															}
														>
															<MenuItem value="once">Once</MenuItem>
															<MenuItem value="hourly">Hourly</MenuItem>
															<MenuItem value="daily">Daily</MenuItem>
															<MenuItem value="weekly">Weekly</MenuItem>
															<MenuItem value="custom">Custom</MenuItem>
														</Select>
													</FormControl>

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
															<Select
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
															</Select>
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

													{formData.schedules.length > 1 && (
														<Tooltip title="Remove schedule">
															<IconButton
																size="small"
																color="error"
																onClick={() => removeSchedule(idx)}
															>
																<RemoveCircleOutlineIcon />
															</IconButton>
														</Tooltip>
													)}
												</Box>
											</Box>
										))}

										<Button
											size="small"
											startIcon={<AddCircleOutlineIcon />}
											onClick={addSchedule}
										>
											Add Schedule
										</Button>

										{/* Risk Level */}
										<Box sx={{ px: 4 }}>
											<Typography gutterBottom>Risk Level</Typography>
											<Slider
												value={riskValues.indexOf(formData.riskLevel)}
												onChange={(_, value) =>
													setFormData({
														...formData,
														riskLevel: riskValues[value as number],
													})
												}
												step={1}
												marks={riskMarks}
												min={0}
												max={2}
												sx={{
													"& .MuiSlider-markLabel": {
														fontSize: "0.75rem",
													},
												}}
											/>
										</Box>

										{/* Deep Analysis toggle */}
										<Tooltip title="Run specialized subagents (Technical, Fundamental, News) before main analysis. More thorough but uses more API credits.">
											<FormControlLabel
												control={
													<Switch
														checked={formData.useSubagents ?? false}
														onChange={(e) =>
															setFormData({
																...formData,
																useSubagents: e.target.checked,
															})
														}
													/>
												}
												label="Deep Analysis (Subagents)"
											/>
										</Tooltip>

										<FormControlLabel
											control={
												<Switch
													checked={formData.tradingEnabled}
													onChange={(e) =>
														setFormData({
															...formData,
															tradingEnabled: e.target.checked,
														})
													}
												/>
											}
											label="Enable Trading"
										/>

										{formData.tradingEnabled && (
											<>
												<FormControl fullWidth>
													<InputLabel>Agent Mode</InputLabel>
													<Select
														value={formData.agentMode}
														label="Agent Mode"
														onChange={(e) =>
															setFormData({
																...formData,
																agentMode: e.target.value as AgentMode,
															})
														}
													>
														<MenuItem value="ask">
															<Box
																sx={{
																	display: "flex",
																	alignItems: "center",
																	gap: 1,
																}}
															>
																<NotificationsIcon fontSize="small" />
																Ask - Notify for confirmation
															</Box>
														</MenuItem>
														<MenuItem value="auto">
															<Box
																sx={{
																	display: "flex",
																	alignItems: "center",
																	gap: 1,
																}}
															>
																<AutoModeIcon fontSize="small" />
																Auto - Execute automatically
															</Box>
														</MenuItem>
													</Select>
												</FormControl>

												<TextField
													label="Max Position Size (USDT)"
													type="number"
													value={formData.maxPositionSize || ""}
													onChange={(e) =>
														setFormData({
															...formData,
															maxPositionSize: e.target.value
																? Number(e.target.value)
																: undefined,
														})
													}
													fullWidth
												/>
											</>
										)}

										<FormControlLabel
											control={
												<Switch
													checked={formData.monitoringEnabled}
													onChange={(e) =>
														setFormData({
															...formData,
															monitoringEnabled: e.target.checked,
														})
													}
												/>
											}
											label="Enable Monitoring"
										/>

										{formData.monitoringEnabled && (
											<>
												{(formData.monitoringConditions ?? []).map(
													(condition, index) => (
														<Box
															key={index}
															sx={{
																display: "flex",
																gap: 1,
																alignItems: "flex-start",
															}}
														>
															<FormControl sx={{ minWidth: 160 }}>
																<InputLabel>Condition</InputLabel>
																<Select
																	value={condition.conditionType}
																	label="Condition"
																	size="small"
																	onChange={(e) => {
																		const updated = [
																			...(formData.monitoringConditions ?? []),
																		];
																		updated[index] = {
																			...updated[index],
																			conditionType: e.target
																				.value as MonitoringConditionType,
																		};
																		setFormData({
																			...formData,
																			monitoringConditions: updated,
																		});
																	}}
																>
																	{(
																		Object.keys(
																			MONITORING_CONDITION_CONFIG,
																		) as MonitoringConditionType[]
																	).map((type) => (
																		<MenuItem key={type} value={type}>
																			{MONITORING_CONDITION_CONFIG[type].label}
																		</MenuItem>
																	))}
																</Select>
															</FormControl>

															<TextField
																label={`Threshold (${MONITORING_CONDITION_CONFIG[condition.conditionType]?.unit || ""})`}
																type="number"
																size="small"
																value={condition.threshold}
																onChange={(e) => {
																	const updated = [
																		...(formData.monitoringConditions ?? []),
																	];
																	updated[index] = {
																		...updated[index],
																		threshold: Number(e.target.value),
																	};
																	setFormData({
																		...formData,
																		monitoringConditions: updated,
																	});
																}}
																sx={{ width: 140 }}
															/>

															{condition.conditionType === "custom" ? (
																<TextField
																	label="Description"
																	size="small"
																	value={condition.description ?? ""}
																	onChange={(e) => {
																		const updated = [
																			...(formData.monitoringConditions ?? []),
																		];
																		updated[index] = {
																			...updated[index],
																			description: e.target.value,
																		};
																		setFormData({
																			...formData,
																			monitoringConditions: updated,
																		});
																	}}
																	sx={{ flex: 1 }}
																/>
															) : (
																<FormControl size="small" sx={{ minWidth: 90 }}>
																	<InputLabel>Timeframe</InputLabel>
																	<Select
																		value={condition.timeframe ?? ""}
																		label="Timeframe"
																		onChange={(e) => {
																			const updated = [
																				...(formData.monitoringConditions ??
																					[]),
																			];
																			updated[index] = {
																				...updated[index],
																				timeframe: e.target.value || undefined,
																			};
																			setFormData({
																				...formData,
																				monitoringConditions: updated,
																			});
																		}}
																	>
																		<MenuItem value="">-</MenuItem>
																		<MenuItem value="1H">1H</MenuItem>
																		<MenuItem value="4H">4H</MenuItem>
																		<MenuItem value="1D">1D</MenuItem>
																	</Select>
																</FormControl>
															)}

															<IconButton
																size="small"
																color="error"
																onClick={() => {
																	const updated = (
																		formData.monitoringConditions ?? []
																	).filter((_, i) => i !== index);
																	setFormData({
																		...formData,
																		monitoringConditions: updated,
																	});
																}}
															>
																<RemoveCircleOutlineIcon />
															</IconButton>
														</Box>
													),
												)}

												<Button
													size="small"
													startIcon={<AddCircleOutlineIcon />}
													onClick={() => {
														const newCondition: MonitoringCondition = {
															conditionType: "price_above",
															threshold: 0,
														};
														setFormData({
															...formData,
															monitoringConditions: [
																...(formData.monitoringConditions ?? []),
																newCondition,
															],
														});
													}}
												>
													Add Condition
												</Button>

												<Box sx={{ px: 1 }}>
													<Typography gutterBottom variant="body2">
														Alert Cooldown:{" "}
														{formData.alertCooldownMinutes ?? 60} minutes
													</Typography>
													<Slider
														value={formData.alertCooldownMinutes ?? 60}
														onChange={(_, value) =>
															setFormData({
																...formData,
																alertCooldownMinutes: value as number,
															})
														}
														min={5}
														max={1440}
														step={5}
														marks={[
															{ value: 15, label: "15m" },
															{ value: 60, label: "1h" },
															{ value: 360, label: "6h" },
															{ value: 1440, label: "24h" },
														]}
														valueLabelDisplay="auto"
														valueLabelFormat={(v) =>
															v >= 60
																? `${Math.floor(v / 60)}h${v % 60 ? ` ${v % 60}m` : ""}`
																: `${v}m`
														}
														sx={{
															"& .MuiSlider-markLabel": {
																fontSize: "0.7rem",
															},
														}}
													/>
												</Box>
											</>
										)}

										<TextField
											label="Custom Instructions"
											value={formData.customInstructions || ""}
											onChange={(e) =>
												setFormData({
													...formData,
													customInstructions: e.target.value,
												})
											}
											fullWidth
											multiline
											rows={3}
											placeholder="Additional instructions for the agent..."
										/>

										{/* Save button */}
										<Box
											sx={{
												display: "flex",
												justifyContent: "flex-end",
											}}
										>
											<Button
												variant="contained"
												onClick={handleSave}
												disabled={isSaving}
											>
												{isSaving ? "Saving..." : "Save"}
											</Button>
										</Box>
									</Box>
								</CardContent>
							</Card>

							{/* History accordion */}
							{existingTaskId && (
								<Accordion defaultExpanded>
									<AccordionSummary expandIcon={<ExpandMoreIcon />}>
										<Typography variant="h6">
											Recent Executions - {task?.name}
										</Typography>
									</AccordionSummary>
									<AccordionDetails>
										<DataTable
											columns={historyColumns}
											rows={taskHistory}
											rowKey="id"
											loading={historyLoading}
											emptyMessage="No executions yet"
											maxHeight={400}
										/>
									</AccordionDetails>
								</Accordion>
							)}
						</>
					)}
				</Box>
			</PageTransition>
		</LocalizationProvider>
	);
}
