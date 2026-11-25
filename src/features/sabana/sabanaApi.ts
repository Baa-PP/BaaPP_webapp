import { apiFetch, apiFetchRaw, type ApiError } from "../../api/client";
import {
  computeSabanaAge,
  getTodayIsoDate,
  parseIsoCalendarDateUtcMs,
  type SabanaRow,
} from "./SabanaColumns";

export const SABANA_XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface SabanaFilters {
  q: string;
  sexo: "" | "FEMALE" | "MALE";
  raza: string;
  estado: "" | "ACTIVE" | "SOLD" | "DECEASED";
}

export const EMPTY_SABANA_FILTERS: SabanaFilters = {
  q: "",
  sexo: "",
  raza: "",
  estado: "",
};

export interface SabanaPageResult {
  items: SabanaRow[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface SabanaReportResult {
  rows: SabanaRow[];
  totalElements: number;
  serverCutoffIso: string;
  truncated: boolean;
}

const SABANA_PAGE_SIZE = 500;
const MAX_AUTO_PAGES = 20;
const PAGE_FETCH_CONCURRENCY = 3;

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function normalizeIsoDate(value: unknown): string | undefined {
  const str = asNonEmptyString(value);
  if (!str) return undefined;
  const datePart = str.length >= 10 ? str.slice(0, 10) : str;
  if (parseIsoCalendarDateUtcMs(datePart) !== null) return datePart;
  return str;
}

function normalizeSex(value: unknown): "HEMBRA" | "MACHO" {
  const normalized = (asNonEmptyString(value) ?? "").toUpperCase();
  if (normalized === "MALE" || normalized === "MACHO" || normalized === "M") {
    return "MACHO";
  }
  return "HEMBRA";
}

function normalizeConcepcion(value: unknown): "MN" | "IA" | "TE" {
  const normalized = (asNonEmptyString(value) ?? "").toUpperCase();
  if (normalized === "IA" || normalized === "ARTIFICIAL_INSEMINATION") return "IA";
  if (normalized === "TE" || normalized === "EMBRYO_TRANSFER") return "TE";
  return "MN";
}

export function normalizeSabanaRow(raw: unknown): SabanaRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const folio = asNonEmptyString(r.folio ?? r.folioInterno ?? r.folio_interno);
  if (!folio) return null;

  const fechaNacimiento =
    normalizeIsoDate(r.fechaNacimiento ?? r.fecha_nacimiento) ?? "";
  const fechaCorteIso =
    normalizeIsoDate(r.fechaCorteIso ?? r.fecha_corte_iso ?? r.fecha_corte) ??
    getTodayIsoDate();

  const rawEdadDias = toFiniteNumber(r.edadDias ?? r.edad_dias);
  const rawEdadMeses = toFiniteNumber(r.edadMeses ?? r.edad_meses);
  const computedAge = computeSabanaAge(fechaNacimiento, fechaCorteIso);

  const edadDias =
    rawEdadDias !== undefined
      ? Math.max(0, Math.round(rawEdadDias))
      : computedAge?.edadDias;
  const edadMeses =
    rawEdadMeses !== undefined
      ? Math.round(rawEdadMeses * 10) / 10
      : (computedAge?.edadMeses ??
        (edadDias !== undefined
          ? Math.round((edadDias / 30.0) * 10) / 10
          : undefined));

  const sexo = normalizeSex(r.sexo ?? r.sex);
  const rawCircumference = toFiniteNumber(
    r.circunferenciaEscrotalCm ??
      r.circunferencia_escrotal_cm ??
      r.circunferencia
  );

  return {
    folio,
    adn: asNonEmptyString(r.adn),
    chipSiniiga: asNonEmptyString(r.chipSiniiga ?? r.chip_siniiga ?? r.chip),
    fechaNacimiento,
    fechaDestete: normalizeIsoDate(r.fechaDestete ?? r.fecha_destete),
    edadMeses,
    edadDias,
    pesoNacimientoKg: toFiniteNumber(
      r.pesoNacimientoKg ?? r.peso_nacimiento_kg ?? r.peso_nacimiento
    ),
    peso120DiasKg: toFiniteNumber(
      r.peso120DiasKg ?? r.peso_120_dias_kg ?? r.peso_120_dias
    ),
    peso150DiasKg: toFiniteNumber(
      r.peso150DiasKg ?? r.peso_150_dias_kg ?? r.peso_150_dias
    ),
    pesoEvaluacionKg: toFiniteNumber(
      r.pesoEvaluacionKg ?? r.peso_evaluacion_kg ?? r.peso_evaluacion
    ),
    circunferenciaEscrotalCm: sexo === "HEMBRA" ? undefined : rawCircumference,
    pesoDesteteKg: toFiniteNumber(
      r.pesoDesteteKg ?? r.peso_destete_kg ?? r.peso_destete
    ),
    tipoDestete: asNonEmptyString(r.tipoDestete ?? r.tipo_destete),
    padreFolioInterno: asNonEmptyString(
      r.padreFolioInterno ?? r.padre_folio_interno ?? r.padre
    ),
    folioPadreUno: asNonEmptyString(
      r.folioPadreUno ?? r.folio_padre_uno
    ),
    madreFolioInterno: asNonEmptyString(
      r.madreFolioInterno ?? r.madre_folio_interno ?? r.madre
    ),
    folioMadreUno: asNonEmptyString(
      r.folioMadreUno ?? r.folio_madre_uno
    ),
    raza: asNonEmptyString(r.raza ?? r.breed) ?? "",
    tipoParto: asNonEmptyString(r.tipoParto ?? r.tipo_parto) ?? "",
    concepcion: normalizeConcepcion(
      r.concepcion ?? r.metodoConcepcion ?? r.metodo_concepcion
    ),
    color: asNonEmptyString(r.color) ?? "",
    sexo,
    fechaCorteIso,
  };
}

export function normalizeSabanaPage(
  payload: unknown,
  fallbackPage: number,
  fallbackSize: number
): SabanaPageResult {
  const unwrapped =
    payload && typeof payload === "object" && "data" in payload
      ? (payload as { data?: unknown }).data ?? payload
      : payload;

  if (Array.isArray(unwrapped)) {
    const items = unwrapped
      .map(normalizeSabanaRow)
      .filter((row): row is SabanaRow => row !== null);
    return {
      items,
      page: fallbackPage,
      size: fallbackSize,
      totalElements: items.length,
      totalPages: items.length > 0 ? 1 : 0,
    };
  }

  const obj = (unwrapped && typeof unwrapped === "object"
    ? unwrapped
    : {}) as Record<string, unknown>;
  const rawList = Array.isArray(obj.items)
    ? obj.items
    : Array.isArray(obj.content)
      ? obj.content
      : [];
  const items = rawList
    .map(normalizeSabanaRow)
    .filter((row): row is SabanaRow => row !== null);

  const page = toFiniteNumber(obj.page ?? obj.number) ?? fallbackPage;
  const size = toFiniteNumber(obj.size) ?? fallbackSize;
  const totalElements =
    toFiniteNumber(obj.totalElements ?? obj.total_elements) ?? items.length;
  const totalPages =
    toFiniteNumber(obj.totalPages ?? obj.total_pages) ??
    (size > 0 ? Math.ceil(totalElements / size) : items.length > 0 ? 1 : 0);

  return {
    items,
    page: Math.max(0, Math.trunc(page)),
    size: Math.max(1, Math.trunc(size)),
    totalElements: Math.max(0, Math.trunc(totalElements)),
    totalPages: Math.max(0, Math.trunc(totalPages)),
  };
}

export function buildSabanaQueryString(
  filters: SabanaFilters,
  page: number,
  size: number = SABANA_PAGE_SIZE
): string {
  const params = new URLSearchParams();
  params.set("format", "json");
  const q = filters.q.trim();
  const raza = filters.raza.trim();
  if (q) params.set("q", q);
  if (filters.sexo) params.set("sexo", filters.sexo);
  if (raza) params.set("raza", raza);
  if (filters.estado) params.set("estado", filters.estado);
  params.set("page", String(page));
  params.set("size", String(size));
  return `?${params.toString()}`;
}

export function applyCutoffDateToRows(
  rows: SabanaRow[],
  cutoffIso: string | null
): SabanaRow[] {
  if (!cutoffIso || parseIsoCalendarDateUtcMs(cutoffIso) === null) {
    return rows;
  }
  return rows.map((row) => {
    const computed = computeSabanaAge(row.fechaNacimiento, cutoffIso);
    if (!computed) {
      if (row.fechaCorteIso === cutoffIso) {
        return row;
      }
      return {
        ...row,
        edadDias: undefined,
        edadMeses: undefined,
        fechaCorteIso: cutoffIso,
      };
    }
    return {
      ...row,
      edadDias: computed.edadDias,
      edadMeses: computed.edadMeses,
      fechaCorteIso: cutoffIso,
    };
  });
}

/**
 * Carga la Sábana desde GET /api/v1/reports/sabana (BE-012) en páginas de 500
 * registros para soportar rebaños de 1,000+ animales en el grid virtualizado.
 */
export async function fetchSabanaReport(
  filters: SabanaFilters,
  ranchId: string,
  signal?: AbortSignal
): Promise<SabanaReportResult> {
  const firstPayload = await apiFetch<unknown>(
    `/reports/sabana${buildSabanaQueryString(filters, 0, SABANA_PAGE_SIZE)}`,
    { ranchId, signal }
  );
  const firstPage = normalizeSabanaPage(firstPayload, 0, SABANA_PAGE_SIZE);

  const allRows: SabanaRow[] = [...firstPage.items];
  const pagesToFetch = Math.min(firstPage.totalPages, MAX_AUTO_PAGES);
  const truncated = firstPage.totalPages > MAX_AUTO_PAGES;

  if (pagesToFetch > 1 && firstPage.items.length > 0) {
    const remainingPageIndices: number[] = [];
    for (let p = 1; p < pagesToFetch; p += 1) {
      remainingPageIndices.push(p);
    }

    for (let i = 0; i < remainingPageIndices.length; i += PAGE_FETCH_CONCURRENCY) {
      if (signal?.aborted) {
        throw signal.reason ?? new DOMException("Consulta cancelada", "AbortError");
      }
      const batch = remainingPageIndices.slice(i, i + PAGE_FETCH_CONCURRENCY);
      const batchPages = await Promise.all(
        batch.map(async (pageIdx) => {
          const raw = await apiFetch<unknown>(
            `/reports/sabana${buildSabanaQueryString(filters, pageIdx, SABANA_PAGE_SIZE)}`,
            { ranchId, signal }
          );
          return normalizeSabanaPage(raw, pageIdx, SABANA_PAGE_SIZE);
        })
      );
      let reachedEmpty = false;
      for (const pageResult of batchPages) {
        if (pageResult.items.length === 0) {
          reachedEmpty = true;
          break;
        }
        allRows.push(...pageResult.items);
      }
      if (reachedEmpty) break;
    }
  }

  const serverCutoffIso = allRows[0]?.fechaCorteIso || getTodayIsoDate();

  return {
    rows: allRows,
    totalElements: Math.max(firstPage.totalElements, allRows.length),
    serverCutoffIso,
    truncated,
  };
}

export type SabanaExportPhase = "requesting" | "downloading" | "saving";

export interface SabanaExportProgress {
  phase: SabanaExportPhase;
  loadedBytes: number;
  totalBytes: number | null;
  percent: number | null;
}

export interface SabanaExportResult {
  filename: string;
  bytes: number;
}

export interface SabanaExportOptions {
  filters: SabanaFilters;
  ranchId: string;
  ranchName?: string;
  signal?: AbortSignal;
  onProgress?: (progress: SabanaExportProgress) => void;
  triggerDownload?: (blob: Blob, filename: string) => void;
}

export function buildSabanaExportQueryString(filters: SabanaFilters): string {
  const params = new URLSearchParams();
  params.set("format", "xlsx");
  const q = filters.q.trim();
  const raza = filters.raza.trim();
  if (q) params.set("q", q);
  if (filters.sexo) params.set("sexo", filters.sexo);
  if (raza) params.set("raza", raza);
  if (filters.estado) params.set("estado", filters.estado);
  return `?${params.toString()}`;
}

export function buildFallbackSabanaFilename(
  ranchName?: string,
  ranchId?: string
): string {
  const rawSlug = (ranchName || ranchId || "rancho")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const slug = rawSlug || "rancho";
  return `sabana-${slug}-${getTodayIsoDate()}.xlsx`;
}

function sanitizeFilename(raw: string): string | null {
  const trimmed = raw
    .replace(/[\r\n\0]/g, "")
    .replace(/^.*[/\\]/, "")
    .replace(/[<>:"|?*]/g, "_")
    .trim();
  if (!trimmed || trimmed === "." || trimmed === "..") return null;
  return trimmed.toLowerCase().endsWith(".xlsx") ? trimmed : `${trimmed}.xlsx`;
}

export function extractDownloadFilename(
  contentDisposition: string | null,
  fallbackName: string
): string {
  if (!contentDisposition) return fallbackName;

  const utf8Match = /filename\*\s*=\s*(?:UTF-8''|utf-8'')([^;\r\n]+)/i.exec(
    contentDisposition
  );
  if (utf8Match?.[1]) {
    try {
      const decoded = decodeURIComponent(utf8Match[1].trim().replace(/^"|"$/g, ""));
      const clean = sanitizeFilename(decoded);
      if (clean) return clean;
    } catch {
      // Fallback to standard filename parameter below
    }
  }

  const quotedMatch = /filename\s*=\s*"([^"]+)"/i.exec(contentDisposition);
  if (quotedMatch?.[1]) {
    const clean = sanitizeFilename(quotedMatch[1]);
    if (clean) return clean;
  }

  const bareMatch = /filename\s*=\s*([^;\r\n]+)/i.exec(contentDisposition);
  if (bareMatch?.[1]) {
    const clean = sanitizeFilename(bareMatch[1]);
    if (clean) return clean;
  }

  return fallbackName;
}

export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 2)} MB`;
}

export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: unknown }).name;
  return name === "AbortError";
}

function createExportValidationError(message: string, code: string): ApiError {
  const err = new Error(message) as ApiError;
  err.status = 0;
  err.code = code;
  return err;
}

export function formatSabanaExportError(err: unknown): string {
  if (isAbortError(err)) {
    return "Descarga cancelada.";
  }

  const apiErr = err as Partial<ApiError> | null;
  const status = typeof apiErr?.status === "number" ? apiErr.status : undefined;
  const code = typeof apiErr?.code === "string" ? apiErr.code.toUpperCase() : "";
  const rawMessage =
    err instanceof Error && typeof err.message === "string"
      ? err.message.trim()
      : "";

  if (
    code === "INSECURE_TRANSPORT" ||
    code === "REDIRECT_BLOCKED" ||
    code === "INVALID_XLSX_RESPONSE" ||
    code === "EMPTY_XLSX_RESPONSE"
  ) {
    return rawMessage;
  }

  if (status === 401) {
    return "Tu sesión venció mientras se preparaba el Excel. Vuelve a iniciar sesión para descargar la Sábana.";
  }

  if (status === 403) {
    if (code === "INSUFFICIENT_PERMISSION") {
      return "Tu cuenta no cuenta con permiso de exportación para descargar la Sábana de este rancho. Pide al propietario del rancho que habilite el permiso de exportación.";
    }
    if (code === "RANCH_ACCESS_DENIED") {
      return "No tienes acceso al rancho activo seleccionado. Cambia a un rancho autorizado e inténtalo de nuevo.";
    }
    return "No cuentas con permiso de exportación para descargar la Sábana de este rancho.";
  }

  if (status === 400) {
    if (code === "MISSING_RANCH_CONTEXT") {
      return "Selecciona un rancho activo antes de descargar la Sábana en Excel.";
    }
    if (code === "INVALID_EXPORT_FORMAT") {
      return "El servidor rechazó el formato de exportación solicitado (.xlsx). Contacta al administrador de tu asociación.";
    }
    return "Los filtros seleccionados no son válidos para exportar la Sábana. Revisa los criterios e inténtalo de nuevo.";
  }

  if (status === 404) {
    return "El servicio de exportación de la Sábana (.xlsx) no está disponible en este servidor.";
  }

  if (status === 408 || status === 504) {
    return "La generación del archivo Excel tardó demasiado tiempo. Intenta de nuevo o acota los filtros del rebaño.";
  }

  if (status === 429) {
    return "Hay demasiadas descargas en curso en este momento. Espera unos segundos e inténtalo de nuevo.";
  }

  if (status !== undefined && status >= 500) {
    return "El servidor no pudo generar el archivo Excel de la Sábana en este momento. Inténtalo de nuevo en unos minutos.";
  }

  if (
    status === 0 ||
    err instanceof TypeError ||
    rawMessage === "" ||
    /^HTTP \d+$/.test(rawMessage) ||
    /failed to fetch|networkerror|load failed/i.test(rawMessage)
  ) {
    return "No se pudo conectar con el servidor para descargar la Sábana. Revisa tu conexión a internet e inténtalo de nuevo.";
  }

  return `No se pudo completar la descarga de la Sábana en Excel (${rawMessage}). Inténtalo de nuevo.`;
}

function defaultTriggerBrowserDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 1000);
  }
}

function isCompatibleXlsxContentType(contentType: string | null): boolean {
  if (!contentType) return true;
  const normalized = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!normalized) return true;
  return (
    normalized === SABANA_XLSX_MIME ||
    normalized === "application/octet-stream" ||
    normalized === "application/vnd.ms-excel"
  );
}

function hasZipSignature(chunks: Uint8Array[]): boolean {
  const header: number[] = [];
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length && header.length < 2; i += 1) {
      header.push(chunk[i]);
    }
    if (header.length >= 2) break;
  }
  return header.length >= 2 && header[0] === 0x50 && header[1] === 0x4b;
}

/**
 * WEB-013: Descarga en streaming el archivo .xlsx oficial desde
 * GET /api/v1/reports/sabana?format=xlsx (BE-012 FastExcel), aislado
 * estrictamente al rancho activo vía X-Active-Ranch-Id.
 */
export async function downloadSabanaXlsx({
  filters,
  ranchId,
  ranchName,
  signal,
  onProgress,
  triggerDownload = defaultTriggerBrowserDownload,
}: SabanaExportOptions): Promise<SabanaExportResult> {
  if (!ranchId || !ranchId.trim()) {
    const missingRanch = new Error("Rancho activo requerido") as ApiError;
    missingRanch.status = 400;
    missingRanch.code = "MISSING_RANCH_CONTEXT";
    throw missingRanch;
  }

  onProgress?.({
    phase: "requesting",
    loadedBytes: 0,
    totalBytes: null,
    percent: null,
  });

  const queryString = buildSabanaExportQueryString(filters);
  const response = await apiFetchRaw(`/reports/sabana${queryString}`, {
    method: "GET",
    ranchId,
    signal,
    headers: {
      Accept: SABANA_XLSX_MIME,
    },
  });

  const contentType = response.headers.get("Content-Type");
  if (!isCompatibleXlsxContentType(contentType)) {
    throw createExportValidationError(
      "El servidor no devolvió un archivo Excel (.xlsx) válido para la Sábana. Inténtalo de nuevo o avisa al administrador.",
      "INVALID_XLSX_RESPONSE"
    );
  }

  const contentLengthHeader = response.headers.get("Content-Length");
  const parsedLength =
    contentLengthHeader !== null ? Number(contentLengthHeader) : Number.NaN;
  const totalBytes =
    Number.isFinite(parsedLength) && parsedLength > 0
      ? Math.trunc(parsedLength)
      : null;

  const chunks: Uint8Array[] = [];
  let loadedBytes = 0;

  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const handleAbort = () => {
      void reader.cancel().catch(() => {});
    };
    signal?.addEventListener("abort", handleAbort, { once: true });

    try {
      onProgress?.({
        phase: "downloading",
        loadedBytes: 0,
        totalBytes,
        percent: totalBytes ? 0 : null,
      });

      while (true) {
        if (signal?.aborted) {
          throw signal.reason ?? new DOMException("Descarga cancelada", "AbortError");
        }
        const { done, value } = await reader.read();
        if (signal?.aborted) {
          throw signal.reason ?? new DOMException("Descarga cancelada", "AbortError");
        }
        if (done) break;
        if (value && value.byteLength > 0) {
          chunks.push(value);
          loadedBytes += value.byteLength;
          const percent = totalBytes
            ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100))
            : null;
          onProgress?.({
            phase: "downloading",
            loadedBytes,
            totalBytes,
            percent,
          });
        }
      }
    } finally {
      signal?.removeEventListener("abort", handleAbort);
      reader.releaseLock();
    }
  } else {
    const buffer = await response.arrayBuffer();
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException("Descarga cancelada", "AbortError");
    }
    const bytes = new Uint8Array(buffer);
    if (bytes.byteLength > 0) {
      chunks.push(bytes);
      loadedBytes = bytes.byteLength;
    }
    onProgress?.({
      phase: "downloading",
      loadedBytes,
      totalBytes: totalBytes ?? (loadedBytes > 0 ? loadedBytes : null),
      percent: loadedBytes > 0 ? 100 : null,
    });
  }

  if (loadedBytes === 0) {
    throw createExportValidationError(
      "El archivo Excel descargado llegó vacío. Inténtalo de nuevo en un momento.",
      "EMPTY_XLSX_RESPONSE"
    );
  }

  if (!hasZipSignature(chunks)) {
    throw createExportValidationError(
      "El archivo recibido no tiene un formato Excel (.xlsx) válido. Inténtalo de nuevo o verifica el estado del servidor.",
      "INVALID_XLSX_RESPONSE"
    );
  }

  onProgress?.({
    phase: "saving",
    loadedBytes,
    totalBytes: totalBytes ?? loadedBytes,
    percent: 100,
  });

  const fallbackFilename = buildFallbackSabanaFilename(ranchName, ranchId);
  const filename = extractDownloadFilename(
    response.headers.get("Content-Disposition"),
    fallbackFilename
  );

  const blob = new Blob(chunks as BlobPart[], { type: SABANA_XLSX_MIME });
  triggerDownload(blob, filename);

  return { filename, bytes: loadedBytes };
}
