import AutorenewIcon from "@mui/icons-material/Autorenew";
import PlaylistAddCheckIcon from "@mui/icons-material/PlaylistAddCheck";
import Grid from "@mui/material/Grid2";
import { motion } from "framer-motion";
import {
	CountdownMetric,
	KpiMetric,
	TimeAgoMetric,
	TrendIconMetric,
} from "@/components/data-display/metric";
import type { AgentTask } from "@/types/task";
import { staggerCascade } from "@/utils/animations/variants";

interface TaskStatStripProps {
	task: AgentTask;
	compact?: boolean;
}

export function TaskStatStrip({ task, compact = false }: TaskStatStripProps) {
	const successRate =
		task.runCount > 0
			? Math.round((task.successCount / task.runCount) * 100)
			: 0;

	const itemSize = compact ? 6 : { xs: 6, sm: 3 };

	return (
		<motion.div
			variants={staggerCascade.container}
			initial="hidden"
			animate="visible"
		>
			<Grid container spacing={compact ? 1.5 : 2} sx={{ mb: compact ? 0 : 2 }}>
				<Grid size={itemSize}>
					<motion.div variants={staggerCascade.item}>
						<KpiMetric
							label="Total Runs"
							value={String(task.runCount)}
							rolling
							icon={<AutorenewIcon />}
						/>
					</motion.div>
				</Grid>
				<Grid size={itemSize}>
					<motion.div variants={staggerCascade.item}>
						<TrendIconMetric
							label="Success Rate"
							value={task.runCount > 0 ? `${successRate}%` : "—"}
							subtitle={
								task.runCount > 0
									? `${task.successCount} of ${task.runCount} runs`
									: "No runs yet"
							}
							icon={<PlaylistAddCheckIcon />}
							tone={
								task.runCount === 0
									? "neutral"
									: successRate >= 70
										? "success"
										: successRate >= 40
											? "warning"
											: "error"
							}
						/>
					</motion.div>
				</Grid>
				<Grid size={itemSize}>
					<motion.div variants={staggerCascade.item}>
						<CountdownMetric label="Next Run" targetAt={task.nextRunAt} />
					</motion.div>
				</Grid>
				<Grid size={itemSize}>
					<motion.div variants={staggerCascade.item}>
						<TimeAgoMetric
							label="Last Run"
							at={task.lastRunAt}
							hasError={!!task.lastError}
							errorHint={
								typeof task.lastError === "string" ? task.lastError : undefined
							}
						/>
					</motion.div>
				</Grid>
			</Grid>
		</motion.div>
	);
}
