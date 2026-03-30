/**
 * Autocomplete wrapper that keeps the dropdown width and list height stable
 * when the app-wide CSS zoom changes.
 */

import {
	Autocomplete,
	type AutocompleteProps,
	Box,
	Popper,
	type PopperProps,
	type SxProps,
	type Theme,
} from "@mui/material";
import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { useUIStore } from "@/store/uiStore";

type ZoomAwareAutocompleteProps<
	Value,
	Multiple extends boolean | undefined,
	DisableClearable extends boolean | undefined,
	FreeSolo extends boolean | undefined,
> = AutocompleteProps<Value, Multiple, DisableClearable, FreeSolo>;

interface DropdownMetrics {
	maxHeight: number | null;
}

function resolveAnchorEl(anchorEl: PopperProps["anchorEl"]) {
	return typeof anchorEl === "function" ? anchorEl() : anchorEl;
}

const ZoomAwareAutocompletePopper = forwardRef<HTMLDivElement, PopperProps>(
	function ZoomAwareAutocompletePopper(props, ref) {
		const { anchorEl, style, ...rest } = props;
		const uiScale = useUIStore((state) => state.uiScale);
		const resolvedAnchor = resolveAnchorEl(anchorEl);
		const measuredWidth =
			resolvedAnchor && "clientWidth" in resolvedAnchor
				? resolvedAnchor.clientWidth * uiScale
				: style?.width;

		return (
			<Popper
				{...rest}
				anchorEl={anchorEl}
				ref={ref}
				style={{
					...style,
					width: measuredWidth ?? style?.width,
				}}
			/>
		);
	},
);

function mergeStyle(
	base: React.CSSProperties | undefined,
	extra: React.CSSProperties,
) {
	return {
		...(base ?? {}),
		...extra,
	};
}

function mergeSx(
	base: SxProps<Theme> | undefined,
	extra: SxProps<Theme>,
): SxProps<Theme> {
	return base ? ([base, extra] as SxProps<Theme>) : extra;
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
				style: mergeStyle(
					resolved?.style as React.CSSProperties | undefined,
					(extra.style ?? {}) as React.CSSProperties,
				),
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
		style: mergeStyle(
			resolved.style as React.CSSProperties | undefined,
			(extra.style ?? {}) as React.CSSProperties,
		),
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
	const [internalOpen, setInternalOpen] = useState(false);
	const [dropdownMetrics, setDropdownMetrics] = useState<DropdownMetrics>({
		maxHeight: null,
	});
	const open = openProp ?? internalOpen;

	const updateMetrics = useCallback(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}

		const rect = container.getBoundingClientRect();
		const viewportPadding = 24;
		const availableHeight =
			Math.max(rect.top, window.innerHeight - rect.bottom) - viewportPadding;

		setDropdownMetrics({
			maxHeight: Math.max(180, Math.min(420, availableHeight)),
		});
	}, []);

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
				slots={{
					...props.slots,
					popper: ZoomAwareAutocompletePopper,
				}}
				slotProps={{
					...slotProps,
					paper: mergeSlotProp(slotProps?.paper, {
						style: {
							width: "100%",
							maxHeight:
								dropdownMetrics.maxHeight !== null
									? `${dropdownMetrics.maxHeight}px`
									: undefined,
							overflow: "hidden",
						},
						sx: {
							width: "100%",
							maxHeight: dropdownMetrics.maxHeight ?? undefined,
							overflow: "hidden",
						},
					}),
					listbox: mergeSlotProp(slotProps?.listbox, {
						style: {
							maxHeight:
								dropdownMetrics.maxHeight !== null
									? `${dropdownMetrics.maxHeight}px`
									: undefined,
							overflowY: "auto",
						},
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
