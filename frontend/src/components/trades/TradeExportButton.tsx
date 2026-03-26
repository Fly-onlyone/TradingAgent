/**
 * Trade Export Button Component
 * Provides export functionality for trades data
 */

import { Code, Download, Sheet } from "lucide-react";
import { useState } from "react";
import { tradesApi } from "@/api/endpoints/trades";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ExportFormat } from "@/types";

interface TradeExportButtonProps {
	startDate?: string;
	endDate?: string;
	disabled?: boolean;
}

function downloadBlob(blob: Blob, filename: string) {
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(url);
}

export function TradeExportButton({
	startDate,
	endDate,
	disabled,
}: TradeExportButtonProps) {
	const [isExporting, setIsExporting] = useState(false);

	const handleExport = async (format: ExportFormat) => {
		setIsExporting(true);

		try {
			const blob = await tradesApi.exportTrades(format, {
				startDate,
				endDate,
			});
			const timestamp = new Date().toISOString().split("T")[0];
			const filename = `trades_export_${timestamp}.${format}`;
			downloadBlob(blob, filename);
		} catch (error) {
			console.error("Export failed:", error);
		} finally {
			setIsExporting(false);
		}
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				disabled={disabled || isExporting}
				render={
					<Button variant="outline" disabled={disabled || isExporting}>
						{isExporting ? (
							<span className="mr-1 size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
						) : (
							<Download className="mr-1 size-4" />
						)}
						Export
					</Button>
				}
			/>
			<DropdownMenuContent>
				<DropdownMenuItem onClick={() => handleExport("csv")}>
					<Sheet className="size-4" />
					Export as CSV
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => handleExport("json")}>
					<Code className="size-4" />
					Export as JSON
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export default TradeExportButton;
