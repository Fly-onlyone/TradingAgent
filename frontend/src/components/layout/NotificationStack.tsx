import {
	Alert,
	Box,
	Button,
	LinearProgress,
	Snackbar,
} from "@mui/material";
import { AnimatePresence, motion } from "framer-motion";
import type { NotificationConfig } from "@/store/uiStore";

interface NotificationStackProps {
	notifications: NotificationConfig[];
	removeNotification: (id: string) => void;
	reducedMotion: boolean;
}

export function NotificationStack({
	notifications,
	removeNotification,
	reducedMotion,
}: NotificationStackProps) {
	return (
		<AnimatePresence mode="popLayout">
			{notifications.map((notification, index) => (
				<Snackbar
					key={notification.id}
					open
					anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
					sx={{
						bottom: `${24 + index * 88}px !important`,
						transition: "bottom 0.3s ease",
					}}
				>
					<motion.div
						initial={
							reducedMotion
								? { opacity: 0 }
								: { opacity: 0, x: 80, scale: 0.85 }
						}
						animate={
							reducedMotion ? { opacity: 1 } : { opacity: 1, x: 0, scale: 1 }
						}
						exit={
							reducedMotion
								? { opacity: 0 }
								: { opacity: 0, x: 80, scale: 0.9 }
						}
						transition={
							reducedMotion
								? { duration: 0 }
								: { type: "spring", stiffness: 500, damping: 35 }
						}
						layout={!reducedMotion}
						role="alert"
						aria-live="polite"
						style={{ width: 360, maxWidth: "calc(100vw - 48px)" }}
					>
						<Alert
							onClose={() => removeNotification(notification.id)}
							severity={notification.type}
							variant="filled"
							action={
								notification.action ? (
									<Button
										color="inherit"
										size="small"
										onClick={() => {
											notification.action?.onClick();
											removeNotification(notification.id);
										}}
										sx={{
											fontWeight: 600,
											fontSize: "0.75rem",
											textTransform: "uppercase",
											letterSpacing: "0.05em",
											minWidth: "auto",
											px: 1,
										}}
									>
										{notification.action.label}
									</Button>
								) : undefined
							}
							sx={{
								width: "100%",
								position: "relative",
								overflow: "hidden",
							}}
						>
							<Box>
								<strong>{notification.title}</strong>
								{notification.message && (
									<Box sx={{ mt: 0.5, fontSize: "0.875rem", opacity: 0.9 }}>
										{notification.message}
									</Box>
								)}
							</Box>
							{(notification.duration ?? 5000) > 0 && (
								<LinearProgress
									variant="determinate"
									value={100}
									sx={{
										position: "absolute",
										bottom: 0,
										left: 0,
										right: 0,
										height: 2,
										backgroundColor: "transparent",
										"& .MuiLinearProgress-bar": {
											backgroundColor: "currentColor",
											opacity: 0.3,
											animation: `toastCountdown ${notification.duration ?? 5000}ms linear forwards`,
										},
									}}
								/>
							)}
						</Alert>
					</motion.div>
				</Snackbar>
			))}
		</AnimatePresence>
	);
}
