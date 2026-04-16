import Grid from "@mui/material/Grid2";
import { formatDistanceToNowStrict } from "date-fns";
import { motion } from "framer-motion";
import { StatCard } from "@/components/data-display/StatCard";
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

	const nextRunLabel = task.nextRunAt
		? formatDistanceToNowStrict(new Date(task.nextRunAt), {
				addSuffix: true,
			})
		: "Not scheduled";

	const lastRunLabel = task.lastRunAt
		? formatDistanceToNowStrict(new Date(task.lastRunAt), {
				addSuffix: true,
			})
		: "Never";

	const lastRunTrend: "up" | "down" | "neutral" = task.lastError
		? "down"
		: task.runCount > 0
			? "up"
			: "neutral";

	return (
		<motion.div
			variants={staggerCascade.container}
			initial="hidden"
			animate="visible"
		>
			<Grid container spacing={2} sx={{ mb: 2 }}>
				<Grid size={{ xs: 6, sm: 3 }}>
					<motion.div variants={staggerCascade.item}>
						<StatCard title="Total Runs" value={task.runCount} useRolling />
					</motion.div>
				</Grid>
				<Grid size={{ xs: 6, sm: 3 }}>
					<motion.div variants={staggerCascade.item}>
						<StatCard
							title="Success Rate"
							value={successRate}
							suffix="%"
							trend={
								successRate >= 80
									? "up"
									: successRate >= 50
										? "neutral"
										: "down"
							}
						/>
					</motion.div>
				</Grid>
				<Grid size={{ xs: 6, sm: 3 }}>
					<motion.div variants={staggerCascade.item}>
						<StatCard title="Next Run" value={nextRunLabel} />
					</motion.div>
				</Grid>
				<Grid size={{ xs: 6, sm: 3 }}>
					<motion.div variants={staggerCascade.item}>
						<StatCard
							title="Last Run"
							value={lastRunLabel}
							trend={lastRunTrend}
							changeLabel={task.lastError ? "Failed" : undefined}
						/>
					</motion.div>
				</Grid>
			</Grid>
		</motion.div>
	);
}
