import { useMemo } from 'react';
import { RanchContextNotice } from '../../components/RanchContextNotice';
import { EChartPanel, type EChartsOption } from './EChartPanel';
import {
  AlertTriangleIcon,
  escapeHtml,
  formatCount,
  formatPct,
  formatRatio,
  getDataIndex,
} from './analyticsFormatters';
import {
  MORTALITY_ALERT_THRESHOLD_PCT,
  resolvePendingWeaningsSummary,
  type SeasonReproductionMetric,
} from './analyticsOverview';
import { useAnalyticsOverview } from './useAnalyticsOverview';

export interface ReproductiveAnalyticsViewProps {
  username: string;
  multiRanch: boolean;
  activeRanchId: string | null;
  ranchName?: string;
  ranchWeaningTargetDays?: number | null;
  ranchesLoading: boolean;
  ranchesError?: string;
  onRetryRanches?: () => void;
}

function getSeasonalPregnancySubtitle(
  seasons: SeasonReproductionMetric[]
): string {
  const hasDiagnosedBars = seasons.some(
    (s) => s.pregnancyPct !== null && s.diagnosed !== null && s.diagnosed > 0
  );
  const hasExposedOnlyBars = seasons.some(
    (s) =>
      s.pregnancyPct !== null &&
      (s.diagnosed === null || s.diagnosed === 0) &&
      s.exposedFemales !== null &&
      s.exposedFemales > 0
  );
  if (hasDiagnosedBars && hasExposedOnlyBars) {
    return 'Por temporada: preñadas / diagnosticadas (o / expuestas cuando no hay diagnóstico)';
  }
  if (hasExposedOnlyBars && !hasDiagnosedBars) {
    return 'Por temporada: hembras preñadas respecto al total expuesto';
  }
  if (hasDiagnosedBars) {
    return 'Por temporada: hembras preñadas respecto al total diagnosticado';
  }
  return 'Por temporada: porcentaje de preñez reportado (diagnosticadas o expuestas)';
}

function buildPregnancyOption(
  seasons: SeasonReproductionMetric[]
): EChartsOption {
  const labels = seasons.map((s) => s.seasonLabel);
  return {
    color: ['#1B4332'],
    grid: { top: 28, right: 18, bottom: 32, left: 48 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const idx = getDataIndex(params);
        const s = seasons[idx];
        if (!s) return '';
        const lines = [
          `<strong>${escapeHtml(s.seasonLabel)}</strong>`,
          `% de preñez: <b>${formatPct(s.pregnancyPct)}</b>`,
        ];
        if (s.diagnosed !== null && s.diagnosed > 0) {
          lines.push(
            `Preñadas: ${formatCount(s.pregnant)} / Diagnosticadas: ${s.diagnosed}`
          );
        } else if (s.exposedFemales !== null && s.exposedFemales > 0) {
          lines.push(
            `Preñadas: ${formatCount(s.pregnant)} / Expuestas: ${s.exposedFemales}`
          );
        }
        if (s.exposedFemales !== null) {
          lines.push(`Hembras expuestas: ${s.exposedFemales}`);
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
      max: (val) => Math.max(100, Math.ceil((val.max || 100) / 10) * 10),
      axisLabel: { color: '#334155', fontSize: 11, formatter: '{value}%' },
      splitLine: { lineStyle: { color: '#E2E8F0' } },
    },
    series: [
      {
        name: '% de preñez',
        type: 'bar',
        barMaxWidth: 44,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        label: {
          show: true,
          position: 'top',
          color: '#0F172A',
          fontSize: 11,
          fontWeight: 600,
          formatter: (p) =>
            typeof p.value === 'number' ? `${p.value.toFixed(1)}%` : '',
        },
        data: seasons.map((s) => s.pregnancyPct),
      },
    ],
  };
}

function buildBirthRatesOption(
  seasons: SeasonReproductionMetric[]
): EChartsOption {
  const labels = seasons.map((s) => s.seasonLabel);
  return {
    color: ['#1B4332', '#1E40AF'],
    grid: { top: 42, right: 18, bottom: 32, left: 48 },
    legend: {
      top: 0,
      left: 0,
      textStyle: { color: '#334155', fontSize: 12 },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const idx = getDataIndex(params);
        const s = seasons[idx];
        if (!s) return '';
        const lines = [
          `<strong>${escapeHtml(s.seasonLabel)}</strong>`,
          `Paridas / Preñadas: <b>${formatPct(s.birthsPerPregnantPct)}</b>`,
          `Paridas / Expuestas: <b>${formatPct(s.birthsPerExposedPct)}</b>`,
        ];
        if (
          s.births !== null ||
          s.pregnant !== null ||
          s.exposedFemales !== null
        ) {
          lines.push(
            `Partos: ${formatCount(s.births)} · Preñadas: ${formatCount(s.pregnant)} · Expuestas: ${formatCount(s.exposedFemales)}`
          );
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
      max: (val) => Math.max(100, Math.ceil((val.max || 100) / 10) * 10),
      axisLabel: { color: '#334155', fontSize: 11, formatter: '{value}%' },
      splitLine: { lineStyle: { color: '#E2E8F0' } },
    },
    series: [
      {
        name: 'Paridas / Preñadas',
        type: 'bar',
        barMaxWidth: 28,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        data: seasons.map((s) => s.birthsPerPregnantPct),
      },
      {
        name: 'Paridas / Expuestas',
        type: 'bar',
        barMaxWidth: 28,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        data: seasons.map((s) => s.birthsPerExposedPct),
      },
    ],
  };
}

function buildProlificityOption(
  seasons: SeasonReproductionMetric[]
): EChartsOption {
  const labels = seasons.map((s) => s.seasonLabel);
  return {
    color: ['#B45309', '#1B4332'],
    grid: { top: 36, right: 18, bottom: 32, left: 48 },
    legend: {
      top: 0,
      left: 0,
      textStyle: { color: '#334155', fontSize: 12 },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const idx = getDataIndex(params);
        const s = seasons[idx];
        if (!s) return '';
        const lines = [
          `<strong>${escapeHtml(s.seasonLabel)}</strong>`,
          `Prolificidad: <b>${formatRatio(s.prolificity)} crías/parto</b>`,
        ];
        if (s.offspringBorn !== null || s.births !== null) {
          lines.push(
            `Crías nacidas: ${formatCount(s.offspringBorn)} / Partos: ${formatCount(s.births)}`
          );
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
      minInterval: 0.5,
      axisLabel: {
        color: '#334155',
        fontSize: 11,
        formatter: (value: number) => value.toFixed(1),
      },
      splitLine: { lineStyle: { color: '#E2E8F0' } },
    },
    series: [
      {
        name: 'Crías / parto',
        type: 'bar',
        barMaxWidth: 40,
        itemStyle: { color: '#D97706', borderRadius: [4, 4, 0, 0] },
        label: {
          show: true,
          position: 'top',
          color: '#0F172A',
          fontSize: 11,
          fontWeight: 600,
          formatter: (p) =>
            typeof p.value === 'number' ? p.value.toFixed(2) : '',
        },
        data: seasons.map((s) => s.prolificity),
      },
      {
        name: 'Tendencia',
        type: 'line',
        smooth: false,
        symbolSize: 7,
        lineStyle: { width: 2, color: '#1B4332' },
        itemStyle: { color: '#1B4332' },
        data: seasons.map((s) => s.prolificity),
      },
    ],
  };
}

export function ReproductiveAnalyticsView({
  username,
  multiRanch,
  activeRanchId,
  ranchName,
  ranchWeaningTargetDays,
  ranchesLoading,
  ranchesError,
  onRetryRanches,
}: ReproductiveAnalyticsViewProps) {
  const { query: overviewQuery, overview, loading, errorMessage } =
    useAnalyticsOverview(
      username,
      activeRanchId,
      'los indicadores reproductivos'
    );

  const seasons = overview?.seasons ?? [];
  const unproductive = overview?.unproductive;
  const unproductiveAlertCount = unproductive?.alertItems.length ?? 0;
  const resolvedPendingWeanings = useMemo(
    () =>
      overview
        ? resolvePendingWeaningsSummary(
            overview.pendingWeanings,
            ranchWeaningTargetDays
          )
        : null,
    [overview, ranchWeaningTargetDays]
  );
  const overdueWeaningsCount = resolvedPendingWeanings?.overdueCount ?? 0;

  const pregnancyOption = useMemo(
    () => buildPregnancyOption(seasons),
    [seasons]
  );
  const birthRatesOption = useMemo(
    () => buildBirthRatesOption(seasons),
    [seasons]
  );
  const prolificityOption = useMemo(
    () => buildProlificityOption(seasons),
    [seasons]
  );

  if (!activeRanchId) {
    return (
      <RanchContextNotice
        eyebrow="Indicadores reproductivos"
        multiRanch={multiRanch}
        loading={ranchesLoading}
        error={ranchesError}
        onRetry={onRetryRanches}
        contextLabel="sus indicadores reproductivos"
      />
    );
  }

  return (
    <div className="analytics-view">
      <div className="title-row">
        <div>
          <p className="eyebrow">
            {ranchName ? `${ranchName} · ` : ''}
            Analítica zootécnica · RF-WEB-08
          </p>
          <h1>Indicadores reproductivos</h1>
          <p className="intro">
            Desempeño por temporada del rancho activo: tasa de preñez, tasa de partos
            (paridas/preñadas y paridas/expuestas) y prolificidad promedio.
          </p>
        </div>
        <div className="count-card">
          <b>{seasons.length}</b>
          <span>{seasons.length === 1 ? 'temporada' : 'temporadas'}</span>
        </div>
      </div>

      {!errorMessage && !overviewQuery.isLoading && overview?.mortalityWeaning.mortalityAlert && (
        <section
          className="analytics-error analytics-mortality-alert-panel"
          role="alert"
        >
          <div className="analytics-alert-icon-row">
            <span className="analytics-alert-icon-badge">
              <AlertTriangleIcon size={18} />
            </span>
            <div>
              <strong>
                Alerta: mortalidad de crías supera la meta (&gt;{MORTALITY_ALERT_THRESHOLD_PCT}%)
              </strong>
              <p>
                {overview.mortalityWeaning.overallMortalityPct !== null
                  ? `Mortalidad actual: ${overview.mortalityWeaning.overallMortalityPct.toFixed(1)}%`
                  : 'Mortalidad superior al límite recomendado'}
                {overview.mortalityWeaning.alertSeasons.length > 0
                  ? ` · Temporadas en alerta: ${overview.mortalityWeaning.alertSeasons
                      .map((s) => `${s.seasonLabel} (${formatPct(s.mortalityPct)})`)
                      .join(', ')}`
                  : ''}
              </p>
            </div>
          </div>
          <a className="secondary-button" href="#/mortalidad-destete">
            Ver mortalidad y destete
          </a>
        </section>
      )}

      {!errorMessage && !overviewQuery.isLoading && unproductive && unproductiveAlertCount > 0 && (
        <section
          className="analytics-alert-banner"
          role="region"
          aria-label="Resumen de alertas de vientres improductivos"
        >
          <div className="analytics-alert-banner-copy">
            <strong>
              {unproductiveAlertCount}{' '}
              {unproductiveAlertCount === 1
                ? 'vientre improductivo detectado'
                : 'vientres improductivos detectados'}
            </strong>
            <p>
              {unproductive.cullCount} CULL (desecho a rastro) ·{' '}
              {unproductive.sellCount} SELL (venta)
              {unproductive.mortalityAlertCount > 0
                ? ` · ${unproductive.mortalityAlertCount} con mortalidad crítica`
                : ''}
              {unproductive.infertilityAlertCount > 0
                ? ` · ${unproductive.infertilityAlertCount} con infertilidad prolongada`
                : ''}
            </p>
          </div>
          <a className="secondary-button" href="#/vientres-improductivos">
            Abrir tablero CULL / SELL
          </a>
        </section>
      )}

      {!errorMessage && !overviewQuery.isLoading && overview && overdueWeaningsCount > 0 && (
        <section
          className="analytics-alert-banner"
          role="region"
          aria-label="Resumen de destetes vencidos"
        >
          <div className="analytics-alert-banner-copy">
            <strong>
              {overdueWeaningsCount}{' '}
              {overdueWeaningsCount === 1
                ? 'destete vencido'
                : 'destetes vencidos'}
            </strong>
            <p>
              Superaron la meta de{' '}
              {resolvedPendingWeanings?.ranchWeaningTargetDays ??
                overview.pendingWeanings.ranchWeaningTargetDays}{' '}
              días del rancho sin destete confirmado.
            </p>
          </div>
          <a className="secondary-button" href="#/destetes-pendientes">
            Ver destetes pendientes
          </a>
        </section>
      )}

      {errorMessage ? (
        <section className="analytics-error" role="alert">
          <div>
            <strong>No se pudieron cargar los indicadores</strong>
            <p className="error">{errorMessage}</p>
          </div>
          <button
            type="button"
            className="secondary-button"
            disabled={loading}
            onClick={() => {
              void overviewQuery.refetch();
            }}
          >
            {loading ? 'Reintentando…' : 'Reintentar'}
          </button>
        </section>
      ) : overviewQuery.isLoading ? (
        <section className="empty-panel" role="status" aria-live="polite">
          <p className="muted">Cargando indicadores reproductivos del rancho activo…</p>
        </section>
      ) : !overview || seasons.length === 0 ? (
        <section className="empty-panel">
          <p className="eyebrow">Sin datos de temporada</p>
          <h1>No hay indicadores reproductivos registrados</h1>
          <p className="intro">
            Aún no existen eventos suficientes de empadres y partos para calcular
            temporadas reproductivas en {ranchName || 'el rancho activo'}.
          </p>
        </section>
      ) : (
        <>
          <section
            className="analytics-kpi-grid"
            aria-label="Resumen reproductivo del rancho activo"
          >
            <article className="analytics-kpi-card">
              <span className="analytics-kpi-label">% de preñez</span>
              <strong className="analytics-kpi-value">
                {formatPct(overview.overallPregnancyPct)}
              </strong>
              {overview.pregnancyRatio && (
                <small className="analytics-kpi-meta">
                  {overview.pregnancyRatio.numerator} preñadas /{' '}
                  {overview.pregnancyRatio.denominator}{' '}
                  {overview.pregnancyRatio.denominatorLabel}
                </small>
              )}
            </article>

            <article className="analytics-kpi-card">
              <span className="analytics-kpi-label">Partos / Preñadas</span>
              <strong className="analytics-kpi-value">
                {formatPct(overview.overallBirthsPerPregnantPct)}
              </strong>
              {overview.birthsPerPregnantRatio && (
                <small className="analytics-kpi-meta">
                  {overview.birthsPerPregnantRatio.numerator} partos /{' '}
                  {overview.birthsPerPregnantRatio.denominator}{' '}
                  {overview.birthsPerPregnantRatio.denominatorLabel}
                </small>
              )}
            </article>

            <article className="analytics-kpi-card">
              <span className="analytics-kpi-label">Partos / Expuestas</span>
              <strong className="analytics-kpi-value">
                {formatPct(overview.overallBirthsPerExposedPct)}
              </strong>
              {overview.birthsPerExposedRatio && (
                <small className="analytics-kpi-meta">
                  {overview.birthsPerExposedRatio.numerator} partos /{' '}
                  {overview.birthsPerExposedRatio.denominator}{' '}
                  {overview.birthsPerExposedRatio.denominatorLabel}
                </small>
              )}
            </article>

            <article className="analytics-kpi-card">
              <span className="analytics-kpi-label">Prolificidad</span>
              <strong className="analytics-kpi-value">
                {formatRatio(overview.overallProlificity)}
              </strong>
              {overview.prolificityRatio && (
                <small className="analytics-kpi-meta">
                  {overview.prolificityRatio.numerator} crías /{' '}
                  {overview.prolificityRatio.denominator}{' '}
                  {overview.prolificityRatio.denominatorLabel}
                </small>
              )}
            </article>
          </section>

          <section
            className="analytics-charts-grid"
            aria-label="Gráficas de indicadores reproductivos"
          >
            <article className="analytics-chart-card">
              <div className="analytics-chart-head">
                <div>
                  <h2>% de preñez por temporada</h2>
                  <p>{getSeasonalPregnancySubtitle(seasons)}</p>
                </div>
                <span className="analytics-chart-pill">
                  Global
                  {overview.pregnancyRatio
                    ? ` (${overview.pregnancyRatio.denominatorLabel})`
                    : ''}
                  : {formatPct(overview.overallPregnancyPct)}
                </span>
              </div>
              <EChartPanel
                option={pregnancyOption}
                ariaLabel="Gráfica de porcentaje de preñez por temporada del rancho activo"
              />
            </article>

            <article className="analytics-chart-card">
              <div className="analytics-chart-head">
                <div>
                  <h2>% de partos por temporada</h2>
                  <p>Comparativa paridas/preñadas frente a paridas/expuestas</p>
                </div>
                <span className="analytics-chart-pill">
                  Paridas/Exp.: {formatPct(overview.overallBirthsPerExposedPct)}
                </span>
              </div>
              <EChartPanel
                option={birthRatesOption}
                ariaLabel="Gráfica de porcentaje de partos paridas sobre preñadas y paridas sobre expuestas"
              />
            </article>

            <article className="analytics-chart-card analytics-chart-card-wide">
              <div className="analytics-chart-head">
                <div>
                  <h2>Prolificidad (crías / parto) por temporada</h2>
                  <p>Promedio de crías totales nacidas por cada evento de parto</p>
                </div>
                <span className="analytics-chart-pill">
                  Promedio: {formatRatio(overview.overallProlificity)} crías/parto
                </span>
              </div>
              <EChartPanel
                option={prolificityOption}
                ariaLabel="Gráfica de prolificidad en crías por parto por temporada"
              />
            </article>
          </section>

          <section className="table" aria-label="Detalle reproductivo por temporada">
            <div className="table-head">
              <b>Desglose por temporada</b>
              <span>
                {loading
                  ? 'Actualizando…'
                  : `${seasons.length} ${seasons.length === 1 ? 'temporada' : 'temporadas'}`}
              </span>
              <small>{ranchName || 'Rancho activo'}</small>
            </div>

            <div className="scroll">
              <table className="analytics-table">
                <thead>
                  <tr>
                    <th>Temporada</th>
                    <th className="num">Expuestas</th>
                    <th className="num">Diagnosticadas</th>
                    <th className="num">Preñadas</th>
                    <th className="num">% Preñez</th>
                    <th className="num">Partos</th>
                    <th className="num">% Partos (Paridas/Preñadas)</th>
                    <th className="num">% Partos (Paridas/Expuestas)</th>
                    <th className="num">Crías nacidas</th>
                    <th className="num">Prolificidad</th>
                  </tr>
                </thead>
                <tbody>
                  {seasons.map((s) => (
                    <tr key={s.seasonKey}>
                      <td>
                        <strong>{s.seasonLabel}</strong>
                      </td>
                      <td className="num">{formatCount(s.exposedFemales)}</td>
                      <td className="num">{formatCount(s.diagnosed)}</td>
                      <td className="num">{formatCount(s.pregnant)}</td>
                      <td className="num analytics-num-strong">
                        {formatPct(s.pregnancyPct)}
                      </td>
                      <td className="num">{formatCount(s.births)}</td>
                      <td className="num analytics-num-strong">
                        {formatPct(s.birthsPerPregnantPct)}
                      </td>
                      <td className="num analytics-num-strong">
                        {formatPct(s.birthsPerExposedPct)}
                      </td>
                      <td className="num">{formatCount(s.offspringBorn)}</td>
                      <td className="num analytics-num-strong">
                        {formatRatio(s.prolificity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
