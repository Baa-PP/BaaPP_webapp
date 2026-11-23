/**
 * URL base del API resuelta una sola vez para toda la app (login y apiFetch).
 * Si VITE_API_BASE_URL no está definida o está vacía, se usa el backend local
 * de desarrollo. Se eliminan las diagonales finales para concatenar rutas
 * como `${API_BASE_URL}/auth/login`.
 *
 * WEB-026 (RNF Seguridad): Todo el tráfico fuera de localhost debe operar
 * sobre HTTPS y no se permiten credenciales embebidas en la URL.
 */
export const DEFAULT_API_BASE_URL = "http://localhost:5000/api/v1";

const LOCAL_HTTP_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export interface ApiConfigValidation {
  apiBaseUrl: string;
  isHttps: boolean;
  isLocalHttp: boolean;
  error: string | null;
}

export function validateApiBaseUrl(
  rawEnv?: string,
  pageProtocol?: string
): ApiConfigValidation {
  const trimmed = (rawEnv ?? "").trim().replace(/\/+$/, "");
  const candidate = trimmed || DEFAULT_API_BASE_URL;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return {
      apiBaseUrl: candidate,
      isHttps: false,
      isLocalHttp: false,
      error:
        "Configuración insegura: VITE_API_BASE_URL no es una URL válida.",
    };
  }

  if (parsed.username || parsed.password) {
    return {
      apiBaseUrl: `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, ""),
      isHttps: false,
      isLocalHttp: false,
      error:
        "Configuración insegura: VITE_API_BASE_URL no debe incluir credenciales embebidas.",
    };
  }

  if (parsed.protocol === "https:") {
    return {
      apiBaseUrl: candidate,
      isHttps: true,
      isLocalHttp: false,
      error: null,
    };
  }

  if (parsed.protocol === "http:" && LOCAL_HTTP_HOSTS.has(parsed.hostname)) {
    if (pageProtocol === "https:") {
      return {
        apiBaseUrl: candidate,
        isHttps: false,
        isLocalHttp: true,
        error:
          "Bloqueo Mixed Content: el portal está servido sobre HTTPS pero VITE_API_BASE_URL apunta a HTTP local. Configura una URL HTTPS.",
      };
    }
    return {
      apiBaseUrl: candidate,
      isHttps: false,
      isLocalHttp: true,
      error: null,
    };
  }

  return {
    apiBaseUrl: candidate,
    isHttps: false,
    isLocalHttp: false,
    error:
      "Conexión rechazada por política HTTPS: todo el tráfico hacia el backend fuera de localhost debe usar HTTPS.",
  };
}

const rawEnvUrl = import.meta.env?.VITE_API_BASE_URL;

const pageProtocol =
  typeof window !== "undefined" ? window.location.protocol : undefined;

const validation = validateApiBaseUrl(rawEnvUrl, pageProtocol);

export const API_BASE_URL = validation.apiBaseUrl;
export const API_IS_HTTPS = validation.isHttps;
export const API_CONFIG_ERROR = validation.error;
