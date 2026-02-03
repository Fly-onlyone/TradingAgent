/**
 * App Shell Layout Component
 */

import { Box, Toolbar, Snackbar, Alert } from '@mui/material';
import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useUIStore } from '@/store/uiStore';
import { useAuthStore } from '@/store/authStore';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { isAuthenticated } = useAuthStore();
  const { notifications, removeNotification, sidebarState } = useUIStore();

  // For development: show layout even without auth
  // TODO: Remove this in production
  const showLayout = isAuthenticated || import.meta.env.DEV;

  // Calculate main content margin based on sidebar state
  const sidebarWidth = sidebarState === 'expanded' ? 240 : sidebarState === 'collapsed' ? 64 : 0;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Header - only show when authenticated */}
      {showLayout && <Header />}

      {/* Sidebar - only show when authenticated */}
      {showLayout && <Sidebar />}

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          bgcolor: 'background.default',
          minHeight: '100vh',
          ml: showLayout ? `${sidebarWidth}px` : 0,
          transition: (theme) =>
            theme.transitions.create('margin', {
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
            height: showLayout ? 'calc(100vh - 64px)' : '100vh',
            overflow: 'auto',
          }}
        >
          {children}
        </Box>
      </Box>

      {/* Notifications */}
      {notifications.map((notification, index) => (
        <Snackbar
          key={notification.id}
          open
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          sx={{
            bottom: `${24 + index * 80}px !important`,
          }}
        >
          <Alert
            onClose={() => removeNotification(notification.id)}
            severity={notification.type}
            variant="filled"
            sx={{ width: '100%' }}
          >
            <Box>
              <strong>{notification.title}</strong>
              {notification.message && (
                <Box sx={{ mt: 0.5, fontSize: '0.875rem' }}>
                  {notification.message}
                </Box>
              )}
            </Box>
          </Alert>
        </Snackbar>
      ))}
    </Box>
  );
}

export default AppShell;
