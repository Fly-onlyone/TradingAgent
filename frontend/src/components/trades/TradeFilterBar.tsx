/**
 * Trade Filter Bar Component
 * Provides filtering options for trades
 */

import { FilterX, List, Table as TableIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
	const [localStartDate, setLocalStartDate] = useState(
		filters.startDate || "",
	);
	const [localEndDate, setLocalEndDate] = useState(filters.endDate || "");

	const handleSymbolChange = (value: string | null) => {
		onFilterChange({ symbol: value || undefined });
	};

	const handleSideChange = (value: string | null) => {
		onFilterChange({ side: (value as "buy" | "sell") || undefined });
	};

	const handleStatusChange = (value: string | null) => {
		onFilterChange({ status: (value as "open" | "closed") || undefined });
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

	const handleEndDateChange = (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const value = event.target.value;
		setLocalEndDate(value);
		if (value) {
			onFilterChange({ endDate: new Date(value).toISOString() });
		} else {
			onFilterChange({ endDate: undefined });
		}
	};

	const handleViewModeChange = (value: string[]) => {
		const selected = value[0] as TradeViewMode | undefined;
		if (selected) {
			onViewModeChange(selected);
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
		<div className="mb-6 flex flex-wrap items-center gap-3">
			<div className="min-w-[140px]">
				<Select
					value={filters.symbol ?? null}
					onValueChange={handleSymbolChange}
				>
					<SelectTrigger>
						<SelectValue placeholder="All Symbols" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={null as unknown as string}>
							All Symbols
						</SelectItem>
						{symbols.map((symbol) => (
							<SelectItem key={symbol} value={symbol}>
								{symbol}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="min-w-[100px]">
				<Select
					value={filters.side ?? null}
					onValueChange={handleSideChange}
				>
					<SelectTrigger>
						<SelectValue placeholder="All" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={null as unknown as string}>
							All
						</SelectItem>
						<SelectItem value="buy">Buy</SelectItem>
						<SelectItem value="sell">Sell</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<div className="min-w-[120px]">
				<Select
					value={filters.status ?? null}
					onValueChange={handleStatusChange}
				>
					<SelectTrigger>
						<SelectValue placeholder="All" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={null as unknown as string}>
							All
						</SelectItem>
						<SelectItem value="open">Open</SelectItem>
						<SelectItem value="closed">Closed</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<div className="flex w-[160px] flex-col gap-1">
				<Label className="text-xs text-muted-foreground">From</Label>
				<Input
					type="date"
					value={localStartDate}
					onChange={handleStartDateChange}
				/>
			</div>

			<div className="flex w-[160px] flex-col gap-1">
				<Label className="text-xs text-muted-foreground">To</Label>
				<Input
					type="date"
					value={localEndDate}
					onChange={handleEndDateChange}
				/>
			</div>

			{hasActiveFilters && (
				<Button variant="outline" size="sm" onClick={handleReset}>
					<FilterX className="mr-1 size-3.5" />
					Clear
				</Button>
			)}

			<div className="flex-grow" />

			<ToggleGroup
				value={[viewMode]}
				onValueChange={handleViewModeChange}
				variant="outline"
			>
				<ToggleGroupItem value="table" aria-label="Table view">
					<TableIcon className="mr-1 size-3.5" />
					Table
				</ToggleGroupItem>
				<ToggleGroupItem value="grouped" aria-label="Grouped view">
					<List className="mr-1 size-3.5" />
					Grouped
				</ToggleGroupItem>
			</ToggleGroup>
		</div>
	);
}

export default TradeFilterBar;
