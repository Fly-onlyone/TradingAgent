import AutoModeIcon from "@mui/icons-material/AutoMode";
import { Alert, Button, CircularProgress, Typography } from "@mui/material";

interface DuplicateTasksBannerProps {
	taskCount: number;
	onMerge: () => void;
	isPending: boolean;
}

export function DuplicateTasksBanner({
	taskCount,
	onMerge,
	isPending,
}: DuplicateTasksBannerProps) {
	return (
		<Alert
			severity="warning"
			sx={{ mb: 2 }}
			action={
				<Button
					color="inherit"
					size="small"
					startIcon={
						isPending ? (
							<CircularProgress size={14} color="inherit" />
						) : (
							<AutoModeIcon />
						)
					}
					onClick={onMerge}
					disabled={isPending}
				>
					{isPending ? "Merging\u2026" : "Merge with AI"}
				</Button>
			}
		>
			<Typography variant="body2">
				You have <strong>{taskCount}</strong> tasks. Only one task is supported
				{" \u2014 "}click <em>Merge with AI</em> to consolidate them into a
				single task. The merge runs in a chat session you can watch live.
			</Typography>
		</Alert>
	);
}
