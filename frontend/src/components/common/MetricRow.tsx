import { Box, type SxProps, type Theme, Typography } from "@mui/material";
import type { ReactNode } from "react";

interface MetricRowProps {
	label: string;
	value: ReactNode;
	sx?: SxProps<Theme>;
}

export function MetricRow({ label, value, sx }: MetricRowProps) {
	return (
		<Box
			sx={{
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				py: 1.5,
				px: 0,
				borderBottom: (theme) => `1px solid ${theme.trading.border.subtle}`,
				"&:last-child": { borderBottom: "none" },
				...sx,
			}}
		>
			<Typography variant="body2" color="text.secondary">
				{label}
			</Typography>
			<Box
				sx={{
					color: "text.primary",
					fontSize: (theme) => theme.typography.body2.fontSize,
					fontWeight: 500,
					lineHeight: (theme) => theme.typography.body2.lineHeight,
					textAlign: "right",
				}}
			>
				{value}
			</Box>
		</Box>
	);
}
