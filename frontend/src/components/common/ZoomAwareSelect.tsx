/**
 * Select wrapper that compensates for the app-wide CSS zoom when positioning menus.
 */

import {
	Box,
	Select,
	type SelectProps,
	type SxProps,
	type Theme,
} from "@mui/material";
import { useCallback } from "react";
import { useZoomAwareMenu } from "@/hooks/useZoomAwareMenu";

type ZoomAwareSelectProps<Value = unknown> = SelectProps<Value>;

function mergeSx(
	...values: Array<SxProps<Theme> | undefined>
): SxProps<Theme> | undefined {
	const merged = values.filter(
		(value): value is SxProps<Theme> => value !== undefined,
	);
	if (merged.length === 0) {
		return undefined;
	}
	return merged.length === 1 ? merged[0] : (merged as SxProps<Theme>);
}

function paperSlotPropsWithoutRef(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}

	const { ref: _ref, ...rest } = value as Record<string, unknown>;
	return rest;
}

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
							...paperSlotPropsWithoutRef(menuProps.slotProps?.paper),
							...paperSlotPropsWithoutRef(MenuProps?.slotProps?.paper),
							sx: mergeSx(
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
							),
						},
					},
				}}
			/>
		</Box>
	);
}

export default ZoomAwareSelect;
