/**
 * App Shell Layout Component
 */

import { Box, Toolbar, useMediaQuery, useTheme } from "@mui/material";
import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useAgentSocketConnection } from "@/api/websocket/useAgentSocket";
import { useUIStore } from "@/store/uiStore";
import { useMotionTier, useReducedMotion } from "@/utils/animations/hooks";

const MeshBlobs = lazy(() =>
	import("@/components/effects/MeshBlobs").then((m) => ({
		default: m.MeshBlobs,
	})),
);
const ParticleGrid = lazy(() =>
	import("@/components/effects/ParticleGrid").then((m) => ({
		default: m.ParticleGrid,
	})),
);
const NotificationStack = lazy(() =>
	import("./NotificationStack").then((m) => ({
		default: m.NotificationStack,
	})),
);

import {
	markNavEnd,
	reportNavDuration,
} from "@/utils/performance/navigationMetrics";
import { BottomNav } from "./BottomNav";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

interface AppShellProps {
	children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
	useAgentSocketConnection();
	const theme = useTheme();
	const isMobile = useMediaQuery(theme.breakpoints.down("md"));
	const { notifications, removeNotification, effectsEnabled } = useUIStore();
	const reducedMotion = useReducedMotion();
	const currentPath = useRouterState({
		select: (state) => state.location.pathname,
	});
	const contentRef = useRef<HTMLDivElement>(null);
	const [showParticleGrid, setShowParticleGrid] = useState(false);
	const [showDelayedMeshBlobs, setShowDelayedMeshBlobs] = useState(false);
	const isAuthPage = currentPath.startsWith("/auth/");
	const isAgentPage = currentPath.startsWith("/agent");
	const isHeavyRoute =
		currentPath === "/" ||
		currentPath === "/agent" ||
		currentPath === "/trading" ||
		currentPath === "/orders" ||
		currentPath === "/news";
	const motionTier = useMotionTier({ heavyRoute: isHeavyRoute });
	const showLayout = !isAuthPage;

	useEffect(() => {
		const durationMs = markNavEnd(currentPath);
		if (durationMs !== null) {
			reportNavDuration(currentPath, durationMs);
		}
	}, [currentPath]);

	useEffect(() => {
		void currentPath;
		contentRef.current?.scrollTo(0, 0);
	}, [currentPath]);

	useEffect(() => {
		if (isMobile || !effectsEnabled || motionTier !== "full") {
			setShowParticleGrid(false);
			return;
		}

		const frameId = window.requestAnimationFrame(() => {
			setShowParticleGrid(true);
		});

		return () => {
			window.cancelAnimationFrame(frameId);
		};
	}, [effectsEnabled, isMobile, motionTier]);

	useEffect(() => {
		if (
			isMobile ||
			!showLayout ||
			!effectsEnabled ||
			!isHeavyRoute ||
			motionTier !== "reduced"
		) {
			setShowDelayedMeshBlobs(false);
			return;
		}

		setShowDelayedMeshBlobs(false);
		const timeoutId = window.setTimeout(() => {
			setShowDelayedMeshBlobs(true);
		}, 1200);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [effectsEnabled, isHeavyRoute, isMobile, motionTier, showLayout]);

	const showFullEffects = showLayout && effectsEnabled && motionTier === "full";
	const showHeavyRouteEffects =
		showLayout &&
		effectsEnabled &&
		isHeavyRoute &&
		motionTier === "reduced" &&
		showDelayedMeshBlobs;

	return (
		<Box
			sx={{
				display: "flex",
				height: "calc(100dvh / var(--ui-zoom, 1))",
				overflow: "hidden",
			}}
		>
			{/* Background Effects Layer */}
			<Suspense fallback={null}>
				{showFullEffects && (
					<>
						<MeshBlobs />
						{showParticleGrid && (
							<ParticleGrid config={{ color: theme.trading.primaryRgb }} />
						)}
					</>
				)}
				{showHeavyRouteEffects && <MeshBlobs />}
			</Suspense>

			{/* Header - only show when authenticated */}
			{showLayout && <Header />}

			{/* Sidebar - only show when authenticated (hidden on mobile) */}
			{showLayout && !isMobile && <Sidebar />}

			{/* Main Content */}
			<Box
				component="main"
				sx={{
					flexGrow: 1,
					minHeight: 0,
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
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
				{showLayout && <Toolbar sx={{ minHeight: "52px !important" }} />}

				{/* Page Content */}
				<Box
					ref={contentRef}
					sx={{
						p: showLayout ? { xs: 2, sm: 2.5, md: 3 } : 0,
						flex: 1,
						minHeight: 0,
						display: "flex",
						flexDirection: "column",
						overflowX: "hidden",
						overflowY: isAgentPage ? "hidden" : "auto",
						pb: showLayout && isMobile ? "72px" : undefined,
					}}
				>
					{children}
				</Box>
			</Box>

			{/* Bottom Navigation - mobile only */}
			{showLayout && <BottomNav />}

			{/* Notifications */}
			{notifications.length > 0 && (
				<Suspense fallback={null}>
					<NotificationStack
						notifications={notifications}
						removeNotification={removeNotification}
						reducedMotion={reducedMotion}
					/>
				</Suspense>
			)}
		</Box>
	);
}

export default AppShell;
