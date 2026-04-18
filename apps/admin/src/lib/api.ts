import axios from "axios";
import { clearStoredSession, getStoredToken } from "./auth-storage";

const rawApiUrl = import.meta.env.API_URL || import.meta.env.VITE_API_URL;
const baseURL = rawApiUrl?.replace(/\/$/, "") || "http://localhost:3000/api";

export const api = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      clearStoredSession();
      if (!window.location.pathname.startsWith("/login")) {
        const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        const qs = next && next !== "/" ? `?next=${encodeURIComponent(next)}` : "";
        window.location.assign(`/login${qs}`);
      }
    }
    return Promise.reject(err);
  },
);

export function getApiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] } | undefined;
    if (data?.message) {
      return Array.isArray(data.message) ? data.message.join(", ") : data.message;
    }
    return err.message || "Erro de rede";
  }
  if (err instanceof Error) return err.message;
  return "Ocorreu um erro";
}
