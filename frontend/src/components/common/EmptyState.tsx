/**
 * Empty State Component
 */

import { Inbox } from "lucide-react";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/utils/animations/hooks";

interface EmptyStateProps {
	icon?: ReactNode;
	title: string;
	description?: string;
	action?: {
		label: string;
		onClick: () => void;
	};
	className?: string;
}

export function EmptyState({
	icon,
	title,
	description,
	action,
	className,
}: EmptyStateProps) {
	const reducedMotion = useReducedMotion();

	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center py-16 px-6 text-center",
				className,
			)}
		>
			<motion.div
				animate={reducedMotion ? undefined : { y: [0, -8, 0] }}
				transition={
					reducedMotion
						? undefined
						: { duration: 3, repeat: Infinity, ease: "easeInOut" }
				}
			>
				<div className="mb-4 text-[var(--text-disabled)] [&>svg]:size-16">
					{icon || <Inbox />}
				</div>
			</motion.div>
			<h6 className="mb-2 text-lg font-semibold">{title}</h6>
			{description && (
				<p className="mb-6 max-w-[300px] text-sm text-[var(--text-secondary)]">
					{description}
				</p>
			)}
			{action && <Button onClick={action.onClick}>{action.label}</Button>}
		</div>
	);
}

export default EmptyState;
