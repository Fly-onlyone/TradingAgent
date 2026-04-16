import AutoModeIcon from "@mui/icons-material/AutoMode";
import NotificationsIcon from "@mui/icons-material/Notifications";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import {
	Box,
	Chip,
	FormControl,
	FormControlLabel,
	InputLabel,
	MenuItem,
	Slider,
	Switch,
	TextField,
	ToggleButton,
	ToggleButtonGroup,
	Tooltip,
	Typography,
} from "@mui/material";
import { ZoomAwareSelect } from "@/components/common/ZoomAwareSelect";
import { GlassAccordion } from "@/components/tasks/sections/GlassAccordion";
import { useTaskConfig } from "@/components/tasks/TaskConfigContext";
import type { AgentMode, HoldingTerm, RiskLevel } from "@/types/task";
import { HOLDING_TERM_CONFIG } from "@/types/task";

const riskMarks = [
	{ value: 0, label: "Conservative" },
	{ value: 1, label: "Moderate" },
	{ value: 2, label: "Aggressive" },
];
const riskValues: RiskLevel[] = ["conservative", "moderate", "aggressive"];

export function TradingSection() {
	const { formData, setFormData } = useTaskConfig();

	const summaryText = formData.tradingEnabled
		? [
				formData.agentMode === "auto" ? "Auto" : "Ask",
				formData.riskLevel.charAt(0).toUpperCase() +
					formData.riskLevel.slice(1),
				formData.maxPositionSize ? `$${formData.maxPositionSize}` : null,
			]
				.filter(Boolean)
				.join(" \u00b7 ")
		: "Disabled";

	return (
		<GlassAccordion
			defaultExpanded
			icon={<TrendingUpIcon fontSize="small" color="primary" />}
			title="Trading"
			summary={summaryText}
			trailing={
				<Chip
					label={formData.tradingEnabled ? "On" : "Off"}
					size="small"
					color={formData.tradingEnabled ? "success" : "default"}
					variant="outlined"
					sx={{ mr: 1 }}
				/>
			}
		>
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
				}}
			>
				<Typography variant="body2" color="text.secondary">
					Enable automated trading
				</Typography>
				<Switch
					checked={formData.tradingEnabled}
					onChange={(e) =>
						setFormData((prev) => ({
							...prev,
							tradingEnabled: e.target.checked,
						}))
					}
				/>
			</Box>

			{formData.tradingEnabled && (
				<Box
					sx={{
						display: "flex",
						flexDirection: "column",
						gap: 2,
					}}
				>
					<FormControl fullWidth>
						<InputLabel>Agent Mode</InputLabel>
						<ZoomAwareSelect
							value={formData.agentMode}
							label="Agent Mode"
							onChange={(e) =>
								setFormData((prev) => ({
									...prev,
									agentMode: e.target.value as AgentMode,
								}))
							}
						>
							<MenuItem value="ask">
								<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
									<NotificationsIcon fontSize="small" />
									Ask - Notify for confirmation
								</Box>
							</MenuItem>
							<MenuItem value="auto">
								<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
									<AutoModeIcon fontSize="small" />
									Auto - Execute automatically
								</Box>
							</MenuItem>
						</ZoomAwareSelect>
					</FormControl>

					<Box>
						<Typography gutterBottom>Holding Term</Typography>
						<Typography
							variant="caption"
							color="text.secondary"
							sx={{ display: "block", mb: 1 }}
						>
							How long the agent should hold positions before considering exit
						</Typography>
						<ToggleButtonGroup
							value={formData.holdingTerm ?? "medium"}
							exclusive
							onChange={(_, value) => {
								if (value !== null) {
									setFormData((prev) => ({
										...prev,
										holdingTerm: value as HoldingTerm,
									}));
								}
							}}
							fullWidth
							size="small"
						>
							{(Object.keys(HOLDING_TERM_CONFIG) as HoldingTerm[]).map(
								(term) => (
									<ToggleButton
										key={term}
										value={term}
										sx={{
											display: "flex",
											flexDirection: "column",
											gap: 0.25,
											py: 1,
											textTransform: "none",
										}}
									>
										<Typography variant="body2" fontWeight={600}>
											{HOLDING_TERM_CONFIG[term].label}
										</Typography>
										<Typography variant="caption" color="text.secondary">
											{HOLDING_TERM_CONFIG[term].description}
										</Typography>
									</ToggleButton>
								),
							)}
						</ToggleButtonGroup>
					</Box>

					<Box sx={{ px: 4 }}>
						<Typography gutterBottom>Risk Level</Typography>
						<Slider
							value={riskValues.indexOf(formData.riskLevel)}
							onChange={(_, value) =>
								setFormData((prev) => ({
									...prev,
									riskLevel: riskValues[value as number],
								}))
							}
							step={1}
							marks={riskMarks}
							min={0}
							max={2}
							sx={{
								"& .MuiSlider-markLabel": { fontSize: "0.75rem" },
							}}
						/>
					</Box>

					<Tooltip title="Run specialized subagents (Technical, Fundamental, News) before main analysis. More thorough but uses more API credits.">
						<FormControlLabel
							control={
								<Switch
									checked={formData.useSubagents ?? false}
									onChange={(e) =>
										setFormData((prev) => ({
											...prev,
											useSubagents: e.target.checked,
										}))
									}
								/>
							}
							label="Deep Analysis (Subagents)"
						/>
					</Tooltip>

					<TextField
						label="Max Position Size (USDT)"
						type="number"
						value={formData.maxPositionSize || ""}
						onChange={(e) =>
							setFormData((prev) => ({
								...prev,
								maxPositionSize: e.target.value
									? Number(e.target.value)
									: undefined,
							}))
						}
						fullWidth
					/>

					<TextField
						label="Max Daily Trades"
						type="number"
						value={formData.maxDailyTrades || ""}
						onChange={(e) =>
							setFormData((prev) => ({
								...prev,
								maxDailyTrades: e.target.value
									? Number(e.target.value)
									: undefined,
							}))
						}
						fullWidth
						helperText="Limit how many trades the agent can execute per day"
						slotProps={{
							htmlInput: { min: 1, step: 1 },
						}}
					/>
				</Box>
			)}
		</GlassAccordion>
	);
}
