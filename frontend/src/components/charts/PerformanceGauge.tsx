/**
 * Performance Gauge Component
 *
 * SVG-based circular gauge replacing MUI CircularProgress.
 */

import { useThemePreset } from "@/lib/theme";

interface PerformanceGaugeProps {
	value: number; // 0-100
	label: string;
	size?: number;
	thickness?: number;
	showValue?: boolean;
	colorScale?: "default" | "inverted";
}

export function PerformanceGauge({
	value,
	label,
	size = 120,
	thickness = 4,
	showValue = true,
	colorScale = "default",
}: PerformanceGaugeProps) {
	const preset = useThemePreset();

	// Clamp value between 0 and 100
	const clampedValue = Math.min(100, Math.max(0, value));

	// Determine color based on value
	const getColor = () => {
		const effectiveValue =
			colorScale === "inverted" ? 100 - clampedValue : clampedValue;

		if (effectiveValue >= 70) return preset.semantics.success.main;
		if (effectiveValue >= 40) return preset.semantics.warning.main;
		return preset.semantics.error.main;
	};

	const radius = (size - thickness) / 2;
	const circumference = 2 * Math.PI * radius;
	const strokeDashoffset =
		circumference - (clampedValue / 100) * circumference;
	const center = size / 2;

	return (
		<div className="relative inline-flex flex-col items-center">
			<div className="relative inline-flex">
				<svg width={size} height={size}>
					<title>Performance gauge</title>
					{/* Background circle */}
					<circle
						cx={center}
						cy={center}
						r={radius}
						fill="none"
						stroke={preset.chart.gridLine}
						strokeWidth={thickness}
					/>
					{/* Value circle */}
					<circle
						cx={center}
						cy={center}
						r={radius}
						fill="none"
						stroke={getColor()}
						strokeWidth={thickness}
						strokeLinecap="round"
						strokeDasharray={circumference}
						strokeDashoffset={strokeDashoffset}
						transform={`rotate(-90 ${center} ${center})`}
						className="transition-[stroke-dashoffset] duration-500 ease-out"
					/>
				</svg>
				{/* Center content */}
				{showValue && (
					<div className="absolute inset-0 flex items-center justify-center">
						<span
							className="text-xl font-bold"
							style={{ fontFamily: "var(--font-mono)" }}
						>
							{clampedValue.toFixed(0)}%
						</span>
					</div>
				)}
			</div>
			<span className="mt-2 text-center text-xs text-muted-foreground">
				{label}
			</span>
		</div>
	);
}

export default PerformanceGauge;
