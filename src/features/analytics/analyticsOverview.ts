export const MORTALITY_ALERT_THRESHOLD_PCT = 3;

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
  offspringDead: number | null;
  birthDead: number | null;
  preWeaningDead: number | null;
  offspringAliveAtBirth: number | null;
  mortalityPct: number | null;
  birthMortalityPct: number | null;
  preWeaningMortalityPct: number | null;
  mortalityAlert: boolean;
  achievedBirthsPct: number | null;
  weanedAliveCount: number | null;
  weaningSurvivalPct: number | null;
  averageWeaningWeightKg: number | null;
}

export interface StageWeightAverage {
  stageKey: 'BIRTH' | 'WEANING' | 'DAY_120' | 'DAY_150' | 'EVALUATION';
  stageLabel: string;
  averageWeightKg: number;
  sampleCount: number;
  femalesAvgKg: number | null;
  femalesCount: number;
  malesAvgKg: number | null;
  malesCount: number;
}

export interface StageWeightPointRecord {
  key: string;
  animalId: string | null;
  folioInterno: string | null;
  sex: 'FEMALE' | 'MALE' | null;
  stageKey: StageWeightAverage['stageKey'];
  stageLabel: string;
  date: string | null;
  weightKg: number;
  ranchAverageKg: number | null;
  differenceKg: number | null;
  scrotalCircumferenceCm: number | null;
}

export const SLOW_GROWTH_GDP_THRESHOLD_G = 130;
export const DEFAULT_SALE_WEIGHT_TARGET_KG = 35;

export type GrowthDestinationSuggestion = 'SELL' | 'BREEDING' | 'FATTENING';

export interface GrowthRankEntryRecord {
  key: string;
  animalId: string | null;
  folioInterno: string;
  sex: 'FEMALE' | 'MALE' | null;
  ageDays: number | null;
  dailyGainGrams: number | null;
  ranchAvgDailyGainGrams: number | null;
  diffVsRanchAvgGrams: number | null;
  estimatedWeightTodayKg: number | null;
  ranchPercentile: number | null;
  slowGrowth: boolean;
  estimatedSaleDate: string | null;
  reachedSaleTarget: boolean;
  suggestion: GrowthDestinationSuggestion | null;
}

export interface GrowthAnimalSeries {
  animalKey: string;
  animalId: string | null;
  folioInterno: string;
  sex: 'FEMALE' | 'MALE' | null;
  weightsByStage: Partial<
    Record<StageWeightAverage['stageKey'], StageWeightPointRecord>
  >;
}

export interface GrowthOverviewSummary {
  stageAverages: StageWeightAverage[];
  stagePoints: StageWeightPointRecord[];
  animalSeries: GrowthAnimalSeries[];
  ranking: GrowthRankEntryRecord[];
  ranchAverageDailyGainGrams: number | null;
  saleWeightTargetKg: number;
  slowGrowthCount: number;
  reachedTargetCount: number;
  projectedSaleCount: number;
  hasData: boolean;
}

export interface WeaningWeightSummary {
  averageWeaningWeightKg: number | null;
  sampleCount: number | null;
  femalesAvgKg: number | null;
  femalesCount: number;
  malesAvgKg: number | null;
  malesCount: number;
  stageAverages: StageWeightAverage[];
}

export interface MortalityWeaningSummary {
  overallAchievedBirthsPct: number | null;
  achievedBirthsRatio: RatioAggregate | null;
  achievedBirthsSource:
    | 'explicit'
    | 'live_offspring'
    | 'births_per_pregnant'
    | 'births_per_exposed'
    | null;
  overallMortalityPct: number | null;
  mortalityRatio: RatioAggregate | null;
  overallBirthMortalityPct: number | null;
  overallPreWeaningMortalityPct: number | null;
  mortalityAlert: boolean;
  alertSeasons: SeasonReproductionMetric[];
  overallWeaningSurvivalPct: number | null;
  weaningSurvivalRatio: RatioAggregate | null;
  weaningSurvivalIsDerived: boolean;
  weaningWeight: WeaningWeightSummary;
  hasData: boolean;
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
  mortalityWeaning: MortalityWeaningSummary;
  growth: GrowthOverviewSummary;
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

  const offspringDead = toOptionalNonNegativeCount(
    obj.offspringDead,
    obj.offspring_dead,
    obj.crias_muertas,
    obj.criasMuertas,
    obj.lambsDead,
    obj.lambs_dead,
    obj.deceasedOffspring
  );
  const birthDead = toOptionalNonNegativeCount(
    obj.birthDead,
    obj.birth_dead,
    obj.stillborn,
    obj.stillbirths,
    obj.nacidos_muertos,
    obj.nacidosMuertos,
    obj.crias_muertas_nacimiento
  );
  const preWeaningDead = toOptionalNonNegativeCount(
    obj.preWeaningDead,
    obj.pre_weaning_dead,
    obj.muertas_predestete,
    obj.muertasPredestete,
    obj.crias_muertas_despues,
    obj.muertas_despues
  );
  const explicitAliveAtBirth = toOptionalNonNegativeCount(
    obj.offspringBornAlive,
    obj.offspring_born_alive,
    obj.liveBirths,
    obj.live_births,
    obj.nacidos_vivos,
    obj.nacidosVivos
  );
  const offspringAliveAtBirth =
    explicitAliveAtBirth !== null
      ? explicitAliveAtBirth
      : offspringBorn !== null && birthDead !== null
        ? Math.max(0, offspringBorn - birthDead)
        : null;

  const explicitMortalityPct = toOptionalFiniteNumber(
    obj.mortalityPct,
    obj.pct_mortalidad,
    obj.mortality_pct,
    obj.pctMortalidad
  );
  const mortalityPct =
    explicitMortalityPct !== null
      ? roundTo(explicitMortalityPct, 1)
      : offspringDead !== null && offspringBorn !== null && offspringBorn > 0
        ? roundTo((offspringDead / offspringBorn) * 100, 1)
        : null;

  const explicitBirthMortalityPct = toOptionalFiniteNumber(
    obj.birthMortalityPct,
    obj.birth_mortality_pct,
    obj.stillbirthPct,
    obj.pct_mortalidad_nacimiento,
    obj.pctMortalidadNacimiento
  );
  const birthMortalityPct =
    explicitBirthMortalityPct !== null
      ? roundTo(explicitBirthMortalityPct, 1)
      : birthDead !== null && offspringBorn !== null && offspringBorn > 0
        ? roundTo((birthDead / offspringBorn) * 100, 1)
        : null;

  const explicitPreWeaningMortalityPct = toOptionalFiniteNumber(
    obj.preWeaningMortalityPct,
    obj.pre_weaning_mortality_pct,
    obj.predesteteMortalityPct,
    obj.pct_mortalidad_predestete,
    obj.pctMortalidadPredestete
  );
  const preWeaningMortalityPct =
    explicitPreWeaningMortalityPct !== null
      ? roundTo(explicitPreWeaningMortalityPct, 1)
      : preWeaningDead !== null && offspringBorn !== null && offspringBorn > 0
        ? roundTo((preWeaningDead / offspringBorn) * 100, 1)
        : null;

  const explicitMortalityAlert = toOptionalBoolean(
    obj.mortalityAlert,
    obj.mortality_alert,
    obj.alerta_mortalidad,
    obj.alertaMortalidad
  );
  const mortalityAlert =
    (mortalityPct !== null && mortalityPct > MORTALITY_ALERT_THRESHOLD_PCT) ||
    explicitMortalityAlert === true;

  const explicitAchievedBirthsPct = toOptionalFiniteNumber(
    obj.achievedBirthsPct,
    obj.achieved_births_pct,
    obj.successfulBirthsPct,
    obj.birthSuccessPct,
    obj.pct_nacimientos_logrados,
    obj.pctNacimientosLogrados,
    obj.liveBirthPct,
    obj.pct_nacidos_vivos
  );
  const achievedBirthsPct =
    explicitAchievedBirthsPct !== null
      ? roundTo(explicitAchievedBirthsPct, 1)
      : offspringAliveAtBirth !== null &&
          offspringBorn !== null &&
          offspringBorn > 0
        ? roundTo((offspringAliveAtBirth / offspringBorn) * 100, 1)
        : (birthsPerPregnantPct ?? birthsPerExposedPct);

  const weanedAliveCount = toOptionalNonNegativeCount(
    obj.weanedAlive,
    obj.weaned_alive,
    obj.weanedCount,
    obj.weaned_count,
    obj.crias_destetadas,
    obj.criasDestetadas,
    obj.destetadas
  );
  const explicitWeaningSurvivalPct = toOptionalFiniteNumber(
    obj.weaningSurvivalPct,
    obj.weaning_survival_pct,
    obj.aliveAtWeaningPct,
    obj.alive_at_weaning_pct,
    obj.lambSurvivalPct,
    obj.pct_crias_vivas_destete,
    obj.pctCriasVivasDestete,
    obj.pct_vivas_destete
  );
  const weaningSurvivalPct =
    explicitWeaningSurvivalPct !== null
      ? roundTo(explicitWeaningSurvivalPct, 1)
      : weanedAliveCount !== null && offspringBorn !== null && offspringBorn > 0
        ? roundTo((weanedAliveCount / offspringBorn) * 100, 1)
        : mortalityPct !== null
          ? roundTo(Math.max(0, 100 - mortalityPct), 1)
          : offspringBorn !== null &&
              offspringBorn > 0 &&
              offspringDead !== null
            ? roundTo(
                Math.max(0, ((offspringBorn - offspringDead) / offspringBorn) * 100),
                1
              )
            : null;

  const explicitAvgWeaningWeightKg = toOptionalFiniteNumber(
    obj.averageWeaningWeightKg,
    obj.average_weaning_weight_kg,
    obj.avgWeaningWeightKg,
    obj.avg_weaning_weight_kg,
    obj.weaningAvgWeightKg,
    obj.weaningWeightKg,
    obj.peso_promedio_destete,
    obj.pesoPromedioDestete,
    obj.pesoPromedioDesteteKg,
    obj.peso_destete_promedio
  );

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
    offspringDead,
    birthDead,
    preWeaningDead,
    offspringAliveAtBirth,
    mortalityPct,
    birthMortalityPct,
    preWeaningMortalityPct,
    mortalityAlert,
    achievedBirthsPct,
    weanedAliveCount,
    weaningSurvivalPct,
    averageWeaningWeightKg:
      explicitAvgWeaningWeightKg !== null
        ? roundTo(explicitAvgWeaningWeightKg, 2)
        : null,
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

const STAGE_METADATA: ReadonlyArray<{
  key: StageWeightAverage['stageKey'];
  label: string;
}> = [
  { key: 'BIRTH', label: 'Nacimiento' },
  { key: 'WEANING', label: 'Destete' },
  { key: 'DAY_120', label: '120 días' },
  { key: 'DAY_150', label: '150 días' },
  { key: 'EVALUATION', label: 'Evaluación' },
];

function normalizeStageKey(
  ...values: unknown[]
): StageWeightAverage['stageKey'] | null {
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const norm = v
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_');
    if (norm === 'BIRTH' || norm === 'NACIMIENTO') return 'BIRTH';
    if (norm === 'WEANING' || norm === 'DESTETE') return 'WEANING';
    if (norm === 'DAY_120' || norm === 'DAY120' || norm === '120_DIAS' || norm === '120D') {
      return 'DAY_120';
    }
    if (norm === 'DAY_150' || norm === 'DAY150' || norm === '150_DIAS' || norm === '150D') {
      return 'DAY_150';
    }
    if (norm === 'EVALUATION' || norm === 'EVALUACION') return 'EVALUATION';
  }
  return null;
}

function normalizeStageSex(value: unknown): 'FEMALE' | 'MALE' | null {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  if (upper === 'FEMALE' || upper === 'HEMBRA' || upper === 'F') return 'FEMALE';
  if (upper === 'MALE' || upper === 'MACHO' || upper === 'M') return 'MALE';
  return null;
}

interface ExtractedStageWeights {
  stageAverages: StageWeightAverage[];
  stagePoints: StageWeightPointRecord[];
  animalSeries: GrowthAnimalSeries[];
}

function extractStageWeights(
  rootObj: Record<string, unknown> | null
): ExtractedStageWeights {
  const rawPoints = rootObj
    ? (rootObj.weightByStage ??
        rootObj.weight_by_stage ??
        rootObj.stageWeights ??
        rootObj.pesoPorEtapa ??
        rootObj.peso_por_etapa)
    : undefined;

  const stageBuckets = new Map<
    StageWeightAverage['stageKey'],
    {
      weightedSum: number;
      totalCount: number;
      femalesSum: number;
      femalesCount: number;
      malesSum: number;
      malesCount: number;
    }
  >();
  const stagePoints: StageWeightPointRecord[] = [];
  const animalSeriesMap = new Map<string, GrowthAnimalSeries>();

  if (Array.isArray(rawPoints)) {
    for (let idx = 0; idx < rawPoints.length; idx++) {
      const point = rawPoints[idx];
      if (!point || typeof point !== 'object' || Array.isArray(point)) continue;
      const obj = point as Record<string, unknown>;
      const stageKey = normalizeStageKey(
        obj.stage,
        obj.milestone,
        obj.hito,
        obj.etapa
      );
      if (!stageKey) continue;
      const stageLabel =
        STAGE_METADATA.find((m) => m.key === stageKey)?.label ?? stageKey;

      const weightKg = toOptionalFiniteNumber(
        obj.weightKg,
        obj.weight_kg,
        obj.pesoKg,
        obj.peso_kg,
        obj.averageWeightKg,
        obj.average_weight_kg,
        obj.avgWeightKg,
        obj.avg_weight_kg,
        obj.pesoPromedioKg,
        obj.peso_promedio_kg,
        obj.ranchAverageKg,
        obj.ranch_average_kg,
        obj.promedioRanchoKg,
        obj.promedio_rancho_kg
      );
      if (weightKg === null || weightKg <= 0) continue;

      const count =
        toOptionalNonNegativeCount(
          obj.sampleCount,
          obj.sample_count,
          obj.count,
          obj.animales,
          obj.total,
          obj.cantidad
        ) ?? 1;
      if (count <= 0) continue;

      const bucket = stageBuckets.get(stageKey) ?? {
        weightedSum: 0,
        totalCount: 0,
        femalesSum: 0,
        femalesCount: 0,
        malesSum: 0,
        malesCount: 0,
      };
      bucket.weightedSum += weightKg * count;
      bucket.totalCount += count;

      const sex = normalizeStageSex(obj.sex ?? obj.sexo);
      const explicitFemalesAvg = toOptionalFiniteNumber(
        obj.femalesAvgKg,
        obj.females_avg_kg,
        obj.pesoPromedioHembrasKg
      );
      const explicitMalesAvg = toOptionalFiniteNumber(
        obj.malesAvgKg,
        obj.males_avg_kg,
        obj.pesoPromedioMachosKg
      );

      if (sex === 'FEMALE') {
        bucket.femalesSum += weightKg * count;
        bucket.femalesCount += count;
      } else if (sex === 'MALE') {
        bucket.malesSum += weightKg * count;
        bucket.malesCount += count;
      } else {
        if (explicitFemalesAvg !== null && explicitFemalesAvg > 0) {
          bucket.femalesSum += explicitFemalesAvg * count;
          bucket.femalesCount += count;
        }
        if (explicitMalesAvg !== null && explicitMalesAvg > 0) {
          bucket.malesSum += explicitMalesAvg * count;
          bucket.malesCount += count;
        }
      }
      stageBuckets.set(stageKey, bucket);

      const animalId =
        toNonEmptyString(obj.animalId, obj.animal_id, obj.id) ?? null;
      const folioInterno =
        toNonEmptyString(
          obj.folioInterno,
          obj.folio_interno,
          obj.folio,
          obj.arete
        ) ?? null;

      if (animalId || folioInterno) {
        const ranchAverageKg = toOptionalFiniteNumber(
          obj.ranchAverageKg,
          obj.ranch_average_kg,
          obj.promedioRanchoKg,
          obj.promedio_rancho_kg
        );
        const explicitDiffKg = toOptionalFiniteNumber(
          obj.differenceKg,
          obj.difference_kg,
          obj.diferenciaKg,
          obj.diferencia_kg
        );
        const roundedWeight = roundTo(weightKg, 2);
        const roundedRanchAvg =
          ranchAverageKg !== null ? roundTo(ranchAverageKg, 2) : null;
        const pointRecord: StageWeightPointRecord = {
          key: `${animalId ?? folioInterno}-${stageKey}-${idx}`,
          animalId,
          folioInterno,
          sex,
          stageKey,
          stageLabel,
          date:
            toNonEmptyString(obj.date, obj.fecha, obj.measuredAt, obj.measured_at) ??
            null,
          weightKg: roundedWeight,
          ranchAverageKg: roundedRanchAvg,
          differenceKg:
            explicitDiffKg !== null
              ? roundTo(explicitDiffKg, 2)
              : roundedRanchAvg !== null
                ? roundTo(roundedWeight - roundedRanchAvg, 2)
                : null,
          scrotalCircumferenceCm: toOptionalFiniteNumber(
            obj.scrotalCircumferenceCm,
            obj.scrotal_circumference_cm,
            obj.circunferenciaEscrotalCm,
            obj.circunferencia_escrotal_cm
          ),
        };
        stagePoints.push(pointRecord);

        const seriesKey = animalId ?? (folioInterno as string);
        const existingSeries = animalSeriesMap.get(seriesKey) ?? {
          animalKey: seriesKey,
          animalId,
          folioInterno: folioInterno ?? `ID ${(animalId as string).slice(0, 8)}`,
          sex,
          weightsByStage: {},
        };
        if (!existingSeries.sex && sex) existingSeries.sex = sex;
        existingSeries.weightsByStage[stageKey] = pointRecord;
        animalSeriesMap.set(seriesKey, existingSeries);
      }
    }
  }

  const stageAverages: StageWeightAverage[] = [];
  for (const meta of STAGE_METADATA) {
    const bucket = stageBuckets.get(meta.key);
    if (!bucket || bucket.totalCount <= 0) continue;
    stageAverages.push({
      stageKey: meta.key,
      stageLabel: meta.label,
      averageWeightKg: roundTo(bucket.weightedSum / bucket.totalCount, 2),
      sampleCount: bucket.totalCount,
      femalesAvgKg:
        bucket.femalesCount > 0
          ? roundTo(bucket.femalesSum / bucket.femalesCount, 2)
          : null,
      femalesCount: bucket.femalesCount,
      malesAvgKg:
        bucket.malesCount > 0
          ? roundTo(bucket.malesSum / bucket.malesCount, 2)
          : null,
      malesCount: bucket.malesCount,
    });
  }

  const animalSeries = Array.from(animalSeriesMap.values()).sort((a, b) => {
    const stageCountDiff =
      Object.keys(b.weightsByStage).length -
      Object.keys(a.weightsByStage).length;
    if (stageCountDiff !== 0) return stageCountDiff;
    return a.folioInterno.localeCompare(b.folioInterno, 'es-MX', {
      numeric: true,
    });
  });

  return {
    stageAverages,
    stagePoints,
    animalSeries,
  };
}

function summarizeStageWeights(
  rootObj: Record<string, unknown> | null,
  seasons: SeasonReproductionMetric[],
  extracted: ExtractedStageWeights
): WeaningWeightSummary {
  const { stageAverages } = extracted;

  const nestedWeaning =
    rootObj &&
    typeof rootObj.weaningSummary === 'object' &&
    rootObj.weaningSummary !== null &&
    !Array.isArray(rootObj.weaningSummary)
      ? (rootObj.weaningSummary as Record<string, unknown>)
      : rootObj &&
          typeof rootObj.mortalityWeaning === 'object' &&
          rootObj.mortalityWeaning !== null &&
          !Array.isArray(rootObj.mortalityWeaning)
        ? (rootObj.mortalityWeaning as Record<string, unknown>)
        : null;

  const explicitRootWeaningWeight = rootObj
    ? toOptionalFiniteNumber(
        rootObj.averageWeaningWeightKg,
        rootObj.average_weaning_weight_kg,
        rootObj.avgWeaningWeightKg,
        rootObj.avg_weaning_weight_kg,
        rootObj.weaningAvgWeightKg,
        rootObj.weaningWeightKg,
        rootObj.pesoPromedioDestete,
        rootObj.peso_promedio_destete,
        rootObj.pesoPromedioDesteteKg,
        rootObj.peso_destete_promedio,
        nestedWeaning?.averageWeaningWeightKg,
        nestedWeaning?.averageWeightKg,
        nestedWeaning?.pesoPromedioDestete
      )
    : null;

  const weaningStage = stageAverages.find((s) => s.stageKey === 'WEANING');
  const seasonAvgWeight = averageNonNull(
    seasons.map((s) => s.averageWeaningWeightKg),
    2
  );

  const averageWeaningWeightKg =
    explicitRootWeaningWeight !== null
      ? roundTo(explicitRootWeaningWeight, 2)
      : weaningStage
        ? weaningStage.averageWeightKg
        : seasonAvgWeight;

  const explicitSampleCount = rootObj
    ? toOptionalNonNegativeCount(
        rootObj.weaningSampleCount,
        rootObj.weaning_sample_count,
        nestedWeaning?.sampleCount,
        nestedWeaning?.weaningSampleCount
      )
    : null;

  return {
    averageWeaningWeightKg,
    sampleCount: explicitSampleCount ?? weaningStage?.sampleCount ?? null,
    femalesAvgKg: weaningStage?.femalesAvgKg ?? null,
    femalesCount: weaningStage?.femalesCount ?? 0,
    malesAvgKg: weaningStage?.malesAvgKg ?? null,
    malesCount: weaningStage?.malesCount ?? 0,
    stageAverages,
  };
}

function normalizeGrowthDestination(
  ...values: unknown[]
): GrowthDestinationSuggestion | null {
  for (const v of values) {
    if (typeof v !== 'string') continue;
    const upper = v.trim().toUpperCase();
    if (!upper) continue;
    if (upper === 'SELL' || upper === 'VENTA') return 'SELL';
    if (
      upper === 'BREEDING' ||
      upper === 'CRIA' ||
      upper === 'CRÍA' ||
      upper === 'REEMPLAZO'
    ) {
      return 'BREEDING';
    }
    if (upper === 'FATTENING' || upper === 'ENGORDA') return 'FATTENING';
  }
  return null;
}

export function buildGrowthOverviewSummary(
  rootObj: Record<string, unknown> | null,
  extracted: ExtractedStageWeights
): GrowthOverviewSummary {
  const saleWeightTargetKg =
    (rootObj
      ? toOptionalFiniteNumber(
          rootObj.saleWeightTargetKg,
          rootObj.targetSaleWeightKg,
          rootObj.peso_meta_venta_kg,
          rootObj.pesoMetaVentaKg
        )
      : null) ?? DEFAULT_SALE_WEIGHT_TARGET_KG;

  const rawRanking = rootObj
    ? (rootObj.growthRanking ??
        rootObj.growth_ranking ??
        rootObj.rankingCrecimiento ??
        rootObj.ranking_crecimiento ??
        rootObj.growthRankings ??
        rootObj.lambGrowthRanking)
    : undefined;

  const preliminaryEntries: Array<{
    key: string;
    animalId: string | null;
    folioInterno: string;
    sex: 'FEMALE' | 'MALE' | null;
    ageDays: number | null;
    dailyGainGrams: number | null;
    explicitRanchAvgG: number | null;
    explicitDiffG: number | null;
    estimatedWeightTodayKg: number | null;
    ranchPercentile: number | null;
    slowGrowth: boolean;
    estimatedSaleDate: string | null;
    reachedSaleTarget: boolean;
    suggestion: GrowthDestinationSuggestion | null;
  }> = [];

  if (Array.isArray(rawRanking)) {
    for (let idx = 0; idx < rawRanking.length; idx++) {
      const raw = rawRanking[idx];
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const obj = raw as Record<string, unknown>;

      const animalId =
        toNonEmptyString(
          obj.animalId,
          obj.animal_id,
          obj.lambId,
          obj.lamb_id,
          obj.id
        ) ?? null;
      const rawFolio = toNonEmptyString(
        obj.folioInterno,
        obj.folio_interno,
        obj.folio,
        obj.arete
      );

      let dailyGainGrams = toOptionalFiniteNumber(
        obj.dailyGainGrams,
        obj.daily_gain_grams,
        obj.gdpGrams,
        obj.gdp_grams,
        obj.adgGrams,
        obj.adg_grams,
        obj.gananciaDiariaG,
        obj.ganancia_diaria_g,
        obj.dailyGainG,
        obj.gdpG,
        obj.gdp
      );
      if (dailyGainGrams === null) {
        const gainKgPerDay = toOptionalFiniteNumber(
          obj.dailyGainKg,
          obj.daily_gain_kg,
          obj.kgDia,
          obj.kg_dia
        );
        if (gainKgPerDay !== null) {
          dailyGainGrams = gainKgPerDay * 1000;
        }
      }
      if (dailyGainGrams !== null) {
        dailyGainGrams = Math.round(dailyGainGrams);
      }

      if (!animalId && !rawFolio && dailyGainGrams === null) continue;

      const folioInterno =
        rawFolio ??
        (animalId ? `ID ${animalId.slice(0, 8)}` : `Cordero #${idx + 1}`);

      const estimatedWeightTodayKg = toOptionalFiniteNumber(
        obj.estimatedWeightTodayKg,
        obj.estimated_weight_today_kg,
        obj.estimatedCurrentWeightKg,
        obj.estimated_current_weight_kg,
        obj.pesoEstimadoHoyKg,
        obj.peso_estimado_hoy_kg,
        obj.currentWeightKg,
        obj.weightKg,
        obj.pesoKg
      );
      const roundedEstWeight =
        estimatedWeightTodayKg !== null
          ? roundTo(estimatedWeightTodayKg, 1)
          : null;

      const explicitRanchAvgG = toOptionalFiniteNumber(
        obj.ranchAvgDailyGainGrams,
        obj.ranch_avg_daily_gain_grams,
        obj.ranchAverageDailyGainGrams,
        obj.promedioRanchoGdpG,
        obj.promedio_rancho_gdp_g
      );
      const explicitDiffG = toOptionalFiniteNumber(
        obj.diffVsRanchAvgGrams,
        obj.diff_vs_ranch_avg_grams,
        obj.diferenciaPromedioG,
        obj.diferencia_promedio_g
      );

      const rawPercentile = toOptionalFiniteNumber(
        obj.ranchPercentile,
        obj.ranch_percentile,
        obj.percentilRancho,
        obj.percentil_rancho,
        obj.percentile
      );
      const ranchPercentile =
        rawPercentile !== null ? Math.round(rawPercentile) : null;

      const explicitSlowGrowth = toOptionalBoolean(
        obj.slowGrowth,
        obj.slow_growth,
        obj.creceLento,
        obj.crece_lento
      );
      const slowGrowth =
        explicitSlowGrowth ??
        (dailyGainGrams !== null &&
          dailyGainGrams < SLOW_GROWTH_GDP_THRESHOLD_G);

      const estimatedSaleDate =
        toNonEmptyString(
          obj.estimatedSaleDate,
          obj.estimated_sale_date,
          obj.fechaEstimadaVenta,
          obj.fecha_estimada_venta,
          obj.targetWeightDate
        ) ?? null;

      const explicitReached = toOptionalBoolean(
        obj.reachedSaleTarget,
        obj.reached_sale_target,
        obj.pesoMetaAlcanzado
      );
      const reachedSaleTarget =
        explicitReached ??
        (roundedEstWeight !== null && roundedEstWeight >= saleWeightTargetKg);

      preliminaryEntries.push({
        key: animalId ? `${animalId}-${idx}` : `${folioInterno}-${idx}`,
        animalId,
        folioInterno,
        sex: normalizeStageSex(obj.sex ?? obj.sexo),
        ageDays: toOptionalNonNegativeCount(
          obj.ageDays,
          obj.age_days,
          obj.edadDias,
          obj.edad_dias
        ),
        dailyGainGrams,
        explicitRanchAvgG:
          explicitRanchAvgG !== null ? Math.round(explicitRanchAvgG) : null,
        explicitDiffG:
          explicitDiffG !== null ? Math.round(explicitDiffG) : null,
        estimatedWeightTodayKg: roundedEstWeight,
        ranchPercentile,
        slowGrowth,
        estimatedSaleDate,
        reachedSaleTarget,
        suggestion: normalizeGrowthDestination(
          obj.suggestion,
          obj.destinoSugerido,
          obj.destino_sugerido,
          obj.suggestedDestination,
          obj.destination
        ),
      });
    }
  }

  const explicitRootAvgG = rootObj
    ? toOptionalFiniteNumber(
        rootObj.ranchAverageDailyGainGrams,
        rootObj.ranch_average_daily_gain_grams,
        rootObj.averageDailyGainGrams,
        rootObj.avgGdpGrams,
        rootObj.promedioRanchoGdpG,
        rootObj.promedio_rancho_gdp_g
      )
    : null;

  const computedEntryAvgG = averageNonNull(
    preliminaryEntries.map((e) => e.dailyGainGrams),
    0
  );
  const firstEntryRanchAvgG =
    preliminaryEntries.find((e) => e.explicitRanchAvgG !== null)
      ?.explicitRanchAvgG ?? null;

  const ranchAverageDailyGainGrams =
    explicitRootAvgG !== null
      ? Math.round(explicitRootAvgG)
      : (firstEntryRanchAvgG ?? computedEntryAvgG);

  const ranking: GrowthRankEntryRecord[] = preliminaryEntries
    .map((e) => {
      const ranchAvg = e.explicitRanchAvgG ?? ranchAverageDailyGainGrams;
      const diffVsRanchAvgGrams =
        e.explicitDiffG ??
        (e.dailyGainGrams !== null && ranchAvg !== null
          ? Math.round(e.dailyGainGrams - ranchAvg)
          : null);
      return {
        key: e.key,
        animalId: e.animalId,
        folioInterno: e.folioInterno,
        sex: e.sex,
        ageDays: e.ageDays,
        dailyGainGrams: e.dailyGainGrams,
        ranchAvgDailyGainGrams: ranchAvg,
        diffVsRanchAvgGrams,
        estimatedWeightTodayKg: e.estimatedWeightTodayKg,
        ranchPercentile: e.ranchPercentile,
        slowGrowth: e.slowGrowth,
        estimatedSaleDate: e.estimatedSaleDate,
        reachedSaleTarget: e.reachedSaleTarget,
        suggestion: e.suggestion,
      };
    })
    .sort((a, b) => {
      const gdpDiff =
        (b.dailyGainGrams ?? Number.NEGATIVE_INFINITY) -
        (a.dailyGainGrams ?? Number.NEGATIVE_INFINITY);
      if (gdpDiff !== 0) return gdpDiff;
      const pctDiff = (b.ranchPercentile ?? -1) - (a.ranchPercentile ?? -1);
      if (pctDiff !== 0) return pctDiff;
      return a.folioInterno.localeCompare(b.folioInterno, 'es-MX', {
        numeric: true,
      });
    });

  return {
    stageAverages: extracted.stageAverages,
    stagePoints: extracted.stagePoints,
    animalSeries: extracted.animalSeries,
    ranking,
    ranchAverageDailyGainGrams,
    saleWeightTargetKg,
    slowGrowthCount: ranking.filter((r) => r.slowGrowth).length,
    reachedTargetCount: ranking.filter((r) => r.reachedSaleTarget).length,
    projectedSaleCount: ranking.filter((r) => r.estimatedSaleDate !== null)
      .length,
    hasData:
      extracted.stageAverages.length > 0 ||
      extracted.stagePoints.length > 0 ||
      ranking.length > 0,
  };
}

export function buildMortalityWeaningSummary(
  rootObj: Record<string, unknown> | null,
  seasons: SeasonReproductionMetric[],
  birthsPerPregnantAgg: { value: number | null; ratio: RatioAggregate | null },
  birthsPerExposedAgg: { value: number | null; ratio: RatioAggregate | null },
  extractedStages: ExtractedStageWeights = extractStageWeights(rootObj)
): MortalityWeaningSummary {
  const nestedSummary =
    rootObj &&
    typeof rootObj.mortalityWeaning === 'object' &&
    rootObj.mortalityWeaning !== null &&
    !Array.isArray(rootObj.mortalityWeaning)
      ? (rootObj.mortalityWeaning as Record<string, unknown>)
      : null;

  const explicitAchievedBirths = rootObj
    ? toOptionalFiniteNumber(
        rootObj.achievedBirthsPct,
        rootObj.achieved_births_pct,
        rootObj.pctNacimientosLogrados,
        rootObj.pct_nacimientos_logrados,
        nestedSummary?.achievedBirthsPct,
        nestedSummary?.overallAchievedBirthsPct
      )
    : null;

  const liveOffspringAgg = aggregateMatchedRatio(
    seasons,
    (s) => s.offspringAliveAtBirth,
    (s) => s.offspringBorn,
    () => null,
    'crías nac.',
    100,
    1
  );

  let overallAchievedBirthsPct: number | null = null;
  let achievedBirthsRatio: RatioAggregate | null = null;
  let achievedBirthsSource: MortalityWeaningSummary['achievedBirthsSource'] =
    null;

  if (explicitAchievedBirths !== null) {
    overallAchievedBirthsPct = roundTo(explicitAchievedBirths, 1);
    achievedBirthsSource = 'explicit';
  } else if (liveOffspringAgg.ratio) {
    overallAchievedBirthsPct = liveOffspringAgg.value;
    achievedBirthsRatio = liveOffspringAgg.ratio;
    achievedBirthsSource = 'live_offspring';
  } else if (birthsPerPregnantAgg.value !== null) {
    overallAchievedBirthsPct = birthsPerPregnantAgg.value;
    achievedBirthsRatio = birthsPerPregnantAgg.ratio;
    achievedBirthsSource = 'births_per_pregnant';
  } else if (birthsPerExposedAgg.value !== null) {
    overallAchievedBirthsPct = birthsPerExposedAgg.value;
    achievedBirthsRatio = birthsPerExposedAgg.ratio;
    achievedBirthsSource = 'births_per_exposed';
  } else {
    const fallbackAchieved = averageNonNull(
      seasons.map((s) => s.achievedBirthsPct),
      1
    );
    if (fallbackAchieved !== null) {
      overallAchievedBirthsPct = fallbackAchieved;
      achievedBirthsSource = 'explicit';
    }
  }

  const explicitOverallMortality = rootObj
    ? toOptionalFiniteNumber(
        rootObj.overallMortalityPct,
        rootObj.overall_mortality_pct,
        rootObj.mortalityPct,
        rootObj.pct_mortalidad,
        nestedSummary?.overallMortalityPct,
        nestedSummary?.mortalityPct
      )
    : null;

  const mortalityAgg = aggregateMatchedRatio(
    seasons,
    (s) => s.offspringDead,
    (s) => s.offspringBorn,
    (s) => s.mortalityPct,
    'crías',
    100,
    1
  );

  const overallMortalityPct =
    explicitOverallMortality !== null
      ? roundTo(explicitOverallMortality, 1)
      : mortalityAgg.value;

  const birthMortalityAgg = aggregateMatchedRatio(
    seasons,
    (s) => s.birthDead,
    (s) => s.offspringBorn,
    (s) => s.birthMortalityPct,
    'crías',
    100,
    1
  );
  const explicitBirthMortality = rootObj
    ? toOptionalFiniteNumber(
        rootObj.birthMortalityPct,
        rootObj.birth_mortality_pct,
        rootObj.pct_mortalidad_nacimiento,
        nestedSummary?.birthMortalityPct
      )
    : null;
  const overallBirthMortalityPct =
    explicitBirthMortality !== null
      ? roundTo(explicitBirthMortality, 1)
      : birthMortalityAgg.value;

  const preWeaningMortalityAgg = aggregateMatchedRatio(
    seasons,
    (s) => s.preWeaningDead,
    (s) => s.offspringBorn,
    (s) => s.preWeaningMortalityPct,
    'crías',
    100,
    1
  );
  const explicitPreWeaningMortality = rootObj
    ? toOptionalFiniteNumber(
        rootObj.preWeaningMortalityPct,
        rootObj.pre_weaning_mortality_pct,
        rootObj.pct_mortalidad_predestete,
        nestedSummary?.preWeaningMortalityPct
      )
    : null;
  const overallPreWeaningMortalityPct =
    explicitPreWeaningMortality !== null
      ? roundTo(explicitPreWeaningMortality, 1)
      : preWeaningMortalityAgg.value;

  const alertSeasons = seasons.filter((s) => s.mortalityAlert);
  const explicitMortalityAlert = rootObj
    ? toOptionalBoolean(
        rootObj.mortalityAlert,
        rootObj.mortality_alert,
        nestedSummary?.mortalityAlert
      )
    : null;
  const mortalityAlert =
    alertSeasons.length > 0 ||
    (overallMortalityPct !== null &&
      overallMortalityPct > MORTALITY_ALERT_THRESHOLD_PCT) ||
    explicitMortalityAlert === true;

  const explicitWeaningSurvival = rootObj
    ? toOptionalFiniteNumber(
        rootObj.weaningSurvivalPct,
        rootObj.weaning_survival_pct,
        rootObj.aliveAtWeaningPct,
        rootObj.pct_crias_vivas_destete,
        nestedSummary?.weaningSurvivalPct,
        nestedSummary?.aliveAtWeaningPct
      )
    : null;

  const weanedAliveAgg = aggregateMatchedRatio(
    seasons,
    (s) => s.weanedAliveCount,
    (s) => s.offspringBorn,
    () => null,
    'crías nac.',
    100,
    1
  );

  let overallWeaningSurvivalPct: number | null = null;
  let weaningSurvivalRatio: RatioAggregate | null = null;
  let weaningSurvivalIsDerived = false;

  if (explicitWeaningSurvival !== null) {
    overallWeaningSurvivalPct = roundTo(explicitWeaningSurvival, 1);
  } else if (weanedAliveAgg.ratio) {
    overallWeaningSurvivalPct = weanedAliveAgg.value;
    weaningSurvivalRatio = weanedAliveAgg.ratio;
  } else if (overallMortalityPct !== null) {
    overallWeaningSurvivalPct = roundTo(Math.max(0, 100 - overallMortalityPct), 1);
    weaningSurvivalIsDerived = true;
    if (mortalityAgg.ratio) {
      weaningSurvivalRatio = {
        numerator: Math.max(
          0,
          mortalityAgg.ratio.denominator - mortalityAgg.ratio.numerator
        ),
        denominator: mortalityAgg.ratio.denominator,
        denominatorLabel: mortalityAgg.ratio.denominatorLabel,
      };
    }
  } else {
    const avgSeasonSurvival = averageNonNull(
      seasons.map((s) => s.weaningSurvivalPct),
      1
    );
    if (avgSeasonSurvival !== null) {
      overallWeaningSurvivalPct = avgSeasonSurvival;
    }
  }

  const weaningWeight = summarizeStageWeights(rootObj, seasons, extractedStages);

  const hasData =
    overallAchievedBirthsPct !== null ||
    overallMortalityPct !== null ||
    overallWeaningSurvivalPct !== null ||
    weaningWeight.averageWeaningWeightKg !== null ||
    weaningWeight.stageAverages.length > 0 ||
    seasons.some(
      (s) =>
        s.mortalityPct !== null ||
        s.achievedBirthsPct !== null ||
        s.weaningSurvivalPct !== null ||
        s.averageWeaningWeightKg !== null
    );

  return {
    overallAchievedBirthsPct,
    achievedBirthsRatio,
    achievedBirthsSource,
    overallMortalityPct,
    mortalityRatio: mortalityAgg.ratio,
    overallBirthMortalityPct,
    overallPreWeaningMortalityPct,
    mortalityAlert,
    alertSeasons,
    overallWeaningSurvivalPct,
    weaningSurvivalRatio,
    weaningSurvivalIsDerived,
    weaningWeight,
    hasData,
  };
}

export function normalizeReproductiveOverview(
  payload: unknown
): ReproductiveOverview {
  const root = unwrapAnalyticsRoot(payload);
  const rootObj =
    root && typeof root === 'object' && !Array.isArray(root)
      ? (root as Record<string, unknown>)
      : null;

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

  const extractedStages = extractStageWeights(rootObj);
  const mortalityWeaning = buildMortalityWeaningSummary(
    rootObj,
    seasons,
    birthsPerPregnantAgg,
    birthsPerExposedAgg,
    extractedStages
  );
  const growth = buildGrowthOverviewSummary(rootObj, extractedStages);

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
    mortalityWeaning,
    growth,
    unproductive: normalizeUnproductiveFemalesOverview(payload),
  };
}
