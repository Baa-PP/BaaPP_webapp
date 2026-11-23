import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, type ApiError } from '../../api/client';
import { RanchContextNotice } from '../../components/RanchContextNotice';
import { EChartPanel, type EChartsOption } from './EChartPanel';
import {
  normalizeReproductiveOverview,
  type SeasonReproductionMetric,
} from './analyticsOverview';

export interface ReproductiveAnalyticsViewProps {
  username: string;
  multiRanch: boolean;
  activeRanchId: string | null;
  ranchName?: string;
  ranchesLoading: boolean;
  ranchesError?: string;
  onRetryRanches?: () => void;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPct(value: number | null): string {
  return value !== null && Number.isFinite(value) ? `${value.toFixed(1)}%` : '—';
}

function formatRatio(value: number | null): string {
  return value !== null && Number.isFinite(value) ? value.toFixed(2) : '—';
}

function getDataIndex(params: unknown): number {
  const first = Array.isArray(params) ? params[0] : params;
  if (
    first &&
    typeof first === 'object' &&
    'dataIndex' in first &&
    typeof (first as { dataIndex: unknown }).dataIndex === 'number'
  ) {
    return (first as { dataIndex: number }).dataIndex;
  }
  return -1;
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
        return [
          `<strong>${escapeHtml(s.seasonLabel)}</strong>`,
          `% de preñez: <b>${formatPct(s.pregnancyPct)}</b>`,
          s.diagnosed > 0
            ? `Preñadas: ${s.pregnant} / Diagnosticadas: ${s.diagnosed}`
            : `Preñadas: ${s.pregnant} / Expuestas: ${s.exposedFemales}`,
          `Hembras expuestas: ${s.exposedFemales}`,
        ].join('<br/>');
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
        return [
          `<strong>${escapeHtml(s.seasonLabel)}</strong>`,
          `Paridas / Preñadas: <b>${formatPct(s.birthsPerPregnantPct)}</b>`,
          `Paridas / Expuestas: <b>${formatPct(s.birthsPerExposedPct)}</b>`,
          `Partos: ${s.births} · Preñadas: ${s.pregnant} · Expuestas: ${s.exposedFemales}`,
        ].join('<br/>');
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
        return [
          `<strong>${escapeHtml(s.seasonLabel)}</strong>`,
          `Prolificidad: <b>${formatRatio(s.prolificity)} crías/parto</b>`,
          `Crías nacidas: ${s.offspringBorn} / Partos: ${s.births}`,
        ].join('<br/>');
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
  ranchesLoading,
  ranchesError,
  onRetryRanches,
}: ReproductiveAnalyticsViewProps) {
  const overviewQuery = useQuery({
    queryKey: ['analytics', 'overview', username, activeRanchId] as const,
    queryFn: async ({ queryKey }) => {
      const ranchId = queryKey[3];
      const res = await apiFetch<unknown>('/analytics/overview', {
        ranchId: ranchId ?? undefined,
      });
      return normalizeReproductiveOverview(res);
    },
    enabled: Boolean(activeRanchId),
  });

  const seasons = overviewQuery.data?.seasons ?? [];

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

  const overview = overviewQuery.data;
  const loading = overviewQuery.isFetching;
  const rawError = overviewQuery.error;
  const errorStatus = (rawError as Partial<ApiError> | null)?.status;
  const errorMessage =
    rawError instanceof Error
      ? errorStatus === 403 && rawError.message === 'HTTP 403'
        ? 'Tu cuenta no tiene permisos para consultar los indicadores reproductivos de este rancho.'
        : rawError.message
      : overviewQuery.isError
        ? 'No se pudieron cargar los indicadores reproductivos del rancho activo.'
        : '';

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
                  <p>
                    {overview.pregnancyRatio?.denominatorLabel === 'expuestas'
                      ? 'Hembras preñadas respecto al total expuesto'
                      : 'Hembras preñadas respecto al total diagnosticado'}
                  </p>
                </div>
                <span className="analytics-chart-pill">
                  Global: {formatPct(overview.overallPregnancyPct)}
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
                      <td className="num">{s.exposedFemales}</td>
                      <td className="num">{s.diagnosed}</td>
                      <td className="num">{s.pregnant}</td>
                      <td className="num analytics-num-strong">
                        {formatPct(s.pregnancyPct)}
                      </td>
                      <td className="num">{s.births}</td>
                      <td className="num analytics-num-strong">
                        {formatPct(s.birthsPerPregnantPct)}
                      </td>
                      <td className="num analytics-num-strong">
                        {formatPct(s.birthsPerExposedPct)}
                      </td>
                      <td className="num">{s.offspringBorn}</td>
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
