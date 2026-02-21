/**
 * Tasks Page - Scheduled Trading Tasks
 */

import AddIcon from "@mui/icons-material/Add";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import AutoModeIcon from "@mui/icons-material/AutoMode";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import NotificationsIcon from "@mui/icons-material/Notifications";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import ScheduleIcon from "@mui/icons-material/Schedule";
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
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Divider,
	FormControl,
	FormControlLabel,
	Grid2 as Grid,
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useState } from "react";
import { tasksApi } from "@/api/endpoints/tasks";
import { PageTransition } from "@/components/common/PageTransition";
import { type Column, DataTable } from "@/components/data-display/DataTable";
import type {
	AgentMode,
	AgentTask,
	MonitoringCondition,
	MonitoringConditionType,
	RiskLevel,
	TaskCreate,
	TaskExecution,
	TaskFrequency,
	TaskType,
} from "@/types/task";
import { MONITORING_CONDITION_CONFIG } from "@/types/task";
import { staggerCascade } from "@/utils/animations/variants";
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

	const [createDialogOpen, setCreateDialogOpen] = useState(false);
	const [editingTask, setEditingTask] = useState<AgentTask | null>(null);
	const [selectedTaskHistory, setSelectedTaskHistory] = useState<string | null>(
		null,
	);
	const [error, setError] = useState<string | null>(null);

	// Form state
	const [formData, setFormData] = useState<TaskCreate>({
		name: "",
		description: "",
		taskType: "analysis",
		frequency: "daily",
		scheduledTime: "09:00",
		symbols: [],
		riskLevel: "moderate",
		agentMode: "ask",
	});

	const tasksQuery = useQuery({
		queryKey: ["tasks"],
		queryFn: () => tasksApi.getTasks(),
		staleTime: 30_000,
	});

	const historyQuery = useQuery({
		queryKey: ["tasks", "history", selectedTaskHistory],
		queryFn: () => tasksApi.getTaskHistory(selectedTaskHistory as string),
		enabled: !!selectedTaskHistory,
	});

	const createTaskMutation = useMutation({
		mutationFn: (payload: TaskCreate) => tasksApi.createTask(payload),
		onSuccess: () => {
			setCreateDialogOpen(false);
			resetForm();
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
			setEditingTask(null);
			resetForm();
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
			if (selectedTaskHistory) {
				void queryClient.invalidateQueries({
					queryKey: ["tasks", "history", selectedTaskHistory],
				});
			}
		},
		onError: () => {
			setError("Failed to run task");
		},
	});

	const tasks = tasksQuery.data?.tasks ?? [];
	const activeTasks = tasks.filter((task) => task.status === "active");
	const pausedTasks = tasks.filter((task) => task.status === "paused");
	const taskHistory = historyQuery.data?.executions ?? [];
	const historyLoading = historyQuery.isLoading;
	const isLoadingTasks = tasksQuery.isLoading;

	const handleCreateTask = async () => {
		try {
			await createTaskMutation.mutateAsync(formData);
		} catch {
			// handled in mutation callbacks
		}
	};

	const handleUpdateTask = async () => {
		if (!editingTask) return;
		try {
			await updateTaskMutation.mutateAsync({
				taskId: editingTask.id,
				payload: formData,
			});
		} catch {
			// handled in mutation callbacks
		}
	};

	const handleDeleteTask = async (taskId: string) => {
		if (!confirm("Are you sure you want to delete this task?")) return;
		try {
			await deleteTaskMutation.mutateAsync(taskId);
		} catch {
			// handled in mutation callbacks
		}
	};

	const handlePauseTask = async (taskId: string) => {
		try {
			await pauseTaskMutation.mutateAsync(taskId);
		} catch {
			// handled in mutation callbacks
		}
	};

	const handleResumeTask = async (taskId: string) => {
		try {
			await resumeTaskMutation.mutateAsync(taskId);
		} catch {
			// handled in mutation callbacks
		}
	};

	const handleRunNow = async (taskId: string) => {
		try {
			await runTaskMutation.mutateAsync(taskId);
		} catch {
			// handled in mutation callbacks
		}
	};

	const loadTaskHistory = (taskId: string) => {
		setSelectedTaskHistory(taskId);
	};

	const resetForm = () => {
		setFormData({
			name: "",
			description: "",
			taskType: "analysis",
			frequency: "daily",
			scheduledTime: "09:00",
			symbols: [],
			riskLevel: "moderate",
			agentMode: "ask",
			monitoringConditions: [],
			alertCooldownMinutes: 60,
			useSubagents: false,
		});
	};

	const openEditDialog = (task: AgentTask) => {
		setFormData({
			name: task.name,
			description: task.description,
			taskType: task.taskType,
			frequency: task.frequency,
			cronExpression: task.cronExpression,
			scheduledTime: task.scheduledTime,
			dayOfWeek: task.dayOfWeek,
			symbols: task.symbols,
			riskLevel: task.riskLevel,
			agentMode: task.agentMode,
			maxPositionSize: task.maxPositionSize,
			monitoringConditions: task.monitoringConditions ?? [],
			alertCooldownMinutes: task.alertCooldownMinutes ?? 60,
			useSubagents: task.useSubagents ?? false,
			customInstructions: task.customInstructions,
		});
		setEditingTask(task);
	};

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

	const getRiskChip = (riskLevel: RiskLevel) => {
		const colors: Record<RiskLevel, "success" | "warning" | "error"> = {
			conservative: "success",
			moderate: "warning",
			aggressive: "error",
		};
		return (
			<Chip
				label={riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)}
				size="small"
				color={colors[riskLevel]}
				variant="outlined"
			/>
		);
	};

	const getModeIcon = (mode: AgentMode) => {
		return mode === "auto" ? (
			<Tooltip title="Auto: Executes trades automatically">
				<AutoModeIcon fontSize="small" color="primary" />
			</Tooltip>
		) : (
			<Tooltip title="Ask: Notifies for confirmation">
				<NotificationsIcon fontSize="small" color="secondary" />
			</Tooltip>
		);
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

	return (
		<PageTransition pageKey="tasks">
			<Box>
				<Box
					sx={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						mb: 3,
					}}
				>
					<Typography variant="h4" fontWeight={700}>
						Scheduled Tasks
					</Typography>
					<Button
						variant="contained"
						startIcon={<AddIcon />}
						onClick={() => setCreateDialogOpen(true)}
					>
						New Task
					</Button>
				</Box>

				{(error || tasksQuery.isError) && (
					<Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
						{error ?? "Failed to load tasks"}
					</Alert>
				)}

				{isLoadingTasks ? (
					<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
						<CircularProgress />
					</Box>
				) : (
					<>
						{/* Active Tasks */}
						<Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
							Active Tasks ({activeTasks.length})
						</Typography>
						<motion.div
							variants={staggerCascade.container}
							initial="hidden"
							animate="visible"
						>
							<Grid container spacing={2} sx={{ mb: 4 }}>
								{activeTasks.length === 0 ? (
									<Grid size={12}>
										<Card>
											<CardContent>
												<Typography color="text.secondary" align="center">
													No active tasks. Create one to get started.
												</Typography>
											</CardContent>
										</Card>
									</Grid>
								) : (
									activeTasks.map((task) => (
										<Grid size={{ xs: 12, md: 6, lg: 4 }} key={task.id}>
											<motion.div variants={staggerCascade.item}>
												<TaskCard
													task={task}
													onPause={() => handlePauseTask(task.id)}
													onRunNow={() => handleRunNow(task.id)}
													onEdit={() => openEditDialog(task)}
													onDelete={() => handleDeleteTask(task.id)}
													onViewHistory={() => loadTaskHistory(task.id)}
													getRiskChip={getRiskChip}
													getModeIcon={getModeIcon}
												/>
											</motion.div>
										</Grid>
									))
								)}
							</Grid>
						</motion.div>

						{/* Paused Tasks */}
						{pausedTasks.length > 0 && (
							<>
								<Typography variant="h6" gutterBottom>
									Paused Tasks ({pausedTasks.length})
								</Typography>
								<Grid container spacing={2} sx={{ mb: 4 }}>
									{pausedTasks.map((task) => (
										<Grid size={{ xs: 12, md: 6, lg: 4 }} key={task.id}>
											<TaskCard
												task={task}
												onResume={() => handleResumeTask(task.id)}
												onEdit={() => openEditDialog(task)}
												onDelete={() => handleDeleteTask(task.id)}
												onViewHistory={() => loadTaskHistory(task.id)}
												getRiskChip={getRiskChip}
												getModeIcon={getModeIcon}
											/>
										</Grid>
									))}
								</Grid>
							</>
						)}

						{/* Task History */}
						{selectedTaskHistory && (
							<Accordion defaultExpanded>
								<AccordionSummary expandIcon={<ExpandMoreIcon />}>
									<Typography variant="h6">
										Recent Executions -{" "}
										{tasks.find((t) => t.id === selectedTaskHistory)?.name}
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

				{/* Create/Edit Dialog */}
				<TaskFormDialog
					open={createDialogOpen || editingTask !== null}
					onClose={() => {
						setCreateDialogOpen(false);
						setEditingTask(null);
						resetForm();
					}}
					onSubmit={editingTask ? handleUpdateTask : handleCreateTask}
					formData={formData}
					setFormData={setFormData}
					isEditing={editingTask !== null}
				/>
			</Box>
		</PageTransition>
	);
}

// Task Card Component
interface TaskCardProps {
	task: AgentTask;
	onPause?: () => void;
	onResume?: () => void;
	onRunNow?: () => void;
	onEdit: () => void;
	onDelete: () => void;
	onViewHistory: () => void;
	getRiskChip: (risk: RiskLevel) => ReactNode;
	getModeIcon: (mode: AgentMode) => ReactNode;
}

function TaskCard({
	task,
	onPause,
	onResume,
	onRunNow,
	onEdit,
	onDelete,
	onViewHistory,
	getRiskChip,
	getModeIcon,
}: TaskCardProps) {
	const getFrequencyLabel = (task: AgentTask) => {
		if (task.frequency === "daily" && task.scheduledTime) {
			return `Daily at ${task.scheduledTime}`;
		}
		if (task.frequency === "weekly" && task.dayOfWeek !== undefined) {
			const day = DAYS_OF_WEEK.find((d) => d.value === task.dayOfWeek)?.label;
			return `Weekly on ${day} at ${task.scheduledTime || "09:00"}`;
		}
		return task.frequency.charAt(0).toUpperCase() + task.frequency.slice(1);
	};

	return (
		<Card sx={{ height: "100%" }}>
			<CardContent>
				<Box
					sx={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "flex-start",
						mb: 1,
					}}
				>
					<Typography variant="h6" noWrap sx={{ maxWidth: "60%" }}>
						{task.name}
					</Typography>
					<Box sx={{ display: "flex", gap: 0.5 }}>
						{getModeIcon(task.agentMode)}
						{task.status === "active" ? (
							<Chip label="Active" size="small" color="success" />
						) : (
							<Chip label="Paused" size="small" color="warning" />
						)}
					</Box>
				</Box>

				{task.description && (
					<Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
						{task.description}
					</Typography>
				)}

				<Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 2 }}>
					{task.symbols.map((s) => (
						<Chip key={s} label={s} size="small" variant="outlined" />
					))}
				</Box>

				{task.taskType === "monitoring" &&
					task.monitoringConditions &&
					task.monitoringConditions.length > 0 && (
						<Box sx={{ mb: 1 }}>
							{task.monitoringConditions.map((c, i) => (
								<Chip
									key={i}
									label={`${MONITORING_CONDITION_CONFIG[c.conditionType]?.label ?? c.conditionType}: ${c.threshold}${MONITORING_CONDITION_CONFIG[c.conditionType]?.unit ?? ""}`}
									size="small"
									variant="outlined"
									color="info"
									sx={{ mr: 0.5, mb: 0.5 }}
								/>
							))}
						</Box>
					)}

				<Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
					<ScheduleIcon fontSize="small" color="action" />
					<Typography variant="body2" color="text.secondary">
						{getFrequencyLabel(task)}
					</Typography>
				</Box>

				<Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
					<Typography variant="body2" color="text.secondary">
						Risk:
					</Typography>
					{getRiskChip(task.riskLevel)}
					<Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
						Runs: {task.runCount} ({task.successCount} success)
					</Typography>
				</Box>

				{task.nextRunAt && (
					<Typography
						variant="caption"
						color="text.secondary"
						display="block"
						sx={{ mb: 1 }}
					>
						Next run: {formatDateTime(task.nextRunAt)}
					</Typography>
				)}

				<Divider sx={{ my: 1 }} />

				<Box sx={{ display: "flex", justifyContent: "space-between" }}>
					<Box>
						{task.status === "active" ? (
							<>
								<Tooltip title="Pause">
									<IconButton size="small" onClick={onPause}>
										<PauseIcon />
									</IconButton>
								</Tooltip>
								<Tooltip title="Run Now">
									<IconButton size="small" color="primary" onClick={onRunNow}>
										<PlayArrowIcon />
									</IconButton>
								</Tooltip>
							</>
						) : (
							<Tooltip title="Resume">
								<IconButton size="small" color="success" onClick={onResume}>
									<PlayArrowIcon />
								</IconButton>
							</Tooltip>
						)}
					</Box>
					<Box>
						<Tooltip title="View History">
							<IconButton size="small" onClick={onViewHistory}>
								<ScheduleIcon />
							</IconButton>
						</Tooltip>
						<Tooltip title="Edit">
							<IconButton size="small" onClick={onEdit}>
								<EditIcon />
							</IconButton>
						</Tooltip>
						<Tooltip title="Delete">
							<IconButton size="small" color="error" onClick={onDelete}>
								<DeleteIcon />
							</IconButton>
						</Tooltip>
					</Box>
				</Box>
			</CardContent>
		</Card>
	);
}

// Task Form Dialog
interface TaskFormDialogProps {
	open: boolean;
	onClose: () => void;
	onSubmit: () => void;
	formData: TaskCreate;
	setFormData: Dispatch<SetStateAction<TaskCreate>>;
	isEditing: boolean;
}

function TaskFormDialog({
	open,
	onClose,
	onSubmit,
	formData,
	setFormData,
	isEditing,
}: TaskFormDialogProps) {
	const riskMarks = [
		{ value: 0, label: "Conservative" },
		{ value: 1, label: "Moderate" },
		{ value: 2, label: "Aggressive" },
	];
	const riskValues: RiskLevel[] = ["conservative", "moderate", "aggressive"];

	return (
		<Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
			<DialogTitle>{isEditing ? "Edit Task" : "Create New Task"}</DialogTitle>
			<DialogContent>
				<Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
					<TextField
						label="Task Name"
						value={formData.name}
						onChange={(e) => setFormData({ ...formData, name: e.target.value })}
						fullWidth
						required
					/>

					<TextField
						label="Description"
						value={formData.description || ""}
						onChange={(e) =>
							setFormData({ ...formData, description: e.target.value })
						}
						fullWidth
						multiline
						rows={2}
					/>

					<FormControl fullWidth>
						<InputLabel>Task Type</InputLabel>
						<Select
							value={formData.taskType}
							label="Task Type"
							onChange={(e) =>
								setFormData({
									...formData,
									taskType: e.target.value as TaskType,
								})
							}
						>
							<MenuItem value="analysis">Analysis Only</MenuItem>
							<MenuItem value="trading">Analysis + Trading</MenuItem>
							<MenuItem value="monitoring">Price Monitoring</MenuItem>
						</Select>
					</FormControl>

					<FormControl fullWidth>
						<InputLabel>Frequency</InputLabel>
						<Select
							value={formData.frequency}
							label="Frequency"
							onChange={(e) =>
								setFormData({
									...formData,
									frequency: e.target.value as TaskFrequency,
								})
							}
						>
							<MenuItem value="once">Once</MenuItem>
							<MenuItem value="hourly">Hourly</MenuItem>
							<MenuItem value="daily">Daily</MenuItem>
							<MenuItem value="weekly">Weekly</MenuItem>
							<MenuItem value="custom">Custom (Cron)</MenuItem>
						</Select>
					</FormControl>

					{(formData.frequency === "daily" ||
						formData.frequency === "weekly") && (
						<TextField
							label="Scheduled Time"
							type="time"
							value={formData.scheduledTime || "09:00"}
							onChange={(e) =>
								setFormData({ ...formData, scheduledTime: e.target.value })
							}
							fullWidth
							slotProps={{
								inputLabel: { shrink: true },
							}}
						/>
					)}

					{formData.frequency === "weekly" && (
						<FormControl fullWidth>
							<InputLabel>Day of Week</InputLabel>
							<Select
								value={formData.dayOfWeek ?? 0}
								label="Day of Week"
								onChange={(e) =>
									setFormData({
										...formData,
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

					{formData.frequency === "custom" && (
						<TextField
							label="Cron Expression"
							value={formData.cronExpression || ""}
							onChange={(e) =>
								setFormData({ ...formData, cronExpression: e.target.value })
							}
							fullWidth
							placeholder="0 9 * * *"
							helperText="e.g., '0 9 * * *' for 9 AM daily"
						/>
					)}

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
								<Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
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

					<Box sx={{ px: 1 }}>
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
								"& .MuiSlider-markLabel": { fontSize: "0.75rem" },
							}}
						/>
					</Box>

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
								<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
									<NotificationsIcon fontSize="small" />
									Ask - Notify for confirmation
								</Box>
							</MenuItem>
							<MenuItem value="auto">
								<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
									<AutoModeIcon fontSize="small" />
									Auto - Execute automatically
								</Box>
							</MenuItem>
						</Select>
					</FormControl>

					{(formData.taskType === "analysis" ||
						formData.taskType === "trading") && (
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
					)}

					{formData.taskType === "monitoring" && (
						<>
							<Divider>
								<Typography variant="caption" color="text.secondary">
									Monitoring Conditions
								</Typography>
							</Divider>

							{(formData.monitoringConditions ?? []).map((condition, index) => (
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
														...(formData.monitoringConditions ?? []),
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
							))}

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
									Alert Cooldown: {formData.alertCooldownMinutes ?? 60} minutes
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
										"& .MuiSlider-markLabel": { fontSize: "0.7rem" },
									}}
								/>
							</Box>
						</>
					)}

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
						label="Custom Instructions"
						value={formData.customInstructions || ""}
						onChange={(e) =>
							setFormData({ ...formData, customInstructions: e.target.value })
						}
						fullWidth
						multiline
						rows={3}
						placeholder="Additional instructions for the agent..."
					/>
				</Box>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose}>Cancel</Button>
				<Button
					variant="contained"
					onClick={onSubmit}
					disabled={!formData.name || formData.symbols.length === 0}
				>
					{isEditing ? "Update" : "Create"}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
