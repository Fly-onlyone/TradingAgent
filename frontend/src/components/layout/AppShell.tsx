/**
 * App Shell Layout Component
 */

import { Alert, Box, Snackbar, Toolbar } from "@mui/material";
import { useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { CursorGlow } from "@/components/effects/CursorGlow";
import { MeshBlobs } from "@/components/effects/MeshBlobs";
import { ParticleGrid } from "@/components/effects/ParticleGrid";
import { useUIStore } from "@/store/uiStore";
import {
	markNavEnd,
	reportNavDuration,
} from "@/utils/performance/navigationMetrics";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

interface AppShellProps {
	children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
	const { notifications, removeNotification, effectsEnabled } = useUIStore();
	const currentPath = useRouterState({
		select: (state) => state.location.pathname,
	});
	const isAuthPage = currentPath.startsWith("/auth/");

	useEffect(() => {
		const durationMs = markNavEnd(currentPath);
		if (durationMs !== null) {
			reportNavDuration(currentPath, durationMs);
		}
	}, [currentPath]);

	const showLayout = !isAuthPage;

	const showEffects = showLayout && effectsEnabled;

	return (
		<Box sx={{ display: "flex", minHeight: "100vh" }}>
			{/* Background Effects Layer */}
			{showEffects && (
				<>
					<MeshBlobs />
					<ParticleGrid />
					<CursorGlow />
				</>
			)}

			{/* Header - only show when authenticated */}
			{showLayout && <Header />}

			{/* Sidebar - only show when authenticated */}
			{showLayout && <Sidebar />}

			{/* Main Content */}
			<Box
				component="main"
				sx={{
					flexGrow: 1,
					minHeight: "100vh",
					position: "relative",
					zIndex: 1,
					transition: (theme) =>
						theme.transitions.create("width", {
							easing: theme.transitions.easing.sharp,
							duration: theme.transitions.duration.enteringScreen,
						}),
				}}
			>
				{/* Toolbar spacer for header */}
				{showLayout && <Toolbar />}

				{/* Page Content */}
				<Box
					sx={{
						p: showLayout ? 3 : 0,
						height: showLayout ? "calc(100vh - 48px)" : "100vh",
						overflow: "auto",
					}}
				>
					{children}
				</Box>
			</Box>

			{/* Notifications */}
			<AnimatePresence>
				{notifications.map((notification, index) => (
					<Snackbar
						key={notification.id}
						open
						anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
						sx={{
							bottom: `${24 + index * 80}px !important`,
						}}
					>
						<motion.div
							initial={{ opacity: 0, x: 60 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: 60 }}
							transition={{ type: "spring", stiffness: 400, damping: 30 }}
						>
							<Alert
								onClose={() => removeNotification(notification.id)}
								severity={notification.type}
								variant="filled"
								sx={{ width: "100%" }}
							>
								<Box>
									<strong>{notification.title}</strong>
									{notification.message && (
										<Box sx={{ mt: 0.5, fontSize: "0.875rem" }}>
											{notification.message}
										</Box>
									)}
								</Box>
							</Alert>
						</motion.div>
					</Snackbar>
				))}
			</AnimatePresence>
		</Box>
	);
}

export default AppShell;
