/**
 * Displays saved (configured) notification channels with masked URLs.
 */

import { Box, Button, Chip, Typography } from "@mui/material";
import { motion } from "framer-motion";
import { staggerCascade } from "@/utils/animations/variants";
import { detectServiceType } from "./notificationProviders";

interface SavedChannelsListProps {
	maskedUrls: string[];
	onClearAll: () => void;
	isClearing: boolean;
}

export function SavedChannelsList({
	maskedUrls,
	onClearAll,
	isClearing,
}: SavedChannelsListProps) {
	if (maskedUrls.length === 0) return null;

	return (
		<Box>
			<Typography variant="subtitle2" gutterBottom>
				Configured Channels ({maskedUrls.length})
			</Typography>
			<motion.div
				variants={staggerCascade.container}
				initial="hidden"
				animate="visible"
			>
				<Box
					sx={{
						display: "flex",
						flexDirection: "column",
						gap: 0.75,
					}}
				>
					{maskedUrls.map((maskedUrl, index) => {
						const service = detectServiceType(maskedUrl);
						return (
							<motion.div
								key={`saved-${maskedUrl}-${index.toString()}`}
								variants={staggerCascade.item}
							>
								<Box
									sx={{
										display: "flex",
										alignItems: "center",
										gap: 1,
										p: 1,
										borderRadius: 1,
										border: "1px solid",
										borderColor: "divider",
										bgcolor: "action.hover",
									}}
								>
									{service.icon}
									<Chip
										label={service.label}
										size="small"
										color={service.color}
										variant="outlined"
									/>
									<Typography
										variant="body2"
										sx={{
											flex: 1,
											fontFamily: "monospace",
											fontSize: "0.8rem",
										}}
									>
										{maskedUrl}
									</Typography>
								</Box>
							</motion.div>
						);
					})}
				</Box>
			</motion.div>
			<Button
				size="small"
				color="error"
				onClick={onClearAll}
				disabled={isClearing}
				sx={{ mt: 1 }}
			>
				Clear All
			</Button>
		</Box>
	);
}
