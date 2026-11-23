export interface SeasonReproductionMetric {
  seasonKey: string;
  seasonLabel: string;
  exposedFemales: number | null;
  diagnosed: number | null;
  pregnant: number | null;
  pregnancyPct: number | null;
  births: number | null;
  birthsPerPregnantPct: number | null;
  birthsPerExposedPct: number | null;
  offspringBorn: number | null;
  prolificity: number | null;
}

export interface RatioAggregate {
  numerator: number;
  denominator: number;
  denominatorLabel: string;
}

export interface ReproductiveOverview {
  seasons: SeasonReproductionMetric[];
  overallPregnancyPct: number | null;
  pregnancyRatio: RatioAggregate | null;
  overallBirthsPerPregnantPct: number | null;
  birthsPerPregnantRatio: RatioAggregate | null;
  overallBirthsPerExposedPct: number | null;
  birthsPerExposedRatio: RatioAggregate | null;
  overallProlificity: number | null;
  prolificityRatio: RatioAggregate | null;
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

function toOptionalNonNegativeCount(...values: unknown[]): number | null {
  const n = toOptionalFiniteNumber(...values);
  if (n === null || n < 0) return null;
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

  const exposedFemales = toOptionalNonNegativeCount(
    obj.exposedFemales,
    obj.exposed_females,
    obj.exposed,
    obj.expuestas
  );
  const diagnosed = toOptionalNonNegativeCount(obj.diagnosed, obj.diagnosticadas);
  const pregnant = toOptionalNonNegativeCount(obj.pregnant, obj.prenadas);
  const births = toOptionalNonNegativeCount(obj.births, obj.partos);
  const offspringBorn = toOptionalNonNegativeCount(
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
      : pregnant !== null && diagnosed !== null && diagnosed > 0
        ? roundTo((pregnant / diagnosed) * 100, 1)
        : pregnant !== null && exposedFemales !== null && exposedFemales > 0
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
      : births !== null && pregnant !== null && pregnant > 0
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
      : births !== null && exposedFemales !== null && exposedFemales > 0
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
      : offspringBorn !== null && births !== null && births > 0
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

function aggregateMatchedRatio(
  seasons: SeasonReproductionMetric[],
  getNumerator: (s: SeasonReproductionMetric) => number | null,
  getDenominator: (s: SeasonReproductionMetric) => number | null,
  getFallbackRate: (s: SeasonReproductionMetric) => number | null,
  denominatorLabel: string,
  scale: number,
  decimals: number
): { value: number | null; ratio: RatioAggregate | null } {
  const matched = seasons.filter((s) => {
    const num = getNumerator(s);
    const den = getDenominator(s);
    return num !== null && den !== null && den > 0;
  });
  if (matched.length > 0) {
    const numerator = matched.reduce(
      (acc, s) => acc + (getNumerator(s) ?? 0),
      0
    );
    const denominator = matched.reduce(
      (acc, s) => acc + (getDenominator(s) ?? 0),
      0
    );
    return {
      value: roundTo((numerator / denominator) * scale, decimals),
      ratio: { numerator, denominator, denominatorLabel },
    };
  }
  return {
    value: averageNonNull(seasons.map(getFallbackRate), decimals),
    ratio: null,
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

  // Use diagnosed coverage when all pregnancy-reporting seasons have diagnosed > 0;
  // if diagnosed coverage is incomplete across seasons, prefer consistent exposed-female
  // coverage when complete, otherwise sum only seasons with diagnosed > 0.
  const hasDiagnosedCoverage = seasons.some(
    (s) => s.pregnant !== null && s.diagnosed !== null && s.diagnosed > 0
  );
  const hasIncompleteDiagnosed = seasons.some(
    (s) => s.pregnant !== null && (s.diagnosed === null || s.diagnosed === 0)
  );
  const hasCompleteExposed =
    seasons.some(
      (s) =>
        s.pregnant !== null && s.exposedFemales !== null && s.exposedFemales > 0
    ) &&
    !seasons.some(
      (s) =>
        s.pregnant !== null &&
        (s.exposedFemales === null || s.exposedFemales === 0)
    );

  const pregnancyAgg =
    hasDiagnosedCoverage && (!hasIncompleteDiagnosed || !hasCompleteExposed)
      ? aggregateMatchedRatio(
          seasons,
          (s) => s.pregnant,
          (s) => s.diagnosed,
          (s) => s.pregnancyPct,
          'diagn.',
          100,
          1
        )
      : aggregateMatchedRatio(
          seasons,
          (s) => s.pregnant,
          (s) => s.exposedFemales,
          (s) => s.pregnancyPct,
          'expuestas',
          100,
          1
        );

  const birthsPerPregnantAgg = aggregateMatchedRatio(
    seasons,
    (s) => s.births,
    (s) => s.pregnant,
    (s) => s.birthsPerPregnantPct,
    'preñadas',
    100,
    1
  );

  const birthsPerExposedAgg = aggregateMatchedRatio(
    seasons,
    (s) => s.births,
    (s) => s.exposedFemales,
    (s) => s.birthsPerExposedPct,
    'expuestas',
    100,
    1
  );

  const prolificityAgg = aggregateMatchedRatio(
    seasons,
    (s) => s.offspringBorn,
    (s) => s.births,
    (s) => s.prolificity,
    'partos',
    1,
    2
  );

  return {
    seasons,
    overallPregnancyPct: pregnancyAgg.value,
    pregnancyRatio: pregnancyAgg.ratio,
    overallBirthsPerPregnantPct: birthsPerPregnantAgg.value,
    birthsPerPregnantRatio: birthsPerPregnantAgg.ratio,
    overallBirthsPerExposedPct: birthsPerExposedAgg.value,
    birthsPerExposedRatio: birthsPerExposedAgg.ratio,
    overallProlificity: prolificityAgg.value,
    prolificityRatio: prolificityAgg.ratio,
  };
}
