/**
 * Theme palette selector -- popover with 2x2 gradient preview cards.
 */

import { Check, Palette } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useThemePreset } from "@/lib/theme";
import { useUIStore } from "@/store/uiStore";
import type { ThemeId } from "@/theme/presets";
import { themeList } from "@/theme/presets";
import { useReducedMotion } from "@/utils/animations/hooks";
import { spring, staggerCascade } from "@/utils/animations/variants";

export function ThemeSelector() {
	const themeId = useUIStore((s) => s.themeId);
	const setThemeId = useUIStore((s) => s.setThemeId);
	const preset = useThemePreset();
	const reducedMotion = useReducedMotion();
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tooltip>
				<TooltipTrigger
					render={
						<PopoverTrigger
							render={
								<Button variant="ghost" size="icon" />
							}
						/>
					}
				>
					<Palette />
				</TooltipTrigger>
				<TooltipContent>Theme</TooltipContent>
			</Tooltip>

			<PopoverContent
				className="w-auto p-3 backdrop-blur-[24px] bg-[var(--glass-card-bg)] border border-[var(--border-subtle)]"
				style={{
					borderRadius: `${preset.glass.borderRadius}px`,
				}}
			>
				<motion.div
					variants={reducedMotion ? undefined : staggerCascade.container}
					initial="hidden"
					animate="visible"
					className="grid grid-cols-2 gap-2"
				>
					{themeList.map((item) => {
						const isActive = item.id === themeId;
						return (
							<motion.div
								key={item.id}
								variants={
									reducedMotion ? undefined : staggerCascade.item
								}
								whileHover={
									reducedMotion ? undefined : { scale: 1.05 }
								}
								whileTap={
									reducedMotion ? undefined : { scale: 0.95 }
								}
								transition={spring.snappy}
								onClick={() => {
									setThemeId(item.id as ThemeId);
									setOpen(false);
								}}
								style={{ cursor: "pointer" }}
							>
								<div
									className="flex w-[110px] flex-col items-center gap-1.5 p-2 transition-[border-color,box-shadow,background] duration-200 ease-out"
									style={{
										borderRadius: `${preset.glass.borderRadius}px`,
										background: isActive
											? `rgba(${item.primaryRgb}, 0.12)`
											: `rgba(${item.primaryRgb}, 0.04)`,
										border: isActive
											? `1.5px solid ${item.primary.main}`
											: "1.5px solid transparent",
										boxShadow: isActive
											? `0 0 16px rgba(${item.primaryRgb}, 0.3), inset 0 0 12px rgba(${item.primaryRgb}, 0.08)`
											: "none",
									}}
									onMouseEnter={(e) => {
										if (!isActive) {
											e.currentTarget.style.background = `rgba(${item.primaryRgb}, 0.1)`;
											e.currentTarget.style.boxShadow = `0 0 12px rgba(${item.primaryRgb}, 0.2)`;
										}
									}}
									onMouseLeave={(e) => {
										if (!isActive) {
											e.currentTarget.style.background = `rgba(${item.primaryRgb}, 0.04)`;
											e.currentTarget.style.boxShadow = "none";
										}
									}}
								>
									{/* Gradient preview bar */}
									<div
										className="relative w-full h-6 overflow-hidden after:absolute after:inset-0 after:bg-gradient-to-br after:from-white/15 after:to-transparent"
										style={{
											borderRadius: `${Math.max(preset.glass.borderRadius - 2, 4)}px`,
											background: `linear-gradient(135deg, ${item.primary.main} 0%, ${item.secondary.main} 50%, ${item.accent.main} 100%)`,
										}}
									>
										{isActive && (
											<div className="absolute inset-0 z-[1] flex items-center justify-center">
												<Check className="size-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
											</div>
										)}
									</div>

									{/* Theme name */}
									<span
										className="text-[0.7rem] tracking-wide transition-colors duration-200"
										style={{
											fontWeight: isActive ? 700 : 500,
											color: isActive
												? item.primary.main
												: "var(--text-secondary)",
										}}
									>
										{item.label}
									</span>
								</div>
							</motion.div>
						);
					})}
				</motion.div>
			</PopoverContent>
		</Popover>
	);
}
