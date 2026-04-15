import SmartToyIcon from "@mui/icons-material/SmartToy";
import { Box, Card, CardContent, Typography } from "@mui/material";
import { MetricRow } from "@/components/common/MetricRow";
import { StatusDot } from "@/components/common/StatusDot";
import { useAgentStore } from "@/store/agentStore";
import type { AgentMode } from "@/types";

export default function DashboardAgentStatusCard({
	activeTaskMode,
}: {
	activeTaskMode: AgentMode | null;
}) {
	const agentStatus = useAgentStore((state) => state.status);
	const isThinking = useAgentStore((state) =>
		Boolean(state.activeRunSessionId),
	);
	const agentConnected =
		agentStatus === "connected" ||
		agentStatus === "thinking" ||
		agentStatus === "analyzing" ||
		agentStatus === "initializing";

	const modeLabel =
		activeTaskMode === "ask"
			? "Ask (confirm before trading)"
			: activeTaskMode === "auto"
				? "Auto (immediate execution)"
				: "No task configured";

	return (
		<Card sx={{ height: 280 }}>
			<CardContent>
				<Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
					<SmartToyIcon sx={{ color: "primary.main" }} />
					<Typography variant="h6">Agent Status</Typography>
				</Box>
				<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
					<MetricRow
						label="Status"
						value={
							<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
								<StatusDot
									status={agentConnected ? "online" : "offline"}
									size={7}
								/>
								<Typography variant="body2">
									{agentConnected ? "Connected" : "Disconnected"}
								</Typography>
							</Box>
						}
					/>
					<MetricRow
						label="Active Task"
						value={isThinking ? "Running" : "None"}
					/>
					<MetricRow label="Mode" value={modeLabel} />
				</Box>
			</CardContent>
		</Card>
	);
}
