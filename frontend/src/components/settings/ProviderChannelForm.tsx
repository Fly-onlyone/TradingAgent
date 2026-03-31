/**
 * Provider-based notification channel form.
 *
 * Lets users select a notification service from a dropdown, fill in
 * provider-specific fields, and constructs the Apprise URL automatically.
 */

import AddIcon from "@mui/icons-material/Add";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import {
	Box,
	Button,
	FormControl,
	FormControlLabel,
	InputLabel,
	ListItemIcon,
	ListItemText,
	MenuItem,
	Switch,
	TextField,
	Typography,
} from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useState } from "react";
import { ZoomAwareSelect } from "@/components/common/ZoomAwareSelect";
import { fadeInUp } from "@/utils/animations/variants";
import {
	type FieldValues,
	NOTIFICATION_PROVIDERS,
	PROVIDER_MAP,
} from "./notificationProviders";

interface ProviderChannelFormProps {
	onAddUrl: (url: string) => void;
}

function getInitialValues(providerId: string): FieldValues {
	const provider = PROVIDER_MAP.get(providerId);
	if (!provider) return {};
	const values: FieldValues = {};
	for (const field of provider.fields) {
		if (field.defaultValue !== undefined) {
			values[field.key] = field.defaultValue;
		} else if (field.type === "checkbox") {
			values[field.key] = false;
		} else {
			values[field.key] = "";
		}
	}
	return values;
}

export function ProviderChannelForm({ onAddUrl }: ProviderChannelFormProps) {
	const [selectedProvider, setSelectedProvider] = useState("");
	const [fieldValues, setFieldValues] = useState<FieldValues>({});
	const [errors, setErrors] = useState<Record<string, string>>({});

	const provider = PROVIDER_MAP.get(selectedProvider);

	const handleProviderChange = useCallback((providerId: string) => {
		setSelectedProvider(providerId);
		setFieldValues(getInitialValues(providerId));
		setErrors({});
	}, []);

	const handleFieldChange = useCallback(
		(key: string, value: string | boolean | number) => {
			setFieldValues((prev) => ({ ...prev, [key]: value }));
			setErrors((prev) => {
				if (!prev[key]) return prev;
				const next = { ...prev };
				delete next[key];
				return next;
			});
		},
		[],
	);

	const handleAdd = useCallback(() => {
		if (!provider) return;

		const newErrors: Record<string, string> = {};
		for (const field of provider.fields) {
			if (field.required) {
				const val = fieldValues[field.key];
				if (val === undefined || val === "" || val === null) {
					newErrors[field.key] = "Required";
				}
			}
		}

		if (Object.keys(newErrors).length > 0) {
			setErrors(newErrors);
			return;
		}

		const url = provider.buildUrl(fieldValues);
		onAddUrl(url);
		setSelectedProvider("");
		setFieldValues({});
		setErrors({});
	}, [provider, fieldValues, onAddUrl]);

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
			<FormControl size="small" fullWidth>
				<InputLabel>Notification Service</InputLabel>
				<ZoomAwareSelect
					value={selectedProvider}
					label="Notification Service"
					onChange={(e) => handleProviderChange(e.target.value as string)}
					renderValue={(val) => {
						const p = PROVIDER_MAP.get(val as string);
						if (!p) return val;
						return (
							<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
								{p.icon}
								{p.label}
							</Box>
						);
					}}
				>
					{NOTIFICATION_PROVIDERS.map((p) => (
						<MenuItem key={p.id} value={p.id}>
							<ListItemIcon sx={{ minWidth: 32 }}>{p.icon}</ListItemIcon>
							<ListItemText>{p.label}</ListItemText>
						</MenuItem>
					))}
				</ZoomAwareSelect>
			</FormControl>

			<AnimatePresence mode="wait">
				{provider && (
					<motion.div
						key={provider.id}
						variants={fadeInUp}
						initial="hidden"
						animate="visible"
						exit="hidden"
					>
						<Box
							sx={{
								display: "flex",
								flexDirection: "column",
								gap: 1.5,
								p: 2,
								borderRadius: 1,
								border: "1px solid",
								borderColor: "divider",
								bgcolor: "action.hover",
							}}
						>
							{provider.fields.map((field) =>
								field.type === "checkbox" ? (
									<FormControlLabel
										key={field.key}
										control={
											<Switch
												checked={Boolean(fieldValues[field.key])}
												onChange={(e) =>
													handleFieldChange(field.key, e.target.checked)
												}
												size="small"
											/>
										}
										label={field.label}
									/>
								) : (
									<TextField
										key={field.key}
										size="small"
										label={field.label}
										placeholder={field.placeholder}
										helperText={errors[field.key] || field.helperText}
										error={Boolean(errors[field.key])}
										type={
											field.type === "password"
												? "password"
												: field.type === "number"
													? "number"
													: "text"
										}
										value={fieldValues[field.key] ?? ""}
										onChange={(e) =>
											handleFieldChange(
												field.key,
												field.type === "number"
													? Number(e.target.value)
													: e.target.value,
											)
										}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												handleAdd();
											}
										}}
										required={field.required}
										fullWidth
									/>
								),
							)}

							<Box
								sx={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
									mt: 0.5,
								}}
							>
								<Button
									size="small"
									variant="contained"
									startIcon={<AddIcon />}
									onClick={handleAdd}
								>
									Add Channel
								</Button>

								{provider.helpUrl && (
									<Typography
										component="a"
										href={provider.helpUrl}
										target="_blank"
										rel="noopener noreferrer"
										variant="caption"
										color="text.secondary"
										sx={{
											display: "inline-flex",
											alignItems: "center",
											gap: 0.5,
											"&:hover": {
												color: "primary.main",
											},
										}}
									>
										Setup guide
										<OpenInNewIcon sx={{ fontSize: "0.85rem" }} />
									</Typography>
								)}
							</Box>
						</Box>
					</motion.div>
				)}
			</AnimatePresence>
		</Box>
	);
}
