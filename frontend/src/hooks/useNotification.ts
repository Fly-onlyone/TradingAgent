/**
 * Notification Hook
 */

import { useCallback } from 'react';
import { useUIStore, notify } from '@/store/uiStore';

export function useNotification() {
  const { notifications, addNotification, removeNotification, clearNotifications } = useUIStore();

  const success = useCallback(
    (title: string, message?: string) => {
      return addNotification({ type: 'success', title, message });
    },
    [addNotification]
  );

  const error = useCallback(
    (title: string, message?: string) => {
      return addNotification({ type: 'error', title, message, duration: 8000 });
    },
    [addNotification]
  );

  const warning = useCallback(
    (title: string, message?: string) => {
      return addNotification({ type: 'warning', title, message });
    },
    [addNotification]
  );

  const info = useCallback(
    (title: string, message?: string) => {
      return addNotification({ type: 'info', title, message });
    },
    [addNotification]
  );

  const custom = useCallback(
    (config: {
      type: 'success' | 'error' | 'warning' | 'info';
      title: string;
      message?: string;
      duration?: number;
      action?: { label: string; onClick: () => void };
    }) => {
      return addNotification(config);
    },
    [addNotification]
  );

  return {
    notifications,
    success,
    error,
    warning,
    info,
    custom,
    remove: removeNotification,
    clear: clearNotifications,
  };
}

// Re-export the global notify helper
export { notify };

export default useNotification;
