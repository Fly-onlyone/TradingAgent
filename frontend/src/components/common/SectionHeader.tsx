import { motion } from "framer-motion";
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { fadeInUp } from "@/utils/animations/variants";

interface SectionHeaderProps {
	title: string;
	subtitle?: string;
	action?: ReactNode;
	className?: string;
}

export function SectionHeader({
	title,
	subtitle,
	action,
	className,
}: SectionHeaderProps) {
	return (
		<motion.div variants={fadeInUp} initial="hidden" animate="visible">
			<div
				className={cn(
					"flex items-start justify-between mb-6",
					className,
				)}
			>
				<div>
					<h4 className="text-2xl font-bold">{title}</h4>
					{subtitle && (
						<p className="mt-1 text-sm text-[var(--text-secondary)]">
							{subtitle}
						</p>
					)}
				</div>
				{action && <div className="ml-4 shrink-0">{action}</div>}
			</div>
		</motion.div>
	);
}
