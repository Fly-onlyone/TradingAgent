import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import {
	Box,
	Card,
	CardContent,
	CircularProgress,
	Typography,
} from "@mui/material";
import type { AgentTask } from "@/types/task";

interface TaskRunningProgressProps {
	task: AgentTask;
}

export function TaskRunningProgress({ task }: TaskRunningProgressProps) {
	return (
		<Card
			sx={{
				background: "rgba(59, 130, 246, 0.08)",
				border: "1px solid rgba(59, 130, 246, 0.3)",
			}}
		>
			<CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
				<Box
					sx={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						mb: 1,
					}}
				>
					<Box
						sx={{
							display: "flex",
							alignItems: "center",
							gap: 1,
						}}
					>
						<CircularProgress size={18} sx={{ color: "#3B82F6" }} />
						<Typography
							variant="body2"
							fontWeight={600}
							sx={{ color: "#60A5FA" }}
						>
							{task.runningProgress?.currentSymbol
								? `Analyzing ${task.runningProgress.currentSymbol}...`
								: "Starting analysis..."}
						</Typography>
					</Box>
					{task.runningProgress && task.runningProgress.total > 0 && (
						<Typography variant="body2" color="text.secondary">
							{task.runningProgress.completed} / {task.runningProgress.total}{" "}
							symbols
						</Typography>
					)}
				</Box>
				{task.runningProgress && task.runningProgress.total > 0 && (
					<Box
						sx={{
							display: "flex",
							alignItems: "center",
							gap: 1,
							flexWrap: "wrap",
						}}
					>
						{task.symbols.map((symbol, idx) => {
							const completed = task.runningProgress?.completed ?? 0;
							const currentSymbol = task.runningProgress?.currentSymbol;
							const isDone =
								idx < completed ||
								(idx === completed &&
									currentSymbol !== symbol &&
									completed > 0);
							const isActive = symbol === currentSymbol;

							return (
								<Box
									key={symbol}
									sx={{
										display: "flex",
										alignItems: "center",
										gap: 0.5,
									}}
								>
									{idx > 0 && (
										<Typography
											variant="caption"
											sx={{
												color: "rgba(255,255,255,0.2)",
												mx: 0.5,
											}}
										>
											\u2192
										</Typography>
									)}
									{isDone ? (
										<CheckCircleIcon
											sx={{
												fontSize: 14,
												color: "#10B981",
											}}
										/>
									) : (
										<FiberManualRecordIcon
											sx={{
												fontSize: 10,
												color: isActive ? "#3B82F6" : "rgba(255,255,255,0.2)",
											}}
										/>
									)}
									<Typography
										variant="caption"
										fontWeight={isActive ? 600 : 400}
										sx={{
											color: isDone
												? "#10B981"
												: isActive
													? "#60A5FA"
													: "text.secondary",
										}}
									>
										{symbol}
									</Typography>
								</Box>
							);
						})}
					</Box>
				)}
			</CardContent>
		</Card>
	);
}
