import axios from "axios";
import { api } from "./client";
import type { AuthTokens, AuthUser } from "../types";

const BASE = (import.meta.env.VITE_API_URL as string | undefined) || "";

export const loginRequest = (email: string, password: string) =>
  api.post<AuthTokens>("/api/auth/login", { email, password }).then((r) => r.data);

/**
 * Refresh con axios "crudo" (sin interceptores): si se hiciera con `api`,
 * un 401 aquí re-dispararía el propio flujo de refresh en bucle.
 */
export const refreshRequest = () =>
  axios
    .post<AuthTokens>(`${BASE}/api/auth/refresh`, {}, { withCredentials: true })
    .then((r) => r.data);

export const logoutRequest = () =>
  api.post("/api/auth/logout", {}).catch(() => undefined);

export const meRequest = () => api.get<AuthUser>("/api/auth/me").then((r) => r.data);
