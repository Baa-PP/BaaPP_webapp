import { apiFetch } from "../../api/client";
import {
  computeSabanaAge,
  getTodayIsoDate,
  parseIsoCalendarDateUtcMs,
  type SabanaRow,
} from "./SabanaColumns";

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
      : (computedAge?.edadDias ?? 0);
  const edadMeses =
    rawEdadMeses !== undefined
      ? Math.round(rawEdadMeses * 10) / 10
      : (computedAge?.edadMeses ?? Math.round((edadDias / 30.0) * 10) / 10);

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
      return row.fechaCorteIso === cutoffIso
        ? row
        : { ...row, fechaCorteIso: cutoffIso };
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
