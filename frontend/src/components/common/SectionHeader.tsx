import { Box, type SxProps, type Theme, Typography } from "@mui/material";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { fadeInUp } from "@/utils/animations/variants";

interface SectionHeaderProps {
	title: string;
	subtitle?: string;
	action?: ReactNode;
	sx?: SxProps<Theme>;
}

export function SectionHeader({
	title,
	subtitle,
	action,
	sx,
}: SectionHeaderProps) {
	return (
		<motion.div variants={fadeInUp} initial="hidden" animate="visible">
			<Box
				sx={{
					display: "flex",
					alignItems: "flex-start",
					justifyContent: "space-between",
					mb: 3,
					...sx,
				}}
			>
				<Box>
					<Typography variant="h4" fontWeight={700}>
						{title}
					</Typography>
					{subtitle && (
						<Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
							{subtitle}
						</Typography>
					)}
				</Box>
				{action && <Box sx={{ ml: 2, flexShrink: 0 }}>{action}</Box>}
			</Box>
		</motion.div>
	);
}
