import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import MonitorHeartIcon from "@mui/icons-material/MonitorHeart";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import {
	Box,
	Button,
	Chip,
	FormControl,
	IconButton,
	InputLabel,
	MenuItem,
	Slider,
	Switch,
	TextField,
	Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { ZoomAwareSelect } from "@/components/common/ZoomAwareSelect";
import { GlassAccordion } from "@/components/tasks/sections/GlassAccordion";
import { useTaskConfig } from "@/components/tasks/TaskConfigContext";
import type {
	MonitoringCondition,
	MonitoringConditionType,
} from "@/types/task";
import { MONITORING_CONDITION_CONFIG } from "@/types/task";

export function MonitoringSection() {
	const { formData, setFormData } = useTaskConfig();

	const [conditionKeys, setConditionKeys] = useState<string[]>(() =>
		(formData.monitoringConditions ?? []).map(() => crypto.randomUUID()),
	);

	// Re-sync keys when backend hydration changes the condition count
	const conditionsLen = (formData.monitoringConditions ?? []).length;
	useEffect(() => {
		setConditionKeys((prev) => {
			if (prev.length === conditionsLen) return prev;
			return Array.from(
				{ length: conditionsLen },
				(_, i) => prev[i] ?? crypto.randomUUID(),
			);
		});
	}, [conditionsLen]);

	const updateCondition = useCallback(
		(index: number, patch: Partial<MonitoringCondition>) => {
			setFormData((prev) => {
				const updated = [...(prev.monitoringConditions ?? [])];
				updated[index] = { ...updated[index], ...patch };
				return { ...prev, monitoringConditions: updated };
			});
		},
		[setFormData],
	);

	const removeCondition = useCallback(
		(index: number) => {
			setConditionKeys((prev) => prev.filter((_, i) => i !== index));
			setFormData((prev) => ({
				...prev,
				monitoringConditions: (prev.monitoringConditions ?? []).filter(
					(_, i) => i !== index,
				),
			}));
		},
		[setFormData],
	);

	const addCondition = useCallback(() => {
		const newCondition: MonitoringCondition = {
			conditionType: "price_above",
			threshold: 0,
		};
		setConditionKeys((prev) => [...prev, crypto.randomUUID()]);
		setFormData((prev) => ({
			...prev,
			monitoringConditions: [
				...(prev.monitoringConditions ?? []),
				newCondition,
			],
		}));
	}, [setFormData]);

	const conditionCount = (formData.monitoringConditions ?? []).length;
	const summaryText = formData.monitoringEnabled
		? `${conditionCount} condition${conditionCount !== 1 ? "s" : ""} \u00b7 ${formData.alertCooldownMinutes ?? 60}m cooldown`
		: "Disabled";

	return (
		<GlassAccordion
			defaultExpanded
			icon={<MonitorHeartIcon fontSize="small" color="primary" />}
			title="Monitoring"
			summary={summaryText}
			trailing={
				<Chip
					label={formData.monitoringEnabled ? "On" : "Off"}
					size="small"
					color={formData.monitoringEnabled ? "success" : "default"}
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
					Enable monitoring alerts
				</Typography>
				<Switch
					checked={formData.monitoringEnabled}
					onChange={(e) =>
						setFormData((prev) => ({
							...prev,
							monitoringEnabled: e.target.checked,
						}))
					}
				/>
			</Box>

			{formData.monitoringEnabled && (
				<Box
					sx={{
						display: "flex",
						flexDirection: "column",
						gap: 1.5,
					}}
				>
					{(formData.monitoringConditions ?? []).map((condition, index) => (
						<Box
							key={conditionKeys[index] as string}
							sx={{
								display: "flex",
								gap: 1,
								alignItems: "flex-start",
							}}
						>
							<FormControl sx={{ minWidth: 160 }}>
								<InputLabel>Condition</InputLabel>
								<ZoomAwareSelect
									value={condition.conditionType}
									label="Condition"
									size="small"
									onChange={(e) =>
										updateCondition(index, {
											conditionType: e.target.value as MonitoringConditionType,
										})
									}
								>
									{(
										Object.keys(
											MONITORING_CONDITION_CONFIG,
										) as MonitoringConditionType[]
									).map((type) => (
										<MenuItem key={type} value={type}>
											{MONITORING_CONDITION_CONFIG[type].label}
										</MenuItem>
									))}
								</ZoomAwareSelect>
							</FormControl>

							<TextField
								label={`Threshold (${MONITORING_CONDITION_CONFIG[condition.conditionType]?.unit || ""})`}
								type="number"
								size="small"
								value={condition.threshold}
								onChange={(e) =>
									updateCondition(index, {
										threshold: Number(e.target.value),
									})
								}
								sx={{ width: 140 }}
							/>

							{condition.conditionType === "custom" ? (
								<TextField
									label="Description"
									size="small"
									value={condition.description ?? ""}
									onChange={(e) =>
										updateCondition(index, {
											description: e.target.value,
										})
									}
									sx={{ flex: 1 }}
								/>
							) : (
								<FormControl size="small" sx={{ minWidth: 90 }}>
									<InputLabel>Timeframe</InputLabel>
									<ZoomAwareSelect
										value={condition.timeframe ?? ""}
										label="Timeframe"
										onChange={(e) =>
											updateCondition(index, {
												timeframe: e.target.value || undefined,
											})
										}
									>
										<MenuItem value="">-</MenuItem>
										<MenuItem value="1H">1H</MenuItem>
										<MenuItem value="4H">4H</MenuItem>
										<MenuItem value="1D">1D</MenuItem>
									</ZoomAwareSelect>
								</FormControl>
							)}

							<IconButton
								size="small"
								color="error"
								onClick={() => removeCondition(index)}
							>
								<RemoveCircleOutlineIcon />
							</IconButton>
						</Box>
					))}

					<Button
						size="small"
						startIcon={<AddCircleOutlineIcon />}
						onClick={addCondition}
						sx={{ alignSelf: "flex-start" }}
					>
						Add Condition
					</Button>

					<Box sx={{ px: 1 }}>
						<Typography gutterBottom variant="body2">
							Alert Cooldown: {formData.alertCooldownMinutes ?? 60} minutes
						</Typography>
						<Slider
							value={formData.alertCooldownMinutes ?? 60}
							onChange={(_, value) =>
								setFormData((prev) => ({
									...prev,
									alertCooldownMinutes: value as number,
								}))
							}
							min={5}
							max={1440}
							step={5}
							marks={[
								{ value: 15, label: "15m" },
								{ value: 60, label: "1h" },
								{ value: 360, label: "6h" },
								{ value: 1440, label: "24h" },
							]}
							valueLabelDisplay="auto"
							valueLabelFormat={(v) =>
								v >= 60
									? `${Math.floor(v / 60)}h${v % 60 ? ` ${v % 60}m` : ""}`
									: `${v}m`
							}
							sx={{
								"& .MuiSlider-markLabel": { fontSize: "0.7rem" },
							}}
						/>
					</Box>
				</Box>
			)}
		</GlassAccordion>
	);
}
