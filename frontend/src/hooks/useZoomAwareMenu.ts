/**
 * Compensate for app-wide CSS zoom when anchoring MUI menus and popovers.
 */

import type {MenuProps} from "@mui/material";
import type {PopoverPosition} from "@mui/material/Popover";
import {useCallback, useEffect, useRef, useState} from "react";
import {useUIStore} from "@/store/uiStore";

export function useZoomAwareMenu() {
    const [open, setOpen] = useState(false);
    const [anchorPosition, setAnchorPosition] = useState<PopoverPosition | null>(
        null,
    );
    const [menuWidth, setMenuWidth] = useState<number | null>(null);
    const [flipped, setFlipped] = useState(false);
    const anchorRef = useRef<HTMLDivElement | null>(null);
    const uiScale = useUIStore((state) => state.uiScale);

    const updateAnchorPosition = useCallback(() => {
        const container = anchorRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const zoom = uiScale || 1;
        const spaceBelow = window.innerHeight - rect.bottom;
        const shouldFlip = spaceBelow < 160;
        setFlipped(shouldFlip);
        setAnchorPosition({
            top: (shouldFlip ? rect.top : rect.bottom) / zoom,
            left: rect.left / zoom,
        });
        setMenuWidth(rect.width / zoom);
    }, [uiScale]);

    const handleOpen = useCallback(() => {
        updateAnchorPosition();
        setOpen(true);
    }, [updateAnchorPosition]);

    const handleClose = useCallback(() => {
        setOpen(false);
    }, []);

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

    const menuProps: Partial<MenuProps> = {
        anchorReference: "anchorPosition",
        anchorPosition: anchorPosition ?? undefined,
        transformOrigin: {
            vertical: flipped ? "bottom" : "top",
            horizontal: "left",
        },
        marginThreshold: -Infinity,
        slotProps: {
            paper: {
                sx: menuWidth
                    ? {
                        minWidth: menuWidth,
                    }
                    : undefined,
            },
        },
    };

    return {
        anchorRef,
        handleClose,
        handleOpen,
        menuProps,
        open,
        updateAnchorPosition,
    };
}

export default useZoomAwareMenu;
