/**
 * Who is logged in.
 *
 * The JWT from the server is kept in localStorage. On page load, if a token
 * exists, we ask the server who it belongs to (GET /auth/me). The user object
 * is cached by TanStack Query under the key ["me"], so any component can call
 * `refreshUser()` after an action that changes storage usage, name, etc.
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { api, TOKEN_KEY } from "@/lib/api";
import { useTheme } from "@/context/ThemeContext";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const { setTheme } = useTheme();
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const hasToken = Boolean(token);

  const { data: user, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.get("/auth/me").then((r) => r.data),
    enabled: hasToken,
    retry: false,
  });

  // Use the theme saved on the account once we know who the user is.
  useEffect(() => {
    if (user?.theme) setTheme(user.theme);
  }, [user?.theme, setTheme]);

  const startSession = useCallback(
    (data) => {
      localStorage.setItem(TOKEN_KEY, data.access_token);
      queryClient.setQueryData(["me"], data.user);
      setToken(data.access_token);
    },
    [queryClient],
  );

  const login = useCallback(
    async (email, password) => startSession((await api.post("/auth/login", { email, password })).data),
    [startSession],
  );

  const register = useCallback(
    async (name, email, password) =>
      startSession((await api.post("/auth/register", { name, email, password })).data),
    [startSession],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    queryClient.clear(); // forget every cached response of this user
  }, [queryClient]);

  const refreshUser = useCallback(() => queryClient.invalidateQueries({ queryKey: ["me"] }), [queryClient]);

  const value = {
    user: hasToken ? user : null,
    isLoading: hasToken && isLoading,
    login,
    register,
    logout,
    refreshUser,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}
