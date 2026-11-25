import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";

export interface SabanaRow {
  folio: string;                     // A: folio
  adn?: string;                      // B: adn
  chipSiniiga?: string;              // C: CHIP (484...)
  fechaNacimiento: string;           // D: FECHA NACIMIENTO
  fechaDestete?: string;             // E: FECHA DESTETE
  edadMeses?: number;                // F: EDAD MESES
  edadDias?: number;                 // G: EDAD DIAS
  pesoNacimientoKg?: number;         // H: PESO NACIMIENTO
  peso120DiasKg?: number;            // I: PESO 120 DIAS
  peso150DiasKg?: number;            // J: PESO 150 DIAS
  pesoEvaluacionKg?: number;         // K: PESO A LA EVALUACION
  circunferenciaEscrotalCm?: number; // L: CIRCUNFERENCIA (solo machos)
  pesoDesteteKg?: number;            // M: PESO DESTETE
  tipoDestete?: string;              // N: TIPO DESTETE
  padreFolioInterno?: string;        // O: PADRE
  folioPadreUno?: string;            // P: FOLIO PADRE
  madreFolioInterno?: string;        // Q: MADRE
  folioMadreUno?: string;            // R: FOLIO MADRE
  raza: string;                      // S: RAZA
  tipoParto: string;                 // T: TIPO DE PARTO
  concepcion: "MN" | "IA" | "TE";    // U: CONCEPCION
  color: string;                     // V: COLOR
  sexo: "HEMBRA" | "MACHO";          // W: SEXO
  fechaCorteIso: string;             // X: FECHA CORTE (=AHORA())
}

export interface SabanaColumnMeta {
  letter: string;
  srsHeader: string;
  align?: "left" | "right";
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

const decimalFormatter = new Intl.NumberFormat("es-MX", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
});

const integerFormatter = new Intl.NumberFormat("es-MX", {
  maximumFractionDigits: 0,
});

export function parseIsoCalendarDateUtcMs(isoDate?: string | null): number | null {
  if (typeof isoDate !== "string") return null;
  const match = ISO_DATE_RE.exec(isoDate.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcMs = Date.UTC(year, month - 1, day);
  const check = new Date(utcMs);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }
  return utcMs;
}

export function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Calcula la edad respecto a la fecha de corte según el SRS (RF-WEB-05):
 * - edadDias  = fecha_corte - fecha_nacimiento (días calendario, mínimo 0)
 * - edadMeses = ROUND(edadDias / 30.0, 1)
 */
export function computeSabanaAge(
  fechaNacimiento?: string | null,
  fechaCorteIso?: string | null
): { edadDias: number; edadMeses: number } | null {
  const birthMs = parseIsoCalendarDateUtcMs(fechaNacimiento);
  const cutoffMs = parseIsoCalendarDateUtcMs(fechaCorteIso);
  if (birthMs === null || cutoffMs === null) return null;
  const edadDias = Math.max(0, Math.round((cutoffMs - birthMs) / MS_PER_DAY));
  const edadMeses = Math.round((edadDias / 30.0) * 10) / 10;
  return { edadDias, edadMeses };
}

function formatTextCell(value: string | undefined): string {
  if (!value) return "—";
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "—";
}

function formatDecimalCell(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return decimalFormatter.format(value);
}

function formatMonthsCell(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toFixed(1);
}

function formatIntegerCell(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return integerFormatter.format(Math.round(value));
}

const columnHelper = createColumnHelper<SabanaRow>();

export const sabanaColumns: ColumnDef<SabanaRow, any>[] = [
  columnHelper.accessor("folio", {
    id: "folio",
    header: "A · Folio",
    size: 120,
    cell: (info) => formatTextCell(info.getValue()),
    meta: { letter: "A", srsHeader: "folio", align: "left" } satisfies SabanaColumnMeta,
  }),
  columnHelper.accessor("adn", {
    id: "adn",
    header: "B · ADN",
    size: 130,
    sortUndefined: "last",
    cell: (info) => formatTextCell(info.getValue()),
    meta: { letter: "B", srsHeader: "adn", align: "left" } satisfies SabanaColumnMeta,
  }),
  columnHelper.accessor("chipSiniiga", {
    id: "chipSiniiga",
    header: "C · CHIP SINIIGA",
    size: 165,
    sortUndefined: "last",
    cell: (info) => formatTextCell(info.getValue()),
    meta: { letter: "C", srsHeader: "CHIP", align: "left" } satisfies SabanaColumnMeta,
  }),
  columnHelper.accessor("fechaNacimiento", {
    id: "fechaNacimiento",
    header: "D · Fecha Nac.",
    size: 130,
    cell: (info) => formatTextCell(info.getValue()),
    meta: { letter: "D", srsHeader: "FECHA NACIMIENTO", align: "left" } satisfies SabanaColumnMeta,
  }),
  columnHelper.accessor("fechaDestete", {
    id: "fechaDestete",
    header: "E · Fecha Destete",
    size: 135,
    sortUndefined: "last",
    cell: (info) => formatTextCell(info.getValue()),
    meta: { letter: "E", srsHeader: "FECHA DESTETE", align: "left" } satisfies SabanaColumnMeta,
  }),
  columnHelper.accessor("edadMeses", {
    id: "edadMeses",
    header: "F · Edad (Meses)",
    size: 125,
    sortUndefined: "last",
    cell: (info) => formatMonthsCell(info.getValue()),
    meta: { letter: "F", srsHeader: "EDAD MESES", align: "right" } satisfies SabanaColumnMeta,
  }),
  columnHelper.accessor("edadDias", {
    id: "edadDias",
    header: "G · Edad (Días)",
    size: 120,
    sortUndefined: "last",
    cell: (info) => formatIntegerCell(info.getValue()),
    meta: { letter: "G", srsHeader: "EDAD DIAS", align: "right" } satisfies SabanaColumnMeta,
  }),
  columnHelper.accessor("pesoNacimientoKg", {
    id: "pesoNacimientoKg",
    header: "H · Peso Nac. (kg)",
    size: 135,
    sortUndefined: "last",
    cell: (info) => formatDecimalCell(info.getValue()),
    meta: { letter: "H", srsHeader: "PESO NACIMIENTO", align: "right" } satisfies SabanaColumnMeta,
  }),
  columnHelper.accessor("peso120DiasKg", {
    id: "peso120DiasKg",
    header: "I · Peso 120d (kg)",
    size: 135,
    sortUndefined: "last",
    cell: (info) => formatDecimalCell(info.getValue()),
    meta: { letter: "I", srsHeader: "PESO 120 DIAS", align: "right" } satisfies SabanaColumnMeta,
  }),
  columnHelper.accessor("peso150DiasKg", {
    id: "peso150DiasKg",
    header: "J · Peso 150d (kg)",
    size: 135,
    sortUndefined: "last",
    cell: (info) => formatDecimalCell(info.getValue()),
    meta: { letter: "J", srsHeader: "PESO 150 DIAS", align: "right" } satisfies SabanaColumnMeta,
  }),
  columnHelper.accessor("pesoEvaluacionKg", {
    id: "pesoEvaluacionKg",
    header: "K · Peso Eval. (kg)",
    size: 140,
    sortUndefined: "last",
    cell: (info) => formatDecimalCell(info.getValue()),
    meta: { letter: "K", srsHeader: "PESO A LA EVALUACION", align: "right" } satisfies SabanaColumnMeta,
  }),
  columnHelper.accessor("circunferenciaEscrotalCm", {
    id: "circunferenciaEscrotalCm",
    header: "L · Circ. Escrotal (cm)",
    size: 155,
    sortUndefined: "last",
    cell: (info) =>
      info.row.original.sexo === "HEMBRA"
        ? "—"
        : formatDecimalCell(info.getValue()),
    meta: { letter: "L", srsHeader: "CIRCUNFERENCIA", align: "right" } satisfies SabanaColumnMeta,
  }),
  columnHelper.accessor("pesoDesteteKg", {
    id: "pesoDesteteKg",
    header: "M · Peso Destete (kg)",
    size: 150,
    sortUndefined: "last",
    cell: (info) => formatDecimalCell(info.getValue()),
    meta: { letter: "M", srsHeader: "PESO DESTETE", align: "right" } satisfies SabanaColumnMeta,
  }),
  columnHelper.accessor("tipoDestete", {
    id: "tipoDestete",
    header: "N · Tipo Destete",
    size: 135,
    sortUndefined: "last",
    cell: (info) => formatTextCell(info.getValue()),
    meta: { letter: "N", srsHeader: "TIPO DESTETE", align: "left" } satisfies SabanaColumnMeta,
  }),
  columnHelper.accessor("padreFolioInterno", {
    id: "padreFolioInterno",
    header: "O · Padre",
    size: 120,
    sortUndefined: "last",
    cell: (info) => formatTextCell(info.getValue()),
    meta: { letter: "O", srsHeader: "PADRE", align: "left" } satisfies SabanaColumnMeta,
  }),
  columnHelper.accessor("folioPadreUno", {
    id: "folioPadreUno",
    header: "P · Folio Padre UNO",
    size: 155,
    sortUndefined: "last",
    cell: (info) => formatTextCell(info.getValue()),
    meta: { letter: "P", srsHeader: "FOLIO PADRE", align: "left" } satisfies SabanaColumnMeta,
  }),
  columnHelper.accessor("madreFolioInterno", {
    id: "madreFolioInterno",
    header: "Q · Madre",
    size: 120,
    sortUndefined: "last",
    cell: (info) => formatTextCell(info.getValue()),
    meta: { letter: "Q", srsHeader: "MADRE", align: "left" } satisfies SabanaColumnMeta,
  }),
  columnHelper.accessor("folioMadreUno", {
    id: "folioMadreUno",
    header: "R · Folio Madre UNO",
    size: 155,
    sortUndefined: "last",
    cell: (info) => formatTextCell(info.getValue()),
    meta: { letter: "R", srsHeader: "FOLIO MADRE", align: "left" } satisfies SabanaColumnMeta,
  }),
  columnHelper.accessor("raza", {
    id: "raza",
    header: "S · Raza",
    size: 130,
    cell: (info) => formatTextCell(info.getValue()),
    meta: { letter: "S", srsHeader: "RAZA", align: "left" } satisfies SabanaColumnMeta,
  }),
  columnHelper.accessor("tipoParto", {
    id: "tipoParto",
    header: "T · Tipo Parto",
    size: 130,
    cell: (info) => formatTextCell(info.getValue()),
    meta: { letter: "T", srsHeader: "TIPO DE PARTO", align: "left" } satisfies SabanaColumnMeta,
  }),
  columnHelper.accessor("concepcion", {
    id: "concepcion",
    header: "U · Concepción",
    size: 125,
    cell: (info) => formatTextCell(info.getValue()),
    meta: { letter: "U", srsHeader: "CONCEPCION", align: "left" } satisfies SabanaColumnMeta,
  }),
  columnHelper.accessor("color", {
    id: "color",
    header: "V · Color",
    size: 125,
    cell: (info) => formatTextCell(info.getValue()),
    meta: { letter: "V", srsHeader: "COLOR", align: "left" } satisfies SabanaColumnMeta,
  }),
  columnHelper.accessor("sexo", {
    id: "sexo",
    header: "W · Sexo",
    size: 115,
    cell: (info) => formatTextCell(info.getValue()),
    meta: { letter: "W", srsHeader: "SEXO", align: "left" } satisfies SabanaColumnMeta,
  }),
  columnHelper.accessor("fechaCorteIso", {
    id: "fechaCorteIso",
    header: "X · Fecha Corte",
    size: 130,
    cell: (info) => formatTextCell(info.getValue()),
    meta: { letter: "X", srsHeader: "FECHA CORTE", align: "left" } satisfies SabanaColumnMeta,
  }),
];
