import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import RefreshIcon from "@mui/icons-material/Refresh";
import {
	Box,
	Button,
	Collapse,
	IconButton,
	Typography,
	useTheme,
} from "@mui/material";
import { useState } from "react";

interface ErrorStateProps {
	title?: string;
	message?: string;
	detail?: string;
	onRetry?: () => void;
}

export function ErrorState({
	title = "Something went wrong",
	message = "An unexpected error occurred. Please try again.",
	detail,
	onRetry,
}: ErrorStateProps) {
	const theme = useTheme();
	const [showDetail, setShowDetail] = useState(false);

	return (
		<Box
			sx={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				py: 6,
				px: 3,
				textAlign: "center",
			}}
		>
			<ErrorOutlineIcon
				sx={{
					fontSize: 48,
					color: theme.palette.error.main,
					mb: 2,
					opacity: 0.8,
				}}
			/>
			<Typography variant="h6" sx={{ mb: 1 }}>
				{title}
			</Typography>
			<Typography
				variant="body2"
				color="text.secondary"
				sx={{ mb: 3, maxWidth: 400 }}
			>
				{message}
			</Typography>
			{onRetry && (
				<Button
					variant="outlined"
					startIcon={<RefreshIcon />}
					onClick={onRetry}
					sx={{ mb: 2 }}
				>
					Try again
				</Button>
			)}
			{detail && (
				<Box sx={{ mt: 1 }}>
					<IconButton
						size="small"
						onClick={() => setShowDetail(!showDetail)}
						aria-label={
							showDetail ? "Hide error details" : "Show error details"
						}
					>
						<ExpandMoreIcon
							sx={{
								transform: showDetail ? "rotate(180deg)" : "rotate(0deg)",
								transition: "transform 0.2s",
							}}
						/>
					</IconButton>
					<Collapse in={showDetail}>
						<Typography
							variant="caption"
							component="pre"
							sx={{
								mt: 1,
								p: 2,
								borderRadius: 1,
								backgroundColor: `rgba(${theme.trading.primaryRgb}, 0.05)`,
								border: `1px solid ${theme.trading.border.subtle}`,
								maxWidth: 500,
								overflow: "auto",
								textAlign: "left",
								fontFamily: theme.trading.mono,
								whiteSpace: "pre-wrap",
								wordBreak: "break-word",
							}}
						>
							{detail}
						</Typography>
					</Collapse>
				</Box>
			)}
		</Box>
	);
}
