/**
 * Strategy Auto-Discovery sidebar panel for the Strategies page.
 * Superuser-only — returns null for non-superusers.
 */

import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import SearchIcon from "@mui/icons-material/Search";
import {
	Alert,
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	CircularProgress,
	Divider,
	FormControl,
	InputLabel,
	MenuItem,
	Slider,
	Switch,
	Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
	type StrategyDiscoveryConfig,
	settingsApi,
} from "@/api/endpoints/settings";
import { ZoomAwareSelect } from "@/components/common/ZoomAwareSelect";
import { useAuthStore } from "@/store/authStore";
import { useDiscoveryStore } from "@/store/discoveryStore";
import { notify } from "@/store/uiStore";
import { formatRelativeTime } from "@/utils/formatters";

const INTERVAL_OPTIONS = [
	{ value: 1, label: "Every hour" },
	{ value: 3, label: "Every 3 hours" },
	{ value: 6, label: "Every 6 hours" },
	{ value: 12, label: "Every 12 hours" },
	{ value: 24, label: "Every 24 hours" },
];

export function StrategyDiscoveryCard() {
	const isSuperuser = useAuthStore((s) => s.user?.isSuperuser);
	const token = useAuthStore((s) => s.token);
	const queryClient = useQueryClient();

	const isRunning = useDiscoveryStore((s) => s.isRunning);
	const progressMessages = useDiscoveryStore((s) => s.progressMessages);
	const runResult = useDiscoveryStore((s) => s.runResult);
	const startRun = useDiscoveryStore((s) => s.startRun);
	const logRef = useRef<HTMLDivElement>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: trigger scroll on new messages
	useEffect(() => {
		if (logRef.current) {
			logRef.current.scrollTop = logRef.current.scrollHeight;
		}
	}, [progressMessages]);

	const configQuery = useQuery({
		queryKey: ["strategy-discovery-config"],
		queryFn: () => settingsApi.getStrategyDiscoveryConfig(),
		enabled: !!isSuperuser,
	});

	const updateMutation = useMutation({
		mutationFn: (update: Partial<StrategyDiscoveryConfig>) =>
			settingsApi.updateStrategyDiscoveryConfig(update),
		onSuccess: () => {
			void queryClient.invalidateQueries({
				queryKey: ["strategy-discovery-config"],
			});
		},
		onError: () => notify.error("Failed to update discovery settings"),
	});

	if (!isSuperuser) return null;

	const config = configQuery.data;

	return (
		<Card
			sx={{
				height: "100%",
				display: "flex",
				flexDirection: "column",
			}}
		>
			<CardContent
				sx={{
					p: 2.5,
					"&:last-child": { pb: 2.5 },
					display: "flex",
					flexDirection: "column",
					flex: 1,
					overflow: "auto",
				}}
			>
				{/* Header */}
				<Box
					sx={{
						display: "flex",
						alignItems: "center",
						gap: 1,
						mb: 0.5,
					}}
				>
					<SearchIcon color="primary" fontSize="small" />
					<Typography variant="subtitle1" fontWeight={600}>
						Auto-Discovery
					</Typography>
				</Box>

				{/* Enable toggle */}
				{config && (
					<Box
						sx={{
							display: "flex",
							alignItems: "center",
							gap: 1,
							mb: 1,
						}}
					>
						<Switch
							checked={config.enabled}
							onChange={(_, checked) =>
								updateMutation.mutate({ enabled: checked })
							}
							size="small"
						/>
						<Typography
							variant="body2"
							color={config.enabled ? "primary" : "text.secondary"}
							fontWeight={500}
						>
							{config.enabled ? "Enabled" : "Disabled"}
						</Typography>
					</Box>
				)}

				<Typography variant="caption" color="text.secondary" sx={{ mb: 1.5 }}>
					Crawl news sources and extract strategies using AI.
				</Typography>

				<Divider sx={{ mb: 2 }} />

				{configQuery.isLoading && <CircularProgress size={24} />}

				{config && (
					<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
						{/* Check Interval */}
						<FormControl size="small" fullWidth>
							<InputLabel>Check Interval</InputLabel>
							<ZoomAwareSelect
								value={config.intervalHours}
								label="Check Interval"
								onChange={(e) =>
									updateMutation.mutate({
										intervalHours: e.target.value as number,
									})
								}
								disabled={!config.enabled}
							>
								{INTERVAL_OPTIONS.map((opt) => (
									<MenuItem key={opt.value} value={opt.value}>
										{opt.label}
									</MenuItem>
								))}
							</ZoomAwareSelect>
						</FormControl>

						{/* Confidence slider */}
						<Box>
							<Typography variant="caption" color="text.secondary" gutterBottom>
								Min. Confidence: {(config.minConfidence * 100).toFixed(0)}%
							</Typography>
							<Slider
								value={config.minConfidence}
								onChange={(_, val) =>
									updateMutation.mutate({ minConfidence: val as number })
								}
								min={0.1}
								max={1.0}
								step={0.05}
								size="small"
								disabled={!config.enabled}
								valueLabelDisplay="auto"
								valueLabelFormat={(v) => `${(v * 100).toFixed(0)}%`}
							/>
						</Box>

						{/* Max Sources slider */}
						<Box>
							<Typography variant="caption" color="text.secondary" gutterBottom>
								Max Sources: {config.maxSources}
							</Typography>
							<Slider
								value={config.maxSources}
								onChange={(_, val) =>
									updateMutation.mutate({ maxSources: val as number })
								}
								min={5}
								max={100}
								step={5}
								size="small"
								disabled={!config.enabled}
								valueLabelDisplay="auto"
							/>
						</Box>

						<Divider />

						{/* Run Now */}
						<Box>
							<Button
								variant="outlined"
								size="small"
								fullWidth
								startIcon={
									isRunning ? <CircularProgress size={14} /> : <PlayArrowIcon />
								}
								onClick={() => startRun(token ?? "")}
								disabled={isRunning}
							>
								{isRunning ? "Running..." : "Run Now"}
							</Button>
							{config.lastRunAt && !isRunning && (
								<Typography
									variant="caption"
									color="text.secondary"
									display="block"
									sx={{ mt: 0.5 }}
								>
									Last run: {formatRelativeTime(config.lastRunAt)}
								</Typography>
							)}
							{runResult && !isRunning && (
								<Alert severity="info" sx={{ py: 0, mt: 1 }}>
									{runResult}
								</Alert>
							)}
						</Box>

						<Divider />

						{/* Discovered Sources */}
						<Box>
							<Typography
								variant="caption"
								color="text.secondary"
								fontWeight={700}
								sx={{ letterSpacing: "0.06em", mb: 1, display: "block" }}
							>
								SOURCES ({config.sources.length})
							</Typography>
							{config.sources.length > 0 ? (
								<Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
									{config.sources.map((source) => (
										<Chip
											key={source.id}
											label={source.name}
											variant="outlined"
											size="small"
											color="primary"
										/>
									))}
								</Box>
							) : (
								<Typography variant="caption" color="text.secondary">
									No sources yet. Run discovery to find sources.
								</Typography>
							)}
						</Box>

						{/* Progress log */}
						{isRunning && progressMessages.length > 0 && (
							<Box
								ref={logRef}
								sx={{
									maxHeight: 160,
									overflow: "auto",
									bgcolor: "action.hover",
									borderRadius: 1,
									p: 1,
								}}
							>
								{progressMessages.map((msg, i) => (
									<Typography
										key={`${i}-${msg}`}
										variant="caption"
										display="block"
										color="text.secondary"
										sx={{ fontFamily: "monospace", lineHeight: 1.6 }}
									>
										{msg}
									</Typography>
								))}
							</Box>
						)}
					</Box>
				)}
			</CardContent>
		</Card>
	);
}
