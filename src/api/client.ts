import { useRanchContextStore } from "../store/useRanchContextStore";
import { API_BASE_URL } from "./config";

/**
 * WEB-003 — apiFetch: cliente HTTP centralizado.
 *
 * Inyecta en cada petición:
 *   - Authorization: Bearer <jwt>  (leído de sessionStorage, acotado a la pestaña)
 *   - X-Active-Ranch-Id: <id>      (leído de useRanchContextStore)
 *
 * Los errores HTTP se normalizan a un único tipo { status, message }
 * para que todos los módulos los manejen igual.
 *
 * WEB-002 — Interceptor 401 Unauthorized con cola de peticiones concurrentes.
 *
 * Ante un 401:
 *   1. Si hay un token más nuevo ya almacenado → reintenta con él sin refrescar.
 *   2. Si hay refreshToken → intenta POST /api/v1/auth/refresh una sola vez,
 *      encolando cualquier petición concurrente para reintentarlas después.
 *   3. Si el refresh tiene éxito → actualiza jwt_token en sessionStorage (y baapp.session) y reintenta la cola.
 *   4. Si el refresh falla o no hay refreshToken → limpia la sesión y
 *      redirige a /login (con guardia de generación de sesión).
 */

export interface ApiError extends Error {
  status: number;
}

function createApiError(status: number, message: string): ApiError {
  const err = new Error(message) as ApiError;
  err.status = status;
  return err;
}

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body?.message === "string" && body.message.length > 0) {
        message = body.message;
      }
    } catch {
      // sin cuerpo JSON
    }
    throw createApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

// --- Contador de generación de sesión para invalidar refresh obsoletos ---
let sessionGeneration = 0;

export function getSessionGeneration(): number {
  return sessionGeneration;
}

type SessionClearedListener = () => void;
const sessionClearedListeners = new Set<SessionClearedListener>();

export function onSessionCleared(listener: SessionClearedListener): () => void {
  sessionClearedListeners.add(listener);
  return () => {
    sessionClearedListeners.delete(listener);
  };
}

export function clearSession(): void {
  sessionGeneration += 1;
  sessionStorage.removeItem("jwt_token");
  sessionStorage.removeItem("jwt_refresh_token");
  sessionStorage.removeItem("baapp.session");
  sessionStorage.removeItem("baapp_user");
  localStorage.removeItem("jwt_token");
  localStorage.removeItem("jwt_refresh_token");
  localStorage.removeItem("baapp_user");
  useRanchContextStore.getState().setActiveRanchId(null);
  sessionClearedListeners.forEach((listener) => listener());
}

// --- Cola de peticiones concurrentes durante el refresh (WEB-002) ---
let isRefreshing = false;

type QueueEntry = {
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
};

const pendingQueue: QueueEntry[] = [];

function flushQueue(error: unknown, newToken?: string): void {
  const queue = [...pendingQueue];
  pendingQueue.length = 0;
  queue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(newToken!);
    }
  });
}

/** Intenta refrescar el JWT. Devuelve el nuevo token o lanza un error. */
async function refreshSession(): Promise<string> {
  const refreshToken = sessionStorage.getItem("jwt_refresh_token");
  if (!refreshToken) {
    throw createApiError(401, "No hay refresh token disponible.");
  }

  // Capturar la generación antes del refresh para descartar respuestas obsoletas
  // (p. ej. logout o nueva sesión mientras la petición estaba en vuelo).
  const startGeneration = sessionGeneration;

  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    throw createApiError(res.status, "Refresh token inválido o expirado.");
  }

  const data = await res.json();
  const payload = data?.data ?? data;
  const newToken: string =
    payload.token || payload.accessToken || payload.access_token || payload.jwt ||
    data.token || data.accessToken || data.access_token || data.jwt;
  if (!newToken) {
    throw createApiError(401, "El servidor no devolvió un token de acceso renovado.");
  }

  const nextRefresh: string | undefined =
    (typeof payload.refreshToken === "string" && payload.refreshToken.length > 0 && payload.refreshToken) ||
    (typeof payload.refresh_token === "string" && payload.refresh_token.length > 0 && payload.refresh_token) ||
    (typeof data.refreshToken === "string" && data.refreshToken.length > 0 && data.refreshToken) ||
    (typeof data.refresh_token === "string" && data.refresh_token.length > 0 && data.refresh_token) ||
    undefined;

  if (sessionGeneration !== startGeneration) {
    throw createApiError(401, "Sesión cancelada");
  }

  sessionStorage.setItem("jwt_token", newToken);
  if (nextRefresh) {
    sessionStorage.setItem("jwt_refresh_token", nextRefresh);
  }
  try {
    const raw = sessionStorage.getItem("baapp.session");
    if (raw) {
      const stored = JSON.parse(raw) as Record<string, unknown>;
      stored.accessToken = newToken;
      if (nextRefresh) stored.refreshToken = nextRefresh;
      sessionStorage.setItem("baapp.session", JSON.stringify(stored));
    }
  } catch {
    // ignore malformed session payload
  }
  return newToken;
}

// --- apiFetch principal ---

export interface ApiFetchOptions extends RequestInit {
  /** Overrides X-Active-Ranch-Id for this request. Pass null to omit the header. */
  ranchId?: string | null;
}

export async function apiFetch<T>(
  path: string,
  init: ApiFetchOptions = {}
): Promise<T> {
  const { ranchId, ...fetchInit } = init;
  const activeRanchId =
    ranchId !== undefined
      ? ranchId
      : useRanchContextStore.getState().activeRanchId;
  const token = sessionStorage.getItem("jwt_token");

  const headers = new Headers(fetchInit.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (ranchId === null) {
    headers.delete("X-Active-Ranch-Id");
  } else if (activeRanchId) {
    headers.set("X-Active-Ranch-Id", activeRanchId);
  }

  const requestGen = sessionGeneration;
  const response = await fetch(`${API_BASE_URL}${path}`, { ...fetchInit, headers });

  // --- WEB-002: interceptor 401 ---
  if (response.status === 401) {
    if (sessionGeneration !== requestGen) {
      throw createApiError(401, "Sesión cancelada");
    }

    // 1. Comparar el token usado en la petición fallida con el token actualmente almacenado.
    // Si ya existe un token más nuevo (refrescado por otra petición concurrente), reintentar sin refrescar otra vez.
    const currentToken = sessionStorage.getItem("jwt_token");
    if (currentToken && currentToken !== token) {
      headers.set("Authorization", `Bearer ${currentToken}`);
      const retryRes = await fetch(`${API_BASE_URL}${path}`, {
        ...fetchInit,
        headers,
      });
      return parseResponse<T>(retryRes);
    }

    // 2. Si ya hay un refresh en curso con el token actual, encolar esta petición
    if (isRefreshing) {
      return new Promise<T>((resolve, reject) => {
        pendingQueue.push({
          resolve: async (newToken: string) => {
            try {
              headers.set("Authorization", `Bearer ${newToken}`);
              const res = await fetch(`${API_BASE_URL}${path}`, {
                ...fetchInit,
                headers,
              });
              resolve(await parseResponse<T>(res));
            } catch (err) {
              reject(err);
            }
          },
          reject,
        });
      });
    }

    // 3. Primer 401: capturar la generación de sesión antes de iniciar refresh
    isRefreshing = true;
    const initialSessionGen = sessionGeneration;
    let newToken: string;
    try {
      newToken = await refreshSession();
    } catch (refreshErr) {
      flushQueue(refreshErr);
      isRefreshing = false;

      // Si la sesión cambió desde que inició el refresh (ej. logout mientras la petición volaba),
      // descartar la acción para evitar limpiar o redirigir en una sesión nueva
      if (sessionGeneration !== initialSessionGen) {
        throw refreshErr;
      }

      const status = (refreshErr as Partial<ApiError>)?.status;
      if (status === 401 || status === 403) {
        clearSession();
        if (window.location.hash) {
          window.location.hash = "/login";
        } else {
          window.location.href = "/login";
        }
      }
      throw refreshErr;
    }

    // Si la sesión cambió antes de que el refresh exitoso fuera aplicado
    if (sessionGeneration !== initialSessionGen) {
      flushQueue(new Error("Sesión cancelada"));
      isRefreshing = false;
      throw createApiError(401, "Sesión cancelada");
    }

    // Refresh exitoso: drenar la cola ANTES de reintentar el request original
    // para que peticiones encoladas no puedan unirse a una cola ya cerrada
    flushQueue(null, newToken);
    isRefreshing = false;

    // Reintentar el request original con el nuevo token (separado del bloque
    // de refresh: errores 5xx o de red aquí NO deben limpiar la sesión)
    headers.set("Authorization", `Bearer ${newToken}`);
    const retryRes = await fetch(`${API_BASE_URL}${path}`, {
      ...fetchInit,
      headers,
    });

    return parseResponse<T>(retryRes);
  }

  // --- Otros errores HTTP o respuesta exitosa ---
  return parseResponse<T>(response);
}
