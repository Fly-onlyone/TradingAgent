/**
 * Select wrapper that compensates for the app-wide CSS zoom when positioning menus.
 */

import { Box, Select, type SelectProps } from "@mui/material";
import { useCallback } from "react";
import { useZoomAwareMenu } from "@/hooks/useZoomAwareMenu";

type ZoomAwareSelectProps<Value = unknown> = SelectProps<Value>;

export function ZoomAwareSelect<Value = unknown>({
	MenuProps,
	onClose,
	onOpen,
	fullWidth = true,
	...props
}: ZoomAwareSelectProps<Value>) {
	const { anchorRef, handleClose, handleOpen, menuProps, open } =
		useZoomAwareMenu();

	const handleOpenWithEvent = useCallback(
		(event: React.SyntheticEvent) => {
			handleOpen();
			onOpen?.(event);
		},
		[handleOpen, onOpen],
	);

	const handleCloseWithEvent = useCallback(
		(event: React.SyntheticEvent) => {
			handleClose();
			onClose?.(event);
		},
		[handleClose, onClose],
	);

	return (
		<Box ref={anchorRef} sx={{ width: "100%" }}>
			<Select
				{...props}
				fullWidth={fullWidth}
				open={open}
				onOpen={handleOpenWithEvent}
				onClose={handleCloseWithEvent}
				MenuProps={{
					...menuProps,
					...MenuProps,
					anchorReference: menuProps.anchorReference,
					anchorPosition: menuProps.anchorPosition,
					transformOrigin: menuProps.transformOrigin,
					slotProps: {
						paper: {
							...menuProps.slotProps?.paper,
							...MenuProps?.slotProps?.paper,
							sx: [
								menuProps.slotProps?.paper &&
								typeof menuProps.slotProps.paper === "object" &&
								"sx" in menuProps.slotProps.paper
									? menuProps.slotProps.paper.sx
									: undefined,
								MenuProps?.slotProps?.paper &&
								typeof MenuProps.slotProps.paper === "object" &&
								"sx" in MenuProps.slotProps.paper
									? MenuProps.slotProps.paper.sx
									: undefined,
							],
						},
					},
				}}
			/>
		</Box>
	);
}

export default ZoomAwareSelect;
