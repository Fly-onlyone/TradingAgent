/**
 * Sidebar Component
 */

import {
    Box,
    Drawer,
    List,
    ListItem,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Divider,
    Typography,
    IconButton
} from '@mui/material';
import {Link, useLocation} from '@tanstack/react-router';
import DashboardIcon from '@mui/icons-material/Dashboard';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import TimelineIcon from '@mui/icons-material/Timeline';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ScheduleIcon from '@mui/icons-material/Schedule';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import SchoolIcon from '@mui/icons-material/School';
import NewspaperIcon from '@mui/icons-material/Newspaper';
import StorageIcon from '@mui/icons-material/Storage';
import ArticleIcon from '@mui/icons-material/Article';
import SettingsIcon from '@mui/icons-material/Settings';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import {useUIStore} from '@/store/uiStore';
import {useAuthStore} from '@/store/authStore';

const DRAWER_WIDTH = 240;
const COLLAPSED_WIDTH = 64;

// Main navigation items
const menuItems = [
    {path: '/', label: 'Dashboard', icon: DashboardIcon},
    {path: '/trading', label: 'Trading', icon: ShowChartIcon},
    {path: '/orders', label: 'Orders', icon: ReceiptLongIcon},
    {path: '/trades', label: 'Trade History', icon: TimelineIcon},
];

// Agent section items
const agentMenuItems = [
    {path: '/agent', label: 'Agent Chat', icon: SmartToyIcon},
    {path: '/tasks', label: 'Tasks', icon: ScheduleIcon},
];

// Strategy & Learning section
const strategyMenuItems = [
    {path: '/strategies', label: 'Strategies', icon: AccountBalanceIcon},
    {path: '/knowledge', label: 'Knowledge', icon: SchoolIcon},
    {path: '/news', label: 'News', icon: NewspaperIcon},
];

// Admin section (only for superusers)
const adminMenuItems = [
    {path: '/admin/database', label: 'Database', icon: StorageIcon},
    {path: '/admin/logs', label: 'Logs', icon: ArticleIcon},
];

const bottomMenuItems = [
    {path: '/settings', label: 'Settings', icon: SettingsIcon},
];

// Reusable menu section renderer
function MenuSection({
                         items,
                         isExpanded,
                         currentPath
                     }: {
    items: typeof menuItems;
    isExpanded: boolean;
    currentPath: string;
}) {
    return (
        <>
            {items.map((item) => {
                const isActive = currentPath === item.path;
                const Icon = item.icon;

                return (
                    <ListItem key={item.path} disablePadding sx={{display: 'block'}}>
                        <ListItemButton
                            component={Link}
                            to={item.path}
                            sx={{
                                minHeight: 48,
                                justifyContent: isExpanded ? 'initial' : 'center',
                                px: 2.5,
                                bgcolor: isActive ? 'rgba(249, 115, 22, 0.1)' : 'transparent',
                                borderRight: isActive ? '3px solid' : 'none',
                                borderColor: 'primary.main',
                                '&:hover': {
                                    bgcolor: isActive
                                        ? 'rgba(249, 115, 22, 0.15)'
                                        : 'rgba(255, 255, 255, 0.05)',
                                },
                            }}
                        >
                            <ListItemIcon
                                sx={{
                                    minWidth: 0,
                                    mr: isExpanded ? 2 : 'auto',
                                    justifyContent: 'center',
                                    color: isActive ? 'primary.main' : 'text.secondary',
                                }}
                            >
                                <Icon/>
                            </ListItemIcon>
                            {isExpanded && (
                                <ListItemText
                                    primary={item.label}
                                    primaryTypographyProps={{
                                        fontWeight: isActive ? 600 : 400,
                                        color: isActive ? 'primary.main' : 'text.primary',
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
    const isExpanded = sidebarState === 'expanded';
    const isHidden = sidebarState === 'hidden';
    const isSuperuser = user?.isSuperuser ?? false;

    if (isHidden) return null;

    const drawerWidth = isExpanded ? DRAWER_WIDTH : COLLAPSED_WIDTH;

    return (
        <Drawer
            variant="permanent"
            sx={{
                width: drawerWidth,
                flexShrink: 0,
                '& .MuiDrawer-paper': {
                    width: drawerWidth,
                    boxSizing: 'border-box',
                    transition: (theme) =>
                        theme.transitions.create('width', {
                            easing: theme.transitions.easing.sharp,
                            duration: theme.transitions.duration.enteringScreen,
                        }),
                    overflowX: 'hidden',
                },
            }}
        >
            {/* Logo / Brand */}
            <Box
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: isExpanded ? 'space-between' : 'center',
                    px: isExpanded ? 2 : 1,
                    py: 2,
                    minHeight: 64,
                }}
            >
                {isExpanded && (
                    <Typography variant="h6" fontWeight={700} color="primary">
                        TradingBot
                    </Typography>
                )}
                <IconButton onClick={toggleSidebar} size="small">
                    {isExpanded ? <ChevronLeftIcon/> : <ChevronRightIcon/>}
                </IconButton>
            </Box>

            <Divider/>

            {/* Main Menu */}
            <List sx={{py: 1}}>
                <MenuSection items={menuItems} isExpanded={isExpanded} currentPath={location.pathname}/>
            </List>

            <Divider/>

            {/* Agent Section */}
            <List sx={{py: 1}}>
                {isExpanded && (
                    <ListItem sx={{py: 0.5}}>
                        <Typography variant="caption" color="text.secondary" sx={{px: 1}}>
                            AGENT
                        </Typography>
                    </ListItem>
                )}
                <MenuSection items={agentMenuItems} isExpanded={isExpanded} currentPath={location.pathname}/>
            </List>

            <Divider/>

            {/* Strategy & Learning Section */}
            <List sx={{flex: 1, py: 1}}>
                {isExpanded && (
                    <ListItem sx={{py: 0.5}}>
                        <Typography variant="caption" color="text.secondary" sx={{px: 1}}>
                            STRATEGY
                        </Typography>
                    </ListItem>
                )}
                <MenuSection items={strategyMenuItems} isExpanded={isExpanded} currentPath={location.pathname}/>
            </List>

            {/* Admin Section (superusers only) */}
            {(isSuperuser || import.meta.env.DEV) && (
                <>
                    <Divider/>
                    <List sx={{py: 1}}>
                        {isExpanded && (
                            <ListItem sx={{py: 0.5}}>
                                <Typography variant="caption" color="text.secondary" sx={{px: 1}}>
                                    ADMIN
                                </Typography>
                            </ListItem>
                        )}
                        <MenuSection items={adminMenuItems} isExpanded={isExpanded} currentPath={location.pathname}/>
                    </List>
                </>
            )}

            <Divider/>

            {/* Bottom Menu */}
            <List sx={{py: 1}}>
                <MenuSection items={bottomMenuItems} isExpanded={isExpanded} currentPath={location.pathname}/>
            </List>
        </Drawer>
    );
}

export default Sidebar;
