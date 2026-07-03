import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { loginRequest, logoutRequest, refreshRequest } from "../api/auth";
import { SESSION_EXPIRED_EVENT, setAccessToken } from "./tokens";
import type { AuthUser } from "../types";

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  // Al montar: refresh silencioso con la cookie httpOnly → sesión restaurada
  useEffect(() => {
    let cancelled = false;
    refreshRequest()
      .then((tokens) => {
        if (cancelled) return;
        setAccessToken(tokens.access_token);
        setUser(tokens.user);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // El interceptor avisa cuando el refresh definitivo falla (sesión revocada/expirada)
  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      queryClient.clear();
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [queryClient]);

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await loginRequest(email, password);
    setAccessToken(tokens.access_token);
    setUser(tokens.user);
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setAccessToken(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
