/**
 * Authentication Hook
 */

import { useCallback, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/api/endpoints/auth';
import { notify } from '@/store/uiStore';
import type { UserLogin, UserCreate } from '@/types';

export function useAuth() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading, login, logout, setLoading, setUser } = useAuthStore();

  // Check auth status on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const userData = await authApi.getMe();
        setUser(userData);
      } catch {
        // Not authenticated
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    if (isLoading) {
      checkAuth();
    }
  }, [isLoading, setUser, setLoading]);

  const handleLogin = useCallback(
    async (credentials: UserLogin) => {
      try {
        setLoading(true);
        const tokens = await authApi.login(credentials);
        const userData = await authApi.getMe();
        login(userData, tokens.access_token);
        notify.success('Welcome back!', `Logged in as ${userData.email}`);
        navigate({ to: '/' });
      } catch (error) {
        notify.error('Login failed', (error as Error).message);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [login, navigate, setLoading]
  );

  const handleRegister = useCallback(
    async (data: UserCreate) => {
      try {
        setLoading(true);
        await authApi.register(data);
        notify.success('Account created', 'Please log in with your credentials');
        navigate({ to: '/auth/login' });
      } catch (error) {
        notify.error('Registration failed', (error as Error).message);
        throw error;
      } finally {
        setLoading(false);
      }
    },
    [navigate, setLoading]
  );

  const handleLogout = useCallback(() => {
    authApi.logout();
    logout();
    notify.info('Logged out', 'You have been logged out');
    navigate({ to: '/auth/login' });
  }, [logout, navigate]);

  return {
    user,
    isAuthenticated,
    isLoading,
    login: handleLogin,
    register: handleRegister,
    logout: handleLogout,
  };
}

// Hook to protect routes
export function useRequireAuth() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate({ to: '/auth/login' });
    }
  }, [isAuthenticated, isLoading, navigate]);

  return { isAuthenticated, isLoading };
}

export default useAuth;
