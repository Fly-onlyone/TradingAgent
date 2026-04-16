import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import MonitorHeartIcon from "@mui/icons-material/MonitorHeart";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import {
	Box,
	Button,
	Chip,
	Divider,
	IconButton,
	MenuItem,
	Slider,
	Switch,
	TextField,
	Typography,
} from "@mui/material";
import { Fragment, useCallback, useEffect, useState } from "react";
import { ZoomAwareSelect } from "@/components/common/ZoomAwareSelect";
import { GlassAccordion } from "@/components/tasks/sections/GlassAccordion";
import { useTaskConfig } from "@/components/tasks/TaskConfigContext";
import type {
	MonitoringCondition,
	MonitoringConditionType,
} from "@/types/task";
import { MONITORING_CONDITION_CONFIG } from "@/types/task";

const GRID_COLUMNS =
	"minmax(160px, 1.4fr) minmax(100px, 0.8fr) minmax(120px, 1.1fr) 36px";

const HEADER_LABELS = ["Condition", "Threshold", "Timeframe"] as const;

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
				<>
					<Divider flexItem />

					{conditionCount > 0 && (
						<Box
							sx={{
								display: "grid",
								gridTemplateColumns: GRID_COLUMNS,
								columnGap: 1,
								rowGap: 1,
								alignItems: "center",
							}}
						>
							{HEADER_LABELS.map((label) => (
								<Typography
									key={label}
									variant="caption"
									color="text.secondary"
									sx={{
										textTransform: "uppercase",
										letterSpacing: "0.06em",
										fontWeight: 600,
										px: 0.5,
									}}
								>
									{label}
								</Typography>
							))}
							<Box />

							{(formData.monitoringConditions ?? []).map((condition, index) => {
								const unit =
									MONITORING_CONDITION_CONFIG[condition.conditionType]?.unit ||
									"";
								const isCustom = condition.conditionType === "custom";
								return (
									<Fragment key={conditionKeys[index] as string}>
										<ZoomAwareSelect
											value={condition.conditionType}
											size="small"
											onChange={(e) =>
												updateCondition(index, {
													conditionType: e.target
														.value as MonitoringConditionType,
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

										<TextField
											type="number"
											size="small"
											value={condition.threshold}
											placeholder={unit || "value"}
											onChange={(e) =>
												updateCondition(index, {
													threshold: Number(e.target.value),
												})
											}
										/>

										{isCustom ? (
											<TextField
												size="small"
												placeholder="Describe the signal"
												value={condition.description ?? ""}
												onChange={(e) =>
													updateCondition(index, {
														description: e.target.value,
													})
												}
											/>
										) : (
											<ZoomAwareSelect
												value={condition.timeframe ?? ""}
												size="small"
												displayEmpty
												onChange={(e) =>
													updateCondition(index, {
														timeframe: e.target.value || undefined,
													})
												}
											>
												<MenuItem value="">Any</MenuItem>
												<MenuItem value="1H">1H</MenuItem>
												<MenuItem value="4H">4H</MenuItem>
												<MenuItem value="1D">1D</MenuItem>
											</ZoomAwareSelect>
										)}

										<IconButton
											size="small"
											color="error"
											onClick={() => removeCondition(index)}
											sx={{ justifySelf: "center" }}
										>
											<RemoveCircleOutlineIcon fontSize="small" />
										</IconButton>
									</Fragment>
								);
							})}
						</Box>
					)}

					<Button
						size="small"
						startIcon={<AddCircleOutlineIcon />}
						onClick={addCondition}
						sx={{ alignSelf: "flex-start" }}
					>
						Add Condition
					</Button>

					<Divider flexItem />

					<Box sx={{ px: 0.5 }}>
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
				</>
			)}
		</GlassAccordion>
	);
}
