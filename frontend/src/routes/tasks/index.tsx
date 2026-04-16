/**
 * Task Configuration Page — single-task auto-save design.
 * Auto-creates a default task on first visit, debounces all changes.
 *
 * Layout: sticky action bar → stat strip → two-column (config | status).
 */

import { Alert, Box, CircularProgress } from "@mui/material";
import Grid from "@mui/material/Grid2";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { decisionsApi } from "@/api/endpoints/decisions";
import { tasksApi } from "@/api/endpoints/tasks";
import { PageTransition } from "@/components/common/PageTransition";
import { SectionHeader } from "@/components/common/SectionHeader";
import { StrategyDiscoveryCard } from "@/components/strategies/StrategyDiscoveryCard";
import {
	DuplicateTasksBanner,
	GeneralSection,
	MonitoringSection,
	RecentRunsPanel,
	ScheduleSection,
	TaskActionBar,
	TaskConfigProvider,
	TaskRunningProgress,
	TaskStatStrip,
	TradingSection,
} from "@/components/tasks";
import { useDebouncedSave } from "@/hooks/useDebouncedSave";
import { useSymbolOptions } from "@/hooks/useSymbolOptions";
import { useAgentStore } from "@/store/agentStore";
import { useAuthStore } from "@/store/authStore";
import { notify, useUIStore } from "@/store/uiStore";
import type { TaskCreate, TaskUpdate } from "@/types/task";
import { staggerCascade } from "@/utils/animations/variants";
import { requireAuth } from "../-guards";

export const Route = createFileRoute("/tasks/")({
	beforeLoad: requireAuth,
	component: TaskConfigPage,
});

const DEFAULT_FORM: TaskCreate = {
	name: "Trading Task",
	description: "",
	tradingEnabled: false,
	monitoringEnabled: false,
	schedules: [{ frequency: "daily", scheduledTime: "09:00", enabled: true }],
	symbols: [],
	riskLevel: "moderate",
	holdingTerm: "medium",
	agentMode: "ask",
	monitoringConditions: [],
	alertCooldownMinutes: 60,
	useSubagents: false,
};

function buildTaskForm(task: TaskCreate | TaskUpdate) {
	return {
		name: task.name ?? DEFAULT_FORM.name,
		description: task.description,
		tradingEnabled: task.tradingEnabled ?? false,
		monitoringEnabled: task.monitoringEnabled ?? false,
		schedules:
			task.schedules && task.schedules.length > 0
				? task.schedules.map((schedule) => ({
						...schedule,
						enabled: schedule.enabled ?? true,
					}))
				: [{ frequency: "daily", scheduledTime: "09:00", enabled: true }],
		symbols: task.symbols ?? [],
		riskLevel: task.riskLevel ?? "moderate",
		holdingTerm: task.holdingTerm ?? "medium",
		agentMode: task.agentMode ?? "ask",
		maxPositionSize: task.maxPositionSize,
		maxDailyTrades: task.maxDailyTrades,
		monitoringConditions: task.monitoringConditions ?? [],
		alertCooldownMinutes: task.alertCooldownMinutes ?? 60,
		useSubagents: task.useSubagents ?? false,
		customInstructions: task.customInstructions,
	} satisfies TaskCreate;
}

function buildEditableTaskUpdate(formData: TaskCreate): TaskUpdate {
	return {
		description: formData.description,
		symbols: formData.symbols,
		customInstructions: formData.customInstructions,
		schedules: formData.schedules,
		tradingEnabled: formData.tradingEnabled,
		agentMode: formData.agentMode,
		riskLevel: formData.riskLevel,
		holdingTerm: formData.holdingTerm,
		useSubagents: formData.useSubagents,
		maxPositionSize: formData.maxPositionSize,
		maxDailyTrades: formData.maxDailyTrades,
		monitoringEnabled: formData.monitoringEnabled,
		monitoringConditions: formData.monitoringConditions,
		alertCooldownMinutes: formData.alertCooldownMinutes,
	};
}

function serializeEditableTaskUpdate(update: TaskUpdate): string {
	return JSON.stringify(update);
}

function TaskConfigPage() {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const backendStatus = useUIStore((s) => s.backendStatus);
	const isSuperuser = useAuthStore((s) => s.user?.isSuperuser) ?? false;
	const { symbolOptions, isLoading: symbolsLoading } = useSymbolOptions();
	const [taskId, setTaskId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [formData, setFormData] = useState<TaskCreate>({ ...DEFAULT_FORM });
	const [manualRunning, setManualRunning] = useState(false);

	const initRef = useRef(false);
	const autoCreatingRef = useRef(false);
	const lastSyncedPayloadRef = useRef<string | null>(null);
	const currentPayloadRef = useRef(
		serializeEditableTaskUpdate(buildEditableTaskUpdate(DEFAULT_FORM)),
	);
	const prevIsRunningRef = useRef(false);

	// ── Queries ──────────────────────────────────────────────────────────

	const tasksQuery = useQuery({
		queryKey: ["tasks"],
		queryFn: () => tasksApi.getTasks(),
		staleTime: 30_000,
		refetchInterval: (query) => {
			const tasks = query.state.data?.tasks ?? [];
			const anyRunning = tasks.some((t) => t.isRunning);
			return manualRunning || prevIsRunningRef.current || anyRunning
				? 3_000
				: false;
		},
	});

	const allTasks = tasksQuery.data?.tasks ?? [];
	const task = allTasks[0] ?? null;
	const isTaskRunning = task?.isRunning || manualRunning;

	// ── Mutations ────────────────────────────────────────────────────────

	const createTaskMutation = useMutation({
		mutationFn: (payload: TaskCreate) => tasksApi.createTask(payload),
		onSuccess: (created) => {
			setTaskId(created.id);
			setError(null);
			autoCreatingRef.current = false;
			void queryClient.invalidateQueries({ queryKey: ["tasks"] });
		},
		onError: () => {
			setError("Failed to create task");
			autoCreatingRef.current = false;
		},
	});

	const pauseTaskMutation = useMutation({
		mutationFn: (id: string) => tasksApi.pauseTask(id),
		onSuccess: () => {
			setError(null);
			void queryClient.invalidateQueries({ queryKey: ["tasks"] });
		},
		onError: () => setError("Failed to pause task"),
	});

	const resumeTaskMutation = useMutation({
		mutationFn: (id: string) => tasksApi.resumeTask(id),
		onSuccess: () => {
			setError(null);
			void queryClient.invalidateQueries({ queryKey: ["tasks"] });
		},
		onError: () => setError("Failed to resume task"),
	});

	const runTaskMutation = useMutation({
		mutationFn: (id: string) => tasksApi.runTaskNow(id),
		onMutate: () => setManualRunning(true),
		onSuccess: () => {
			setError(null);
			void queryClient.invalidateQueries({ queryKey: ["tasks"] });
			if (taskId) {
				void queryClient.invalidateQueries({
					queryKey: ["tasks", "history", taskId],
				});
			}
		},
		onError: () => {
			setError("Failed to run task");
			setManualRunning(false);
		},
	});

	const mergeDuplicatesMutation = useMutation({
		mutationFn: () => tasksApi.mergeDuplicateTasks(),
		onSuccess: (result) => {
			setError(null);
			void queryClient.invalidateQueries({ queryKey: ["tasks"] });
			if (result.sessionId) {
				sessionStorage.setItem("agent:pendingSession", result.sessionId);
				void navigate({ to: "/agent" });
			} else {
				notify.success("Cleanup", result.message);
			}
		},
		onError: () => setError("Failed to merge duplicate tasks"),
	});

	// ── Debounced auto-save ──────────────────────────────────────────────

	const { triggerSave, saveStatus } = useDebouncedSave<TaskUpdate>({
		mutationFn: async (update) => {
			if (!taskId) return;
			console.debug("[task-save] saving to backend\u2026", {
				taskId,
				schedules: update.schedules,
			});
			await tasksApi.updateTask(taskId, update);
			lastSyncedPayloadRef.current = serializeEditableTaskUpdate(update);
			console.debug("[task-save] saved, invalidating query cache");
			void queryClient.invalidateQueries({ queryKey: ["tasks"] });
		},
		delay: 1500,
	});

	useEffect(() => {
		currentPayloadRef.current = serializeEditableTaskUpdate(
			buildEditableTaskUpdate(formData),
		);
	}, [formData]);

	// ── Populate form from backend task ─────────────────────────────────

	useEffect(() => {
		if (!task) {
			initRef.current = false;
			lastSyncedPayloadRef.current = null;
			setTaskId(null);
			return;
		}

		const backendFormData = buildTaskForm(task);
		const backendPayload = serializeEditableTaskUpdate(
			buildEditableTaskUpdate(backendFormData),
		);
		const previousSyncedPayload = lastSyncedPayloadRef.current;
		const localPayload = currentPayloadRef.current;

		const notInitialised = !initRef.current;
		const taskChanged = task.id !== taskId;
		const noLocalEdits = localPayload === previousSyncedPayload;
		const backendChanged = backendPayload !== previousSyncedPayload;

		const shouldHydrateForm =
			notInitialised || taskChanged || (backendChanged && noLocalEdits);

		console.debug("[task-hydrate] check", {
			shouldHydrateForm,
			notInitialised,
			taskChanged,
			noLocalEdits,
			backendChanged,
		});

		if (task.id !== taskId) {
			setTaskId(task.id);
		}

		if (!shouldHydrateForm) {
			console.debug("[task-hydrate] skipped \u2014 local edits pending");
			return;
		}

		console.debug("[task-hydrate] applying backend data to form");
		lastSyncedPayloadRef.current = backendPayload;
		initRef.current = false;
		setFormData(backendFormData);
		const t = setTimeout(() => {
			initRef.current = true;
		}, 0);
		return () => clearTimeout(t);
	}, [task, taskId]);

	// ── Auto-create when no task exists ──────────────────────────────────

	useEffect(() => {
		if (tasksQuery.isLoading || tasksQuery.isError) return;
		if (task) return;
		if (autoCreatingRef.current || createTaskMutation.isPending) return;
		autoCreatingRef.current = true;
		createTaskMutation.mutate({ ...DEFAULT_FORM });
	}, [
		tasksQuery.isLoading,
		tasksQuery.isError,
		task,
		createTaskMutation.isPending,
		createTaskMutation.mutate,
	]);

	// ── Trigger debounced save on form changes ──────────────────────────

	useEffect(() => {
		if (!initRef.current || !taskId) return;
		const update = buildEditableTaskUpdate(formData);
		if (serializeEditableTaskUpdate(update) === lastSyncedPayloadRef.current) {
			return;
		}
		triggerSave(update);
	}, [formData, taskId, triggerSave]);

	// ── Retry on reconnect ──────────────────────────────────────────────

	useEffect(() => {
		if (backendStatus !== "online" || !tasksQuery.isError) return;
		void tasksQuery.refetch();
	}, [backendStatus, tasksQuery.isError, tasksQuery.refetch]);

	// ── Clear manualRunning once server confirms not running ────────────

	useEffect(() => {
		if (manualRunning && task?.isRunning === false) {
			setManualRunning(false);
		}
	}, [manualRunning, task?.isRunning]);

	// ── Toast notification on run completion ────────────────────────────

	useEffect(() => {
		const wasRunning = prevIsRunningRef.current;
		prevIsRunningRef.current = isTaskRunning;

		if (wasRunning && !isTaskRunning && task) {
			// Refresh recent runs panel now that the decision is persisted
			void queryClient.invalidateQueries({
				queryKey: ["tasks", "decisions"],
			});
			if (task.lastError) {
				notify.error("Task Failed", `${task.name}: ${task.lastError}`);
			} else {
				notify.success("Task Completed", `${task.name} finished successfully`);
			}
		}
	}, [isTaskRunning, task, queryClient]);

	// ── Derived ──────────────────────────────────────────────────────────

	const isWaitingForBackend =
		backendStatus === "connecting" && tasksQuery.isError && !tasksQuery.data;
	const isLoadingTasks = tasksQuery.isLoading || isWaitingForBackend;

	// ── Handlers ─────────────────────────────────────────────────────────

	const handlePause = async () => {
		if (!taskId) return;
		try {
			await pauseTaskMutation.mutateAsync(taskId);
		} catch {
			// handled in mutation callbacks
		}
	};

	const handleResume = async () => {
		if (!taskId) return;
		try {
			await resumeTaskMutation.mutateAsync(taskId);
		} catch {
			// handled in mutation callbacks
		}
	};

	const handleRunNow = async () => {
		if (!taskId) return;
		try {
			await runTaskMutation.mutateAsync(taskId);
		} catch {
			// handled in mutation callbacks
		}
	};

	const navigateToSession = useCallback(
		(sessionId: string) => {
			sessionStorage.setItem("agent:pendingSession", sessionId);
			void navigate({ to: "/agent" });
		},
		[navigate],
	);

	const handleViewExecutionHistory = useCallback(() => {
		if (!taskId) return;
		useAgentStore.getState().setDecisionTaskFilter(taskId);
		void navigate({ to: "/agent" });
	}, [taskId, navigate]);

	const handleViewLastChat = useCallback(async () => {
		if (!taskId) return;

		let sessionId = task?.lastSessionId;
		if (!sessionId) {
			try {
				const res = await decisionsApi.getDecisions({ taskId, pageSize: 1 });
				sessionId = res.decisions?.[0]?.sessionId;
			} catch {
				// ignore
			}
		}

		if (sessionId) {
			navigateToSession(sessionId);
		} else {
			useAgentStore.getState().setDecisionTaskFilter(taskId);
			void navigate({ to: "/agent" });
		}
	}, [taskId, task?.lastSessionId, navigate, navigateToSession]);

	// ── Render ────────────────────────────────────────────────────────────

	const contextValue = useMemo(
		() => ({
			task,
			taskId,
			formData,
			setFormData,
			saveStatus,
			isTaskRunning,
			isSuperuser,
			symbolOptions,
			symbolsLoading,
		}),
		[
			task,
			taskId,
			formData,
			saveStatus,
			isTaskRunning,
			isSuperuser,
			symbolOptions,
			symbolsLoading,
		],
	);

	return (
		<LocalizationProvider dateAdapter={AdapterDateFns}>
			<TaskConfigProvider value={contextValue}>
				<PageTransition pageKey="tasks">
					<Box>
						<SectionHeader
							title="Task Configuration"
							subtitle="Configure your automated trading task"
						/>

						<TaskActionBar
							task={task}
							taskId={taskId}
							isTaskRunning={isTaskRunning}
							saveStatus={saveStatus}
							onRunNow={handleRunNow}
							onPause={handlePause}
							onResume={handleResume}
							onViewLastChat={handleViewLastChat}
							onViewHistory={handleViewExecutionHistory}
							onNavigateToSession={navigateToSession}
							isRunPending={runTaskMutation.isPending}
							isPausePending={pauseTaskMutation.isPending}
							isResumePending={resumeTaskMutation.isPending}
						/>

						{allTasks.length > 1 && (
							<DuplicateTasksBanner
								taskCount={allTasks.length}
								onMerge={() => mergeDuplicatesMutation.mutate()}
								isPending={mergeDuplicatesMutation.isPending}
							/>
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

						{task && <TaskStatStrip task={task} />}

						{isLoadingTasks ? (
							<Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
								<CircularProgress />
							</Box>
						) : (
							<Grid container spacing={3}>
								{/* LEFT COLUMN — Configuration */}
								<Grid size={{ xs: 12, md: 5 }}>
									<motion.div
										variants={staggerCascade.container}
										initial="hidden"
										animate="visible"
										style={{
											display: "flex",
											flexDirection: "column",
											gap: 16,
										}}
									>
										<motion.div variants={staggerCascade.item}>
											<GeneralSection />
										</motion.div>
										<motion.div variants={staggerCascade.item}>
											<ScheduleSection />
										</motion.div>
										<motion.div variants={staggerCascade.item}>
											<TradingSection />
										</motion.div>
										<motion.div variants={staggerCascade.item}>
											<MonitoringSection />
										</motion.div>
									</motion.div>
								</Grid>

								{/* RIGHT COLUMN — Status & Activity */}
								<Grid size={{ xs: 12, md: 7 }}>
									<motion.div
										variants={staggerCascade.container}
										initial="hidden"
										animate="visible"
										style={{
											display: "flex",
											flexDirection: "column",
											gap: 16,
										}}
									>
										{isTaskRunning && task && (
											<motion.div variants={staggerCascade.item}>
												<TaskRunningProgress task={task} />
											</motion.div>
										)}

										<motion.div variants={staggerCascade.item}>
											<RecentRunsPanel
												taskId={taskId}
												onViewHistory={handleViewExecutionHistory}
												onViewLastChat={handleViewLastChat}
												hasRuns={(task?.runCount ?? 0) > 0}
												hasLastSession={!!task?.lastSessionId}
											/>
										</motion.div>

										{isSuperuser && (
											<motion.div variants={staggerCascade.item}>
												<StrategyDiscoveryCard />
											</motion.div>
										)}
									</motion.div>
								</Grid>
							</Grid>
						)}
					</Box>
				</PageTransition>
			</TaskConfigProvider>
		</LocalizationProvider>
	);
}
