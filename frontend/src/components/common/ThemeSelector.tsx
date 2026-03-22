/**
 * Theme palette selector — popover with colored swatches.
 */

import CheckIcon from "@mui/icons-material/Check";
import PaletteOutlinedIcon from "@mui/icons-material/PaletteOutlined";
import { Box, IconButton, Popover, Tooltip, Typography } from "@mui/material";
import type { PopoverPosition } from "@mui/material/Popover";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUIStore } from "@/store/uiStore";
import type { ThemeId } from "@/theme/presets";
import { themeList } from "@/theme/presets";

export function ThemeSelector() {
	const buttonRef = useRef<HTMLButtonElement | null>(null);
	const [anchorPosition, setAnchorPosition] = useState<PopoverPosition | null>(
		null,
	);
	const themeId = useUIStore((s) => s.themeId);
	const uiScale = useUIStore((s) => s.uiScale);
	const setThemeId = useUIStore((s) => s.setThemeId);
	const open = Boolean(anchorPosition);

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
					paper: { sx: { p: 2, mt: 1 } },
				}}
			>
				<Box
					sx={{
						display: "flex",
						gap: 2,
					}}
				>
					{themeList.map((preset) => {
						const isActive = preset.id === themeId;
						return (
							<Box
								key={preset.id}
								sx={{
									display: "flex",
									flexDirection: "column",
									alignItems: "center",
									gap: 0.5,
									cursor: "pointer",
								}}
								onClick={() => {
									setThemeId(preset.id as ThemeId);
									setAnchorPosition(null);
								}}
							>
								<Box
									sx={{
										width: 36,
										height: 36,
										borderRadius: "50%",
										background: preset.primary.main,
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										border: isActive
											? "2px solid #fff"
											: "2px solid transparent",
										boxShadow: isActive
											? `0 0 12px ${preset.primary.main}`
											: "none",
										transition: "box-shadow 0.2s ease, border-color 0.2s ease",
										"&:hover": {
											boxShadow: `0 0 10px ${preset.primary.main}`,
										},
									}}
								>
									{isActive && (
										<CheckIcon
											sx={{
												fontSize: 18,
												color: preset.primary.contrastText,
											}}
										/>
									)}
								</Box>
								<Typography
									variant="caption"
									sx={{
										color: isActive ? "text.primary" : "text.secondary",
										fontWeight: isActive ? 600 : 400,
										fontSize: "0.65rem",
									}}
								>
									{preset.label}
								</Typography>
							</Box>
						);
					})}
				</Box>
			</Popover>
		</>
	);
}
