import { useRanchContextStore } from "../store/useRanchContextStore";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000/api/v1";

/**
 * WEB-003 — apiFetch: cliente HTTP centralizado.
 *
 * Inyecta en cada petición:
 *   - Authorization: Bearer <jwt>  (leído de localStorage)
 *   - X-Active-Ranch-Id: <id>      (leído de useRanchContextStore)
 *
 * Los errores HTTP se normalizan a un único tipo { status, message }
 * para que todos los módulos los manejen igual.
 *
 * WEB-002 — Interceptor 401 Unauthorized con cola de peticiones concurrentes.
 *
 * Ante un 401:
 *   1. Si hay refreshToken → intenta POST /api/v1/auth/refresh una sola vez,
 *      encolando cualquier petición concurrente para reintentarlas después.
 *   2. Si el refresh tiene éxito → actualiza jwt_token y reintenta la cola.
 *   3. Si el refresh falla o no hay refreshToken → limpia la sesión y
 *      redirige a /login.
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

function clearSession(): void {
  localStorage.removeItem("jwt_token");
  localStorage.removeItem("jwt_refresh_token");
  localStorage.removeItem("baapp_user");
  useRanchContextStore.getState().setActiveRanchId(null);
}

/** Intenta refrescar el JWT. Devuelve el nuevo token o lanza un error. */
async function refreshSession(): Promise<string> {
  const refreshToken = localStorage.getItem("jwt_refresh_token");
  if (!refreshToken) {
    throw createApiError(401, "No hay refresh token disponible.");
  }

  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    throw createApiError(res.status, "Refresh token inválido o expirado.");
  }

  const data = await res.json();
  const newToken: string = data.token;
  localStorage.setItem("jwt_token", newToken);
  if (typeof data.refreshToken === "string" && data.refreshToken.length > 0) {
    localStorage.setItem("jwt_refresh_token", data.refreshToken);
  }
  return newToken;
}

// --- apiFetch principal ---

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const activeRanchId = useRanchContextStore.getState().activeRanchId;
  const token = localStorage.getItem("jwt_token");

  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (activeRanchId) headers.set("X-Active-Ranch-Id", activeRanchId);

  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  // --- WEB-002: interceptor 401 ---
  if (response.status === 401) {
    // Si ya hay un refresh en curso, encolar esta petición
    if (isRefreshing) {
      return new Promise<T>((resolve, reject) => {
        pendingQueue.push({
          resolve: async (newToken: string) => {
            try {
              headers.set("Authorization", `Bearer ${newToken}`);
              const res = await fetch(`${API_BASE_URL}${path}`, {
                ...init,
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

    // Primer 401: intentar refresh
    isRefreshing = true;
    let newToken: string;
    try {
      newToken = await refreshSession();
    } catch (refreshErr) {
      // El refresh en sí falló (token inválido/expirado) → limpiar sesión
      flushQueue(refreshErr);
      isRefreshing = false;
      clearSession();
      window.location.href = "/login";
      throw refreshErr;
    }

    // Refresh exitoso: drenar la cola ANTES de reintentar el request original
    // para que peticiones encoladas no puedan unirse a una cola ya cerrada
    flushQueue(null, newToken);
    isRefreshing = false;

    // Reintentar el request original con el nuevo token (separado del bloque
    // de refresh: errores 5xx o de red aquí NO deben limpiar la sesión)
    headers.set("Authorization", `Bearer ${newToken}`);
    const retryRes = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
    });

    return parseResponse<T>(retryRes);
  }

  // --- Otros errores HTTP o respuesta exitosa ---
  return parseResponse<T>(response);
}
