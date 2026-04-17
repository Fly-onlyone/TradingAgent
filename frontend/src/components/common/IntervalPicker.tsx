import { FormControl, InputLabel, MenuItem, TextField } from "@mui/material";
import { ZoomAwareSelect } from "@/components/common/ZoomAwareSelect";

export type IntervalUnit = "minutes" | "hours";

interface Props {
	value: number | undefined;
	unit: IntervalUnit | undefined;
	onValueChange: (value: number | undefined) => void;
	onUnitChange: (unit: IntervalUnit) => void;
	valueLabel?: string;
	unitLabel?: string;
	valueWidth?: number;
	unitMinWidth?: number;
	minutesLabel?: string;
	hoursLabel?: string;
}

/**
 * Value + unit pair for interval schedules — shared by the "Every" frequency
 * branch and the daily/weekly "Repeat every N" sub-control. Only the widths
 * and the optional value label change between call sites.
 */
export function IntervalPicker({
	value,
	unit,
	onValueChange,
	onUnitChange,
	valueLabel,
	unitLabel = "Unit",
	valueWidth = 90,
	unitMinWidth = 110,
	minutesLabel = "Minutes",
	hoursLabel = "Hours",
}: Props) {
	return (
		<>
			<TextField
				label={valueLabel}
				type="number"
				size="small"
				value={value ?? ""}
				onChange={(e) =>
					onValueChange(e.target.value ? Number(e.target.value) : undefined)
				}
				slotProps={{
					htmlInput: {
						min: 1,
						onFocus: (e: React.FocusEvent<HTMLInputElement>) =>
							e.target.select(),
					},
				}}
				sx={{ width: valueWidth }}
			/>
			<FormControl size="small" sx={{ minWidth: unitMinWidth }}>
				<InputLabel>{unitLabel}</InputLabel>
				<ZoomAwareSelect
					value={unit ?? "hours"}
					label={unitLabel}
					onChange={(e) => onUnitChange(e.target.value as IntervalUnit)}
				>
					<MenuItem value="minutes">{minutesLabel}</MenuItem>
					<MenuItem value="hours">{hoursLabel}</MenuItem>
				</ZoomAwareSelect>
			</FormControl>
		</>
	);
}
