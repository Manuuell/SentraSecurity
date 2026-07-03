import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { emitSessionExpired, getAccessToken, setAccessToken } from "../auth/tokens";

/**
 * Cliente HTTP único. En producción la API vive en el mismo origen (detrás
 * del reverse proxy); en dev el proxy de Vite redirige /api a localhost:8000.
 */
export const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL as string | undefined) || "",
  withCredentials: true, // cookie httpOnly del refresh token
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Refresh single-flight: N peticiones con 401 esperan UN solo refresh
let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  try {
    const { data } = await axios.post(
      `${api.defaults.baseURL || ""}/api/auth/refresh`,
      {},
      { withCredentials: true },
    );
    setAccessToken(data.access_token);
    return data.access_token as string;
  } catch {
    emitSessionExpired();
    return null;
  }
}

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
  const isAuthCall = config?.url?.includes("/api/auth/");

  if (error.response?.status === 401 && config && !config._retried && !isAuthCall) {
    config._retried = true;
    refreshing = refreshing ?? refreshAccessToken().finally(() => (refreshing = null));
    const token = await refreshing;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      return api(config);
    }
  }
  throw error;
});
