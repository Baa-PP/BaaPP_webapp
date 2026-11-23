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

export type SuggestedDestination = 'CULL' | 'SELL' | 'BREEDING';

export interface UnproductiveFemaleAlert {
  key: string;
  animalId: string | null;
  folioInterno: string;
  ageDays: number | null;
  breedings: number | null;
  diagnosed: number | null;
  pregnantCount: number | null;
  pregnancyPct: number | null;
  births: number | null;
  offspringBorn: number | null;
  offspringDead: number | null;
  mortalityPct: number | null;
  lastBirthDate: string | null;
  daysSinceLastBirth: number | null;
  pregnant: boolean | null;
  unproductive: boolean;
  suggestion: SuggestedDestination | null;
  consecutiveLambDeaths: number | null;
  hasConsecutiveMortality: boolean;
  hasHighMortality: boolean;
  hasProlongedInfertility: boolean;
  alertReason: string | null;
  isAlertCandidate: boolean;
}

export interface UnproductiveFemalesSummary {
  items: UnproductiveFemaleAlert[];
  alertItems: UnproductiveFemaleAlert[];
  cullCount: number;
  sellCount: number;
  breedingCount: number;
  mortalityAlertCount: number;
  consecutiveMortalityCount: number;
  infertilityAlertCount: number;
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
  unproductive: UnproductiveFemalesSummary;
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
    if (v === null || v === undefined || v === '' || typeof v === 'boolean') {
      continue;
    }
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toOptionalBoolean(...values: unknown[]): boolean | null {
  for (const v of values) {
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') {
      if (v === 1) return true;
      if (v === 0) return false;
    }
    if (typeof v === 'string') {
      const normalized = v.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1' || normalized === 'si' || normalized === 'sí') {
        return true;
      }
      if (normalized === 'false' || normalized === '0' || normalized === 'no') {
        return false;
      }
    }
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

function unwrapAnalyticsRoot(payload: unknown): unknown {
  if (
    payload &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    'data' in (payload as Record<string, unknown>) &&
    (payload as Record<string, unknown>).data &&
    typeof (payload as Record<string, unknown>).data === 'object'
  ) {
    return (payload as Record<string, unknown>).data;
  }
  return payload;
}

export function normalizeSuggestedDestination(
  ...values: unknown[]
): SuggestedDestination | null {
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const upper = v.trim().toUpperCase();
    if (!upper) continue;
    if (
      upper === 'CULL' ||
      upper === 'DESECHO' ||
      upper === 'RASTRO' ||
      upper === 'DESECHO_RASTRO' ||
      upper === 'DESECHO A RASTRO'
    ) {
      return 'CULL';
    }
    if (upper === 'SELL' || upper === 'VENTA') {
      return 'SELL';
    }
    if (
      upper === 'BREEDING' ||
      upper === 'EMPADRE' ||
      upper === 'CRIA' ||
      upper === 'CRÍA' ||
      upper === 'KEEP' ||
      upper === 'MANTENER'
    ) {
      return 'BREEDING';
    }
  }
  return null;
}

function looksLikeFemaleAlertRow(item: unknown): boolean {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const obj = item as Record<string, unknown>;
  return (
    'animalId' in obj ||
    'animal_id' in obj ||
    'femaleId' in obj ||
    'female_id' in obj ||
    'folioInterno' in obj ||
    'folio_interno' in obj ||
    'suggestion' in obj ||
    'destino_sugerido' in obj ||
    'destinoSugerido' in obj ||
    'unproductive' in obj ||
    'improductiva' in obj
  );
}

export function normalizeUnproductiveFemale(
  raw: unknown,
  index: number
): UnproductiveFemaleAlert | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const animalId =
    toNonEmptyString(
      obj.animalId,
      obj.animal_id,
      obj.femaleId,
      obj.female_id,
      obj.id
    ) ?? null;
  const rawFolio = toNonEmptyString(
    obj.folioInterno,
    obj.folio_interno,
    obj.folio,
    obj.earTag,
    obj.ear_tag,
    obj.arete
  );
  const ageDays = toOptionalNonNegativeCount(
    obj.ageDays,
    obj.age_days,
    obj.edad_dias,
    obj.edadDias
  );
  const suggestion = normalizeSuggestedDestination(
    obj.suggestion,
    obj.destino_sugerido,
    obj.destinoSugerido,
    obj.suggestedDestination,
    obj.suggested_destination,
    obj.destination,
    obj.destino
  );
  const explicitUnproductive = toOptionalBoolean(
    obj.unproductive,
    obj.improductiva,
    obj.es_improductiva,
    obj.esImproductiva
  );

  if (
    !animalId &&
    !rawFolio &&
    suggestion === null &&
    explicitUnproductive === null &&
    ageDays === null
  ) {
    return null;
  }

  const folioInterno =
    rawFolio ??
    (animalId ? `ID ${animalId.slice(0, 8)}` : `Vientre #${index + 1}`);

  const breedings = toOptionalNonNegativeCount(
    obj.breedings,
    obj.breedingsCount,
    obj.breedings_count,
    obj.empadres
  );
  const diagnosed = toOptionalNonNegativeCount(
    obj.diagnosed,
    obj.diagnosedCount,
    obj.diagnosed_count,
    obj.diagnosticados,
    obj.diagnosticadas
  );
  const pregnantCount = toOptionalNonNegativeCount(
    obj.pregnantCount,
    obj.pregnant_count,
    obj.prenadas
  );
  const births = toOptionalNonNegativeCount(
    obj.births,
    obj.birthsCount,
    obj.births_count,
    obj.partos
  );
  const offspringBorn = toOptionalNonNegativeCount(
    obj.offspringBorn,
    obj.offspring_born,
    obj.lambsBorn,
    obj.lambs_born,
    obj.crias_nacidas,
    obj.criasNacidas
  );
  const offspringDead = toOptionalNonNegativeCount(
    obj.offspringDead,
    obj.offspring_dead,
    obj.lambsDead,
    obj.lambs_dead,
    obj.lambsDeceased,
    obj.lambs_deceased,
    obj.crias_muertas,
    obj.criasMuertas
  );

  const explicitPregnancyPct = toOptionalFiniteNumber(
    obj.pregnancyPct,
    obj.pregnancy_pct,
    obj.pct_prenez,
    obj.pctPrenez
  );
  const pregnancyPct =
    explicitPregnancyPct !== null
      ? roundTo(explicitPregnancyPct, 1)
      : pregnantCount !== null && diagnosed !== null && diagnosed > 0
        ? roundTo((pregnantCount / diagnosed) * 100, 1)
        : null;

  const explicitMortalityPct = toOptionalFiniteNumber(
    obj.mortalityPct,
    obj.mortality_pct,
    obj.pct_mortalidad,
    obj.pctMortalidad
  );
  const mortalityPct =
    explicitMortalityPct !== null
      ? roundTo(explicitMortalityPct, 1)
      : offspringDead !== null && offspringBorn !== null && offspringBorn > 0
        ? roundTo((offspringDead / offspringBorn) * 100, 1)
        : null;

  const lastBirthDate =
    toNonEmptyString(
      obj.lastBirthDate,
      obj.last_birth_date,
      obj.ultimo_parto,
      obj.ultimoParto
    ) ?? null;
  const daysSinceLastBirth = toOptionalNonNegativeCount(
    obj.daysSinceLastBirth,
    obj.days_since_last_birth,
    obj.dias_desde_ultimo_parto,
    obj.diasDesdeUltimoParto
  );
  const pregnant = toOptionalBoolean(
    obj.pregnant,
    obj.isPregnant,
    obj.is_pregnant,
    obj.cargada
  );
  const consecutiveLambDeaths = toOptionalNonNegativeCount(
    obj.consecutiveLambDeaths,
    obj.consecutive_lamb_deaths,
    obj.consecutiveDeaths,
    obj.consecutive_deaths,
    obj.muertes_consecutivas,
    obj.muertesConsecutivas
  );
  const explicitConsecutiveMortality = toOptionalBoolean(
    obj.consecutiveMortality,
    obj.consecutive_mortality,
    obj.hasConsecutiveMortality,
    obj.has_consecutive_mortality,
    obj.mortalidad_consecutiva,
    obj.mortalidadConsecutiva
  );
  const explicitInfertility = toOptionalBoolean(
    obj.prolongedInfertility,
    obj.prolonged_infertility,
    obj.hasProlongedInfertility,
    obj.has_prolonged_infertility,
    obj.infertilidad_prolongada,
    obj.infertilidadProlongada
  );
  const alertReason =
    toNonEmptyString(obj.alertReason, obj.alert_reason, obj.reason, obj.motivo) ??
    null;

  const unproductive =
    explicitUnproductive ?? (suggestion === 'CULL' || suggestion === 'SELL');

  const hasConsecutiveMortality =
    explicitConsecutiveMortality === true ||
    (consecutiveLambDeaths !== null && consecutiveLambDeaths >= 2) ||
    (alertReason !== null && /consecutiv/i.test(alertReason));

  const hasHighMortality =
    hasConsecutiveMortality ||
    (mortalityPct !== null && mortalityPct > 30) ||
    (offspringDead !== null &&
      offspringDead >= 2 &&
      offspringBorn !== null &&
      offspringBorn > 0 &&
      offspringDead / offspringBorn > 0.3);

  const hasProlongedInfertility =
    explicitInfertility !== null
      ? explicitInfertility
      : (daysSinceLastBirth !== null &&
          daysSinceLastBirth > 365 &&
          pregnant !== true) ||
        (ageDays !== null && ageDays > 600 && births === 0 && pregnant !== true) ||
        (diagnosed !== null &&
          diagnosed >= 2 &&
          pregnancyPct !== null &&
          pregnancyPct < 50) ||
        (pregnancyPct !== null &&
          pregnancyPct === 0 &&
          (births === null || births === 0) &&
          pregnant !== true) ||
        (unproductive && !hasHighMortality) ||
        (alertReason !== null &&
          /(infert|sin parir|sin parto|gestar|abierta|vac[ií]a)/i.test(alertReason));

  const isAlertCandidate =
    suggestion === 'CULL' ||
    suggestion === 'SELL' ||
    unproductive ||
    hasHighMortality ||
    hasProlongedInfertility;

  return {
    key: animalId ? `${animalId}-${index}` : `${folioInterno}-${index}`,
    animalId,
    folioInterno,
    ageDays,
    breedings,
    diagnosed,
    pregnantCount,
    pregnancyPct,
    births,
    offspringBorn,
    offspringDead,
    mortalityPct,
    lastBirthDate,
    daysSinceLastBirth,
    pregnant,
    unproductive,
    suggestion,
    consecutiveLambDeaths,
    hasConsecutiveMortality,
    hasHighMortality,
    hasProlongedInfertility,
    alertReason,
    isAlertCandidate,
  };
}

function getAlertPriorityRank(item: UnproductiveFemaleAlert): number {
  if (item.suggestion === 'CULL') return 0;
  if (item.suggestion === 'SELL') return 1;
  if (item.isAlertCandidate && item.suggestion !== 'BREEDING') return 2;
  if (item.isAlertCandidate) return 3;
  return 4;
}

export function normalizeUnproductiveFemalesOverview(
  payload: unknown
): UnproductiveFemalesSummary {
  const root = unwrapAnalyticsRoot(payload);

  let rawFemales: unknown[] = [];
  if (Array.isArray(root)) {
    rawFemales = root.filter(looksLikeFemaleAlertRow);
  } else if (root && typeof root === 'object') {
    const obj = root as Record<string, unknown>;
    const candidate =
      obj.unproductiveFemales ??
      obj.unproductive_females ??
      obj.vientresImproductivos ??
      obj.vientres_improductivos ??
      obj.hembrasImproductivas ??
      obj.hembras_improductivas ??
      obj.unproductiveEweAlerts ??
      obj.unproductiveAlerts ??
      (Array.isArray(obj.alerts) && obj.alerts.some(looksLikeFemaleAlertRow)
        ? obj.alerts
        : undefined);
    if (Array.isArray(candidate)) {
      rawFemales = candidate;
    }
  }

  const items = rawFemales
    .map((item, idx) => normalizeUnproductiveFemale(item, idx))
    .filter((item): item is UnproductiveFemaleAlert => item !== null)
    .sort((a, b) => {
      const rankDiff = getAlertPriorityRank(a) - getAlertPriorityRank(b);
      if (rankDiff !== 0) return rankDiff;
      if (a.hasConsecutiveMortality !== b.hasConsecutiveMortality) {
        return a.hasConsecutiveMortality ? -1 : 1;
      }
      if (a.hasHighMortality !== b.hasHighMortality) {
        return a.hasHighMortality ? -1 : 1;
      }
      const mortDiff = (b.mortalityPct ?? -1) - (a.mortalityPct ?? -1);
      if (mortDiff !== 0) return mortDiff;
      if (a.hasProlongedInfertility !== b.hasProlongedInfertility) {
        return a.hasProlongedInfertility ? -1 : 1;
      }
      const daysOpenDiff =
        (b.daysSinceLastBirth ?? b.ageDays ?? -1) -
        (a.daysSinceLastBirth ?? a.ageDays ?? -1);
      if (daysOpenDiff !== 0) return daysOpenDiff;
      return a.folioInterno.localeCompare(b.folioInterno, 'es-MX', {
        numeric: true,
      });
    });

  const alertItems = items.filter((item) => item.isAlertCandidate);

  return {
    items,
    alertItems,
    cullCount: alertItems.filter((item) => item.suggestion === 'CULL').length,
    sellCount: alertItems.filter((item) => item.suggestion === 'SELL').length,
    breedingCount: items.filter(
      (item) => item.suggestion === 'BREEDING' && !item.isAlertCandidate
    ).length,
    mortalityAlertCount: alertItems.filter(
      (item) => item.hasConsecutiveMortality || item.hasHighMortality
    ).length,
    consecutiveMortalityCount: alertItems.filter(
      (item) => item.hasConsecutiveMortality
    ).length,
    infertilityAlertCount: alertItems.filter(
      (item) => item.hasProlongedInfertility
    ).length,
  };
}

export function normalizeReproductiveOverview(
  payload: unknown
): ReproductiveOverview {
  const root = unwrapAnalyticsRoot(payload);

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
    unproductive: normalizeUnproductiveFemalesOverview(payload),
  };
}
