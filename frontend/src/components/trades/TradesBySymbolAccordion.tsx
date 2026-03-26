/**
 * Trades By Symbol Accordion Component
 * Displays trades grouped by symbol in expandable sections
 */

import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { TradesBySymbol } from "@/types";

interface TradesBySymbolAccordionProps {
	data: TradesBySymbol[];
	expandedSymbols: Set<string>;
	onToggleSymbol: (symbol: string) => void;
	onExpandAll: () => void;
	onCollapseAll: () => void;
	isLoading?: boolean;
}

function formatCurrency(value: number): { text: string; color: string } {
	const prefix = value >= 0 ? "+" : "";
	return {
		text: `${prefix}$${Math.abs(value).toLocaleString(undefined, {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		})}`,
		color: value >= 0 ? "text-success" : "text-destructive",
	};
}

function formatPercent(value: number): string {
	const prefix = value >= 0 ? "+" : "";
	return `${prefix}${value.toFixed(2)}%`;
}

function formatPrice(price: number | undefined): string {
	if (price === undefined || price === null) return "-";
	return price.toLocaleString(undefined, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 6,
	});
}

function formatDate(dateStr: string): string {
	const date = new Date(dateStr);
	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}

export function TradesBySymbolAccordion({
	data,
	expandedSymbols,
	onToggleSymbol,
	onExpandAll,
	onCollapseAll,
	isLoading,
}: TradesBySymbolAccordionProps) {
	if (isLoading) {
		return (
			<div className="flex flex-col gap-2">
				{[...Array(3)].map((_, i) => (
					<Skeleton key={i} className="h-[60px] w-full rounded-lg" />
				))}
			</div>
		);
	}

	if (data.length === 0) {
		return (
			<div className="rounded-xl border bg-card p-8 text-center ring-1 ring-foreground/10">
				<span className="text-sm text-muted-foreground">
					No trades found
				</span>
			</div>
		);
	}

	const expandedValues = data
		.filter((g) => expandedSymbols.has(g.symbol))
		.map((g) => g.symbol);

	return (
		<div>
			<div className="mb-2 flex justify-end gap-1">
				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={onExpandAll}
							>
								<ChevronsUpDown className="size-4" />
							</Button>
						}
					/>
					<TooltipContent>Expand all</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								variant="ghost"
								size="icon-sm"
								onClick={onCollapseAll}
							>
								<ChevronsDownUp className="size-4" />
							</Button>
						}
					/>
					<TooltipContent>Collapse all</TooltipContent>
				</Tooltip>
			</div>

			<Accordion value={expandedValues} hiddenUntilFound={false}>
				{data.map((group) => {
					const pnl = formatCurrency(group.totalPnl);

					return (
						<AccordionItem
							key={group.symbol}
							value={group.symbol}
							className="mb-2 rounded-lg border bg-card ring-1 ring-foreground/10"
							onOpenChange={() => onToggleSymbol(group.symbol)}
						>
							<AccordionTrigger className="px-4">
								<div className="flex w-full items-center justify-between pr-2">
									<div className="flex items-center gap-2">
										<span className="text-base font-bold">
											{group.symbol}
										</span>
										<Badge variant="outline">
											{group.tradeCount} trade
											{group.tradeCount !== 1 ? "s" : ""}
										</Badge>
										<Badge
											variant="outline"
											className={
												group.winRate >= 50
													? "border-success/30 text-success"
													: "border-warning/30 text-warning"
											}
										>
											{group.winRate.toFixed(0)}% win
										</Badge>
									</div>
									<div className="text-right">
										<span
											className={cn(
												"text-base font-bold",
												pnl.color,
											)}
										>
											{pnl.text}
										</span>
										<span className="block text-xs text-muted-foreground">
											{formatPercent(
												group.totalPnlPercent,
											)}
										</span>
									</div>
								</div>
							</AccordionTrigger>
							<AccordionContent className="px-4">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Side</TableHead>
											<TableHead className="text-right">
												Entry
											</TableHead>
											<TableHead className="text-right">
												Exit
											</TableHead>
											<TableHead className="text-right">
												Qty
											</TableHead>
											<TableHead className="text-right">
												P&L
											</TableHead>
											<TableHead className="text-right">
												Date
											</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{group.trades.map((trade) => {
											const tradePnl = formatCurrency(
												trade.realizedPnl ?? 0,
											);
											return (
												<TableRow key={trade.id}>
													<TableCell>
														<Badge
															variant={
																trade.side ===
																"buy"
																	? "default"
																	: "destructive"
															}
															className={
																trade.side ===
																"buy"
																	? "bg-success/10 text-success"
																	: ""
															}
														>
															{trade.side.toUpperCase()}
														</Badge>
													</TableCell>
													<TableCell className="text-right">
														{formatPrice(
															trade.entryPrice,
														)}
													</TableCell>
													<TableCell className="text-right">
														{formatPrice(
															trade.exitPrice,
														)}
													</TableCell>
													<TableCell className="text-right">
														{trade.quantity.toFixed(
															4,
														)}
													</TableCell>
													<TableCell className="text-right">
														<span
															className={cn(
																"text-sm",
																tradePnl.color,
															)}
														>
															{tradePnl.text}
														</span>
														{trade.realizedPnlPercent !==
															undefined && (
															<span
																className={cn(
																	"block text-xs",
																	tradePnl.color,
																)}
															>
																{formatPercent(
																	trade.realizedPnlPercent,
																)}
															</span>
														)}
													</TableCell>
													<TableCell className="text-right">
														<span className="text-sm text-muted-foreground">
															{formatDate(
																trade.entryTime,
															)}
														</span>
													</TableCell>
												</TableRow>
											);
										})}
									</TableBody>
								</Table>
							</AccordionContent>
						</AccordionItem>
					);
				})}
			</Accordion>
		</div>
	);
}

export default TradesBySymbolAccordion;
