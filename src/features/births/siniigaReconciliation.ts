export const FIVE_MONTH_WINDOW_DAYS = 150;
const MS_PER_DAY = 86_400_000;

export interface BirthReconciliationInput {
  id: string;
  birthDate: string;
  liveBornCount: number;
  stillbornCount: number;
  registeredLambsCount: number | null;
  subsequentDeceasedCount: number;
  requestedChipsCount: number | null;
  daysElapsed: number | null;
}

export interface MonthlySiniigaReconciliation {
  monthKey: string;
  monthLabel: string;
  birthsCount: number;
  liveBornCount: number;
  stillbornCount: number;
  registeredLambsCount: number | null;
  subsequentDeceasedCount: number;
  allowedChipsCount: number;
  serverRequestedChips: number | null;
  effectiveRequestedChips: number | null;
  excessChips: number;
  exceedsAllowed: boolean;
  registeredExceedsAllowed: boolean;
  minDaysElapsed: number | null;
  maxDaysElapsed: number | null;
  inFiveMonthWindow: boolean;
}

export interface SiniigaReconciliationSummary {
  months: MonthlySiniigaReconciliation[];
  totalBirths: number;
  totalLiveBorn: number;
  totalSubsequentDeceased: number;
  totalAllowedChips: number;
  excessMonthsCount: number;
  fiveMonthWindowCount: number;
}

export function getLocalDateKey(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseLocalDateKey(dateKey: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function computeDaysElapsed(
  birthDate?: string,
  referenceDateKey?: string
): number | null {
  if (!birthDate) return null;
  const trimmed = birthDate.trim();
  if (!trimmed) return null;

  const todayMidnight = parseLocalDateKey(
    referenceDateKey ?? getLocalDateKey()
  );

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    const birthMidnight = new Date(year, month, day);
    if (
      birthMidnight.getFullYear() === year &&
      birthMidnight.getMonth() === month &&
      birthMidnight.getDate() === day
    ) {
      const diff = Math.round(
        (todayMidnight.getTime() - birthMidnight.getTime()) / MS_PER_DAY
      );
      return Math.max(0, diff);
    }
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  const parsedMidnight = new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate()
  );
  const diff = Math.round(
    (todayMidnight.getTime() - parsedMidnight.getTime()) / MS_PER_DAY
  );
  return Math.max(0, diff);
}

export function extractYearMonth(birthDate?: string): string | null {
  if (!birthDate) return null;
  const trimmed = birthDate.trim();
  const match = /^(\d{4}-\d{2})/.exec(trimmed);
  if (match) return match[1];

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function formatMonthLabelEs(monthKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return monthKey === 'sin-fecha' ? 'Sin fecha' : monthKey;
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1;
  if (monthIdx < 0 || monthIdx > 11) return monthKey;
  const sampleDate = new Date(year, monthIdx, 15);
  const formatted = new Intl.DateTimeFormat('es-MX', {
    month: 'short',
    year: 'numeric',
  }).format(sampleDate);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function toOptionalNonNegativeInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return null;
  }
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.trunc(n);
}

function firstValidInt(...values: unknown[]): number | null {
  for (const v of values) {
    const parsed = toOptionalNonNegativeInt(v);
    if (parsed !== null) return parsed;
  }
  return null;
}

interface ParsedMonthlyOverride {
  monthKey: string;
  birthsCount: number | null;
  liveBornCount: number | null;
  stillbornCount: number | null;
  registeredLambsCount: number | null;
  subsequentDeceasedCount: number | null;
  requestedChips: number | null;
}

function extractMonthlySummaryOverrides(
  payload: unknown
): Map<string, ParsedMonthlyOverride> {
  const result = new Map<string, ParsedMonthlyOverride>();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return result;
  }
  const root =
    'data' in (payload as Record<string, unknown>) &&
    (payload as Record<string, unknown>).data &&
    typeof (payload as Record<string, unknown>).data === 'object' &&
    !Array.isArray((payload as Record<string, unknown>).data)
      ? ((payload as Record<string, unknown>).data as Record<string, unknown>)
      : (payload as Record<string, unknown>);

  const candidate =
    root.monthlyReconciliation ??
    root.monthly_reconciliation ??
    root.chipsReconciliation ??
    root.chips_reconciliation ??
    root.monthlySummary ??
    root.monthly_summary ??
    root.resumenMensual ??
    root.resumen_mensual;

  if (!Array.isArray(candidate)) return result;

  for (const row of candidate) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const obj = row as Record<string, unknown>;
    const rawMonth =
      typeof obj.month === 'string'
        ? obj.month
        : typeof obj.mes === 'string'
          ? obj.mes
          : typeof obj.monthKey === 'string'
            ? obj.monthKey
            : typeof obj.periodo === 'string'
              ? obj.periodo
              : '';
    const monthKey = extractYearMonth(rawMonth);
    if (!monthKey) continue;

    result.set(monthKey, {
      monthKey,
      birthsCount: firstValidInt(obj.birthsCount, obj.births_count, obj.partos),
      liveBornCount: firstValidInt(
        obj.liveBornCount,
        obj.live_born_count,
        obj.liveBirths,
        obj.live_births,
        obj.nacidosVivos,
        obj.nacidos_vivos
      ),
      stillbornCount: firstValidInt(
        obj.stillbornCount,
        obj.stillborn_count,
        obj.nacidosMuertos,
        obj.nacidos_muertos
      ),
      registeredLambsCount: firstValidInt(
        obj.registeredLambsCount,
        obj.registered_lambs_count,
        obj.criasRegistradas,
        obj.crias_registradas
      ),
      subsequentDeceasedCount: firstValidInt(
        obj.subsequentDeceasedCount,
        obj.subsequent_deceased_count,
        obj.subsequentDeathsCount,
        obj.deceasedLambsCount,
        obj.criasMuertasDespues,
        obj.crias_muertas_despues,
        obj.criasMuertasPosteriores,
        obj.crias_muertas_posteriores,
        obj.criasFallecidasPosteriores,
        obj.crias_fallecidas_posteriores
      ),
      requestedChips: firstValidInt(
        obj.requestedChips,
        obj.requested_chips,
        obj.requestedTags,
        obj.requested_tags,
        obj.requestedEarTags,
        obj.requested_ear_tags,
        obj.aretesSolicitados,
        obj.aretes_solicitados,
        obj.chipsSolicitados,
        obj.chips_solicitados
      ),
    });
  }

  return result;
}

export function buildMonthlySiniigaReconciliation(
  payload: unknown,
  births: BirthReconciliationInput[],
  manualOverridesByMonth: Record<string, number | null> = {},
  referenceDateKey: string = getLocalDateKey()
): SiniigaReconciliationSummary {
  const serverSummaries = extractMonthlySummaryOverrides(payload);

  interface MonthBucket {
    birthsCount: number;
    liveBornCount: number;
    stillbornCount: number;
    registeredSum: number;
    hasRegisteredCount: boolean;
    subsequentDeceasedCount: number;
    requestedSum: number;
    hasPerBirthRequested: boolean;
    minDaysElapsed: number | null;
    maxDaysElapsed: number | null;
  }

  const buckets = new Map<string, MonthBucket>();

  for (const birth of births) {
    const monthKey = extractYearMonth(birth.birthDate) ?? 'sin-fecha';
    const bucket = buckets.get(monthKey) ?? {
      birthsCount: 0,
      liveBornCount: 0,
      stillbornCount: 0,
      registeredSum: 0,
      hasRegisteredCount: false,
      subsequentDeceasedCount: 0,
      requestedSum: 0,
      hasPerBirthRequested: false,
      minDaysElapsed: null,
      maxDaysElapsed: null,
    };

    bucket.birthsCount += 1;
    bucket.liveBornCount += birth.liveBornCount;
    bucket.stillbornCount += birth.stillbornCount;
    if (birth.registeredLambsCount !== null) {
      bucket.registeredSum += birth.registeredLambsCount;
      bucket.hasRegisteredCount = true;
    }
    bucket.subsequentDeceasedCount += birth.subsequentDeceasedCount;
    if (birth.requestedChipsCount !== null) {
      bucket.requestedSum += birth.requestedChipsCount;
      bucket.hasPerBirthRequested = true;
    }

    const elapsed =
      birth.daysElapsed ??
      computeDaysElapsed(birth.birthDate, referenceDateKey);
    if (elapsed !== null) {
      bucket.minDaysElapsed =
        bucket.minDaysElapsed === null
          ? elapsed
          : Math.min(bucket.minDaysElapsed, elapsed);
      bucket.maxDaysElapsed =
        bucket.maxDaysElapsed === null
          ? elapsed
          : Math.max(bucket.maxDaysElapsed, elapsed);
    }

    buckets.set(monthKey, bucket);
  }

  const allMonthKeys = new Set<string>([
    ...buckets.keys(),
    ...serverSummaries.keys(),
  ]);

  const months: MonthlySiniigaReconciliation[] = [];

  for (const monthKey of allMonthKeys) {
    const bucket = buckets.get(monthKey);
    const summaryRow = serverSummaries.get(monthKey);

    const birthsCount = bucket?.birthsCount ?? summaryRow?.birthsCount ?? 0;
    const liveBornCount = bucket
      ? bucket.liveBornCount
      : (summaryRow?.liveBornCount ?? 0);
    const stillbornCount = bucket
      ? bucket.stillbornCount
      : (summaryRow?.stillbornCount ?? 0);
    const registeredLambsCount = bucket?.hasRegisteredCount
      ? bucket.registeredSum
      : (summaryRow?.registeredLambsCount ?? null);

    // Use birth-derived deceased count when > 0, or explicit monthly override when birth rows omitted it
    const subsequentDeceasedCount =
      bucket && bucket.subsequentDeceasedCount > 0
        ? bucket.subsequentDeceasedCount
        : (summaryRow?.subsequentDeceasedCount ??
          bucket?.subsequentDeceasedCount ??
          0);

    const allowedChipsCount = Math.max(
      0,
      liveBornCount - subsequentDeceasedCount
    );

    const serverRequestedChips =
      summaryRow?.requestedChips ??
      (bucket?.hasPerBirthRequested ? bucket.requestedSum : null);

    const hasManualOverride = Object.prototype.hasOwnProperty.call(
      manualOverridesByMonth,
      monthKey
    );
    const effectiveRequestedChips = hasManualOverride
      ? manualOverridesByMonth[monthKey]
      : serverRequestedChips;

    const excessChips =
      effectiveRequestedChips !== null
        ? Math.max(0, effectiveRequestedChips - allowedChipsCount)
        : 0;
    const exceedsAllowed =
      effectiveRequestedChips !== null &&
      effectiveRequestedChips > allowedChipsCount;

    const registeredExceedsAllowed =
      registeredLambsCount !== null && registeredLambsCount > allowedChipsCount;

    let minDaysElapsed = bucket?.minDaysElapsed ?? null;
    let maxDaysElapsed = bucket?.maxDaysElapsed ?? null;
    if (
      minDaysElapsed === null &&
      maxDaysElapsed === null &&
      /^\d{4}-\d{2}$/.test(monthKey)
    ) {
      const approxDays = computeDaysElapsed(`${monthKey}-01`, referenceDateKey);
      minDaysElapsed = approxDays;
      maxDaysElapsed = approxDays;
    }

    const inFiveMonthWindow =
      maxDaysElapsed !== null && maxDaysElapsed >= FIVE_MONTH_WINDOW_DAYS;

    months.push({
      monthKey,
      monthLabel: formatMonthLabelEs(monthKey),
      birthsCount,
      liveBornCount,
      stillbornCount,
      registeredLambsCount,
      subsequentDeceasedCount,
      allowedChipsCount,
      serverRequestedChips,
      effectiveRequestedChips,
      excessChips,
      exceedsAllowed,
      registeredExceedsAllowed,
      minDaysElapsed,
      maxDaysElapsed,
      inFiveMonthWindow,
    });
  }

  months.sort((a, b) => {
    if (a.monthKey === 'sin-fecha') return 1;
    if (b.monthKey === 'sin-fecha') return -1;
    return b.monthKey.localeCompare(a.monthKey);
  });

  return {
    months,
    totalBirths: months.reduce((sum, m) => sum + m.birthsCount, 0),
    totalLiveBorn: months.reduce((sum, m) => sum + m.liveBornCount, 0),
    totalSubsequentDeceased: months.reduce(
      (sum, m) => sum + m.subsequentDeceasedCount,
      0
    ),
    totalAllowedChips: months.reduce((sum, m) => sum + m.allowedChipsCount, 0),
    excessMonthsCount: months.filter((m) => m.exceedsAllowed).length,
    fiveMonthWindowCount: months.filter((m) => m.inFiveMonthWindow).length,
  };
}
