/**
 * MUI-styled table components used as markdown table overrides in chat messages.
 */

import type {ComponentPropsWithoutRef} from "react";
import {Table, TableBody, TableCell, TableContainer, TableHead, TableRow,} from "@mui/material";

export function MdTable({children}: ComponentPropsWithoutRef<"table">) {
    return (
        <TableContainer
            sx={{
                my: 1.5,
                borderRadius: 1,
                border: "1px solid",
                borderColor: "divider",
                maxWidth: "100%",
                overflowX: "auto",
            }}
        >
            <Table size="small">{children}</Table>
        </TableContainer>
    );
}

export function MdThead({children}: ComponentPropsWithoutRef<"thead">) {
    return (
        <TableHead
            sx={{
                bgcolor: "action.hover",
            }}
        >
            {children}
        </TableHead>
    );
}

export function MdTbody({children}: ComponentPropsWithoutRef<"tbody">) {
    return <TableBody>{children}</TableBody>;
}

export function MdTr({children}: ComponentPropsWithoutRef<"tr">) {
    return (
        <TableRow
            sx={{
                "&:last-child td, &:last-child th": {border: 0},
            }}
        >
            {children}
        </TableRow>
    );
}

export function MdTh({children}: ComponentPropsWithoutRef<"th">) {
    return (
        <TableCell
            component="th"
            sx={{
                fontWeight: 700,
                fontSize: "0.85rem",
                whiteSpace: "nowrap",
                py: 1,
                px: 1.5,
            }}
        >
            {children}
        </TableCell>
    );
}

export function MdTd({children}: ComponentPropsWithoutRef<"td">) {
    return (
        <TableCell
            sx={(theme) => ({
                fontFamily: theme.trading.mono,
                fontSize: "0.85rem",
                py: 0.75,
                px: 1.5,
            })}
        >
            {children}
        </TableCell>
    );
}
