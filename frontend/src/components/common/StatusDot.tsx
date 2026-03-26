import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useThemePreset } from "@/lib/theme";

type StatusType = "online" | "offline" | "away" | "busy" | "loading";

interface StatusDotProps {
	status: StatusType;
	size?: number;
	className?: string;
}

export function StatusDot({ status, size = 8, className }: StatusDotProps) {
	const preset = useThemePreset();
	const colors: Record<StatusType, string> = {
		online: preset.status.online,
		offline: preset.status.offline,
		away: preset.status.away,
		busy: preset.status.busy,
		loading: preset.primary.main,
	};

	const color = colors[status];
	const isAnimated = status === "online" || status === "loading";

	return (
		<div
			className={cn("relative shrink-0", className)}
			style={{ width: size, height: size }}
		>
			{isAnimated && (
				<motion.div
					animate={{
						scale: [1, 1.8, 1],
						opacity: [0.6, 0, 0.6],
					}}
					transition={{
						duration: 2,
						repeat: Infinity,
						ease: "easeInOut",
					}}
					style={{
						position: "absolute",
						inset: 0,
						borderRadius: "50%",
						backgroundColor: color,
					}}
				/>
			)}
			<div
				className="absolute inset-0 rounded-full"
				style={{ backgroundColor: color }}
			/>
		</div>
	);
}
