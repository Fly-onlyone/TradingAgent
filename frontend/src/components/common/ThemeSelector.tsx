/**
 * Theme palette selector — popover with 2x2 gradient preview cards.
 */

import CheckIcon from "@mui/icons-material/Check";
import PaletteOutlinedIcon from "@mui/icons-material/PaletteOutlined";
import {
	Box,
	IconButton,
	Popover,
	Tooltip,
	Typography,
	useTheme,
} from "@mui/material";
import type { PopoverPosition } from "@mui/material/Popover";
import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUIStore } from "@/store/uiStore";
import type { ThemeId } from "@/theme/presets";
import { themeList } from "@/theme/presets";
import { useReducedMotion } from "@/utils/animations/hooks";
import { spring, staggerCascade } from "@/utils/animations/variants";

export function ThemeSelector() {
	const buttonRef = useRef<HTMLButtonElement | null>(null);
	const [anchorPosition, setAnchorPosition] = useState<PopoverPosition | null>(
		null,
	);
	const themeId = useUIStore((s) => s.themeId);
	const uiScale = useUIStore((s) => s.uiScale);
	const setThemeId = useUIStore((s) => s.setThemeId);
	const open = Boolean(anchorPosition);
	const theme = useTheme();
	const reducedMotion = useReducedMotion();

	const updateAnchorPosition = useCallback(() => {
		const button = buttonRef.current;
		if (!button) return;

		const rect = button.getBoundingClientRect();
		const zoom = uiScale || 1;
		setAnchorPosition({
			top: rect.bottom / zoom,
			left: (rect.left + rect.width / 2) / zoom,
		});
	}, [uiScale]);

	useEffect(() => {
		if (!open) return;

		const handleLayoutChange = () => {
			window.requestAnimationFrame(updateAnchorPosition);
		};

		handleLayoutChange();
		window.addEventListener("resize", handleLayoutChange);
		window.addEventListener("scroll", handleLayoutChange, true);

		return () => {
			window.removeEventListener("resize", handleLayoutChange);
			window.removeEventListener("scroll", handleLayoutChange, true);
		};
	}, [open, updateAnchorPosition]);

	return (
		<>
			<Tooltip title="Theme">
				<IconButton
					ref={buttonRef}
					color="inherit"
					onClick={updateAnchorPosition}
				>
					<PaletteOutlinedIcon />
				</IconButton>
			</Tooltip>

			<Popover
				open={open}
				anchorReference="anchorPosition"
				anchorPosition={anchorPosition ?? undefined}
				onClose={() => setAnchorPosition(null)}
				transformOrigin={{ vertical: "top", horizontal: "center" }}
				slotProps={{
					paper: {
						sx: {
							p: 1.5,
							mt: 1,
							background: theme.trading.glass.card.background,
							backdropFilter: "blur(24px)",
							WebkitBackdropFilter: "blur(24px)",
							border: `1px solid ${theme.trading.border.subtle}`,
							borderRadius: theme.trading.glass.card.borderRadius,
							overflow: "visible",
						},
					},
				}}
			>
				<motion.div
					variants={reducedMotion ? undefined : staggerCascade.container}
					initial="hidden"
					animate="visible"
					style={{
						display: "grid",
						gridTemplateColumns: "1fr 1fr",
						gap: 8,
					}}
				>
					{themeList.map((preset) => {
						const isActive = preset.id === themeId;
						return (
							<motion.div
								key={preset.id}
								variants={reducedMotion ? undefined : staggerCascade.item}
								whileHover={reducedMotion ? undefined : { scale: 1.05 }}
								whileTap={reducedMotion ? undefined : { scale: 0.95 }}
								transition={spring.snappy}
								onClick={() => {
									setThemeId(preset.id as ThemeId);
									setAnchorPosition(null);
								}}
								style={{ cursor: "pointer" }}
							>
								<Box
									sx={{
										width: 110,
										p: 1,
										borderRadius: theme.trading.glass.card.borderRadius,
										background: isActive
											? `rgba(${preset.primaryRgb}, 0.12)`
											: `rgba(${preset.primaryRgb}, 0.04)`,
										border: isActive
											? `1.5px solid ${preset.primary.main}`
											: "1.5px solid transparent",
										boxShadow: isActive
											? `0 0 16px rgba(${preset.primaryRgb}, 0.3), inset 0 0 12px rgba(${preset.primaryRgb}, 0.08)`
											: "none",
										transition:
											"border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease",
										"&:hover": {
											background: `rgba(${preset.primaryRgb}, 0.1)`,
											boxShadow: `0 0 12px rgba(${preset.primaryRgb}, 0.2)`,
										},
										display: "flex",
										flexDirection: "column",
										alignItems: "center",
										gap: 0.75,
									}}
								>
									{/* Gradient preview bar */}
									<Box
										sx={{
											width: "100%",
											height: 24,
											borderRadius: theme.trading.glass.card.borderRadius,
											background: `linear-gradient(135deg, ${preset.primary.main} 0%, ${preset.secondary.main} 50%, ${preset.accent.main} 100%)`,
											position: "relative",
											overflow: "hidden",
											"&::after": {
												content: '""',
												position: "absolute",
												inset: 0,
												background:
													"linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 50%)",
											},
										}}
									>
										{isActive && (
											<Box
												sx={{
													position: "absolute",
													inset: 0,
													display: "flex",
													alignItems: "center",
													justifyContent: "center",
													zIndex: 1,
												}}
											>
												<CheckIcon
													sx={{
														fontSize: 16,
														color: "#fff",
														filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))",
													}}
												/>
											</Box>
										)}
									</Box>

									{/* Theme name */}
									<Typography
										variant="caption"
										sx={{
											fontWeight: isActive ? 700 : 500,
											color: isActive ? preset.primary.main : "text.secondary",
											fontSize: "0.7rem",
											letterSpacing: "0.03em",
											transition: "color 0.2s ease",
										}}
									>
										{preset.label}
									</Typography>
								</Box>
							</motion.div>
						);
					})}
				</motion.div>
			</Popover>
		</>
	);
}
