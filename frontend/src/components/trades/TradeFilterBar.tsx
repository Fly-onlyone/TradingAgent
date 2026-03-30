/**
 * Trade Filter Bar Component
 * Provides filtering options for trades
 */

import FilterAltOffIcon from "@mui/icons-material/FilterAltOff";
import TableRowsIcon from "@mui/icons-material/TableRows";
import ViewListIcon from "@mui/icons-material/ViewList";
import {
	Box,
	Button,
	FormControl,
	InputLabel,
	MenuItem,
	TextField,
	ToggleButton,
	ToggleButtonGroup,
} from "@mui/material";
import type { SelectChangeEvent } from "@mui/material/Select";
import { useState } from "react";
import { ZoomAwareSelect } from "@/components/common/ZoomAwareSelect";
import type { TradesFilter, TradeViewMode } from "@/types";

interface TradeFilterBarProps {
	filters: TradesFilter;
	viewMode: TradeViewMode;
	onFilterChange: (filters: Partial<TradesFilter>) => void;
	onViewModeChange: (mode: TradeViewMode) => void;
	onResetFilters: () => void;
	symbols?: string[];
}

const COMMON_SYMBOLS = [
	"BTC-USDT",
	"ETH-USDT",
	"SOL-USDT",
	"XRP-USDT",
	"DOGE-USDT",
	"ADA-USDT",
	"AVAX-USDT",
	"DOT-USDT",
];

export function TradeFilterBar({
	filters,
	viewMode,
	onFilterChange,
	onViewModeChange,
	onResetFilters,
	symbols = COMMON_SYMBOLS,
}: TradeFilterBarProps) {
	const [localStartDate, setLocalStartDate] = useState(filters.startDate || "");
	const [localEndDate, setLocalEndDate] = useState(filters.endDate || "");

	const handleSymbolChange = (event: SelectChangeEvent) => {
		const value = event.target.value;
		onFilterChange({ symbol: value || undefined });
	};

	const handleSideChange = (event: SelectChangeEvent) => {
		const value = event.target.value as "buy" | "sell" | "";
		onFilterChange({ side: value || undefined });
	};

	const handleStatusChange = (event: SelectChangeEvent) => {
		const value = event.target.value as "open" | "closed" | "";
		onFilterChange({ status: value || undefined });
	};

	const handleStartDateChange = (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const value = event.target.value;
		setLocalStartDate(value);
		if (value) {
			onFilterChange({ startDate: new Date(value).toISOString() });
		} else {
			onFilterChange({ startDate: undefined });
		}
	};

	const handleEndDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const value = event.target.value;
		setLocalEndDate(value);
		if (value) {
			onFilterChange({ endDate: new Date(value).toISOString() });
		} else {
			onFilterChange({ endDate: undefined });
		}
	};

	const handleViewModeChange = (
		_: React.MouseEvent<HTMLElement>,
		newMode: TradeViewMode | null,
	) => {
		if (newMode) {
			onViewModeChange(newMode);
		}
	};

	const handleReset = () => {
		setLocalStartDate("");
		setLocalEndDate("");
		onResetFilters();
	};

	const hasActiveFilters =
		filters.symbol ||
		filters.side ||
		filters.status ||
		filters.startDate ||
		filters.endDate;

	return (
		<Box
			sx={{
				display: "flex",
				flexWrap: "wrap",
				gap: 2,
				alignItems: "center",
				mb: 3,
			}}
		>
			<FormControl size="small" sx={{ minWidth: 140 }}>
				<InputLabel>Symbol</InputLabel>
				<ZoomAwareSelect
					value={filters.symbol || ""}
					onChange={handleSymbolChange}
					label="Symbol"
				>
					<MenuItem value="">All Symbols</MenuItem>
					{symbols.map((symbol) => (
						<MenuItem key={symbol} value={symbol}>
							{symbol}
						</MenuItem>
					))}
				</ZoomAwareSelect>
			</FormControl>

			<FormControl size="small" sx={{ minWidth: 100 }}>
				<InputLabel>Side</InputLabel>
				<ZoomAwareSelect
					value={filters.side || ""}
					onChange={handleSideChange}
					label="Side"
				>
					<MenuItem value="">All</MenuItem>
					<MenuItem value="buy">Buy</MenuItem>
					<MenuItem value="sell">Sell</MenuItem>
				</ZoomAwareSelect>
			</FormControl>

			<FormControl size="small" sx={{ minWidth: 120 }}>
				<InputLabel>Status</InputLabel>
				<ZoomAwareSelect
					value={filters.status || ""}
					onChange={handleStatusChange}
					label="Status"
				>
					<MenuItem value="">All</MenuItem>
					<MenuItem value="open">Open</MenuItem>
					<MenuItem value="closed">Closed</MenuItem>
				</ZoomAwareSelect>
			</FormControl>

			<TextField
				type="date"
				size="small"
				label="From"
				value={localStartDate}
				onChange={handleStartDateChange}
				slotProps={{ inputLabel: { shrink: true } }}
				sx={{ width: 160 }}
			/>

			<TextField
				type="date"
				size="small"
				label="To"
				value={localEndDate}
				onChange={handleEndDateChange}
				slotProps={{ inputLabel: { shrink: true } }}
				sx={{ width: 160 }}
			/>

			{hasActiveFilters && (
				<Button
					variant="outlined"
					size="small"
					startIcon={<FilterAltOffIcon />}
					onClick={handleReset}
				>
					Clear
				</Button>
			)}

			<Box sx={{ flexGrow: 1 }} />

			<ToggleButtonGroup
				value={viewMode}
				exclusive
				onChange={handleViewModeChange}
				size="small"
			>
				<ToggleButton value="table">
					<TableRowsIcon fontSize="small" sx={{ mr: 0.5 }} />
					Table
				</ToggleButton>
				<ToggleButton value="grouped">
					<ViewListIcon fontSize="small" sx={{ mr: 0.5 }} />
					Grouped
				</ToggleButton>
			</ToggleButtonGroup>
		</Box>
	);
}

export default TradeFilterBar;
