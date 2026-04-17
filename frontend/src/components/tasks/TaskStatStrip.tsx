import AutorenewIcon from "@mui/icons-material/Autorenew";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import HighlightOffIcon from "@mui/icons-material/HighlightOff";
import { Box, Stack, Typography } from "@mui/material";
import Grid from "@mui/material/Grid2";
import { motion } from "framer-motion";
import {
	CountdownMetric,
	KpiMetric,
	RingMetric,
	TimeAgoMetric,
} from "@/components/data-display/metric";
import type { MetricTone } from "@/components/data-display/metric/types";
import { getToneTokens } from "@/components/data-display/metric/types";
import type { AgentTask } from "@/types/task";
import { staggerCascade } from "@/utils/animations/variants";
import { SuccessFailureBar } from "./SuccessFailureBar";

interface TaskStatStripProps {
	task: AgentTask;
	compact?: boolean;
}

function successTone(rate: number, total: number): MetricTone {
	if (total === 0) return "neutral";
	if (rate >= 70) return "success";
	if (rate >= 40) return "warning";
	return "error";
}

function TallyRow({
	tone,
	icon,
	count,
	label,
	total,
}: {
	tone: MetricTone;
	icon: React.ReactNode;
	count: number;
	label: string;
	total: number;
}) {
	const pct = total > 0 ? Math.max(0, Math.min(100, (count / total) * 100)) : 0;

	return (
		<Box
			sx={(t) => {
				const { main, rgb } = getToneTokens(t, tone);
				return {
					position: "relative",
					display: "flex",
					alignItems: "center",
					gap: 0.75,
					px: 1,
					py: 0.375,
					borderRadius: 1,
					border: `1px solid rgba(${rgb}, 0.32)`,
					color: main,
					overflow: "hidden",
					"& svg": { fontSize: 16 },
					background: `linear-gradient(90deg, rgba(${rgb}, 0.38) 0%, rgba(${rgb}, 0.22) ${pct}%, rgba(${rgb}, 0.06) ${pct}%, rgba(${rgb}, 0.04) 100%)`,
					"&::after": {
						content: '""',
						position: "absolute",
						top: 0,
						bottom: 0,
						left: 0,
						width: `${pct}%`,
						boxShadow: `inset -1px 0 0 rgba(${rgb}, 0.5)`,
						pointerEvents: "none",
					},
				};
			}}
		>
			{icon}
			<Typography
				sx={{
					fontFamily: (t) => t.trading.mono,
					fontSize: "0.9375rem",
					fontWeight: 700,
					lineHeight: 1,
					position: "relative",
					zIndex: 1,
				}}
			>
				{count}
			</Typography>
			<Typography
				sx={{
					fontSize: "0.75rem",
					color: "text.secondary",
					lineHeight: 1,
					fontWeight: 500,
					position: "relative",
					zIndex: 1,
				}}
			>
				{label}
			</Typography>
		</Box>
	);
}

export function TaskStatStrip({ task, compact = false }: TaskStatStripProps) {
	const successRate =
		task.runCount > 0
			? Math.round((task.successCount / task.runCount) * 100)
			: 0;

	const itemSize = compact ? 6 : { xs: 6, sm: 3 };
	const ringTone = successTone(successRate, task.runCount);

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
							footer={
								<SuccessFailureBar
									success={task.successCount}
									failure={task.failureCount}
									total={task.runCount}
								/>
							}
						/>
					</motion.div>
				</Grid>
				<Grid size={itemSize}>
					<motion.div variants={staggerCascade.item}>
						<RingMetric
							label="Success Rate"
							percent={task.runCount > 0 ? successRate : null}
							tone={ringTone}
							rightContent={
								task.runCount > 0 ? (
									<Stack spacing={0.375}>
										<TallyRow
											tone="success"
											icon={<CheckCircleIcon />}
											count={task.successCount}
											label="ok"
											total={task.runCount}
										/>
										<TallyRow
											tone="error"
											icon={<HighlightOffIcon />}
											count={task.failureCount}
											label="fail"
											total={task.runCount}
										/>
									</Stack>
								) : (
									<Typography
										variant="caption"
										color="text.secondary"
										sx={{ fontSize: "0.75rem" }}
									>
										No runs yet
									</Typography>
								)
							}
						/>
					</motion.div>
				</Grid>
				<Grid size={itemSize}>
					<motion.div variants={staggerCascade.item}>
						<CountdownMetric
							label="Next Run"
							targetAt={task.nextRunAt}
							paused={task.status !== "active"}
						/>
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
