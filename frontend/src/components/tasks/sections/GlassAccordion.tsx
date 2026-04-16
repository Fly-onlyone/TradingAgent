/**
 * Shared glass-styled Accordion for task config sections.
 * Eliminates repeated sx/layout across GeneralSection, ScheduleSection, etc.
 */

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
	Accordion,
	AccordionDetails,
	AccordionSummary,
	Box,
	Typography,
} from "@mui/material";
import type { ReactNode } from "react";

interface GlassAccordionProps {
	icon: ReactNode;
	title: string;
	summary?: string;
	trailing?: ReactNode;
	defaultExpanded?: boolean;
	children: ReactNode;
}

export function GlassAccordion({
	icon,
	title,
	summary,
	trailing,
	defaultExpanded,
	children,
}: GlassAccordionProps) {
	return (
		<Accordion
			defaultExpanded={defaultExpanded}
			disableGutters
			elevation={0}
			sx={{
				background: (t) => t.trading.glass.card.background,
				backdropFilter: (t) => t.trading.glass.card.backdropFilter,
				border: (t) => t.trading.glass.card.border,
				borderRadius: (t) => `${t.trading.glass.card.borderRadius} !important`,
				"&:before": { display: "none" },
			}}
		>
			<AccordionSummary expandIcon={<ExpandMoreIcon />}>
				<Box
					sx={{
						display: "flex",
						alignItems: "center",
						gap: 1.5,
						width: "100%",
					}}
				>
					{icon}
					<Typography variant="h6" sx={{ fontSize: "1rem" }}>
						{title}
					</Typography>
					{summary && (
						<Typography
							variant="body2"
							color="text.secondary"
							sx={{ ml: "auto", mr: 1 }}
							noWrap
						>
							{summary}
						</Typography>
					)}
					{trailing}
				</Box>
			</AccordionSummary>
			<AccordionDetails
				sx={{ display: "flex", flexDirection: "column", gap: 2 }}
			>
				{children}
			</AccordionDetails>
		</Accordion>
	);
}
