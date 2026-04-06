import {
	Alert,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	TextField,
} from "@mui/material";
import { type ReactNode, useState } from "react";

interface DestructiveConfirmDialogProps {
	open: boolean;
	title: string;
	message: ReactNode;
	confirmPhrase?: string;
	confirmLabel?: string;
	loading?: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}

export function DestructiveConfirmDialog({
	open,
	title,
	message,
	confirmPhrase = "DELETE",
	confirmLabel = "Delete All",
	loading = false,
	onConfirm,
	onCancel,
}: DestructiveConfirmDialogProps) {
	const [typed, setTyped] = useState("");

	const isMatch = typed === confirmPhrase;

	const handleClose = () => {
		setTyped("");
		onCancel();
	};

	const handleConfirm = () => {
		if (isMatch) {
			setTyped("");
			onConfirm();
		}
	};

	return (
		<Dialog
			open={open}
			onClose={handleClose}
			maxWidth="xs"
			fullWidth
			TransitionProps={{ onExited: () => setTyped("") }}
		>
			<DialogTitle sx={{ fontWeight: 700 }}>{title}</DialogTitle>
			<DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
				<Alert severity="error" variant="outlined">
					{message}
				</Alert>
				<TextField
					label={`Type "${confirmPhrase}" to confirm`}
					value={typed}
					onChange={(e) => setTyped(e.target.value)}
					fullWidth
					size="small"
					autoComplete="off"
					slotProps={{
						htmlInput: { autoComplete: "off", spellCheck: false },
					}}
				/>
			</DialogContent>
			<DialogActions sx={{ px: 3, pb: 2 }}>
				<Button onClick={handleClose} disabled={loading}>
					Cancel
				</Button>
				<Button
					variant="contained"
					color="error"
					onClick={handleConfirm}
					disabled={!isMatch || loading}
					aria-label={confirmLabel}
				>
					{loading ? "Processing..." : confirmLabel}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
