import SettingsIcon from "@mui/icons-material/Settings";
import {
	Box,
	Chip,
	CircularProgress,
	TextField,
	Typography,
} from "@mui/material";
import { useMemo } from "react";
import type { SymbolOption } from "@/api/endpoints/market";
import { CoinIcon } from "@/components/common/CoinIcon";
import { ZoomAwareAutocomplete } from "@/components/common/ZoomAwareAutocomplete";
import { GlassAccordion } from "@/components/tasks/sections/GlassAccordion";
import { useTaskConfig } from "@/components/tasks/TaskConfigContext";

export function GeneralSection() {
	const { formData, setFormData, symbolOptions, symbolsLoading } =
		useTaskConfig();

	const selectedSymbolOptions = useMemo<SymbolOption[]>(() => {
		return formData.symbols.map((sym) => {
			const found =
				symbolOptions.find((o) => o.symbol === sym && o.group === "Popular") ??
				symbolOptions.find((o) => o.symbol === sym);
			if (found) return found;
			const [base, quote] = sym.split("-");
			return {
				symbol: sym,
				base: base ?? sym,
				quote: quote ?? "USDT",
				group: "Popular",
			};
		});
	}, [formData.symbols, symbolOptions]);

	const summaryText =
		formData.symbols.length > 0
			? formData.symbols.slice(0, 3).join(", ") +
				(formData.symbols.length > 3 ? ` +${formData.symbols.length - 3}` : "")
			: "No symbols selected";

	return (
		<GlassAccordion
			defaultExpanded
			icon={<SettingsIcon fontSize="small" color="primary" />}
			title="General"
			summary={summaryText}
		>
			<TextField
				label="Description"
				value={formData.description || ""}
				onChange={(e) =>
					setFormData((prev) => ({ ...prev, description: e.target.value }))
				}
				fullWidth
				multiline
				rows={2}
				placeholder="What should this task do?"
			/>

			<ZoomAwareAutocomplete<SymbolOption, true, false, false>
				multiple
				filterSelectedOptions
				value={selectedSymbolOptions}
				onChange={(_, newValue) => {
					const uniqueSymbols = [...new Set(newValue.map((opt) => opt.symbol))];
					setFormData((prev) => ({ ...prev, symbols: uniqueSymbols }));
				}}
				options={symbolOptions}
				groupBy={(option) => option.group}
				getOptionLabel={(option) => option.symbol}
				renderOption={(props, option) => (
					<li {...props} key={`${option.group}-${option.symbol}`}>
						<Box
							sx={{
								display: "flex",
								alignItems: "center",
								gap: 1.5,
							}}
						>
							<CoinIcon symbol={option.base} size={28} />
							<Box>
								<Typography variant="body2" fontWeight={600}>
									{option.symbol}
								</Typography>
								<Typography variant="caption" color="text.secondary">
									{option.base} / {option.quote}
								</Typography>
							</Box>
						</Box>
					</li>
				)}
				renderTags={(value, getTagProps) =>
					value.map((option, index) => {
						const { key, ...tagProps } = getTagProps({ index });
						return (
							<Chip
								key={key}
								label={option.symbol}
								size="small"
								icon={<CoinIcon symbol={option.base} size={18} />}
								{...tagProps}
							/>
						);
					})
				}
				isOptionEqualToValue={(option, value) =>
					option.symbol === value.symbol && option.group === value.group
				}
				loading={symbolsLoading}
				renderInput={(params) => (
					<TextField
						{...params}
						label="Symbols"
						placeholder={
							formData.symbols.length === 0 ? "Search instruments..." : ""
						}
						slotProps={{
							input: {
								...params.InputProps,
								endAdornment: (
									<>
										{symbolsLoading ? <CircularProgress size={18} /> : null}
										{params.InputProps.endAdornment}
									</>
								),
							},
						}}
					/>
				)}
			/>

			<TextField
				label="Custom Instructions"
				value={formData.customInstructions || ""}
				onChange={(e) =>
					setFormData((prev) => ({
						...prev,
						customInstructions: e.target.value,
					}))
				}
				fullWidth
				multiline
				rows={3}
				placeholder="Additional instructions for the agent..."
			/>
		</GlassAccordion>
	);
}
