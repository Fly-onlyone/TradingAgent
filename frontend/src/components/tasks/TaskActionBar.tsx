import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import HistoryIcon from "@mui/icons-material/History";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import {
	Box,
	Button,
	Chip,
	CircularProgress,
	Menu,
	MenuItem,
	Stack,
} from "@mui/material";
import { SaveIndicator } from "@/components/common/SaveIndicator";
import type { SaveStatus } from "@/hooks/useDebouncedSave";
import { useZoomAwareMenu } from "@/hooks/useZoomAwareMenu";
import type { AgentTask } from "@/types/task";

interface TaskActionBarProps {
	task: AgentTask | null;
	taskId: string | null;
	isTaskRunning: boolean;
	saveStatus: SaveStatus;
	onRunNow: () => void;
	onPause: () => void;
	onResume: () => void;
	onViewLastChat: () => void;
	onViewHistory: () => void;
	onNavigateToSession: (sessionId: string) => void;
	isRunPending: boolean;
	isPausePending: boolean;
	isResumePending: boolean;
}

const STATUS_CONFIG: Record<
	string,
	{ color: "success" | "warning" | "error" | "default"; label: string }
> = {
	active: { color: "success", label: "Active" },
	paused: { color: "warning", label: "Paused" },
	completed: { color: "default", label: "Completed" },
	failed: { color: "error", label: "Failed" },
};

export function TaskActionBar({
	task,
	taskId,
	isTaskRunning,
	saveStatus,
	onRunNow,
	onPause,
	onResume,
	onViewLastChat,
	onViewHistory,
	onNavigateToSession,
	isRunPending,
	isPausePending,
	isResumePending,
}: TaskActionBarProps) {
	const liveChatMenu = useZoomAwareMenu();

	if (!task || !taskId) return null;

	const statusConf = STATUS_CONFIG[task.status] ?? {
		color: "default" as const,
		label: task.status,
	};

	return (
		<Box
			sx={{
				position: "sticky",
				top: 0,
				zIndex: 10,
				py: 1.5,
				px: 2,
				mb: 2,
				display: "flex",
				alignItems: "center",
				gap: 1.5,
				flexWrap: "wrap",
				backdropFilter: "blur(16px)",
				background: (t) => `rgba(${t.trading.primaryRgb}, 0.03)`,
				borderBottom: "1px solid",
				borderColor: "divider",
				borderRadius: 2,
			}}
		>
			<Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
				{task.status === "active" && (
					<>
						<Button
							variant="contained"
							size="small"
							startIcon={
								isTaskRunning ? (
									<CircularProgress size={16} color="inherit" />
								) : (
									<PlayArrowIcon />
								)
							}
							onClick={onRunNow}
							disabled={isTaskRunning || isRunPending}
						>
							{isTaskRunning ? "Running\u2026" : "Run Now"}
						</Button>

						{isTaskRunning &&
							task.runningProgress?.sessionIds &&
							task.runningProgress.sessionIds.length > 0 && (
								<div ref={liveChatMenu.anchorRef}>
									<Button
										variant="outlined"
										size="small"
										color="info"
										startIcon={<ChatBubbleOutlineIcon />}
										endIcon={
											task.runningProgress.sessionIds.length > 1 ? (
												<ArrowDropDownIcon />
											) : undefined
										}
										onClick={
											task.runningProgress.sessionIds.length === 1
												? () =>
														onNavigateToSession(
															task.runningProgress?.sessionIds?.[0] ?? "",
														)
												: liveChatMenu.handleOpen
										}
									>
										Live Chat ({task.runningProgress.sessionIds.length})
									</Button>
									{task.runningProgress.sessionIds.length > 1 && (
										<Menu
											open={liveChatMenu.open}
											onClose={liveChatMenu.handleClose}
											{...liveChatMenu.menuProps}
										>
											{task.runningProgress.sessionIds.map((sid, idx) => {
												const isActive =
													sid === task.runningProgress?.activeSessionId;
												return (
													<MenuItem
														key={sid}
														onClick={() => {
															liveChatMenu.handleClose();
															onNavigateToSession(sid);
														}}
														sx={{ fontWeight: isActive ? 700 : 400 }}
													>
														{task.symbols[idx] ?? `Session ${idx + 1}`}
														{isActive && " (active)"}
													</MenuItem>
												);
											})}
										</Menu>
									)}
								</div>
							)}

						<Button
							variant="outlined"
							size="small"
							color="warning"
							startIcon={<PauseIcon />}
							onClick={onPause}
							disabled={isPausePending}
						>
							Pause
						</Button>
					</>
				)}

				{task.status === "paused" && (
					<Button
						variant="outlined"
						size="small"
						color="success"
						startIcon={<PlayArrowIcon />}
						onClick={onResume}
						disabled={isResumePending}
					>
						Resume
					</Button>
				)}

				{task.runCount > 0 && (
					<>
						<Button
							variant="outlined"
							size="small"
							startIcon={<ChatBubbleOutlineIcon />}
							onClick={onViewLastChat}
						>
							Last Chat
						</Button>
						<Button
							variant="outlined"
							size="small"
							startIcon={<HistoryIcon />}
							onClick={onViewHistory}
						>
							History
						</Button>
					</>
				)}
			</Stack>

			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					gap: 1,
					ml: "auto",
				}}
			>
				{isTaskRunning && (
					<Chip
						icon={<CircularProgress size={14} />}
						label="Running"
						size="small"
						color="info"
						variant="outlined"
					/>
				)}
				<Chip label={statusConf.label} size="small" color={statusConf.color} />
			</Box>

			<SaveIndicator status={saveStatus} />
		</Box>
	);
}
