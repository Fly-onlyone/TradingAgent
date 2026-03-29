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
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SymbolOption } from "@/api/endpoints/market";
import { tasksApi } from "@/api/endpoints/tasks";
import { CoinIcon } from "@/components/common/CoinIcon";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PageTransition } from "@/components/common/PageTransition";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ZoomAwareAutocomplete } from "@/components/common/ZoomAwareAutocomplete";
import { ZoomAwareSelect } from "@/components/common/ZoomAwareSelect";
import { type Column, DataTable } from "@/components/data-display/DataTable";
import { useSymbolOptions } from "@/hooks/useSymbolOptions";
import { useUIStore } from "@/store/uiStore";
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
	const backendStatus = useUIStore((s) => s.backendStatus);
	const { symbolOptions, isLoading: symbolsLoading } = useSymbolOptions();
	const createUiKey = useCallback(() => crypto.randomUUID(), []);

	const [existingTaskId, setExistingTaskId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const [scheduleKeys, setScheduleKeys] = useState<string[]>(() => [
		createUiKey(),
	]);
	const [monitoringConditionKeys, setMonitoringConditionKeys] = useState<
		string[]
	>([]);

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

	const selectedSymbolOptions = useMemo<SymbolOption[]>(() => {
		return formData.symbols.map((sym) => {
			const found =
				symbolOptions.find((o) => o.symbol === sym && o.group === "Popular") ??
				symbolOptions.find((o) => o.symbol === sym);
			if (found) return found;
			const [base, quote] = sym.split("-");
			return {
				symbol: sym,
				base: base ?? sym,
				quote: quote ?? "USDT",
				group: "Popular",
			};
		});
	}, [formData.symbols, symbolOptions]);

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
		setScheduleKeys(
			(task.schedules.length > 0 ? task.schedules : [{}]).map(() =>
				createUiKey(),
			),
		);
		setMonitoringConditionKeys(
			(task.monitoringConditions ?? []).map(() => createUiKey()),
		);
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
	}, [createUiKey, task]);

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
			setScheduleKeys([createUiKey()]);
			setMonitoringConditionKeys([]);
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
	const isWaitingForBackend =
		backendStatus === "connecting" && tasksQuery.isError && !tasksQuery.data;
	const isLoadingTasks = tasksQuery.isLoading || isWaitingForBackend;

	useEffect(() => {
		if (backendStatus !== "online" || !tasksQuery.isError) {
			return;
		}

		void tasksQuery.refetch();
	}, [backendStatus, tasksQuery.isError, tasksQuery.refetch]);

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

	const handleDelete = () => {
		if (!existingTaskId) return;
		setShowDeleteConfirm(true);
	};

	const handleConfirmDelete = async () => {
		if (!existingTaskId) return;
		try {
			await deleteTaskMutation.mutateAsync(existingTaskId);
		} catch {
			// handled in mutation callbacks
		}
		setShowDeleteConfirm(false);
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
		setScheduleKeys((prev) => prev.filter((_, i) => i !== idx));
		setFormData({
			...formData,
			schedules: formData.schedules.filter((_, i) => i !== idx),
		});
	};

	const addSchedule = () => {
		setScheduleKeys((prev) => [...prev, createUiKey()]);
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
					<SectionHeader
						title="Automated Tasks"
						subtitle="Configure and manage scheduled agent trading tasks"
						action={task ? getStatusChip(task.status) : undefined}
					/>
					{existingTaskId && (
						<Box sx={{ display: "flex", gap: 1, mb: 2 }}>
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

					{(error || (tasksQuery.isError && !isWaitingForBackend)) && (
						<Alert
							severity="error"
							onClose={() => setError(null)}
							sx={{ mb: 2 }}
						>
							{error ?? "Failed to load tasks"}
						</Alert>
					)}

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

										<ZoomAwareAutocomplete<SymbolOption, true, false, false>
											multiple
											filterSelectedOptions
											value={selectedSymbolOptions}
											onChange={(_, newValue) => {
												const uniqueSymbols = [
													...new Set(newValue.map((opt) => opt.symbol)),
												];
												setFormData({
													...formData,
													symbols: uniqueSymbols,
												});
											}}
											options={symbolOptions}
											groupBy={(option) => option.group}
											getOptionLabel={(option) => option.symbol}
											renderOption={(props, option) => (
												<li {...props} key={`${option.group}-${option.symbol}`}>
													<Box
														sx={{
															display: "flex",
															alignItems: "center",
															gap: 1.5,
														}}
													>
														<CoinIcon symbol={option.base} size={28} />
														<Box>
															<Typography variant="body2" fontWeight={600}>
																{option.symbol}
															</Typography>
															<Typography
																variant="caption"
																color="text.secondary"
															>
																{option.base} / {option.quote}
															</Typography>
														</Box>
													</Box>
												</li>
											)}
											renderTags={(value, getTagProps) =>
												value.map((option, index) => {
													const { key, ...tagProps } = getTagProps({ index });
													return (
														<Chip
															key={key}
															label={option.symbol}
															size="small"
															icon={<CoinIcon symbol={option.base} size={18} />}
															{...tagProps}
														/>
													);
												})
											}
											isOptionEqualToValue={(option, value) =>
												option.symbol === value.symbol &&
												option.group === value.group
											}
											loading={symbolsLoading}
											renderInput={(params) => (
												<TextField
													{...params}
													label="Symbols"
													placeholder={
														formData.symbols.length === 0
															? "Search instruments..."
															: ""
													}
													slotProps={{
														input: {
															...params.InputProps,
															endAdornment: (
																<>
																	{symbolsLoading ? (
																		<CircularProgress size={18} />
																	) : null}
																	{params.InputProps.endAdornment}
																</>
															),
														},
													}}
												/>
											)}
										/>

										<Typography
											variant="overline"
											color="text.secondary"
											sx={{ mt: 1, display: "block" }}
										>
											Schedule Configuration
										</Typography>

										{formData.schedules.map((schedule, idx) => (
											<Box
												key={scheduleKeys[idx] as string}
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
														<ZoomAwareSelect
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
														</ZoomAwareSelect>
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
										<Typography
											variant="overline"
											color="text.secondary"
											sx={{ mt: 1, display: "block" }}
										>
											Risk & Analysis
										</Typography>
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

										<Typography
											variant="overline"
											color="text.secondary"
											sx={{ mt: 1, display: "block" }}
										>
											Trading Configuration
										</Typography>
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
													<ZoomAwareSelect
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
													</ZoomAwareSelect>
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

												<TextField
													label="Max Daily Trades"
													type="number"
													value={formData.maxDailyTrades || ""}
													onChange={(e) =>
														setFormData({
															...formData,
															maxDailyTrades: e.target.value
																? Number(e.target.value)
																: undefined,
														})
													}
													fullWidth
													helperText="Limit how many trades the agent can execute per day"
													slotProps={{
														htmlInput: { min: 1, step: 1 },
													}}
												/>
											</>
										)}

										<Typography
											variant="overline"
											color="text.secondary"
											sx={{ mt: 1, display: "block" }}
										>
											Monitoring
										</Typography>
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
															key={monitoringConditionKeys[index] as string}
															sx={{
																display: "flex",
																gap: 1,
																alignItems: "flex-start",
															}}
														>
															<FormControl sx={{ minWidth: 160 }}>
																<InputLabel>Condition</InputLabel>
																<ZoomAwareSelect
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
																</ZoomAwareSelect>
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
																	<ZoomAwareSelect
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
																	</ZoomAwareSelect>
																</FormControl>
															)}

															<IconButton
																size="small"
																color="error"
																onClick={() => {
																	setMonitoringConditionKeys((prev) =>
																		prev.filter((_, i) => i !== index),
																	);
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
														setMonitoringConditionKeys((prev) => [
															...prev,
															createUiKey(),
														]);
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

										<Typography
											variant="overline"
											color="text.secondary"
											sx={{ mt: 1, display: "block" }}
										>
											Additional Settings
										</Typography>
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
								<Accordion defaultExpanded={false}>
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
				<ConfirmDialog
					open={showDeleteConfirm}
					title="Delete Task"
					message="Are you sure you want to delete this task? This action cannot be undone."
					confirmLabel="Delete"
					destructive
					loading={deleteTaskMutation.isPending}
					onConfirm={handleConfirmDelete}
					onCancel={() => setShowDeleteConfirm(false)}
				/>
			</PageTransition>
		</LocalizationProvider>
	);
}
