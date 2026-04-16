/**
 * Shared glass-styled container for task config sections.
 * Renders as accordion (collapsible header) or panel (no chrome — header is
 * owned by the enclosing tab strip). Resolved from TaskConfigContext.
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
import { useTaskSectionLayout } from "@/components/tasks/TaskConfigContext";

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
	const layout = useTaskSectionLayout();

	if (layout === "panel") {
		return (
			<Box
				sx={{
					background: (t) => t.trading.glass.card.background,
					backdropFilter: (t) => t.trading.glass.card.backdropFilter,
					border: (t) => t.trading.glass.card.border,
					borderRadius: (t) => t.trading.glass.card.borderRadius,
					px: 3,
					py: 2.5,
					display: "flex",
					flexDirection: "column",
					gap: 2,
				}}
			>
				{children}
			</Box>
		);
	}

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
