/**
 * App Shell Layout Component
 */

import {Alert, Box, Button, LinearProgress, Snackbar, Toolbar, useMediaQuery, useTheme,} from "@mui/material";
import {useRouterState} from "@tanstack/react-router";
import {AnimatePresence, motion} from "framer-motion";
import type {ReactNode} from "react";
import {useEffect, useRef} from "react";
import {MeshBlobs} from "@/components/effects/MeshBlobs";
import {ParticleGrid} from "@/components/effects/ParticleGrid";
import {useUIStore} from "@/store/uiStore";
import {useReducedMotion} from "@/utils/animations/hooks";
import {markNavEnd, reportNavDuration,} from "@/utils/performance/navigationMetrics";
import {BottomNav} from "./BottomNav";
import {Header} from "./Header";
import {Sidebar} from "./Sidebar";

interface AppShellProps {
    children: ReactNode;
}

export function AppShell({children}: AppShellProps) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("md"));
    const {notifications, removeNotification, effectsEnabled} = useUIStore();
    const reducedMotion = useReducedMotion();
    const currentPath = useRouterState({
        select: (state) => state.location.pathname,
    });
    const contentRef = useRef<HTMLDivElement>(null);
    const isAuthPage = currentPath.startsWith("/auth/");

    useEffect(() => {
        const durationMs = markNavEnd(currentPath);
        if (durationMs !== null) {
            reportNavDuration(currentPath, durationMs);
        }
    }, [currentPath]);

    useEffect(() => {
        contentRef.current?.scrollTo(0, 0);
    }, [currentPath]);

    const showLayout = !isAuthPage;

    const showEffects = showLayout && effectsEnabled;

    return (
        <Box sx={{display: "flex", height: "100vh", overflow: "hidden"}}>
            {/* Background Effects Layer */}
            {showEffects && (
                <>
                    <MeshBlobs/>
                    <ParticleGrid config={{color: theme.trading.primaryRgb}}/>
                </>
            )}

            {/* Header - only show when authenticated */}
            {showLayout && <Header/>}

            {/* Sidebar - only show when authenticated (hidden on mobile) */}
            {showLayout && !isMobile && <Sidebar/>}

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
                {showLayout && <Toolbar sx={{minHeight: "52px !important"}}/>}

                {/* Page Content */}
                <Box
                    ref={contentRef}
                    sx={{
                        p: showLayout ? {xs: 2, sm: 2.5, md: 3} : 0,
                        flex: 1,
                        minHeight: 0,
                        overflow: "auto",
                        pb: showLayout && isMobile ? "72px" : undefined,
                    }}
                >
                    {children}
                </Box>
            </Box>

            {/* Bottom Navigation - mobile only */}
            {showLayout && <BottomNav/>}

            {/* Notifications */}
            <AnimatePresence mode="popLayout">
                {notifications.map((notification, index) => (
                    <Snackbar
                        key={notification.id}
                        open
                        anchorOrigin={{vertical: "bottom", horizontal: "right"}}
                        sx={{
                            bottom: `${24 + index * 88}px !important`,
                            transition: "bottom 0.3s ease",
                        }}
                    >
                        <motion.div
                            initial={
                                reducedMotion
                                    ? {opacity: 0}
                                    : {opacity: 0, x: 80, scale: 0.85}
                            }
                            animate={
                                reducedMotion
                                    ? {opacity: 1}
                                    : {opacity: 1, x: 0, scale: 1}
                            }
                            exit={
                                reducedMotion
                                    ? {opacity: 0}
                                    : {opacity: 0, x: 80, scale: 0.9}
                            }
                            transition={
                                reducedMotion
                                    ? {duration: 0}
                                    : {type: "spring", stiffness: 500, damping: 35}
                            }
                            layout={!reducedMotion}
                            role="alert"
                            aria-live="polite"
                            style={{width: 360, maxWidth: "calc(100vw - 48px)"}}
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
                                        <Box
                                            sx={{mt: 0.5, fontSize: "0.875rem", opacity: 0.9}}
                                        >
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
        </Box>
    );
}

export default AppShell;
