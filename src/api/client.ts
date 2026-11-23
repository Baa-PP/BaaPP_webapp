import { useRanchContextStore } from "../store/useRanchContextStore";
import { API_BASE_URL, API_CONFIG_ERROR } from "./config";

/**
 * WEB-003 — apiFetch: cliente HTTP centralizado.
 *
 * Inyecta en cada petición:
 *   - Authorization: Bearer <jwt>  (leído de sessionStorage, acotado a la pestaña)
 *   - X-Active-Ranch-Id: <id>      (override explícito o leído de useRanchContextStore)
 *
 * Los errores HTTP se normalizan a un único tipo { status, message }
 * para que todos los módulos los manejen igual.
 *
 * WEB-002 — Interceptor 401 Unauthorized con cola de peticiones concurrentes (BE-001).
 *
 * Ante un 401:
 *   1. Si hay un token más nuevo ya almacenado → reintenta con él sin refrescar.
 *   2. Si ya hay un refresh en curso → encola la petición para reintentarla al finalizar.
 *   3. Si hay refreshToken → ejecuta POST /api/v1/auth/refresh una sola vez (BE-001 rota
 *      accessToken y refreshToken), actualiza sessionStorage y baapp.session (con guardia
 *      de generación), drena la cola y reintenta todas las peticiones.
 *   4. Si el refresh rechaza credenciales (4xx no transitorio), falta refreshToken o el
 *      reintento devuelve 401 → limpia la sesión, notifica vía onSessionCleared y redirige
 *      a #/login. Ante fallos transitorios (red, 408, 429, 5xx) conserva tokens y relanza.
 */

export interface ApiError extends Error {
  status: number;
  code?: string;
}

export interface ForbiddenEvent {
  status: 403;
  code?: string;
  message: string;
  path: string;
  ranchId: string | null;
}

export interface ApiFetchOptions extends RequestInit {
  /** Overrides X-Active-Ranch-Id for this request. Pass null to omit the header. */
  ranchId?: string | null;
}

function createApiError(
  status: number,
  message: string,
  code?: string
): ApiError {
  const err = new Error(message) as ApiError;
  err.status = status;
  if (code) err.code = code;
  return err;
}

function resolveForbiddenMessage(rawMessage?: string, code?: string): string {
  const trimmed = typeof rawMessage === "string" ? rawMessage.trim() : "";
  if (
    trimmed.length > 0 &&
    trimmed !== "HTTP 403" &&
    trimmed.toLowerCase() !== "forbidden"
  ) {
    return trimmed;
  }
  switch (code) {
    case "RANCH_ACCESS_DENIED":
      return "El usuario autenticado no tiene acceso al rancho activo.";
    case "INSUFFICIENT_PERMISSION":
      return "No cuentas con los permisos necesarios para realizar esta operación en el rancho activo.";
    default:
      return "Acceso denegado (403): no tienes permisos para realizar esta operación.";
  }
}

type ForbiddenErrorListener = (event: ForbiddenEvent) => void;
const forbiddenErrorListeners = new Set<ForbiddenErrorListener>();

export function onForbiddenError(
  listener: ForbiddenErrorListener
): () => void {
  forbiddenErrorListeners.add(listener);
  return () => {
    forbiddenErrorListeners.delete(listener);
  };
}

/**
 * Política explícita de clasificación de errores en POST /api/v1/auth/refresh:
 * - No recuperables (limpian sesión y redirigen a #/login): códigos HTTP 4xx que rechazan
 *   credenciales o solicitud de sesión (p. ej. 400, 401, 403, 404), excluyendo 408 y 429.
 * - Transitorios / recuperables (conservan tokens almacenados y relanzan para reintento):
 *   errores de red/timeout (sin status HTTP numérico), 408 Request Timeout,
 *   429 Too Many Requests y 5xx del servidor.
 */
function isNonRecoverableRefreshError(err: unknown): boolean {
  const status = (err as Partial<ApiError>)?.status;
  if (typeof status !== "number") return false;
  if (status === 408 || status === 429) return false;
  return status >= 400 && status < 500;
}

async function parseResponse<T>(
  res: Response,
  context?: { path: string; ranchId: string | null; expectedGeneration: number }
): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    let code: string | undefined;
    try {
      const body = await res.json();
      if (typeof body?.code === "string" && body.code.trim().length > 0) {
        code = body.code.trim();
      }
      if (typeof body?.message === "string" && body.message.trim().length > 0) {
        message = body.message.trim();
      }
    } catch {
      // sin cuerpo JSON
    }

    if (res.status === 403) {
      message = resolveForbiddenMessage(message, code);
      if (context && sessionGeneration === context.expectedGeneration) {
        const event: ForbiddenEvent = {
          status: 403,
          code,
          message,
          path: context.path,
          ranchId: context.ranchId,
        };
        forbiddenErrorListeners.forEach((listener) => listener(event));
      }
    }

    throw createApiError(res.status, message, code);
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

type SessionRefreshedListener = (tokens: {
  accessToken: string;
  refreshToken?: string;
}) => void;
const sessionRefreshedListeners = new Set<SessionRefreshedListener>();

export function onSessionRefreshed(
  listener: SessionRefreshedListener
): () => void {
  sessionRefreshedListeners.add(listener);
  return () => {
    sessionRefreshedListeners.delete(listener);
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

function expireSessionAndRedirect(expectedGeneration: number): void {
  if (sessionGeneration !== expectedGeneration) return;
  clearSession();
  if (window.location.hash !== "#/login") {
    window.location.hash = "/login";
  }
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

/**
 * Intenta refrescar el JWT contra POST /api/v1/auth/refresh (BE-001).
 * Persiste el nuevo accessToken y cualquier refreshToken rotado solo si
 * la generación de sesión no cambió mientras el request estaba en vuelo.
 */
async function refreshSession(): Promise<string> {
  if (API_CONFIG_ERROR) {
    throw createApiError(0, API_CONFIG_ERROR, "INSECURE_TRANSPORT");
  }
  const refreshToken = sessionStorage.getItem("jwt_refresh_token");
  if (!refreshToken) {
    throw createApiError(401, "No hay refresh token disponible.");
  }

  const startGeneration = sessionGeneration;

  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    redirect: "error",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    throw createApiError(res.status, "Refresh token inválido o expirado.");
  }

  const data = await res.json();
  const payload = data?.data ?? data;
  const newToken: string =
    payload.accessToken ||
    payload.access_token ||
    payload.token ||
    payload.jwt ||
    data.accessToken ||
    data.access_token ||
    data.token ||
    data.jwt;

  if (!newToken) {
    throw createApiError(
      401,
      "El servidor no devolvió un token de acceso renovado."
    );
  }

  const nextRefresh: string | undefined =
    (typeof payload.refreshToken === "string" &&
      payload.refreshToken.length > 0 &&
      payload.refreshToken) ||
    (typeof payload.refresh_token === "string" &&
      payload.refresh_token.length > 0 &&
      payload.refresh_token) ||
    (typeof data.refreshToken === "string" &&
      data.refreshToken.length > 0 &&
      data.refreshToken) ||
    (typeof data.refresh_token === "string" &&
      data.refresh_token.length > 0 &&
      data.refresh_token) ||
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

  sessionRefreshedListeners.forEach((listener) =>
    listener({ accessToken: newToken, refreshToken: nextRefresh })
  );

  return newToken;
}

// --- apiFetch principal ---

export async function apiFetch<T>(
  path: string,
  init: ApiFetchOptions = {}
): Promise<T> {
  if (API_CONFIG_ERROR) {
    throw createApiError(0, API_CONFIG_ERROR, "INSECURE_TRANSPORT");
  }

  const { ranchId, ...fetchInit } = init;
  const activeRanchId =
    ranchId !== undefined
      ? ranchId
      : useRanchContextStore.getState().activeRanchId;
  const requestGen = sessionGeneration;
  const effectiveRanchId = ranchId === null ? null : (activeRanchId ?? null);
  const errorContext = {
    path,
    ranchId: effectiveRanchId,
    expectedGeneration: requestGen,
  };
  const token = sessionStorage.getItem("jwt_token");

  const headers = new Headers(fetchInit.headers);
  headers.set("Accept", "application/json");
  if (fetchInit.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (ranchId === null) {
    headers.delete("X-Active-Ranch-Id");
  } else if (activeRanchId) {
    headers.set("X-Active-Ranch-Id", activeRanchId);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...fetchInit,
    headers,
  });

  // --- WEB-002: interceptor 401 ---
  if (response.status === 401) {
    // Si la sesión cambió mientras la petición inicial estaba en vuelo, cancelar sin refrescar ni expirar la nueva sesión.
    if (sessionGeneration !== requestGen) {
      throw createApiError(401, "Sesión cancelada");
    }

    // 1. Si ya existe un token más nuevo (refrescado por otra petición concurrente), reintentar sin refrescar otra vez.
    const currentToken = sessionStorage.getItem("jwt_token");
    if (currentToken && currentToken !== token) {
      headers.set("Authorization", `Bearer ${currentToken}`);
      const retryRes = await fetch(`${API_BASE_URL}${path}`, {
        ...fetchInit,
        headers,
      });
      if (retryRes.status === 401) {
        expireSessionAndRedirect(requestGen);
      }
      return parseResponse<T>(retryRes, errorContext);
    }

    // 2. Si ya hay un refresh en curso con el token actual, encolar esta petición (1 solo refresh para N 401 concurrentes).
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
              if (res.status === 401) {
                expireSessionAndRedirect(requestGen);
              }
              resolve(await parseResponse<T>(res, errorContext));
            } catch (err) {
              reject(err);
            }
          },
          reject,
        });
      });
    }

    // 3. Primer 401: iniciar un único POST /api/v1/auth/refresh bajo la misma generación de sesión
    isRefreshing = true;
    const initialSessionGen = requestGen;
    let newToken: string;
    try {
      newToken = await refreshSession();
    } catch (refreshErr) {
      flushQueue(refreshErr);
      isRefreshing = false;
      if (isNonRecoverableRefreshError(refreshErr)) {
        expireSessionAndRedirect(initialSessionGen);
      }
      throw refreshErr;
    }

    if (sessionGeneration !== initialSessionGen) {
      flushQueue(new Error("Sesión cancelada"));
      isRefreshing = false;
      throw createApiError(401, "Sesión cancelada");
    }

    // Refresh exitoso: drenar la cola ANTES de reintentar el request original
    flushQueue(null, newToken);
    isRefreshing = false;

    headers.set("Authorization", `Bearer ${newToken}`);
    const retryRes = await fetch(`${API_BASE_URL}${path}`, {
      ...fetchInit,
      headers,
    });
    if (retryRes.status === 401) {
      expireSessionAndRedirect(initialSessionGen);
    }

    return parseResponse<T>(retryRes, errorContext);
  }

  return parseResponse<T>(response, errorContext);
}
