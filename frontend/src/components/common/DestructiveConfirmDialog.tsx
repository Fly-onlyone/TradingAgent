import {
	Alert,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
} from "@mui/material";
import type { ReactNode } from "react";

interface DestructiveConfirmDialogProps {
	open: boolean;
	title: string;
	message: ReactNode;
	confirmLabel?: string;
	loading?: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}

export function DestructiveConfirmDialog({
	open,
	title,
	message,
	confirmLabel = "Delete All",
	loading = false,
	onConfirm,
	onCancel,
}: DestructiveConfirmDialogProps) {
	return (
		<Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
			<DialogTitle sx={{ fontWeight: 700 }}>{title}</DialogTitle>
			<DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
				<Alert severity="error" variant="outlined">
					{message}
				</Alert>
			</DialogContent>
			<DialogActions sx={{ px: 3, pb: 2 }}>
				<Button onClick={onCancel} disabled={loading}>
					Cancel
				</Button>
				<Button
					variant="contained"
					color="error"
					onClick={onConfirm}
					disabled={loading}
					aria-label={confirmLabel}
				>
					{loading ? "Processing..." : confirmLabel}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
