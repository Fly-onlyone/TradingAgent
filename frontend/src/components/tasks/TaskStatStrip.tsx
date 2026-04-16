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
}

export function TaskStatStrip({ task }: TaskStatStripProps) {
	const successRate =
		task.runCount > 0
			? Math.round((task.successCount / task.runCount) * 100)
			: 0;

	return (
		<motion.div
			variants={staggerCascade.container}
			initial="hidden"
			animate="visible"
		>
			<Grid container spacing={2} sx={{ mb: 2 }}>
				<Grid size={{ xs: 6, sm: 3 }}>
					<motion.div variants={staggerCascade.item}>
						<KpiMetric
							label="Total Runs"
							value={String(task.runCount)}
							rolling
							icon={<AutorenewIcon />}
						/>
					</motion.div>
				</Grid>
				<Grid size={{ xs: 6, sm: 3 }}>
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
				<Grid size={{ xs: 6, sm: 3 }}>
					<motion.div variants={staggerCascade.item}>
						<CountdownMetric label="Next Run" targetAt={task.nextRunAt} />
					</motion.div>
				</Grid>
				<Grid size={{ xs: 6, sm: 3 }}>
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
