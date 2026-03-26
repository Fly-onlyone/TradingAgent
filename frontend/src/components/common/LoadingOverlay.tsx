import { Loader2 } from "lucide-react";

interface LoadingOverlayProps {
	message?: string;
}

export function LoadingOverlay({ message }: LoadingOverlayProps) {
	return (
		<div className="flex flex-col items-center justify-center py-12 gap-4">
			<Loader2 className="size-9 animate-spin text-[var(--primary)]" />
			{message && (
				<p className="text-sm text-[var(--text-secondary)]">{message}</p>
			)}
		</div>
	);
}
