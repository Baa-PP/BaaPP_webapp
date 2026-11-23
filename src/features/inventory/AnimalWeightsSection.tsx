import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import type { AnimalDetail, AnimalWeight } from './AnimalCertificate';
import { formatDate } from './AnimalCertificate';
import { GdpWeightsChart, type GdpChartPoint } from './GdpWeightsChart';

const MILESTONES = ['BIRTH', 'WEANING', 'DAY_120', 'DAY_150', 'EVALUATION'] as const;

const MILESTONE_LABELS: Record<string, string> = {
  BIRTH: 'Nacimiento',
  WEANING: 'Destete',
  DAY_120: '120 días',
  DAY_150: '150 días',
  EVALUATION: 'Evaluación',
};

function milestoneLabel(code?: string | null): string {
  if (!code) return '—';
  const upper = code.toUpperCase();
  return MILESTONE_LABELS[upper] || upper.replace(/_/g, ' ').toLowerCase();
}

export interface WeightHistoryRow {
  id: string;
  milestone: string;
  date?: string;
  ageDays: number | null;
  weightKg: number;
  previousWeightKg: number | null;
  daysSincePrevious: number | null;
  gainKg: number | null;
  dailyGainKg: number | null;
  dailyGainGrams: number | null;
  scrotalCircumferenceCm: number | null;
}

export interface NormalizedWeightHistory {
  latestWeightKg: number | null;
  overallDailyGainKg: number | null;
  overallDailyGainGrams: number | null;
  rows: WeightHistoryRow[];
}

function toFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

function parseDateMs(value?: string): number {
  if (!value) return NaN;
  const parsed = new Date(value + (value.length === 10 ? 'T00:00:00' : ''));
  return parsed.getTime();
}

function daysBetween(startDate?: string, endDate?: string): number | null {
  const start = parseDateMs(startDate);
  const end = parseDateMs(endDate);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / 86400000);
}

function compareWeightsChronologically(
  a: { date?: string; id?: string },
  b: { date?: string; id?: string }
): number {
  const ta = parseDateMs(a.date);
  const tb = parseDateMs(b.date);
  const aDated = Number.isFinite(ta);
  const bDated = Number.isFinite(tb);
  if (aDated !== bDated) {
    return aDated ? -1 : 1;
  }
  if (aDated && bDated && ta !== tb) {
    return ta - tb;
  }
  return (a.id ?? '').localeCompare(b.id ?? '');
}

function buildFallbackHistory(
  weights: AnimalWeight[],
  birthDate?: string
): NormalizedWeightHistory {
  const sorted = [...weights].sort(compareWeightsChronologically);

  const rows: WeightHistoryRow[] = sorted.map((w, idx) => {
    const prev = idx > 0 ? sorted[idx - 1] : null;
    const daysPrev = prev ? daysBetween(prev.date, w.date) : null;
    const gainKg = prev ? w.weightKg - prev.weightKg : null;
    const dailyGainKg =
      gainKg !== null && daysPrev !== null && daysPrev > 0 ? gainKg / daysPrev : null;
    const dailyGainGrams =
      dailyGainKg !== null ? Math.round(dailyGainKg * 1000) : null;
    const ageDays = birthDate ? daysBetween(birthDate, w.date) : null;

    return {
      id: w.id || `${w.milestone}-${w.date ?? 'nodate'}-${idx}`,
      milestone: w.milestone,
      date: w.date,
      ageDays: ageDays !== null && ageDays >= 0 ? ageDays : null,
      weightKg: w.weightKg,
      previousWeightKg: prev ? prev.weightKg : null,
      daysSincePrevious: daysPrev,
      gainKg,
      dailyGainKg,
      dailyGainGrams,
      scrotalCircumferenceCm: w.scrotalCircumferenceCm ?? null,
    };
  });

  const first = rows[0] ?? null;
  const last = rows.length > 0 ? rows[rows.length - 1] : null;
  const totalDays = first && last ? daysBetween(first.date, last.date) : null;
  const overallDailyGainKg =
    first && last && totalDays !== null && totalDays > 0
      ? (last.weightKg - first.weightKg) / totalDays
      : null;

  return {
    latestWeightKg: last ? last.weightKg : null,
    overallDailyGainKg,
    overallDailyGainGrams:
      overallDailyGainKg !== null ? Math.round(overallDailyGainKg * 1000) : null,
    rows,
  };
}

function normalizeBe009History(
  raw: unknown,
  detailWeights: AnimalWeight[],
  birthDate?: string
): NormalizedWeightHistory {
  const unwrapped =
    raw && typeof raw === 'object' && 'data' in (raw as Record<string, unknown>)
      ? (raw as Record<string, unknown>).data
      : raw;
  const obj = (unwrapped && typeof unwrapped === 'object'
    ? unwrapped
    : {}) as Record<string, unknown>;

  const rawList = Array.isArray(obj.weights)
    ? obj.weights
    : Array.isArray(unwrapped)
      ? unwrapped
      : [];

  // Index scrotalCircumferenceCm from BE-005 detail weights (by id, fallback milestone+date)
  const scrotalById = new Map<string, number>();
  const scrotalByKey = new Map<string, number>();
  detailWeights.forEach((w) => {
    if (w.scrotalCircumferenceCm !== null && w.scrotalCircumferenceCm !== undefined) {
      if (w.id) scrotalById.set(w.id, w.scrotalCircumferenceCm);
      if (w.date) scrotalByKey.set(`${w.milestone}|${w.date}`, w.scrotalCircumferenceCm);
    }
  });

  // Preserve the exact array order returned by BE-009 (sorted chronologically by date + UUID.compareTo on server)
  const parsedRows: WeightHistoryRow[] = rawList
    .map((item, idx): WeightHistoryRow | null => {
      if (!item || typeof item !== 'object') return null;
      const m = item as Record<string, unknown>;
      const weightKg = toFiniteNumber(m.weightKg ?? m.weight_kg ?? m.peso_kg);
      if (weightKg === null || weightKg <= 0) return null;

      const id = String(m.id ?? m.weightId ?? m.weight_id ?? `row-${idx}`).trim();
      const milestone = String(m.milestone ?? m.hito ?? '').trim().toUpperCase();
      const date =
        typeof (m.date ?? m.measured_at ?? m.fecha) === 'string'
          ? String(m.date ?? m.measured_at ?? m.fecha)
          : undefined;
      const rawDailyKg = toFiniteNumber(m.dailyGainKg ?? m.daily_gain_kg);
      const rawDailyGrams = toFiniteNumber(m.dailyGainGrams ?? m.daily_gain_grams);
      const dailyGainKg =
        rawDailyKg ?? (rawDailyGrams !== null ? rawDailyGrams / 1000 : null);
      const dailyGainGrams =
        rawDailyGrams !== null
          ? Math.round(rawDailyGrams)
          : dailyGainKg !== null
            ? Math.round(dailyGainKg * 1000)
            : null;
      const rawScrotal = toFiniteNumber(
        m.scrotalCircumferenceCm ??
          m.scrotal_circumference_cm ??
          m.circunferencia_escrotal_cm
      );
      const scrotalCircumferenceCm =
        (rawScrotal !== null && rawScrotal > 0 ? rawScrotal : null) ??
        scrotalById.get(id) ??
        (date ? scrotalByKey.get(`${milestone}|${date}`) ?? null : null);

      return {
        id,
        milestone,
        date,
        ageDays: toFiniteNumber(m.ageDays ?? m.age_days ?? m.edad_dias),
        weightKg,
        previousWeightKg: toFiniteNumber(m.previousWeightKg ?? m.previous_weight_kg),
        daysSincePrevious: toFiniteNumber(m.daysSincePrevious ?? m.days_since_previous),
        gainKg: toFiniteNumber(m.gainKg ?? m.gain_kg),
        dailyGainKg,
        dailyGainGrams,
        scrotalCircumferenceCm,
      };
    })
    .filter((row): row is WeightHistoryRow => row !== null);

  // Only backfill missing interval fields when the server did not return them at all
  const rows: WeightHistoryRow[] = parsedRows.map((row, idx) => {
    const prev = idx > 0 ? parsedRows[idx - 1] : null;
    const previousWeightKg = row.previousWeightKg ?? (prev ? prev.weightKg : null);
    const daysSincePrevious =
      row.daysSincePrevious ?? (prev ? daysBetween(prev.date, row.date) : null);
    const gainKg =
      row.gainKg ?? (previousWeightKg !== null ? row.weightKg - previousWeightKg : null);
    const derivedDailyGainKg =
      gainKg !== null && daysSincePrevious !== null && daysSincePrevious > 0
        ? gainKg / daysSincePrevious
        : null;
    const dailyGainKg = row.dailyGainKg ?? derivedDailyGainKg;
    const dailyGainGrams =
      row.dailyGainGrams ??
      (dailyGainKg !== null ? Math.round(dailyGainKg * 1000) : null);
    const derivedAge = birthDate ? daysBetween(birthDate, row.date) : null;
    const ageDays =
      row.ageDays ?? (derivedAge !== null && derivedAge >= 0 ? derivedAge : null);

    return {
      ...row,
      ageDays,
      previousWeightKg,
      daysSincePrevious,
      gainKg,
      dailyGainKg,
      dailyGainGrams,
    };
  });

  const first = rows[0] ?? null;
  const last = rows.length > 0 ? rows[rows.length - 1] : null;
  const totalDays = first && last ? daysBetween(first.date, last.date) : null;
  const derivedOverallDailyGainKg =
    first && last && totalDays !== null && totalDays > 0
      ? (last.weightKg - first.weightKg) / totalDays
      : null;

  const rawOverallKg = toFiniteNumber(
    obj.overallDailyGainKg ?? obj.overall_daily_gain_kg
  );
  const rawOverallGrams = toFiniteNumber(
    obj.overallDailyGainGrams ?? obj.overall_daily_gain_grams
  );
  const overallDailyGainKg =
    rawOverallKg ??
    (rawOverallGrams !== null ? rawOverallGrams / 1000 : derivedOverallDailyGainKg);

  return {
    latestWeightKg:
      toFiniteNumber(obj.latestWeightKg ?? obj.latest_weight_kg) ??
      (last ? last.weightKg : null),
    overallDailyGainKg,
    overallDailyGainGrams:
      rawOverallGrams !== null
        ? Math.round(rawOverallGrams)
        : overallDailyGainKg !== null
          ? Math.round(overallDailyGainKg * 1000)
          : null,
    rows,
  };
}

interface AnimalWeightsSectionProps {
  animal: AnimalDetail;
  activeRanchId: string | null;
}

export function AnimalWeightsSection({
  animal,
  activeRanchId,
}: AnimalWeightsSectionProps) {
  const isMale = animal.sex === 'MALE';
  const accentColor =
    animal.sex === 'FEMALE'
      ? '#BE185D'
      : animal.sex === 'MALE'
        ? '#1D4ED8'
        : '#1B4332';

  const weightsQuery = useQuery({
    queryKey: ['animal-weights', activeRanchId, animal.id] as const,
    queryFn: async ({ queryKey, signal }) => {
      const ranchId = queryKey[1];
      const animalId = queryKey[2];
      return apiFetch<unknown>(
        `/animals/${encodeURIComponent(animalId)}/weights`,
        { ranchId: ranchId ?? undefined, signal }
      );
    },
    enabled: Boolean(animal.id && activeRanchId),
  });

  const history: NormalizedWeightHistory = useMemo(
    () =>
      weightsQuery.data
        ? normalizeBe009History(weightsQuery.data, animal.weights, animal.birthDate)
        : buildFallbackHistory(animal.weights, animal.birthDate),
    [weightsQuery.data, animal.weights, animal.birthDate]
  );

  const rows = history.rows;

  // Latest recorded scrotal circumference (ONLY used when animal.sex === 'MALE')
  const latestScrotalRow = useMemo(
    () =>
      isMale
        ? [...rows].reverse().find((r) => r.scrotalCircumferenceCm !== null)
        : undefined,
    [isMale, rows]
  );

  const chartPoints: GdpChartPoint[] = useMemo(
    () =>
      rows.map((r) => ({
        label: milestoneLabel(r.milestone),
        dateLabel: formatDate(r.date),
        weightKg: r.weightKg,
        dailyGainGrams: r.dailyGainGrams,
        dailyGainKg: r.dailyGainKg,
        gainKg: r.gainKg,
        daysSincePrevious: r.daysSincePrevious,
      })),
    [rows]
  );

  const hasGdp = rows.some((r) => r.dailyGainGrams !== null);

  return (
    <>
      <section className="cert-section" aria-labelledby="weights-milestones-heading">
        <div className="section-title">
          <div>
            <h2 id="weights-milestones-heading">Historial de pesajes</h2>
            <small>
              Control de crecimiento por hito (Nacimiento, Destete, 120d, 150d y Evaluación)
            </small>
          </div>
          <small>
            {weightsQuery.isFetching ? 'Actualizando pesajes…' : 'PESO · KG'}
          </small>
        </div>

        {weightsQuery.isError && (
          <div className="weights-sync-error" role="alert">
            <span>
              No se pudo consultar el cálculo detallado de GDP desde el servidor
              {weightsQuery.error instanceof Error
                ? `: ${weightsQuery.error.message}`
                : '.'}
              {animal.weights.length > 0
                ? ' Se muestran los pesajes incluidos en la ficha.'
                : ''}
            </span>
            <button
              type="button"
              className="link-button"
              disabled={weightsQuery.isFetching}
              onClick={() => {
                void weightsQuery.refetch();
              }}
            >
              Reintentar
            </button>
          </div>
        )}

        <div className="weight-kpis">
          <div className="weight-kpi">
            <small>Último peso registrado</small>
            <b>
              {history.latestWeightKg !== null
                ? `${history.latestWeightKg.toFixed(2)} kg`
                : 'Sin registro'}
            </b>
          </div>
          <div className="weight-kpi">
            <small>GDP acumulada (global)</small>
            <b>
              {history.overallDailyGainGrams !== null
                ? `${history.overallDailyGainGrams} g/día`
                : '—'}
            </b>
            {history.overallDailyGainKg !== null && (
              <span>{history.overallDailyGainKg.toFixed(3)} kg/día</span>
            )}
          </div>
          {isMale && (
            <div className="weight-kpi weight-kpi-scrotal">
              <small>
                <span aria-hidden="true">♂</span> Circunferencia escrotal
              </small>
              <b>
                {latestScrotalRow?.scrotalCircumferenceCm != null
                  ? `${latestScrotalRow.scrotalCircumferenceCm.toFixed(1)} cm`
                  : 'Sin registro'}
              </b>
              {latestScrotalRow?.date && (
                <span>
                  {milestoneLabel(latestScrotalRow.milestone)} ·{' '}
                  {formatDate(latestScrotalRow.date)}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="weights">
          {MILESTONES.map((code) => {
            const match = [...rows].reverse().find((r) => r.milestone === code);
            return (
              <div key={code}>
                <small>{milestoneLabel(code)}</small>
                <b>{match ? `${match.weightKg.toFixed(1)} kg` : '—'}</b>
                <small>
                  {match
                    ? `${formatDate(match.date)}${match.ageDays !== null ? ` · ${match.ageDays} d` : ''}`
                    : 'Sin registro'}
                </small>
              </div>
            );
          })}
        </div>
      </section>

      <section className="cert-section" aria-labelledby="gdp-section-heading">
        <div className="section-title">
          <div>
            <h2 id="gdp-section-heading">Ganancia diaria de peso (GDP)</h2>
            <small>
              Evolución de peso (kg) y ganancia diaria por intervalo (g/día)
            </small>
          </div>
          <small>
            {rows.length} {rows.length === 1 ? 'pesaje' : 'pesajes'}
          </small>
        </div>

        {rows.length === 0 ? (
          <p className="muted">
            Aún no hay pesajes registrados para este ejemplar.
          </p>
        ) : (
          <>
            <GdpWeightsChart points={chartPoints} accentColor={accentColor} />
            {!hasGdp && (
              <p className="muted gdp-hint">
                Se requieren al menos dos pesajes en fechas distintas para calcular la GDP entre intervalos.
              </p>
            )}

            <div className="weights-table-wrap">
              <table className="weights-table" aria-label="Historial de pesajes y ganancia diaria de peso">
                <thead>
                  <tr>
                    <th scope="col">Hito</th>
                    <th scope="col">Fecha</th>
                    <th scope="col">Edad</th>
                    <th scope="col">Peso</th>
                    <th scope="col">Ganancia / Intervalo</th>
                    <th scope="col">GDP</th>
                    {isMale && <th scope="col">Circ. escrotal</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{milestoneLabel(row.milestone)}</strong>
                      </td>
                      <td>{formatDate(row.date)}</td>
                      <td>{row.ageDays !== null ? `${row.ageDays} días` : '—'}</td>
                      <td>
                        <b>{row.weightKg.toFixed(2)} kg</b>
                      </td>
                      <td>
                        {row.gainKg !== null && row.daysSincePrevious !== null
                          ? `${row.gainKg >= 0 ? '+' : ''}${row.gainKg.toFixed(2)} kg / ${row.daysSincePrevious} d`
                          : 'Referencia inicial'}
                      </td>
                      <td>
                        {row.dailyGainGrams !== null ? (
                          <span className="gdp-cell">
                            <b>{row.dailyGainGrams} g/día</b>
                            {row.dailyGainKg !== null && (
                              <small>{row.dailyGainKg.toFixed(3)} kg/día</small>
                            )}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      {isMale && (
                        <td>
                          {row.scrotalCircumferenceCm !== null
                            ? `${row.scrotalCircumferenceCm.toFixed(1)} cm`
                            : '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </>
  );
}
