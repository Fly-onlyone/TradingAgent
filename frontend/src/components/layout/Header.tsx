/**
 * Header Component
 */

import { AppBar, Toolbar, Box, IconButton, Typography, Avatar, Menu, MenuItem, Divider, Badge, Tooltip, InputBase, alpha } from '@mui/material';
import { useState } from 'react';
import SearchIcon from '@mui/icons-material/Search';
import NotificationsIcon from '@mui/icons-material/Notifications';
import LogoutIcon from '@mui/icons-material/Logout';
import SettingsIcon from '@mui/icons-material/Settings';
import { Link } from '@tanstack/react-router';
import { useAuth } from '@/hooks/useAuth';
import { useUIStore } from '@/store/uiStore';

export function Header() {
  const { user, logout } = useAuth();
  const { notifications } = useUIStore();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    handleClose();
    logout();
  };

  const unreadCount = notifications.length;

  return (
    <AppBar
      position="fixed"
      sx={{
        zIndex: (theme) => theme.zIndex.drawer + 1,
      }}
    >
      <Toolbar>
        {/* Search */}
        <Box
          sx={(theme) => ({
            position: 'relative',
            borderRadius: 1,
            bgcolor: alpha(theme.palette.common.white, 0.05),
            '&:hover': {
              bgcolor: alpha(theme.palette.common.white, 0.1),
            },
            ml: 0,
            width: '100%',
            maxWidth: 400,
          })}
        >
          <Box
            sx={{
              padding: (theme) => theme.spacing(0, 2),
              height: '100%',
              position: 'absolute',
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SearchIcon sx={{ color: 'text.secondary' }} />
          </Box>
          <InputBase
            placeholder="Search symbols, orders..."
            sx={{
              color: 'inherit',
              width: '100%',
              '& .MuiInputBase-input': {
                padding: (theme) => theme.spacing(1, 1, 1, 0),
                paddingLeft: (theme) => `calc(1em + ${theme.spacing(4)})`,
              },
            }}
          />
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        {/* Actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* Notifications */}
          <Tooltip title="Notifications">
            <IconButton color="inherit">
              <Badge badgeContent={unreadCount} color="error">
                <NotificationsIcon />
              </Badge>
            </IconButton>
          </Tooltip>

          {/* User Menu */}
          <Tooltip title="Account">
            <IconButton onClick={handleMenu} color="inherit">
              <Avatar
                sx={{
                  width: 32,
                  height: 32,
                  bgcolor: 'primary.main',
                  fontSize: '0.875rem',
                }}
              >
                {user?.email?.[0].toUpperCase() || 'U'}
              </Avatar>
            </IconButton>
          </Tooltip>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleClose}
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'right',
            }}
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
            PaperProps={{
              sx: { minWidth: 200, mt: 1 },
            }}
          >
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="subtitle2">{user?.email}</Typography>
              <Typography variant="caption" color="text.secondary">
                {user?.username || 'Trader'}
              </Typography>
            </Box>
            <Divider />
            <MenuItem component={Link} to="/settings" onClick={handleClose}>
              <SettingsIcon sx={{ mr: 1.5, fontSize: 20 }} />
              Settings
            </MenuItem>
            <MenuItem onClick={handleLogout}>
              <LogoutIcon sx={{ mr: 1.5, fontSize: 20 }} />
              Logout
            </MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  );
}

export default Header;
