/**
 * Tasks Page - Single task with multiple toggleable schedules
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { format, parse } from "date-fns";
import {
	Bell,
	ChevronDown,
	Clock,
	Loader2,
	MinusCircle,
	Pause,
	Play,
	PlusCircle,
	RotateCw,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { tasksApi } from "@/api/endpoints/tasks";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { PageTransition } from "@/components/common/PageTransition";
import { SectionHeader } from "@/components/common/SectionHeader";
import { StrategyDiscoveryCard } from "@/components/tasks/StrategyDiscoveryCard";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { type Column, DataTable } from "@/components/data-display/DataTable";
import { cn } from "@/lib/utils";
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
	const backendStatus = useUIStore((s) => s.backendStatus);
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

	const riskValues: RiskLevel[] = ["conservative", "moderate", "aggressive"];

	const getStatusBadge = (status: string) => {
		const config: Record<
			string,
			{
				variant: "default" | "secondary" | "destructive" | "outline";
				className?: string;
				label: string;
			}
		> = {
			active: {
				variant: "default",
				className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
				label: "Active",
			},
			paused: {
				variant: "default",
				className: "bg-amber-500/20 text-amber-400 border-amber-500/30",
				label: "Paused",
			},
			completed: { variant: "secondary", label: "Completed" },
			failed: { variant: "destructive", label: "Failed" },
		};
		const c = config[status] || { variant: "secondary" as const, label: status };
		return (
			<Badge variant={c.variant} className={c.className}>
				{c.label}
			</Badge>
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
					<Badge
						variant="default"
						className={cn(
							row.action === "buy"
								? "bg-emerald-500/20 text-emerald-400"
								: row.action === "sell"
									? "bg-red-500/20 text-red-400"
									: "",
						)}
					>
						{row.action.toUpperCase()}
					</Badge>
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
			render: (row) => getStatusBadge(row.status),
		},
	];

	const isSaving = createTaskMutation.isPending || updateTaskMutation.isPending;

	const handleSymbolToggle = (symbol: string) => {
		const current = formData.symbols;
		const updated = current.includes(symbol)
			? current.filter((s) => s !== symbol)
			: [...current, symbol];
		setFormData({ ...formData, symbols: updated });
	};

	return (
		<PageTransition pageKey="tasks">
			<div>
				{/* Header with title + task-level actions */}
				<SectionHeader
					title="Automated Tasks"
					subtitle="Configure and manage scheduled agent trading tasks"
					action={task ? getStatusBadge(task.status) : undefined}
				/>
				{existingTaskId && (
					<div className="mb-4 flex gap-2">
						{task?.status === "active" && (
							<>
								<Tooltip>
									<TooltipTrigger
										render={
											<Button
												variant="outline"
												size="sm"
												onClick={handleRunNow}
												disabled={runTaskMutation.isPending}
											/>
										}
									>
										<Play className="size-3.5" />
										Run Now
									</TooltipTrigger>
									<TooltipContent>Run Now</TooltipContent>
								</Tooltip>
								<Tooltip>
									<TooltipTrigger
										render={
											<Button
												variant="outline"
												size="sm"
												className="text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
												onClick={handlePause}
												disabled={pauseTaskMutation.isPending}
											/>
										}
									>
										<Pause className="size-3.5" />
										Pause
									</TooltipTrigger>
									<TooltipContent>Pause</TooltipContent>
								</Tooltip>
							</>
						)}
						{task?.status === "paused" && (
							<Tooltip>
								<TooltipTrigger
									render={
										<Button
											variant="outline"
											size="sm"
											className="text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
											onClick={handleResume}
											disabled={resumeTaskMutation.isPending}
										/>
									}
								>
									<Play className="size-3.5" />
									Resume
								</TooltipTrigger>
								<TooltipContent>Resume</TooltipContent>
							</Tooltip>
						)}
						<Tooltip>
							<TooltipTrigger
								render={
									<Button
										variant="destructive"
										size="sm"
										onClick={handleDelete}
										disabled={deleteTaskMutation.isPending}
									/>
								}
							>
								<Trash2 className="size-3.5" />
								Delete
							</TooltipTrigger>
							<TooltipContent>Delete</TooltipContent>
						</Tooltip>
					</div>
				)}

				{(error || (tasksQuery.isError && !isWaitingForBackend)) && (
					<Alert variant="destructive" className="mb-4">
						<AlertDescription>
							{error ?? "Failed to load tasks"}
						</AlertDescription>
					</Alert>
				)}

				<StrategyDiscoveryCard />

				{isLoadingTasks ? (
					<div className="flex justify-center py-8">
						<Loader2 className="size-6 animate-spin text-muted-foreground" />
					</div>
				) : (
					<>
						{/* Inline task form */}
						<Card className="mb-6">
							<CardContent className="flex flex-col gap-4">
								<div className="space-y-1.5">
									<Label htmlFor="task-name">Task Name</Label>
									<Input
										id="task-name"
										value={formData.name}
										onChange={(e) =>
											setFormData({ ...formData, name: e.target.value })
										}
										required
									/>
								</div>

								<div className="space-y-1.5">
									<Label htmlFor="task-description">Description</Label>
									<Textarea
										id="task-description"
										value={formData.description || ""}
										onChange={(e) =>
											setFormData({
												...formData,
												description: e.target.value,
											})
										}
										rows={2}
									/>
								</div>

								<div className="space-y-1.5">
									<Label>Symbols</Label>
									<div className="flex flex-wrap gap-1.5">
										{AVAILABLE_SYMBOLS.map((symbol) => (
											<Badge
												key={symbol}
												variant={
													formData.symbols.includes(symbol)
														? "default"
														: "outline"
												}
												className="cursor-pointer"
												onClick={() => handleSymbolToggle(symbol)}
											>
												{symbol}
											</Badge>
										))}
									</div>
								</div>

								<p className="mt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Schedule Configuration
								</p>

								{formData.schedules.map((schedule, idx) => (
									<div
										key={scheduleKeys[idx] as string}
										className={cn(
											"flex flex-col gap-2 rounded-lg border border-border p-3",
											schedule.enabled === false && "opacity-50",
										)}
									>
										<div className="flex flex-wrap items-center gap-2">
											<Switch
												checked={schedule.enabled !== false}
												onCheckedChange={(checked) =>
													updateSchedule(idx, { enabled: checked })
												}
												size="sm"
											/>

											<Select
												value={schedule.frequency}
												onValueChange={(val) =>
													updateSchedule(idx, {
														frequency: val as TaskFrequency,
													})
												}
											>
												<SelectTrigger size="sm" className="min-w-[130px]">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="once">Once</SelectItem>
													<SelectItem value="hourly">Hourly</SelectItem>
													<SelectItem value="daily">Daily</SelectItem>
													<SelectItem value="weekly">Weekly</SelectItem>
													<SelectItem value="custom">Custom</SelectItem>
												</SelectContent>
											</Select>

											{(schedule.frequency === "daily" ||
												schedule.frequency === "weekly") && (
												<div className="flex items-center gap-1.5">
													<Clock className="size-3.5 text-muted-foreground" />
													<input
														type="time"
														className="rounded-md border border-input bg-transparent px-3 py-1.5 text-sm text-foreground"
														value={schedule.scheduledTime || "09:00"}
														onChange={(e) =>
															updateSchedule(idx, {
																scheduledTime: e.target.value,
															})
														}
													/>
												</div>
											)}

											{schedule.frequency === "weekly" && (
												<Select
													value={String(schedule.dayOfWeek ?? 0)}
													onValueChange={(val) =>
														updateSchedule(idx, {
															dayOfWeek: Number(val),
														})
													}
												>
													<SelectTrigger size="sm" className="min-w-[120px]">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{DAYS_OF_WEEK.map((day) => (
															<SelectItem
																key={day.value}
																value={String(day.value)}
															>
																{day.label}
															</SelectItem>
														))}
													</SelectContent>
												</Select>
											)}

											{schedule.frequency === "custom" && (
												<Input
													value={schedule.cronExpression || ""}
													onChange={(e) =>
														updateSchedule(idx, {
															cronExpression: e.target.value,
														})
													}
													placeholder="0 9 * * *"
													className="flex-1"
												/>
											)}

											{formData.schedules.length > 1 && (
												<Tooltip>
													<TooltipTrigger
														render={
															<Button
																variant="ghost"
																size="icon-xs"
																className="text-destructive"
																onClick={() => removeSchedule(idx)}
															/>
														}
													>
														<MinusCircle className="size-4" />
													</TooltipTrigger>
													<TooltipContent>Remove schedule</TooltipContent>
												</Tooltip>
											)}
										</div>
									</div>
								))}

								<Button
									variant="ghost"
									size="sm"
									onClick={addSchedule}
									className="self-start"
								>
									<PlusCircle className="size-3.5" />
									Add Schedule
								</Button>

								{/* Risk Level */}
								<p className="mt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Risk & Analysis
								</p>
								<div className="px-4">
									<p className="mb-3 text-sm text-foreground">Risk Level</p>
									<Slider
										value={riskValues.indexOf(formData.riskLevel)}
										onValueChange={(val) =>
											setFormData({
												...formData,
												riskLevel: riskValues[val as number],
											})
										}
										step={1}
										min={0}
										max={2}
									/>
									<div className="mt-1 flex justify-between text-xs text-muted-foreground">
										<span>Conservative</span>
										<span>Moderate</span>
										<span>Aggressive</span>
									</div>
								</div>

								{/* Deep Analysis toggle */}
								<Tooltip>
									<TooltipTrigger className="flex items-center gap-2 self-start">
										<Switch
											checked={formData.useSubagents ?? false}
											onCheckedChange={(checked) =>
												setFormData({
													...formData,
													useSubagents: checked,
												})
											}
										/>
										<Label>Deep Analysis (Subagents)</Label>
									</TooltipTrigger>
									<TooltipContent>
										Run specialized subagents (Technical, Fundamental, News)
										before main analysis. More thorough but uses more API
										credits.
									</TooltipContent>
								</Tooltip>

								<p className="mt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Trading Configuration
								</p>
								<div className="flex items-center gap-2">
									<Switch
										checked={formData.tradingEnabled}
										onCheckedChange={(checked) =>
											setFormData({
												...formData,
												tradingEnabled: checked,
											})
										}
									/>
									<Label>Enable Trading</Label>
								</div>

								{formData.tradingEnabled && (
									<>
										<div className="space-y-1.5">
											<Label>Agent Mode</Label>
											<Select
												value={formData.agentMode}
												onValueChange={(val) =>
													setFormData({
														...formData,
														agentMode: val as AgentMode,
													})
												}
											>
												<SelectTrigger className="w-full">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="ask">
														<div className="flex items-center gap-1.5">
															<Bell className="size-3.5" />
															Ask - Notify for confirmation
														</div>
													</SelectItem>
													<SelectItem value="auto">
														<div className="flex items-center gap-1.5">
															<RotateCw className="size-3.5" />
															Auto - Execute automatically
														</div>
													</SelectItem>
												</SelectContent>
											</Select>
										</div>

										<div className="space-y-1.5">
											<Label htmlFor="max-position">
												Max Position Size (USDT)
											</Label>
											<Input
												id="max-position"
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
											/>
										</div>
									</>
								)}

								<p className="mt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Monitoring
								</p>
								<div className="flex items-center gap-2">
									<Switch
										checked={formData.monitoringEnabled}
										onCheckedChange={(checked) =>
											setFormData({
												...formData,
												monitoringEnabled: checked,
											})
										}
									/>
									<Label>Enable Monitoring</Label>
								</div>

								{formData.monitoringEnabled && (
									<>
										{(formData.monitoringConditions ?? []).map(
											(condition, index) => (
												<div
													key={monitoringConditionKeys[index] as string}
													className="flex flex-wrap items-start gap-2"
												>
													<Select
														value={condition.conditionType}
														onValueChange={(val) => {
															const updated = [
																...(formData.monitoringConditions ?? []),
															];
															updated[index] = {
																...updated[index],
																conditionType:
																	val as MonitoringConditionType,
															};
															setFormData({
																...formData,
																monitoringConditions: updated,
															});
														}}
													>
														<SelectTrigger
															size="sm"
															className="min-w-[160px]"
														>
															<SelectValue />
														</SelectTrigger>
														<SelectContent>
															{(
																Object.keys(
																	MONITORING_CONDITION_CONFIG,
																) as MonitoringConditionType[]
															).map((type) => (
																<SelectItem key={type} value={type}>
																	{MONITORING_CONDITION_CONFIG[type].label}
																</SelectItem>
															))}
														</SelectContent>
													</Select>

													<Input
														type="number"
														placeholder={`Threshold (${MONITORING_CONDITION_CONFIG[condition.conditionType]?.unit || ""})`}
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
														className="w-[140px]"
													/>

													{condition.conditionType === "custom" ? (
														<Input
															placeholder="Description"
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
															className="flex-1"
														/>
													) : (
														<Select
															value={condition.timeframe ?? ""}
															onValueChange={(val) => {
																const updated = [
																	...(formData.monitoringConditions ?? []),
																];
																updated[index] = {
																	...updated[index],
																	timeframe: val || undefined,
																};
																setFormData({
																	...formData,
																	monitoringConditions: updated,
																});
															}}
														>
															<SelectTrigger
																size="sm"
																className="min-w-[90px]"
															>
																<SelectValue placeholder="Timeframe" />
															</SelectTrigger>
															<SelectContent>
																<SelectItem value="">-</SelectItem>
																<SelectItem value="1H">1H</SelectItem>
																<SelectItem value="4H">4H</SelectItem>
																<SelectItem value="1D">1D</SelectItem>
															</SelectContent>
														</Select>
													)}

													<Button
														variant="ghost"
														size="icon-xs"
														className="text-destructive"
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
														<MinusCircle className="size-4" />
													</Button>
												</div>
											),
										)}

										<Button
											variant="ghost"
											size="sm"
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
											className="self-start"
										>
											<PlusCircle className="size-3.5" />
											Add Condition
										</Button>

										<div className="px-2">
											<p className="mb-2 text-sm">
												Alert Cooldown:{" "}
												{formData.alertCooldownMinutes ?? 60} minutes
											</p>
											<Slider
												value={formData.alertCooldownMinutes ?? 60}
												onValueChange={(val) =>
													setFormData({
														...formData,
														alertCooldownMinutes: val as number,
													})
												}
												min={5}
												max={1440}
												step={5}
											/>
											<div className="mt-1 flex justify-between text-xs text-muted-foreground">
												<span>15m</span>
												<span>1h</span>
												<span>6h</span>
												<span>24h</span>
											</div>
										</div>
									</>
								)}

								<p className="mt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
									Additional Settings
								</p>
								<div className="space-y-1.5">
									<Label htmlFor="custom-instructions">
										Custom Instructions
									</Label>
									<Textarea
										id="custom-instructions"
										value={formData.customInstructions || ""}
										onChange={(e) =>
											setFormData({
												...formData,
												customInstructions: e.target.value,
											})
										}
										rows={3}
										placeholder="Additional instructions for the agent..."
									/>
								</div>

								{/* Save button */}
								<div className="flex justify-end">
									<Button onClick={handleSave} disabled={isSaving}>
										{isSaving ? "Saving..." : "Save"}
									</Button>
								</div>
							</CardContent>
						</Card>

						{/* History accordion */}
						{existingTaskId && (
							<Accordion>
								<AccordionItem value="history">
									<AccordionTrigger>
										<h3 className="text-base font-semibold">
											Recent Executions - {task?.name}
										</h3>
									</AccordionTrigger>
									<AccordionContent>
										<DataTable
											columns={historyColumns}
											rows={taskHistory}
											rowKey="id"
											loading={historyLoading}
											emptyMessage="No executions yet"
											maxHeight={400}
										/>
									</AccordionContent>
								</AccordionItem>
							</Accordion>
						)}
					</>
				)}
			</div>
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
	);
}
