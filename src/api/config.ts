/**
 * URL base del API resuelta una sola vez para toda la app (login y apiFetch).
 * Si VITE_API_BASE_URL no está definida o está vacía, se usa el backend local
 * de desarrollo. Se eliminan las diagonales finales para concatenar rutas
 * como `${API_BASE_URL}/auth/login`.
 */
export const DEFAULT_API_BASE_URL = "http://localhost:5000/api/v1";

const raw = (import.meta.env.VITE_API_BASE_URL ?? "").trim();

export const API_BASE_URL = (raw || DEFAULT_API_BASE_URL).replace(/\/+$/, "");
