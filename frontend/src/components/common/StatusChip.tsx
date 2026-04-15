/**
 * Shared status chip for discovery cycles, delegation cards, and similar
 * flows where a pipeline element transitions through `running → ok /
 * failed / skipped*` states. Keeps visual vocabulary consistent.
 */

import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { Chip, CircularProgress } from "@mui/material";

export type ChipStatus =
	| "running"
	| "ok"
	| "failed"
	| "skipped"
	| "skipped_low_confidence";

interface StatusChipProps {
	status: ChipStatus | string;
	/** Override the default label for the status (e.g. "Saved" instead of "ok"). */
	label?: string;
	size?: "small" | "medium";
}

export function StatusChip({ status, label, size = "small" }: StatusChipProps) {
	if (status === "running") {
		return (
			<Chip
				size={size}
				icon={<CircularProgress size={12} thickness={5} sx={{ ml: 0.5 }} />}
				label={label ?? "Running"}
				color="info"
				variant="outlined"
			/>
		);
	}
	if (status === "ok") {
		return (
			<Chip
				size={size}
				icon={<CheckCircleOutlineIcon />}
				label={label ?? "Saved"}
				color="success"
				variant="outlined"
			/>
		);
	}
	if (status === "failed") {
		return (
			<Chip
				size={size}
				icon={<ErrorOutlineIcon />}
				label={label ?? "Failed"}
				color="error"
				variant="outlined"
			/>
		);
	}
	if (status === "skipped" || status === "skipped_low_confidence") {
		return (
			<Chip
				size={size}
				icon={<WarningAmberIcon />}
				label={label ?? "Low confidence"}
				color="warning"
				variant="outlined"
			/>
		);
	}
	return <Chip size={size} label={label ?? status} variant="outlined" />;
}
