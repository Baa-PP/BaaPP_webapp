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
 */

export interface ApiError extends Error {
  status: number;
}

function createApiError(status: number, message: string): ApiError {
  const err = new Error(message) as ApiError;
  err.status = status;
  return err;
}

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

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (typeof body?.message === "string" && body.message.length > 0) {
        message = body.message;
      }
    } catch {
      // sin cuerpo JSON
    }
    throw createApiError(response.status, message);
  }

  return response.json() as Promise<T>;
}
