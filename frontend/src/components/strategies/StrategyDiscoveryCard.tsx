/**
 * Strategy Auto-Discovery card for the Tasks page.
 * Superuser-only — returns null for non-superusers.
 */

import HistoryIcon from "@mui/icons-material/History";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ScheduleIcon from "@mui/icons-material/Schedule";
import {
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	CircularProgress,
	FormControl,
	InputAdornment,
	InputLabel,
	MenuItem,
	Slider,
	Switch,
	TextField,
	Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
	type StrategyDiscoveryConfig,
	settingsApi,
} from "@/api/endpoints/settings";
import { SaveIndicator } from "@/components/common/SaveIndicator";
import { ZoomAwareSelect } from "@/components/common/ZoomAwareSelect";
import { useMutationSaveStatus } from "@/hooks/useMutationSaveStatus";
import { useAuthStore } from "@/store/authStore";
import { useDiscoveryStore } from "@/store/discoveryStore";
import { notify } from "@/store/uiStore";
import { formatDateTime } from "@/utils/formatters";

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
	const [draftMinConfidence, setDraftMinConfidence] = useState<number | null>(
		null,
	);
	const [draftMaxSources, setDraftMaxSources] = useState<number | null>(null);
	const [confidenceInput, setConfidenceInput] = useState("");
	const [sourcesInput, setSourcesInput] = useState("");

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

	const saveStatus = useMutationSaveStatus(updateMutation);

	const config = configQuery.data;
	const minConfidence = draftMinConfidence ?? config?.minConfidence ?? 0.5;
	const maxSources = draftMaxSources ?? config?.maxSources ?? 30;

	useEffect(() => {
		if (!config) return;
		setDraftMinConfidence(config.minConfidence);
		setDraftMaxSources(config.maxSources);
		setConfidenceInput((config.minConfidence * 100).toFixed(0));
		setSourcesInput(String(config.maxSources));
	}, [config]);

	const getSliderNumber = (value: number | number[]) =>
		Array.isArray(value) ? value[0] : value;

	const handleConfidenceInputCommit = () => {
		const parsed = Number(confidenceInput);
		if (Number.isNaN(parsed) || confidenceInput === "") {
			setConfidenceInput((minConfidence * 100).toFixed(0));
			return;
		}
		const clamped = Math.min(100, Math.max(10, Math.round(parsed / 5) * 5));
		const asDecimal = clamped / 100;
		setConfidenceInput(String(clamped));
		setDraftMinConfidence(asDecimal);
		if (asDecimal !== config?.minConfidence) {
			updateMutation.mutate({ minConfidence: asDecimal });
		}
	};

	const handleSourcesInputCommit = () => {
		const parsed = Number(sourcesInput);
		if (Number.isNaN(parsed) || sourcesInput === "") {
			setSourcesInput(String(maxSources));
			return;
		}
		const clamped = Math.min(100, Math.max(5, Math.round(parsed / 5) * 5));
		setSourcesInput(String(clamped));
		setDraftMaxSources(clamped);
		if (clamped !== config?.maxSources) {
			updateMutation.mutate({ maxSources: clamped });
		}
	};

	if (!isSuperuser) return null;

	return (
		<Card>
			<CardContent>
				{/* Header row */}
				<Box
					sx={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						mb: 1,
					}}
				>
					<Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
						<Typography variant="h6">Auto-Discovery</Typography>
						<SaveIndicator status={saveStatus} />
					</Box>
					<Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
						{/* Next Run / Last Run badges in header */}
						{config?.enabled && (
							<>
								<Box
									sx={{
										display: "flex",
										alignItems: "center",
										gap: 1.5,
										px: 2,
										py: 1,
										borderRadius: 3,
										background: "rgba(16, 185, 129, 0.08)",
										border: "1.5px solid rgba(16, 185, 129, 0.5)",
									}}
								>
									<ScheduleIcon sx={{ color: "#10B981", fontSize: 20 }} />
									<Box>
										<Typography
											variant="caption"
											sx={{
												display: "block",
												lineHeight: 1.2,
												letterSpacing: 0.5,
												color: "#34D399",
											}}
										>
											Next Run
										</Typography>
										<Typography variant="body2" fontWeight={500}>
											{config.nextRunAt
												? formatDateTime(config.nextRunAt)
												: "Not scheduled"}
										</Typography>
									</Box>
								</Box>
								<Box
									sx={{
										display: "flex",
										alignItems: "center",
										gap: 1.5,
										px: 2,
										py: 1,
										borderRadius: 3,
										background: "rgba(167, 139, 250, 0.1)",
										border: "1.5px solid rgba(167, 139, 250, 0.55)",
									}}
								>
									<HistoryIcon sx={{ color: "#A78BFA", fontSize: 20 }} />
									<Box>
										<Typography
											variant="caption"
											sx={{
												display: "block",
												lineHeight: 1.2,
												letterSpacing: 0.5,
												color: "#A78BFA",
											}}
										>
											Last Run
										</Typography>
										<Typography variant="body2" fontWeight={500}>
											{config.lastRunAt
												? formatDateTime(config.lastRunAt)
												: "Never"}
										</Typography>
									</Box>
								</Box>
							</>
						)}
						{config && (
							<Switch
								checked={config.enabled}
								onChange={(_, checked) =>
									updateMutation.mutate({ enabled: checked })
								}
							/>
						)}
					</Box>
				</Box>

				{configQuery.isLoading && <CircularProgress size={24} />}

				{/* Content — only when enabled */}
				{config?.enabled && (
					<Box
						sx={{
							display: "flex",
							flexDirection: "column",
							gap: 2,
							mt: 1,
						}}
					>
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
							<Box
								sx={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									mb: 0.5,
								}}
							>
								<Typography variant="body2">Min. Confidence</Typography>
								<TextField
									size="small"
									type="number"
									value={confidenceInput}
									onChange={(e) => setConfidenceInput(e.target.value)}
									onBlur={handleConfidenceInputCommit}
									onKeyDown={(e) => {
										if (e.key === "Enter") handleConfidenceInputCommit();
									}}
									onFocus={(e) => e.target.select()}
									slotProps={{
										htmlInput: {
											min: 10,
											max: 100,
											step: 5,
											style: { textAlign: "right" },
										},
										input: {
											endAdornment: (
												<InputAdornment position="end">%</InputAdornment>
											),
										},
									}}
									sx={{
										width: 80,
										"& .MuiInputBase-input": {
											py: 0.5,
											px: 1,
											fontSize: "0.875rem",
											MozAppearance: "textfield",
											"&::-webkit-outer-spin-button, &::-webkit-inner-spin-button":
												{
													WebkitAppearance: "none",
													margin: 0,
												},
										},
									}}
								/>
							</Box>
							<Slider
								value={minConfidence}
								onChange={(_, value) => {
									const v = getSliderNumber(value);
									setDraftMinConfidence(v);
									setConfidenceInput((v * 100).toFixed(0));
								}}
								onChangeCommitted={(_, value) => {
									const nextValue = getSliderNumber(value);
									setDraftMinConfidence(nextValue);
									setConfidenceInput((nextValue * 100).toFixed(0));
									if (nextValue !== config.minConfidence) {
										updateMutation.mutate({ minConfidence: nextValue });
									}
								}}
								min={0.1}
								max={1.0}
								step={0.05}
								size="small"
								valueLabelDisplay="auto"
								valueLabelFormat={(v) => `${(v * 100).toFixed(0)}%`}
							/>
						</Box>

						{/* Max Sources slider */}
						<Box>
							<Box
								sx={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									mb: 0.5,
								}}
							>
								<Typography variant="body2">Max Sources</Typography>
								<TextField
									size="small"
									type="number"
									value={sourcesInput}
									onChange={(e) => setSourcesInput(e.target.value)}
									onBlur={handleSourcesInputCommit}
									onKeyDown={(e) => {
										if (e.key === "Enter") handleSourcesInputCommit();
									}}
									onFocus={(e) => e.target.select()}
									slotProps={{
										htmlInput: {
											min: 5,
											max: 100,
											step: 5,
											style: { textAlign: "right" },
										},
									}}
									sx={{
										width: 64,
										"& .MuiInputBase-input": {
											py: 0.5,
											px: 1,
											fontSize: "0.875rem",
											MozAppearance: "textfield",
											"&::-webkit-outer-spin-button, &::-webkit-inner-spin-button":
												{
													WebkitAppearance: "none",
													margin: 0,
												},
										},
									}}
								/>
							</Box>
							<Slider
								value={maxSources}
								onChange={(_, value) => {
									const v = getSliderNumber(value);
									setDraftMaxSources(v);
									setSourcesInput(String(v));
								}}
								onChangeCommitted={(_, value) => {
									const nextValue = getSliderNumber(value);
									setDraftMaxSources(nextValue);
									setSourcesInput(String(nextValue));
									if (nextValue !== config.maxSources) {
										updateMutation.mutate({ maxSources: nextValue });
									}
								}}
								min={5}
								max={100}
								step={5}
								size="small"
								valueLabelDisplay="auto"
							/>
						</Box>

						{/* Run Now */}
						<Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
							<Button
								variant="outlined"
								size="small"
								startIcon={
									isRunning ? <CircularProgress size={14} /> : <PlayArrowIcon />
								}
								onClick={() => startRun(token ?? "")}
								disabled={isRunning}
							>
								{isRunning ? "Running..." : "Run Now"}
							</Button>
							{runResult && !isRunning && (
								<Typography variant="caption" color="text.secondary">
									{runResult}
								</Typography>
							)}
						</Box>

						{/* Sources — always visible */}
						<Box>
							<Typography variant="body2" sx={{ mb: 1 }}>
								Sources ({config.sources.length})
							</Typography>
							{config.sources.length > 0 ? (
								<Box
									sx={{
										display: "flex",
										flexWrap: "wrap",
										gap: 0.5,
									}}
								>
									{config.sources.map((source) => (
										<Chip
											key={source.id}
											label={source.name}
											variant="outlined"
											size="small"
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
