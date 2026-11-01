import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { auth as authApi, TOKEN_KEY, USER_KEY } from '../api';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(!!localStorage.getItem(TOKEN_KEY));
  const [themeMode, setThemeMode] = useState(() => localStorage.getItem('lx_theme') || 'light');

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    localStorage.setItem('lx_theme', themeMode);
  }, [themeMode]);

  const refresh = useCallback(async () => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      setLoading(false);
      return null;
    }
    try {
      const me = await authApi.me();
      setUser(me);
      localStorage.setItem(USER_KEY, JSON.stringify(me));
      return me;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback((token, u) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(u));
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      refresh,
      themeMode,
      toggleTheme: () => setThemeMode((m) => (m === 'light' ? 'dark' : 'light')),
      isAdmin: user?.role === 'admin',
    }),
    [user, loading, login, logout, refresh, themeMode]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);