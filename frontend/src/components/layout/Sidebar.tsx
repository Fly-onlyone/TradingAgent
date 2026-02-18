/**
 * Sidebar Component
 */

import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import ArticleIcon from "@mui/icons-material/Article";
import BugReportIcon from "@mui/icons-material/BugReport";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import DashboardIcon from "@mui/icons-material/Dashboard";
import NewspaperIcon from "@mui/icons-material/Newspaper";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import ScheduleIcon from "@mui/icons-material/Schedule";
import SchoolIcon from "@mui/icons-material/School";
import SettingsIcon from "@mui/icons-material/Settings";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import StorageIcon from "@mui/icons-material/Storage";
import TimelineIcon from "@mui/icons-material/Timeline";
import {
    Box,
    Divider,
    Drawer,
    IconButton,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Typography,
} from "@mui/material";
import {Link, useLocation} from "@tanstack/react-router";
import {AnimatePresence, LayoutGroup, motion} from "framer-motion";
import {useCallback} from "react";
import {useAuthStore} from "@/store/authStore";
import {useUIStore} from "@/store/uiStore";
import {spring} from "@/utils/animations/variants";
import {markNavStart} from "@/utils/performance/navigationMetrics";

const DRAWER_WIDTH = 240;
const COLLAPSED_WIDTH = 64;

// Main navigation items
const menuItems = [
    {path: "/", label: "Dashboard", icon: DashboardIcon},
    {path: "/trading", label: "Trading", icon: ShowChartIcon},
    {path: "/orders", label: "Orders", icon: ReceiptLongIcon},
    {path: "/trades", label: "Trade History", icon: TimelineIcon},
];

// Agent section items
const agentMenuItems = [
    {path: "/agent", label: "Agent Chat", icon: SmartToyIcon},
    {path: "/tasks", label: "Tasks", icon: ScheduleIcon},
];

// Strategy & Learning section
const strategyMenuItems = [
    {path: "/strategies", label: "Strategies", icon: AccountBalanceIcon},
    {path: "/knowledge", label: "Knowledge", icon: SchoolIcon},
    {path: "/news", label: "News", icon: NewspaperIcon},
];

// Admin section (only for superusers)
const adminMenuItems = [
    {path: "/admin/database", label: "Database", icon: StorageIcon},
    {path: "/admin/logs", label: "Logs", icon: ArticleIcon},
    {path: "/admin/bugs", label: "Bug Tracker", icon: BugReportIcon},
];

const bottomMenuItems = [
    {path: "/settings", label: "Settings", icon: SettingsIcon},
];

// Reusable menu section renderer
function MenuSection({
                         items,
                         isExpanded,
                         currentPath,
                         onNavigate,
                     }: {
    items: typeof menuItems;
    isExpanded: boolean;
    currentPath: string;
    onNavigate: (path: string) => void;
}) {
    return (
        <>
            {items.map((item) => {
                const isActive = currentPath === item.path;
                const Icon = item.icon;

                return (
                    <ListItem key={item.path} disablePadding sx={{display: "block"}}>
                        <ListItemButton
                            component={Link}
                            to={item.path}
                            preload={false}
                            onClick={() => onNavigate(item.path)}
                            sx={{
                                minHeight: 48,
                                justifyContent: isExpanded ? "initial" : "center",
                                px: 2.5,
                                bgcolor: isActive ? "rgba(249, 115, 22, 0.1)" : "transparent",
                                transition:
                                    "transform 0.2s ease-out, background-color 0.2s ease",
                                "&:hover": {
                                    bgcolor: isActive
                                        ? "rgba(249, 115, 22, 0.15)"
                                        : "rgba(255, 255, 255, 0.05)",
                                    transform: "translateX(4px)",
                                },
                            }}
                        >
                            <ListItemIcon
                                sx={{
                                    minWidth: 0,
                                    mr: isExpanded ? 2 : "auto",
                                    justifyContent: "center",
                                    color: isActive ? "primary.main" : "text.secondary",
                                }}
                            >
                                <Icon/>
                            </ListItemIcon>
                            {isActive && (
                                <motion.div
                                    layoutId="sidebar-indicator"
                                    style={{
                                        position: "absolute",
                                        left: 0,
                                        top: "50%",
                                        transform: "translateY(-50%)",
                                        width: 4,
                                        height: 28,
                                        borderRadius: "0 4px 4px 0",
                                        background: "#F97316",
                                        boxShadow: "0 0 12px rgba(249, 115, 22, 0.5)",
                                    }}
                                    transition={spring.snappy}
                                />
                            )}
                            {isExpanded && (
                                <ListItemText
                                    primary={item.label}
                                    slotProps={{
                                        primary: {
                                            fontWeight: isActive ? 600 : 400,
                                            color: isActive ? "primary.main" : "text.primary",
                                        },
                                    }}
                                />
                            )}
                        </ListItemButton>
                    </ListItem>
                );
            })}
        </>
    );
}

export function Sidebar() {
    const location = useLocation();
    const {sidebarState, toggleSidebar} = useUIStore();
    const {user} = useAuthStore();
    const isExpanded = sidebarState === "expanded";
    const isHidden = sidebarState === "hidden";
    const isSuperuser = user?.isSuperuser ?? false;

    const handleNavigate = useCallback(
        (to: string) => {
            if (location.pathname !== to) {
                markNavStart(to);
            }
        },
        [location.pathname],
    );

    if (isHidden) return null;

    const drawerWidth = isExpanded ? DRAWER_WIDTH : COLLAPSED_WIDTH;

    return (
        <Drawer
            variant="permanent"
            sx={{
                width: drawerWidth,
                flexShrink: 0,
                "& .MuiDrawer-paper": {
                    width: drawerWidth,
                    boxSizing: "border-box",
                    transition: (theme) =>
                        theme.transitions.create("width", {
                            easing: theme.transitions.easing.sharp,
                            duration: theme.transitions.duration.enteringScreen,
                        }),
                    overflowX: "hidden",
                },
            }}
        >
            <LayoutGroup>
                {/* Logo / Brand */}
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: isExpanded ? "space-between" : "center",
                        px: isExpanded ? 2 : 1,
                        py: 2,
                        minHeight: 64,
                    }}
                >
                    {isExpanded && (
                        <Typography
                            variant="h6"
                            fontWeight={700}
                            sx={{
                                background: "linear-gradient(135deg, #F97316 0%, #8B5CF6 100%)",
                                backgroundClip: "text",
                                WebkitBackgroundClip: "text",
                                WebkitTextFillColor: "transparent",
                            }}
                        >
                            TradingBot
                        </Typography>
                    )}
                    <IconButton onClick={toggleSidebar} size="small">
                        <motion.div
                            animate={{rotate: isExpanded ? 0 : 180}}
                            transition={spring.snappy}
                            style={{display: "flex"}}
                        >
                            <ChevronLeftIcon/>
                        </motion.div>
                    </IconButton>
                </Box>

                <Divider/>

                {/* Main Menu */}
                <List sx={{py: 1}}>
                    <MenuSection
                        items={menuItems}
                        isExpanded={isExpanded}
                        currentPath={location.pathname}
                        onNavigate={handleNavigate}
                    />
                </List>

                <Divider/>

                {/* Agent Section */}
                <List sx={{py: 1}}>
                    <AnimatePresence>
                        {isExpanded && (
                            <motion.div
                                initial={{opacity: 0, x: -20}}
                                animate={{opacity: 1, x: 0}}
                                exit={{opacity: 0, x: -20}}
                                transition={spring.snappy}
                            >
                                <ListItem sx={{py: 0.5}}>
                                    <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        sx={{px: 1}}
                                    >
                                        AGENT
                                    </Typography>
                                </ListItem>
                            </motion.div>
                        )}
                    </AnimatePresence>
                    <MenuSection
                        items={agentMenuItems}
                        isExpanded={isExpanded}
                        currentPath={location.pathname}
                        onNavigate={handleNavigate}
                    />
                </List>

                <Divider/>

                {/* Strategy & Learning Section */}
                <List sx={{flex: 1, py: 1}}>
                    <AnimatePresence>
                        {isExpanded && (
                            <motion.div
                                initial={{opacity: 0, x: -20}}
                                animate={{opacity: 1, x: 0}}
                                exit={{opacity: 0, x: -20}}
                                transition={spring.snappy}
                            >
                                <ListItem sx={{py: 0.5}}>
                                    <Typography
                                        variant="caption"
                                        color="text.secondary"
                                        sx={{px: 1}}
                                    >
                                        STRATEGY
                                    </Typography>
                                </ListItem>
                            </motion.div>
                        )}
                    </AnimatePresence>
                    <MenuSection
                        items={strategyMenuItems}
                        isExpanded={isExpanded}
                        currentPath={location.pathname}
                        onNavigate={handleNavigate}
                    />
                </List>

                {/* Admin Section (superusers only) */}
                {(isSuperuser || import.meta.env.DEV) && (
                    <>
                        <Divider/>
                        <List sx={{py: 1}}>
                            <AnimatePresence>
                                {isExpanded && (
                                    <motion.div
                                        initial={{opacity: 0, x: -20}}
                                        animate={{opacity: 1, x: 0}}
                                        exit={{opacity: 0, x: -20}}
                                        transition={spring.snappy}
                                    >
                                        <ListItem sx={{py: 0.5}}>
                                            <Typography
                                                variant="caption"
                                                color="text.secondary"
                                                sx={{px: 1}}
                                            >
                                                ADMIN
                                            </Typography>
                                        </ListItem>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            <MenuSection
                                items={adminMenuItems}
                                isExpanded={isExpanded}
                                currentPath={location.pathname}
                                onNavigate={handleNavigate}
                            />
                        </List>
                    </>
                )}

                <Divider/>

                {/* Bottom Menu */}
                <List sx={{py: 1}}>
                    <MenuSection
                        items={bottomMenuItems}
                        isExpanded={isExpanded}
                        currentPath={location.pathname}
                        onNavigate={handleNavigate}
                    />
                </List>
            </LayoutGroup>
        </Drawer>
    );
}

export default Sidebar;
