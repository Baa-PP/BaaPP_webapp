export interface SeasonReproductionMetric {
  seasonKey: string;
  seasonLabel: string;
  exposedFemales: number;
  diagnosed: number;
  pregnant: number;
  pregnancyPct: number | null;
  births: number;
  birthsPerPregnantPct: number | null;
  birthsPerExposedPct: number | null;
  offspringBorn: number;
  prolificity: number | null;
}

export interface ReproductiveOverview {
  seasons: SeasonReproductionMetric[];
  totalExposed: number;
  totalDiagnosed: number;
  totalPregnant: number;
  totalBirths: number;
  totalOffspringBorn: number;
  overallPregnancyPct: number | null;
  overallBirthsPerPregnantPct: number | null;
  overallBirthsPerExposedPct: number | null;
  overallProlificity: number | null;
}

function toNonEmptyString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return undefined;
}

function toOptionalFiniteNumber(...values: unknown[]): number | null {
  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toNonNegativeCount(...values: unknown[]): number {
  const n = toOptionalFiniteNumber(...values);
  if (n === null || n < 0) return 0;
  return Math.trunc(n);
}

function roundTo(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}

export function formatSeasonLabel(rawSeason: string, index: number): string {
  const trimmed = rawSeason.trim();
  if (!trimmed) return `Temporada ${index + 1}`;

  const dateMatch = /^(\d{4})-(\d{2})(?:-\d{2})?/.exec(trimmed);
  if (dateMatch) {
    const year = dateMatch[1];
    const month = Number(dateMatch[2]);
    if (month >= 1 && month <= 12) {
      const quarter = Math.floor((month - 1) / 3) + 1;
      return `${year} T${quarter}`;
    }
  }

  const quarterMatch = /^(\d{4})[-/\s]?[QT]([1-4])$/i.exec(trimmed);
  if (quarterMatch) {
    return `${quarterMatch[1]} T${quarterMatch[2]}`;
  }

  return trimmed;
}

function averageNonNull(values: Array<number | null>, decimals: number): number | null {
  const valid = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (valid.length === 0) return null;
  const total = valid.reduce((sum, v) => sum + v, 0);
  return roundTo(total / valid.length, decimals);
}

export function normalizeSeasonIndicator(
  raw: unknown,
  index: number
): SeasonReproductionMetric | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const rawSeason =
    toNonEmptyString(
      obj.season,
      obj.temporada,
      obj.period,
      obj.quarter,
      obj.label
    ) ?? `season-${String(index + 1).padStart(2, '0')}`;

  const exposedFemales = toNonNegativeCount(
    obj.exposedFemales,
    obj.exposed_females,
    obj.exposed,
    obj.expuestas
  );
  const diagnosed = toNonNegativeCount(obj.diagnosed, obj.diagnosticadas);
  const pregnant = toNonNegativeCount(obj.pregnant, obj.prenadas);
  const births = toNonNegativeCount(obj.births, obj.partos);
  const offspringBorn = toNonNegativeCount(
    obj.offspringBorn,
    obj.offspring_born,
    obj.crias_nacidas,
    obj.criasNacidas
  );

  const explicitPregnancyPct = toOptionalFiniteNumber(
    obj.pregnancyPct,
    obj.pct_prenez,
    obj.pregnancy_pct,
    obj.pregnancyRate
  );
  const pregnancyPct =
    explicitPregnancyPct !== null
      ? roundTo(explicitPregnancyPct, 1)
      : diagnosed > 0
        ? roundTo((pregnant / diagnosed) * 100, 1)
        : exposedFemales > 0
          ? roundTo((pregnant / exposedFemales) * 100, 1)
          : null;

  const explicitBirthsPerPregnantPct = toOptionalFiniteNumber(
    obj.birthsPerPregnantPct,
    obj.birthsOverPregnantPct,
    obj.births_per_pregnant_pct,
    obj.pct_partos_prenadas,
    obj.pctPartosPrenadas
  );
  const birthsPerPregnantPct =
    explicitBirthsPerPregnantPct !== null
      ? roundTo(explicitBirthsPerPregnantPct, 1)
      : pregnant > 0
        ? roundTo((births / pregnant) * 100, 1)
        : null;

  // V4__vistas.sql defines pct_parto as 100.0 * COUNT(b.id) / COUNT(*) (partos / expuestas)
  const explicitBirthsPerExposedPct = toOptionalFiniteNumber(
    obj.birthsPerExposedPct,
    obj.birthsOverExposedPct,
    obj.births_per_exposed_pct,
    obj.pct_partos_expuestas,
    obj.pctPartosExpuestas,
    obj.birthPct,
    obj.pct_parto,
    obj.birthRate
  );
  const birthsPerExposedPct =
    explicitBirthsPerExposedPct !== null
      ? roundTo(explicitBirthsPerExposedPct, 1)
      : exposedFemales > 0
        ? roundTo((births / exposedFemales) * 100, 1)
        : null;

  const explicitProlificity = toOptionalFiniteNumber(
    obj.prolificity,
    obj.prolificidad,
    obj.crias_por_parto,
    obj.criasPorParto,
    obj.lambsPerBirth
  );
  const prolificity =
    explicitProlificity !== null
      ? roundTo(explicitProlificity, 2)
      : births > 0
        ? roundTo(offspringBorn / births, 2)
        : null;

  return {
    seasonKey: rawSeason,
    seasonLabel: formatSeasonLabel(rawSeason, index),
    exposedFemales,
    diagnosed,
    pregnant,
    pregnancyPct,
    births,
    birthsPerPregnantPct,
    birthsPerExposedPct,
    offspringBorn,
    prolificity,
  };
}

export function normalizeReproductiveOverview(
  payload: unknown
): ReproductiveOverview {
  const root =
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    'data' in (payload as Record<string, unknown>) &&
    (payload as Record<string, unknown>).data &&
    typeof (payload as Record<string, unknown>).data === 'object'
      ? (payload as Record<string, unknown>).data
      : payload;

  let rawSeasons: unknown[] = [];
  if (Array.isArray(root)) {
    rawSeasons = root;
  } else if (root && typeof root === 'object') {
    const obj = root as Record<string, unknown>;
    const candidate =
      obj.seasons ??
      obj.reproductionSeasons ??
      obj.reproductiveSeasons ??
      obj.temporadas ??
      obj.items;
    if (Array.isArray(candidate)) {
      rawSeasons = candidate;
    }
  }

  const seasons = rawSeasons
    .map((item, idx) => normalizeSeasonIndicator(item, idx))
    .filter((item): item is SeasonReproductionMetric => item !== null)
    .sort((a, b) => a.seasonKey.localeCompare(b.seasonKey));

  const totalExposed = seasons.reduce((acc, s) => acc + s.exposedFemales, 0);
  const totalDiagnosed = seasons.reduce((acc, s) => acc + s.diagnosed, 0);
  const totalPregnant = seasons.reduce((acc, s) => acc + s.pregnant, 0);
  const totalBirths = seasons.reduce((acc, s) => acc + s.births, 0);
  const totalOffspringBorn = seasons.reduce((acc, s) => acc + s.offspringBorn, 0);

  const overallPregnancyPct =
    totalDiagnosed > 0
      ? roundTo((totalPregnant / totalDiagnosed) * 100, 1)
      : totalExposed > 0
        ? roundTo((totalPregnant / totalExposed) * 100, 1)
        : averageNonNull(
            seasons.map((s) => s.pregnancyPct),
            1
          );

  const overallBirthsPerPregnantPct =
    totalPregnant > 0
      ? roundTo((totalBirths / totalPregnant) * 100, 1)
      : averageNonNull(
          seasons.map((s) => s.birthsPerPregnantPct),
          1
        );

  const overallBirthsPerExposedPct =
    totalExposed > 0
      ? roundTo((totalBirths / totalExposed) * 100, 1)
      : averageNonNull(
          seasons.map((s) => s.birthsPerExposedPct),
          1
        );

  const overallProlificity =
    totalBirths > 0
      ? roundTo(totalOffspringBorn / totalBirths, 2)
      : averageNonNull(
          seasons.map((s) => s.prolificity),
          2
        );

  return {
    seasons,
    totalExposed,
    totalDiagnosed,
    totalPregnant,
    totalBirths,
    totalOffspringBorn,
    overallPregnancyPct,
    overallBirthsPerPregnantPct,
    overallBirthsPerExposedPct,
    overallProlificity,
  };
}
