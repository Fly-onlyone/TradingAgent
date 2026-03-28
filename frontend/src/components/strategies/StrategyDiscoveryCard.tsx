/**
 * Strategy Auto-Discovery configuration card for the Strategies page.
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
	FormControl,
	FormControlLabel,
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
		<Card sx={{ mb: 3 }}>
			<CardContent>
				<Box
					sx={{
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						mb: 2,
					}}
				>
					<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
						<SearchIcon color="primary" />
						<Typography variant="h6" fontWeight={600}>
							Strategy Auto-Discovery
						</Typography>
					</Box>
					{config && (
						<FormControlLabel
							control={
								<Switch
									checked={config.enabled}
									onChange={(_, checked) =>
										updateMutation.mutate({ enabled: checked })
									}
								/>
							}
							label={config.enabled ? "Enabled" : "Disabled"}
						/>
					)}
				</Box>

				<Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
					Search the web for trading strategy articles using Brave Search, then
					extract and save strategies to the knowledge base (RAG).
				</Typography>

				{configQuery.isLoading && <CircularProgress size={24} />}

				{config && (
					<Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
						<FormControl size="small" sx={{ maxWidth: 250 }}>
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

						<Box sx={{ maxWidth: 350 }}>
							<Typography variant="body2" gutterBottom>
								Min. Extraction Confidence:{" "}
								{(config.minConfidence * 100).toFixed(0)}%
							</Typography>
							<Slider
								value={config.minConfidence}
								onChange={(_, val) =>
									updateMutation.mutate({
										minConfidence: val as number,
									})
								}
								min={0.1}
								max={1.0}
								step={0.05}
								disabled={!config.enabled}
								valueLabelDisplay="auto"
								valueLabelFormat={(v) => `${(v * 100).toFixed(0)}%`}
							/>
						</Box>

						<Box sx={{ maxWidth: 350 }}>
							<Typography variant="body2" gutterBottom>
								Max Auto-Discovered Sources: {config.maxSources}
							</Typography>
							<Slider
								value={config.maxSources}
								onChange={(_, val) =>
									updateMutation.mutate({
										maxSources: val as number,
									})
								}
								min={5}
								max={100}
								step={5}
								disabled={!config.enabled}
								valueLabelDisplay="auto"
							/>
						</Box>

						{/* Sources with strategy extraction enabled */}
						<Box>
							<Typography variant="body2" fontWeight={600} gutterBottom>
								Sources ({config.sources.length})
							</Typography>
							{config.sources.length > 0 ? (
								<Box
									sx={{
										display: "flex",
										flexWrap: "wrap",
										gap: 1,
									}}
								>
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
								<Typography variant="body2" color="text.secondary">
									No pre-configured sources yet. Click Run Now to auto-discover
									sources via Brave Search.
								</Typography>
							)}
						</Box>

						{/* Run Now button + progress */}
						<Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
							<Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
								<Button
									variant="outlined"
									size="small"
									startIcon={
										isRunning ? (
											<CircularProgress size={16} />
										) : (
											<PlayArrowIcon />
										)
									}
									onClick={() => startRun(token ?? "")}
									disabled={isRunning}
								>
									{isRunning ? "Running..." : "Run Now"}
								</Button>
								{runResult && !isRunning && (
									<Alert severity="info" sx={{ py: 0 }}>
										{runResult}
									</Alert>
								)}
							</Box>

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
					</Box>
				)}
			</CardContent>
		</Card>
	);
}
