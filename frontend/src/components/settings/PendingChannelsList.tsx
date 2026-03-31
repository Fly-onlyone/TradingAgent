/**
 * Displays pending (unsaved) notification channels awaiting save.
 */

import DeleteIcon from "@mui/icons-material/Delete";
import {
	Box,
	Button,
	Chip,
	CircularProgress,
	IconButton,
	Tooltip,
	Typography,
} from "@mui/material";
import { detectServiceType } from "./notificationProviders";

interface PendingChannelsListProps {
	pendingUrls: string[];
	onRemove: (index: number) => void;
	onSave: () => void;
	isSaving: boolean;
}

export function PendingChannelsList({
	pendingUrls,
	onRemove,
	onSave,
	isSaving,
}: PendingChannelsListProps) {
	if (pendingUrls.length === 0) return null;

	return (
		<Box>
			<Typography variant="subtitle2" gutterBottom>
				New Channels (unsaved)
			</Typography>
			<Box
				sx={{
					display: "flex",
					flexDirection: "column",
					gap: 0.5,
				}}
			>
				{pendingUrls.map((url, index) => {
					const service = detectServiceType(url);
					return (
						<Box
							key={`pending-${url}-${index.toString()}`}
							sx={{
								display: "flex",
								alignItems: "center",
								gap: 1,
								p: 1,
								borderRadius: 1,
								border: "1px dashed",
								borderColor: "primary.main",
								bgcolor: "action.selected",
							}}
						>
							{service.icon}
							<Chip
								label={service.label}
								size="small"
								color={service.color}
								variant="filled"
							/>
							<Typography
								variant="body2"
								sx={{
									flex: 1,
									fontFamily: "monospace",
									fontSize: "0.8rem",
									wordBreak: "break-all",
								}}
							>
								{url}
							</Typography>
							<Tooltip title="Remove">
								<IconButton size="small" onClick={() => onRemove(index)}>
									<DeleteIcon fontSize="small" />
								</IconButton>
							</Tooltip>
						</Box>
					);
				})}
			</Box>
			<Button
				size="small"
				variant="contained"
				onClick={onSave}
				disabled={isSaving}
				sx={{ mt: 1 }}
			>
				{isSaving ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
				Save {pendingUrls.length} Channel
				{pendingUrls.length > 1 ? "s" : ""}
			</Button>
		</Box>
	);
}
