import { useEffect, useMemo, useState } from 'react';
import { RanchContextNotice } from '../../components/RanchContextNotice';
import { EChartPanel, type EChartsOption } from './EChartPanel';
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  escapeHtml,
  formatGramsPerDay,
  formatShortDateEs,
  formatSignedGramsPerDay,
  formatWeightKg,
  getDataIndex,
} from './analyticsFormatters';
import {
  SLOW_GROWTH_GDP_THRESHOLD_G,
  type GrowthAnimalSeries,
  type GrowthDestinationSuggestion,
  type GrowthOverviewSummary,
  type GrowthRankEntryRecord,
  type StageWeightPointRecord,
} from './analyticsOverview';
import { useAnalyticsOverview } from './useAnalyticsOverview';

export interface GrowthAnalyticsViewProps {
  username: string;
  multiRanch: boolean;
  activeRanchId: string | null;
  ranchName?: string;
  ranchesLoading: boolean;
  ranchesError?: string;
  onRetryRanches?: () => void;
  canOpenAnimalDetail: boolean;
}

type SexFilter = 'ALL' | 'FEMALE' | 'MALE';
type DestFilter = 'ALL' | GrowthDestinationSuggestion;
type PaceFilter = 'ALL' | 'SLOW' | 'READY';

function formatSexLabel(sex: 'FEMALE' | 'MALE' | null): string {
  if (sex === 'FEMALE') return 'Hembra';
  if (sex === 'MALE') return 'Macho';
  return '—';
}

function getDestinationMeta(suggestion: GrowthDestinationSuggestion | null): {
  code: string;
  label: string;
  badgeClass: string;
} {
  if (suggestion === 'BREEDING') {
    return {
      code: 'BREEDING',
      label: 'Reemplazo / cría',
      badgeClass: 'analytics-dest-badge dest-breeding',
    };
  }
  if (suggestion === 'FATTENING') {
    return {
      code: 'FATTENING',
      label: 'Engorda a meta',
      badgeClass: 'analytics-dest-badge dest-review',
    };
  }
  if (suggestion === 'SELL') {
    return {
      code: 'SELL',
      label: 'Venta recomendada',
      badgeClass: 'analytics-dest-badge dest-sell',
    };
  }
  return {
    code: 'SEGUIMIENTO',
    label: 'Sin clasificar',
    badgeClass: 'analytics-dest-badge dest-review',
  };
}

function getDaysUntilDate(isoDate: string | null): number | null {
  if (!isoDate) return null;
  const target = new Date(isoDate.slice(0, 10) + 'T00:00:00');
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const targetUtc = Date.UTC(
    target.getFullYear(),
    target.getMonth(),
    target.getDate()
  );
  return Math.round((targetUtc - todayUtc) / 86_400_000);
}

function buildWeightCurveOption(
  growth: GrowthOverviewSummary,
  selectedAnimal: GrowthAnimalSeries | null
): EChartsOption {
  const { stageAverages } = growth;
  const labels = stageAverages.map((s) => s.stageLabel);
  const hasFemales = stageAverages.some((s) => s.femalesAvgKg !== null);
  const hasMales = stageAverages.some((s) => s.malesAvgKg !== null);

  const series: NonNullable<EChartsOption['series']> = [
    {
      name: 'Promedio del rancho',
      type: 'line',
      smooth: true,
      symbolSize: 8,
      lineStyle: { width: 3, color: '#1B4332' },
      itemStyle: { color: '#1B4332' },
      label: {
        show: !selectedAnimal,
        position: 'top',
        color: '#0F172A',
        fontSize: 11,
        fontWeight: 600,
        formatter: (p) =>
          typeof p.value === 'number' ? `${p.value.toFixed(1)} kg` : '',
      },
      data: stageAverages.map((s) => s.averageWeightKg),
    },
  ];

  if (hasFemales) {
    series.push({
      name: 'Prom. Hembras',
      type: 'line',
      smooth: true,
      symbolSize: 6,
      lineStyle: { width: 2, type: 'dashed', color: '#BE185D' },
      itemStyle: { color: '#BE185D' },
      data: stageAverages.map((s) => s.femalesAvgKg),
    });
  }

  if (hasMales) {
    series.push({
      name: 'Prom. Machos',
      type: 'line',
      smooth: true,
      symbolSize: 6,
      lineStyle: { width: 2, type: 'dashed', color: '#1E40AF' },
      itemStyle: { color: '#1E40AF' },
      data: stageAverages.map((s) => s.malesAvgKg),
    });
  }

  if (selectedAnimal) {
    series.push({
      name: `Ejemplar ${selectedAnimal.folioInterno}`,
      type: 'line',
      smooth: false,
      symbolSize: 9,
      lineStyle: { width: 3, color: '#B45309' },
      itemStyle: { color: '#B45309' },
      data: stageAverages.map(
        (s) => selectedAnimal.weightsByStage[s.stageKey]?.weightKg ?? null
      ),
    });
  }

  return {
    grid: { top: 44, right: 24, bottom: 32, left: 52 },
    legend: {
      top: 0,
      left: 0,
      textStyle: { color: '#334155', fontSize: 12 },
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        const idx = getDataIndex(params);
        const st = stageAverages[idx];
        if (!st) return '';
        const lines = [
          `<strong>${escapeHtml(st.stageLabel)}</strong>`,
          `Promedio rancho: <b>${st.averageWeightKg.toFixed(2)} kg</b> (${st.sampleCount} reg.)`,
        ];
        if (st.femalesAvgKg !== null) {
          lines.push(`Hembras: ${st.femalesAvgKg.toFixed(2)} kg (${st.femalesCount})`);
        }
        if (st.malesAvgKg !== null) {
          lines.push(`Machos: ${st.malesAvgKg.toFixed(2)} kg (${st.malesCount})`);
        }
        if (selectedAnimal) {
          const point = selectedAnimal.weightsByStage[st.stageKey];
          if (point) {
            const diffText =
              point.differenceKg !== null
                ? ` (${point.differenceKg >= 0 ? '+' : ''}${point.differenceKg.toFixed(2)} kg vs rancho)`
                : '';
            lines.push(
              `Ejemplar <b>${escapeHtml(selectedAnimal.folioInterno)}</b>: ${point.weightKg.toFixed(2)} kg${escapeHtml(diffText)}`
            );
          }
        }
        return lines.join('<br/>');
      },
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: '#CBD5E1' } },
      axisLabel: { color: '#334155', fontSize: 12 },
    },
    yAxis: {
      type: 'value',
      min: 0,
      axisLabel: { color: '#334155', fontSize: 11, formatter: '{value} kg' },
      splitLine: { lineStyle: { color: '#E2E8F0' } },
    },
    series,
  };
}

function buildGdpRankingOption(
  entries: GrowthRankEntryRecord[],
  ranchAvgGrams: number | null,
  saleTargetKg: number
): EChartsOption {
  const chartEntries = entries.slice(0, 15);
  const labels = chartEntries.map((e) => e.folioInterno);

  const markLineData: Array<{ yAxis: number; name?: string }> = [];
  if (ranchAvgGrams !== null) {
    markLineData.push({ yAxis: ranchAvgGrams, name: 'Promedio rancho' });
  }

  return {
    grid: { top: 42, right: 26, bottom: 38, left: 56 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const idx = getDataIndex(params);
        const item = chartEntries[idx];
        if (!item) return '';
        const lines = [
          `<strong>${escapeHtml(item.folioInterno)}</strong> (${escapeHtml(formatSexLabel(item.sex))})`,
          `GDP: <b>${escapeHtml(formatGramsPerDay(item.dailyGainGrams))}</b>`,
        ];
        if (item.diffVsRanchAvgGrams !== null) {
          lines.push(
            `Vs promedio rancho: <b>${escapeHtml(formatSignedGramsPerDay(item.diffVsRanchAvgGrams))}</b>`
          );
        }
        if (item.ranchPercentile !== null) {
          lines.push(`Percentil del rancho: P${item.ranchPercentile}`);
        }
        if (item.estimatedWeightTodayKg !== null) {
          lines.push(
            `Peso estimado hoy: ${item.estimatedWeightTodayKg.toFixed(1)} kg / ${saleTargetKg} kg`
          );
        }
        lines.push(
          `Fecha est. venta: ${
            item.reachedSaleTarget
              ? 'Peso meta alcanzado'
              : escapeHtml(formatShortDateEs(item.estimatedSaleDate))
          }`
        );
        return lines.join('<br/>');
      },
    },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: { lineStyle: { color: '#CBD5E1' } },
      axisLabel: {
        color: '#334155',
        fontSize: 11,
        rotate: labels.length > 8 ? 25 : 0,
      },
    },
    yAxis: {
      type: 'value',
      min: chartEntries.some((item) => (item.dailyGainGrams ?? 0) < 0)
        ? undefined
        : 0,
      axisLabel: { color: '#334155', fontSize: 11, formatter: '{value} g/d' },
      splitLine: { lineStyle: { color: '#E2E8F0' } },
    },
    series: [
      {
        name: 'GDP (g/día)',
        type: 'bar',
        barMaxWidth: 36,
        label: {
          show: true,
          position: 'top',
          color: '#0F172A',
          fontSize: 10,
          fontWeight: 600,
          formatter: (p) =>
            typeof p.value === 'number' ? `${Math.round(p.value)}` : '',
        },
        markLine:
          markLineData.length > 0
            ? {
                symbol: 'none',
                silent: true,
                lineStyle: {
                  color: '#1E40AF',
                  type: 'dashed',
                  width: 2,
                },
                label: {
                  show: true,
                  position: 'insideEndTop',
                  formatter: `Prom. rancho: ${Math.round(ranchAvgGrams ?? 0)} g/d`,
                  color: '#1E40AF',
                  fontWeight: 700,
                  fontSize: 11,
                },
                data: markLineData,
              }
            : undefined,
        data: chartEntries.map((item) => {
          const isAboveAvg =
            item.dailyGainGrams !== null &&
            ranchAvgGrams !== null &&
            item.dailyGainGrams >= ranchAvgGrams;
          const color = item.slowGrowth
            ? '#B91C1C'
            : isAboveAvg
              ? '#15803D'
              : '#1E40AF';
          return {
            value: item.dailyGainGrams,
            itemStyle: { color, borderRadius: [4, 4, 0, 0] },
          };
        }),
      },
    ],
  };
}

export function GrowthAnalyticsView({
  username,
  multiRanch,
  activeRanchId,
  ranchName,
  ranchesLoading,
  ranchesError,
  onRetryRanches,
  canOpenAnimalDetail,
}: GrowthAnalyticsViewProps) {
  const { query, overview, loading, errorMessage } = useAnalyticsOverview(
    username,
    activeRanchId,
    'los indicadores de crecimiento'
  );

  const [selectedAnimalKey, setSelectedAnimalKey] = useState('');
  const [search, setSearch] = useState('');
  const [sexFilter, setSexFilter] = useState<SexFilter>('ALL');
  const [destFilter, setDestFilter] = useState<DestFilter>('ALL');
  const [paceFilter, setPaceFilter] = useState<PaceFilter>('ALL');

  useEffect(() => {
    setSelectedAnimalKey('');
    setSearch('');
    setSexFilter('ALL');
    setDestFilter('ALL');
    setPaceFilter('ALL');
  }, [activeRanchId]);

  const growth = overview?.growth;

  const selectedAnimal = useMemo(
    () =>
      growth?.animalSeries.find((a) => a.animalKey === selectedAnimalKey) ??
      null,
    [growth?.animalSeries, selectedAnimalKey]
  );

  const filteredRanking = useMemo(() => {
    if (!growth) return [];
    const term = search.trim().toLowerCase();
    return growth.ranking.filter((entry) => {
      if (sexFilter !== 'ALL' && entry.sex !== sexFilter) return false;
      if (destFilter !== 'ALL' && entry.suggestion !== destFilter) return false;
      if (paceFilter === 'SLOW' && !entry.slowGrowth) return false;
      if (paceFilter === 'READY' && !entry.reachedSaleTarget) return false;
      if (term) {
        const hay = `${entry.folioInterno} ${entry.animalId ?? ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [growth, search, sexFilter, destFilter, paceFilter]);

  const weightCurveOption = useMemo(
    () => (growth ? buildWeightCurveOption(growth, selectedAnimal) : null),
    [growth, selectedAnimal]
  );

  const gdpRankingOption = useMemo(
    () =>
      growth && growth.ranking.length > 0
        ? buildGdpRankingOption(
            growth.ranking,
            growth.ranchAverageDailyGainGrams,
            growth.saleWeightTargetKg
          )
        : null,
    [growth]
  );

  if (!activeRanchId) {
    return (
      <RanchContextNotice
        eyebrow="Crecimiento y ranking GDP"
        multiRanch={multiRanch}
        loading={ranchesLoading}
        error={ranchesError}
        onRetry={onRetryRanches}
        contextLabel="las curvas de peso y ranking GDP"
      />
    );
  }

  const hasActiveFilters =
    search.trim().length > 0 ||
    sexFilter !== 'ALL' ||
    destFilter !== 'ALL' ||
    paceFilter !== 'ALL';

  function resetFilters() {
    setSearch('');
    setSexFilter('ALL');
    setDestFilter('ALL');
    setPaceFilter('ALL');
  }

  const topEntry = growth?.ranking[0] ?? null;

  return (
    <div className="analytics-view">
      <div className="title-row">
        <div>
          <p className="eyebrow">
            {ranchName ? `${ranchName} · ` : ''}
            Analítica zootécnica · RF-WEB-08
          </p>
          <h1>Crecimiento y ranking GDP</h1>
          <p className="intro">
            Curvas de peso por etapa (<code>v_peso_etapa</code>), ranking de
            ganancia diaria de peso (GDP en g/día) comparado con el promedio del
            rancho y fecha estimada a peso de venta (
            {growth?.saleWeightTargetKg ?? 35} kg).
          </p>
        </div>
        <div className="count-card">
          <b>{growth?.ranking.length ?? 0}</b>
          <span>
            {(growth?.ranking.length ?? 0) === 1 ? 'cordero' : 'corderos'}
          </span>
        </div>
      </div>

      {errorMessage ? (
        <section className="analytics-error" role="alert">
          <div>
            <strong>No se pudieron cargar los datos de crecimiento</strong>
            <p className="error">{errorMessage}</p>
          </div>
          <button
            type="button"
            className="secondary-button"
            disabled={loading}
            onClick={() => {
              void query.refetch();
            }}
          >
            {loading ? 'Reintentando…' : 'Reintentar'}
          </button>
        </section>
      ) : query.isLoading ? (
        <section className="empty-panel" role="status" aria-live="polite">
          <p className="muted">
            Cargando curvas de crecimiento y ranking GDP del rancho activo…
          </p>
        </section>
      ) : !overview || !growth || !growth.hasData ? (
        <section className="empty-panel">
          <p className="eyebrow">Sin datos suficientes</p>
          <h1>Sin registros de peso por etapa ni ranking GDP</h1>
          <p className="intro">
            Se requieren al menos dos pesajes en fechas distintas por cordero
            para calcular GDP y proyectar fecha a peso de venta en{' '}
            {ranchName || 'el rancho activo'}.
          </p>
        </section>
      ) : (
        <>
          <section
            className="analytics-kpi-grid"
            aria-label="Resumen de crecimiento y ganancia diaria"
          >
            <article className="analytics-kpi-card">
              <span className="analytics-kpi-label">GDP promedio del rancho</span>
              <strong className="analytics-kpi-value">
                {formatGramsPerDay(growth.ranchAverageDailyGainGrams)}
              </strong>
              <small className="analytics-kpi-meta">
                {growth.ranking.length > 0
                  ? `Base comparativa de ${growth.ranking.length} corderos activos`
                  : 'Sin ranking GDP evaluado'}
              </small>
            </article>

            <article className="analytics-kpi-card">
              <span className="analytics-kpi-label">Mejor GDP evaluado</span>
              <strong className="analytics-kpi-value">
                {topEntry
                  ? formatGramsPerDay(topEntry.dailyGainGrams)
                  : '—'}
              </strong>
              <small className="analytics-kpi-meta">
                {topEntry
                  ? `${topEntry.folioInterno}${
                      topEntry.diffVsRanchAvgGrams !== null
                        ? ` (${formatSignedGramsPerDay(topEntry.diffVsRanchAvgGrams)} vs prom.)`
                        : ''
                    }`
                  : 'Sin datos de ranking'}
              </small>
            </article>

            <article
              className={`analytics-kpi-card${growth.slowGrowthCount > 0 ? ' analytics-kpi-warning' : ''}`}
            >
              <span className="analytics-kpi-label">
                Crecimiento lento (&lt;{SLOW_GROWTH_GDP_THRESHOLD_G} g/d)
              </span>
              <strong className="analytics-kpi-value">
                {growth.slowGrowthCount}
              </strong>
              <small className="analytics-kpi-meta">
                Corderos por debajo del umbral mínimo ({SLOW_GROWTH_GDP_THRESHOLD_G}{' '}
                g/día)
              </small>
            </article>

            <article className="analytics-kpi-card">
              <span className="analytics-kpi-label">
                Meta de venta ({growth.saleWeightTargetKg} kg)
              </span>
              <strong className="analytics-kpi-value">
                {growth.reachedTargetCount}
              </strong>
              <small className="analytics-kpi-meta">
                Listos hoy · {growth.projectedSaleCount} con fecha estimada
              </small>
            </article>
          </section>

          <section
            className="analytics-charts-grid"
            aria-label="Gráficas de curvas de peso y ranking GDP"
          >
            <article className="analytics-chart-card">
              <div className="analytics-chart-head">
                <div>
                  <h2>Curvas de peso por etapa</h2>
                  <p>
                    Promedio del rancho por hito (Nacimiento → Destete → 120 d →
                    150 d → Evaluación)
                  </p>
                </div>
                {growth.animalSeries.length > 0 && (
                  <label className="analytics-inline-select">
                    <span>Comparar ejemplar</span>
                    <select
                      aria-label="Comparar ejemplar en curva de peso"
                      value={selectedAnimalKey}
                      onChange={(e) => setSelectedAnimalKey(e.target.value)}
                    >
                      <option value="">Solo promedios del rancho</option>
                      {growth.animalSeries.map((animal) => (
                        <option key={animal.animalKey} value={animal.animalKey}>
                          {animal.folioInterno} ({formatSexLabel(animal.sex)})
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {weightCurveOption && growth.stageAverages.length > 0 ? (
                <EChartPanel
                  option={weightCurveOption}
                  ariaLabel="Gráfica de curvas de peso promedio por etapa y por sexo del rancho activo"
                />
              ) : (
                <div className="analytics-chart-empty">
                  <p className="muted">
                    Sin pesajes por etapa suficientes para trazar curvas de
                    crecimiento.
                  </p>
                </div>
              )}
            </article>

            <article className="analytics-chart-card">
              <div className="analytics-chart-head">
                <div>
                  <h2>Ranking GDP vs promedio del rancho</h2>
                  <p>
                    Ganancia diaria de peso (g/día) respecto al promedio{' '}
                    {formatGramsPerDay(growth.ranchAverageDailyGainGrams)}
                  </p>
                </div>
                <span className="analytics-chart-pill">
                  {growth.ranking.length > 15
                    ? `Top 15 de ${growth.ranking.length}`
                    : `${growth.ranking.length} evaluados`}
                </span>
              </div>
              {gdpRankingOption ? (
                <EChartPanel
                  option={gdpRankingOption}
                  ariaLabel="Gráfica de ranking de ganancia diaria de peso comparada con el promedio del rancho"
                />
              ) : (
                <div className="analytics-chart-empty">
                  <p className="muted">
                    Sin datos de ganancia diaria de peso (GDP) disponibles.
                  </p>
                </div>
              )}
            </article>
          </section>

          {selectedAnimal && (
            <section
              className="analytics-stage-compare-card"
              aria-label={`Comparativa de ${selectedAnimal.folioInterno} contra promedio del rancho`}
            >
              <div className="analytics-chart-head">
                <div>
                  <h2>
                    Comparativa por etapa: {selectedAnimal.folioInterno} (
                    {formatSexLabel(selectedAnimal.sex)})
                  </h2>
                  <p>
                    Peso individual registrado frente al promedio del rancho de su
                    mismo sexo y hito (<code>v_peso_etapa</code>)
                  </p>
                </div>
                {canOpenAnimalDetail && selectedAnimal.animalId && (
                  <a
                    className="secondary-button"
                    href={`#/inventario/${encodeURIComponent(selectedAnimal.animalId)}`}
                  >
                    Ver ficha del ejemplar
                  </a>
                )}
              </div>
              <div className="analytics-stage-pills">
                {(
                  Object.values(selectedAnimal.weightsByStage) as StageWeightPointRecord[]
                ).map((pt) => (
                  <div key={pt.key} className="analytics-stage-chip">
                    <span className="analytics-kpi-label">{pt.stageLabel}</span>
                    <strong>{formatWeightKg(pt.weightKg)}</strong>
                    <small>
                      {pt.ranchAverageKg !== null
                        ? `Prom. rancho: ${pt.ranchAverageKg.toFixed(2)} kg`
                        : 'Pesaje registrado'}
                      {pt.differenceKg !== null
                        ? ` (${pt.differenceKg >= 0 ? '+' : ''}${pt.differenceKg.toFixed(2)} kg)`
                        : ''}
                    </small>
                  </div>
                ))}
              </div>
            </section>
          )}

          {growth.ranking.length > 0 && (
            <>
              <section
                className="filters analytics-alerts-filters"
                aria-label="Filtros del ranking GDP y fecha estimada a venta"
              >
                <div className="filter-title">
                  <div className="filter-title-left">
                    <strong>Filtrar ranking GDP y proyección a venta</strong>
                    <span className="filter-count-badge">
                      {filteredRanking.length}{' '}
                      {filteredRanking.length === 1 ? 'cordero' : 'corderos'}
                    </span>
                  </div>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={resetFilters}
                    >
                      Limpiar filtros
                    </button>
                  )}
                </div>

                <div className="analytics-filter-grid analytics-filter-grid-4">
                  <label>
                    Buscar por folio o ID
                    <input
                      type="search"
                      placeholder="Ej. CORD-12…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>

                  <label>
                    Sexo
                    <select
                      value={sexFilter}
                      onChange={(e) => setSexFilter(e.target.value as SexFilter)}
                    >
                      <option value="ALL">Todos los sexos</option>
                      <option value="FEMALE">Hembras</option>
                      <option value="MALE">Machos</option>
                    </select>
                  </label>

                  <label>
                    Destino sugerido
                    <select
                      value={destFilter}
                      onChange={(e) =>
                        setDestFilter(e.target.value as DestFilter)
                      }
                    >
                      <option value="ALL">Todos los destinos</option>
                      <option value="BREEDING">BREEDING · Reemplazo / cría</option>
                      <option value="FATTENING">FATTENING · Engorda</option>
                      <option value="SELL">SELL · Venta</option>
                    </select>
                  </label>

                  <label>
                    Ritmo / meta ({growth.saleWeightTargetKg} kg)
                    <select
                      value={paceFilter}
                      onChange={(e) =>
                        setPaceFilter(e.target.value as PaceFilter)
                      }
                    >
                      <option value="ALL">Todos</option>
                      <option value="SLOW">
                        Crecimiento lento (&lt;{SLOW_GROWTH_GDP_THRESHOLD_G} g/d)
                      </option>
                      <option value="READY">
                        Peso meta alcanzado (≥{growth.saleWeightTargetKg} kg)
                      </option>
                    </select>
                  </label>
                </div>
              </section>

              {filteredRanking.length === 0 ? (
                <section className="empty-panel">
                  <p className="eyebrow">Sin coincidencias</p>
                  <h1>Ningún cordero coincide con el filtro actual</h1>
                  <button
                    type="button"
                    className="secondary-button empty-reset-button"
                    onClick={resetFilters}
                  >
                    Restablecer filtros
                  </button>
                </section>
              ) : (
                <section
                  className="table"
                  aria-label="Tabla de ranking GDP y fecha estimada a peso de venta"
                >
                  <div className="table-head">
                    <b>Ranking GDP y fecha estimada a peso de venta</b>
                    <span>
                      {loading
                        ? 'Actualizando…'
                        : `${filteredRanking.length} de ${growth.ranking.length}`}
                    </span>
                    <small>{ranchName || 'Rancho activo'}</small>
                  </div>

                  <div className="scroll">
                    <table className="analytics-table">
                      <thead>
                        <tr>
                          <th>Pos.</th>
                          <th>Cordero (Folio)</th>
                          <th>Sexo / Edad</th>
                          <th className="num">Peso est. hoy</th>
                          <th className="num">GDP (g/día)</th>
                          <th className="num">Vs promedio rancho</th>
                          <th>Fecha est. venta ({growth.saleWeightTargetKg} kg)</th>
                          <th>Destino sugerido</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRanking.map((item, idx) => {
                          const originalRank =
                            growth.ranking.findIndex((r) => r.key === item.key) + 1;
                          const dest = getDestinationMeta(item.suggestion);
                          const daysRemaining = getDaysUntilDate(
                            item.estimatedSaleDate
                          );
                          const diff = item.diffVsRanchAvgGrams;

                          return (
                            <tr
                              key={item.key}
                              className={
                                item.slowGrowth
                                  ? 'analytics-alert-row-warning'
                                  : undefined
                              }
                            >
                              <td className="analytics-num-strong">
                                #{originalRank > 0 ? originalRank : idx + 1}
                              </td>

                              <td>
                                {canOpenAnimalDetail && item.animalId ? (
                                  <a
                                    className="animal-link"
                                    href={`#/inventario/${encodeURIComponent(item.animalId)}`}
                                  >
                                    {item.folioInterno}
                                    {item.ranchPercentile !== null && (
                                      <small>
                                        Percentil P{item.ranchPercentile}
                                      </small>
                                    )}
                                  </a>
                                ) : (
                                  <div>
                                    <strong>{item.folioInterno}</strong>
                                    {item.ranchPercentile !== null && (
                                      <small>
                                        Percentil P{item.ranchPercentile}
                                      </small>
                                    )}
                                  </div>
                                )}
                              </td>

                              <td>
                                <div>
                                  <span>{formatSexLabel(item.sex)}</span>
                                  {item.ageDays !== null && (
                                    <small>{item.ageDays} días</small>
                                  )}
                                </div>
                              </td>

                              <td className="num analytics-num-strong">
                                {item.estimatedWeightTodayKg !== null
                                  ? `${item.estimatedWeightTodayKg.toFixed(1)} kg`
                                  : '—'}
                              </td>

                              <td className="num analytics-num-strong">
                                <div className="analytics-cell-status">
                                  <span>
                                    {formatGramsPerDay(item.dailyGainGrams)}
                                  </span>
                                  {item.slowGrowth && (
                                    <span
                                      className="analytics-threshold-pill threshold-alert"
                                      role="status"
                                    >
                                      <AlertTriangleIcon size={12} />
                                      Lento
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="num">
                                <div>
                                  <strong
                                    className={
                                      diff === null
                                        ? ''
                                        : diff >= 0
                                          ? 'analytics-gdp-positive'
                                          : 'analytics-gdp-negative'
                                    }
                                  >
                                    {formatSignedGramsPerDay(diff)}
                                  </strong>
                                  {item.ranchAvgDailyGainGrams !== null && (
                                    <small>
                                      Prom.: {item.ranchAvgDailyGainGrams} g/d
                                    </small>
                                  )}
                                </div>
                              </td>

                              <td>
                                {item.reachedSaleTarget ? (
                                  <div>
                                    <span className="analytics-threshold-pill threshold-ok">
                                      <CheckCircleIcon size={12} />
                                      Peso meta alcanzado
                                    </span>
                                    {item.estimatedSaleDate && (
                                      <small>
                                        {formatShortDateEs(
                                          item.estimatedSaleDate
                                        )}
                                      </small>
                                    )}
                                  </div>
                                ) : item.estimatedSaleDate ? (
                                  <div>
                                    <strong>
                                      {formatShortDateEs(
                                        item.estimatedSaleDate
                                      )}
                                    </strong>
                                    {daysRemaining !== null && (
                                      <small>
                                        {daysRemaining > 0
                                          ? `Faltan ${daysRemaining} ${daysRemaining === 1 ? 'día' : 'días'}`
                                          : daysRemaining === 0
                                            ? 'Estimado hoy'
                                            : 'Fecha estimada alcanzada'}
                                      </small>
                                    )}
                                  </div>
                                ) : (
                                  <span className="muted">
                                    Sin proyección (GDP ≤ 20 g/d)
                                  </span>
                                )}
                              </td>

                              <td>
                                <div className={dest.badgeClass}>
                                  <strong>{dest.code}</strong>
                                  <span>{dest.label}</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
