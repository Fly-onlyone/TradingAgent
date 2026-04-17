import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import MonitorHeartIcon from "@mui/icons-material/MonitorHeart";
import ScheduleIcon from "@mui/icons-material/Schedule";
import SettingsIcon from "@mui/icons-material/Settings";
import TimelineIcon from "@mui/icons-material/Timeline";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import { Box, Chip, Stack, Tab, Tabs } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import type { ReactElement } from "react";
import { useState } from "react";
import { settingsApi } from "@/api/endpoints/settings";
import { StrategyDiscoveryCard } from "@/components/strategies/StrategyDiscoveryCard";
import { RecentRunsPanel } from "@/components/tasks/RecentRunsPanel";
import { GeneralSection } from "@/components/tasks/sections/GeneralSection";
import { MonitoringSection } from "@/components/tasks/sections/MonitoringSection";
import { ScheduleSection } from "@/components/tasks/sections/ScheduleSection";
import { TradingSection } from "@/components/tasks/sections/TradingSection";
import { useTaskConfig } from "@/components/tasks/TaskConfigContext";
import { TaskRunningProgress } from "@/components/tasks/TaskRunningProgress";
import type { AgentTask } from "@/types/task";

interface TaskSectionTabsProps {
	task: AgentTask | null;
	taskId: string | null;
	isTaskRunning: boolean;
	isSuperuser: boolean;
	onViewHistory: () => void;
	onViewLastChat: () => void;
}

interface TabDef {
	key:
		| "general"
		| "schedule"
		| "trading"
		| "monitoring"
		| "activity"
		| "discovery";
	label: string;
	icon: ReactElement;
	group: "config" | "activity";
}

const BASE_TABS: readonly TabDef[] = [
	{
		key: "general",
		label: "General",
		icon: <SettingsIcon fontSize="small" />,
		group: "config",
	},
	{
		key: "schedule",
		label: "Schedule",
		icon: <ScheduleIcon fontSize="small" />,
		group: "config",
	},
	{
		key: "trading",
		label: "Trading",
		icon: <TrendingUpIcon fontSize="small" />,
		group: "config",
	},
	{
		key: "monitoring",
		label: "Monitoring",
		icon: <MonitorHeartIcon fontSize="small" />,
		group: "config",
	},
	{
		key: "activity",
		label: "Activity",
		icon: <TimelineIcon fontSize="small" />,
		group: "activity",
	},
];

const DISCOVERY_TAB: TabDef = {
	key: "discovery",
	label: "Discovery",
	icon: <AutoFixHighIcon fontSize="small" />,
	group: "activity",
};

const ACTIVITY_GROUP_SX = {
	ml: 1.5,
	borderLeft: 1,
	borderColor: "divider" as const,
	pl: 2.5,
};

function StatusTabLabel({ label, on }: { label: string; on: boolean }) {
	return (
		<Stack direction="row" spacing={1} alignItems="center">
			<span>{label}</span>
			<Chip
				label={on ? "On" : "Off"}
				size="small"
				color={on ? "success" : "default"}
				variant="outlined"
				sx={{ height: 18, fontSize: "0.65rem" }}
			/>
		</Stack>
	);
}

export function TaskSectionTabs({
	task,
	taskId,
	isTaskRunning,
	isSuperuser,
	onViewHistory,
	onViewLastChat,
}: TaskSectionTabsProps) {
	const { formData } = useTaskConfig();
	const [active, setActive] = useState(0);

	const discoveryConfigQuery = useQuery({
		queryKey: ["strategy-discovery-config"],
		queryFn: () => settingsApi.getStrategyDiscoveryConfig(),
		enabled: isSuperuser,
	});
	const discoveryEnabled = discoveryConfigQuery.data?.enabled ?? false;

	const tabs = isSuperuser ? [...BASE_TABS, DISCOVERY_TAB] : BASE_TABS;
	const safeActive = Math.min(active, tabs.length - 1);
	const activeKey = tabs[safeActive].key;

	const renderTabLabel = (tab: TabDef): string | ReactElement => {
		if (tab.key === "trading") {
			return <StatusTabLabel label={tab.label} on={formData.tradingEnabled} />;
		}
		if (tab.key === "monitoring") {
			return (
				<StatusTabLabel label={tab.label} on={formData.monitoringEnabled} />
			);
		}
		if (tab.key === "discovery") {
			return <StatusTabLabel label={tab.label} on={discoveryEnabled} />;
		}
		return tab.label;
	};

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
			<Box
				sx={{
					background: (t) => t.trading.glass.card.background,
					backdropFilter: (t) => t.trading.glass.card.backdropFilter,
					border: (t) => t.trading.glass.card.border,
					borderRadius: (t) => t.trading.glass.card.borderRadius,
					px: 1,
					display: "flex",
					alignItems: "stretch",
					overflow: "hidden",
				}}
			>
				<Tabs
					value={safeActive}
					onChange={(_, v) => setActive(v)}
					variant="scrollable"
					scrollButtons="auto"
					allowScrollButtonsMobile
					sx={{
						flex: 1,
						minHeight: 48,
						"& .MuiTab-root": {
							minHeight: 48,
							textTransform: "none",
							fontWeight: 500,
						},
					}}
				>
					{tabs.map((tab, i) => {
						const startsActivityGroup =
							tab.group === "activity" && tabs[i - 1]?.group === "config";
						return (
							<Tab
								key={tab.key}
								icon={tab.icon}
								iconPosition="start"
								label={renderTabLabel(tab)}
								sx={startsActivityGroup ? ACTIVITY_GROUP_SX : undefined}
							/>
						);
					})}
				</Tabs>
			</Box>

			<AnimatePresence mode="wait">
				<motion.div
					key={activeKey}
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -8 }}
					transition={{ duration: 0.18 }}
				>
					{activeKey === "general" && <GeneralSection />}
					{activeKey === "schedule" && <ScheduleSection />}
					{activeKey === "trading" && <TradingSection />}
					{activeKey === "monitoring" && <MonitoringSection />}
					{activeKey === "activity" && (
						<Stack spacing={2}>
							{isTaskRunning && task && <TaskRunningProgress task={task} />}
							<RecentRunsPanel
								taskId={taskId}
								onViewHistory={onViewHistory}
								onViewLastChat={onViewLastChat}
								hasRuns={(task?.runCount ?? 0) > 0}
								hasLastSession={!!task?.lastSessionId}
							/>
						</Stack>
					)}
					{activeKey === "discovery" && <StrategyDiscoveryCard />}
				</motion.div>
			</AnimatePresence>
		</Box>
	);
}
