import { AlertCircle, ChevronDown, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
	title?: string;
	message?: string;
	detail?: string;
	onRetry?: () => void;
}

export function ErrorState({
	title = "Something went wrong",
	message = "An unexpected error occurred. Please try again.",
	detail,
	onRetry,
}: ErrorStateProps) {
	const [showDetail, setShowDetail] = useState(false);

	return (
		<div className="flex flex-col items-center justify-center py-12 px-6 text-center">
			<AlertCircle className="mb-4 size-12 text-[var(--error-main)] opacity-80" />
			<h6 className="mb-2 text-lg font-semibold">{title}</h6>
			<p className="mb-6 max-w-[400px] text-sm text-[var(--text-secondary)]">
				{message}
			</p>
			{onRetry && (
				<Button variant="outline" onClick={onRetry} className="mb-4">
					<RefreshCw data-icon="inline-start" />
					Try again
				</Button>
			)}
			{detail && (
				<Collapsible
					open={showDetail}
					onOpenChange={setShowDetail}
					className="mt-2"
				>
					<CollapsibleTrigger
						className="inline-flex items-center justify-center rounded-md p-1 hover:bg-muted"
						aria-label={
							showDetail ? "Hide error details" : "Show error details"
						}
					>
						<ChevronDown
							className={cn(
								"size-5 transition-transform duration-200",
								showDetail && "rotate-180",
							)}
						/>
					</CollapsibleTrigger>
					<CollapsibleContent>
						<pre className="mt-2 rounded-md bg-[rgba(var(--primary-rgb),0.05)] border border-[var(--border-subtle)] p-4 max-w-[500px] overflow-auto text-left font-mono text-xs whitespace-pre-wrap break-words">
							{detail}
						</pre>
					</CollapsibleContent>
				</Collapsible>
			)}
		</div>
	);
}
