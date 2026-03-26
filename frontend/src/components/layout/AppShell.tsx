/**
 * App Shell Layout Component
 */

import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { MeshBlobs } from "@/components/effects/MeshBlobs";
import { ParticleGrid } from "@/components/effects/ParticleGrid";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useThemePreset } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/store/uiStore";
import type { NotificationConfig } from "@/store/uiStore";
import { useReducedMotion } from "@/utils/animations/hooks";
import {
	markNavEnd,
	reportNavDuration,
} from "@/utils/performance/navigationMetrics";
import { BottomNav } from "./BottomNav";
import { Header } from "./Header";
import { Sidebar } from "./Sidebar";

const severityStyles: Record<NotificationConfig["type"], string> = {
	success:
		"bg-[var(--success)] text-white border-[var(--success-dark)]",
	error:
		"bg-[var(--error)] text-white border-[var(--error-dark)]",
	warning:
		"bg-[var(--warning)] text-black border-[var(--warning-dark)]",
	info: "bg-[var(--info)] text-white border-[var(--info-dark)]",
};

const severityIcon: Record<NotificationConfig["type"], React.ReactNode> = {
	success: <CheckCircle className="size-5 shrink-0" />,
	error: <AlertCircle className="size-5 shrink-0" />,
	warning: <AlertTriangle className="size-5 shrink-0" />,
	info: <Info className="size-5 shrink-0" />,
};

interface AppShellProps {
	children: ReactNode;
}

const SIDEBAR_EXPANDED_WIDTH = 220;
const SIDEBAR_COLLAPSED_WIDTH = 56;

export function AppShell({ children }: AppShellProps) {
	const isMobile = useMediaQuery("(max-width: 767px)");
	const { notifications, removeNotification, effectsEnabled, sidebarState } =
		useUIStore();
	const reducedMotion = useReducedMotion();
	const theme = useThemePreset();
	const currentPath = useRouterState({
		select: (state) => state.location.pathname,
	});
	const contentRef = useRef<HTMLDivElement>(null);
	const isAuthPage = currentPath.startsWith("/auth/");
	const isAgentPage = currentPath.startsWith("/agent");

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

	const showLayout = !isAuthPage;

	const showEffects = showLayout && effectsEnabled;

	return (
		<div
			className="flex overflow-hidden"
			style={{ height: "calc(100dvh / var(--ui-zoom, 1))" }}
		>
			{/* Background Effects Layer */}
			{showEffects && (
				<>
					<MeshBlobs />
					<ParticleGrid config={{ color: theme.primaryRgb }} />
				</>
			)}

			{/* Header - only show when authenticated */}
			{showLayout && <Header />}

			{/* Sidebar - only show when authenticated (hidden on mobile) */}
			{showLayout && !isMobile && <Sidebar />}

			{/* Main Content */}
			<main
				className={cn(
					"flex-1 min-h-0 flex flex-col overflow-hidden relative z-[1]",
					"transition-[margin] duration-[225ms] ease-[cubic-bezier(0.4,0,0.6,1)]",
				)}
				style={
					showLayout && !isMobile
						? {
								marginLeft:
									sidebarState === "expanded"
										? SIDEBAR_EXPANDED_WIDTH
										: SIDEBAR_COLLAPSED_WIDTH,
							}
						: undefined
				}
			>
				{/* Toolbar spacer for header */}
				{showLayout && <div className="h-[52px] shrink-0" />}

				{/* Page Content */}
				<div
					ref={contentRef}
					className={cn(
						"flex-1 min-h-0 flex flex-col overflow-x-hidden",
						isAgentPage ? "overflow-y-hidden" : "overflow-y-auto",
						showLayout ? "p-4 sm:p-5 md:p-6" : "p-0",
						showLayout && isMobile && "pb-[72px]",
					)}
				>
					{children}
				</div>
			</main>

			{/* Bottom Navigation - mobile only */}
			{showLayout && <BottomNav />}

			{/* Notifications */}
			<div className="fixed bottom-6 right-6 z-[1400] flex flex-col-reverse gap-3 pointer-events-none">
				<AnimatePresence mode="popLayout">
					{notifications.map((notification) => (
						<motion.div
							key={notification.id}
							initial={
								reducedMotion
									? { opacity: 0 }
									: { opacity: 0, x: 80, scale: 0.85 }
							}
							animate={
								reducedMotion
									? { opacity: 1 }
									: { opacity: 1, x: 0, scale: 1 }
							}
							exit={
								reducedMotion
									? { opacity: 0 }
									: { opacity: 0, x: 80, scale: 0.9 }
							}
							transition={
								reducedMotion
									? { duration: 0 }
									: {
											type: "spring",
											stiffness: 500,
											damping: 35,
										}
							}
							layout={!reducedMotion}
							role="alert"
							aria-live="polite"
							className="pointer-events-auto"
							style={{
								width: 360,
								maxWidth: "calc(100vw - 48px)",
							}}
						>
							<div
								className={cn(
									"relative overflow-hidden rounded-lg border px-4 py-3 flex items-start gap-3",
									severityStyles[notification.type],
								)}
							>
								{severityIcon[notification.type]}
								<div className="flex-1 min-w-0">
									<strong className="block text-sm">
										{notification.title}
									</strong>
									{notification.message && (
										<p className="mt-1 text-sm opacity-90">
											{notification.message}
										</p>
									)}
								</div>
								<div className="flex items-center gap-1 shrink-0">
									{notification.action && (
										<Button
											variant="ghost"
											size="xs"
											className="font-semibold text-xs uppercase tracking-wider text-inherit hover:bg-white/20"
											onClick={() => {
												notification.action?.onClick();
												removeNotification(
													notification.id,
												);
											}}
										>
											{notification.action.label}
										</Button>
									)}
									<Button
										variant="ghost"
										size="icon-xs"
										className="text-inherit hover:bg-white/20"
										onClick={() =>
											removeNotification(notification.id)
										}
									>
										<X className="size-4" />
									</Button>
								</div>
								{/* Countdown bar */}
								{(notification.duration ?? 5000) > 0 && (
									<div className="absolute bottom-0 left-0 right-0 h-0.5 bg-transparent">
										<div
											className="h-full bg-current opacity-30"
											style={{
												animation: `toastCountdown ${notification.duration ?? 5000}ms linear forwards`,
											}}
										/>
									</div>
								)}
							</div>
						</motion.div>
					))}
				</AnimatePresence>
			</div>
		</div>
	);
}

export default AppShell;
