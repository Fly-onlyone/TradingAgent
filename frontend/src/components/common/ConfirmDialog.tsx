import {
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogContentText,
	DialogTitle,
} from "@mui/material";

interface ConfirmDialogProps {
	open: boolean;
	title: string;
	message: string;
	confirmLabel?: string;
	cancelLabel?: string;
	destructive?: boolean;
	loading?: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}

export function ConfirmDialog({
	open,
	title,
	message,
	confirmLabel = "Confirm",
	cancelLabel = "Cancel",
	destructive = false,
	loading = false,
	onConfirm,
	onCancel,
}: ConfirmDialogProps) {
	return (
		<Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
			<DialogTitle>{title}</DialogTitle>
			<DialogContent>
				<DialogContentText>{message}</DialogContentText>
			</DialogContent>
			<DialogActions sx={{ px: 3, pb: 2 }}>
				<Button onClick={onCancel} disabled={loading}>
					{cancelLabel}
				</Button>
				<Button
					variant="contained"
					color={destructive ? "error" : "primary"}
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
