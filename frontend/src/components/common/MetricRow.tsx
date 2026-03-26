import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MetricRowProps {
	label: string;
	value: ReactNode;
	className?: string;
}

export function MetricRow({ label, value, className }: MetricRowProps) {
	return (
		<div
			className={cn(
				"flex items-center justify-between py-3 border-b border-[var(--border-subtle)] last:border-b-0",
				className,
			)}
		>
			<span className="text-sm text-[var(--text-secondary)]">{label}</span>
			<span className="text-sm font-medium text-right">{value}</span>
		</div>
	);
}
