/**
 * Autocomplete wrapper that keeps the dropdown width and list height stable
 * when the app-wide CSS zoom changes.
 */

import {
	Autocomplete,
	type AutocompleteProps,
	Box,
	type SxProps,
	type Theme,
} from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUIStore } from "@/store/uiStore";

type ZoomAwareAutocompleteProps<
	Value,
	Multiple extends boolean | undefined,
	DisableClearable extends boolean | undefined,
	FreeSolo extends boolean | undefined,
> = AutocompleteProps<Value, Multiple, DisableClearable, FreeSolo>;

interface DropdownMetrics {
	width: number | null;
	maxHeight: number | null;
}

function mergeSx(base: SxProps<Theme> | undefined, extra: SxProps<Theme>) {
	return base ? [base, extra] : [extra];
}

function mergeSlotProp(slotProp: unknown, extra: Record<string, unknown>) {
	if (typeof slotProp === "function") {
		return (ownerState: unknown) => {
			const resolved =
				typeof slotProp === "function"
					? (slotProp as (ownerState: unknown) => Record<string, unknown>)(
							ownerState,
						)
					: {};

			return {
				...resolved,
				...extra,
				sx: mergeSx(
					resolved?.sx as SxProps<Theme> | undefined,
					(extra.sx ?? {}) as SxProps<Theme>,
				),
			};
		};
	}

	const resolved =
		slotProp && typeof slotProp === "object"
			? (slotProp as Record<string, unknown>)
			: {};

	return {
		...resolved,
		...extra,
		sx: mergeSx(
			resolved.sx as SxProps<Theme> | undefined,
			(extra.sx ?? {}) as SxProps<Theme>,
		),
	};
}

export function ZoomAwareAutocomplete<
	Value,
	Multiple extends boolean | undefined = false,
	DisableClearable extends boolean | undefined = false,
	FreeSolo extends boolean | undefined = false,
>({
	onClose,
	onOpen,
	open: openProp,
	slotProps,
	...props
}: ZoomAwareAutocompleteProps<Value, Multiple, DisableClearable, FreeSolo>) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const uiScale = useUIStore((state) => state.uiScale);
	const [internalOpen, setInternalOpen] = useState(false);
	const [dropdownMetrics, setDropdownMetrics] = useState<DropdownMetrics>({
		width: null,
		maxHeight: null,
	});
	const open = openProp ?? internalOpen;

	const updateMetrics = useCallback(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}

		const rect = container.getBoundingClientRect();
		const zoom = uiScale || 1;
		const viewportPadding = 24;
		const availableHeight =
			Math.max(rect.top, window.innerHeight - rect.bottom) / zoom -
			viewportPadding;

		setDropdownMetrics({
			width: rect.width / zoom,
			maxHeight: Math.max(180, Math.min(420, availableHeight)),
		});
	}, [uiScale]);

	const handleOpen = useCallback<NonNullable<typeof onOpen>>(
		(event) => {
			setInternalOpen(true);
			updateMetrics();
			onOpen?.(event);
		},
		[onOpen, updateMetrics],
	);

	const handleClose = useCallback<NonNullable<typeof onClose>>(
		(event, reason) => {
			setInternalOpen(false);
			onClose?.(event, reason);
		},
		[onClose],
	);

	useEffect(() => {
		if (!open) {
			return;
		}

		const updateOnNextFrame = () => {
			window.requestAnimationFrame(updateMetrics);
		};

		updateOnNextFrame();
		window.addEventListener("resize", updateOnNextFrame);
		window.addEventListener("scroll", updateOnNextFrame, true);

		const resizeObserver =
			typeof ResizeObserver !== "undefined" && containerRef.current
				? new ResizeObserver(updateOnNextFrame)
				: null;

		if (resizeObserver && containerRef.current) {
			resizeObserver.observe(containerRef.current);
		}

		return () => {
			window.removeEventListener("resize", updateOnNextFrame);
			window.removeEventListener("scroll", updateOnNextFrame, true);
			resizeObserver?.disconnect();
		};
	}, [open, updateMetrics]);

	return (
		<Box ref={containerRef} sx={{ width: "100%" }}>
			<Autocomplete<Value, Multiple, DisableClearable, FreeSolo>
				{...props}
				open={open}
				onOpen={handleOpen}
				onClose={handleClose}
				slotProps={{
					...slotProps,
					popper: mergeSlotProp(slotProps?.popper, {
						sx:
							dropdownMetrics.width !== null
								? {
										width: dropdownMetrics.width,
									}
								: {},
					}),
					paper: mergeSlotProp(slotProps?.paper, {
						sx: {
							width: "100%",
							maxWidth: dropdownMetrics.width ?? undefined,
							overflow: "hidden",
						},
					}),
					listbox: mergeSlotProp(slotProps?.listbox, {
						sx: {
							maxHeight: dropdownMetrics.maxHeight ?? undefined,
							overflowY: "auto",
						},
					}),
				}}
			/>
		</Box>
	);
}

export default ZoomAwareAutocomplete;
