import { useMemo } from 'react';
import { RanchContextNotice } from '../../components/RanchContextNotice';
import { EChartPanel, type EChartsOption } from './EChartPanel';
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  escapeHtml,
  formatCount,
  formatPct,
  formatWeightKg,
  getDataIndex,
} from './analyticsFormatters';
import {
  MORTALITY_ALERT_THRESHOLD_PCT,
  type MortalityWeaningSummary,
  type SeasonReproductionMetric,
} from './analyticsOverview';
import { useAnalyticsOverview } from './useAnalyticsOverview';

export interface MortalityWeaningViewProps {
  username: string;
  multiRanch: boolean;
  activeRanchId: string | null;
  ranchName?: string;
  ranchesLoading: boolean;
  ranchesError?: string;
  onRetryRanches?: () => void;
}

function getAchievedBirthsCaption(summary: MortalityWeaningSummary): string {
  if (summary.achievedBirthsRatio) {
    const label =
      summary.achievedBirthsSource === 'live_offspring'
        ? 'nacidas vivas'
        : 'partos';
    return `${summary.achievedBirthsRatio.numerator} ${label} / ${summary.achievedBirthsRatio.denominator} ${summary.achievedBirthsRatio.denominatorLabel}`;
  }
  if (summary.achievedBirthsSource === 'live_offspring') {
    return 'Crías nacidas vivas / totales';
  }
  if (summary.achievedBirthsSource === 'births_per_pregnant') {
    return 'Partos logrados respecto a preñadas';
  }
  if (summary.achievedBirthsSource === 'births_per_exposed') {
    return 'Partos logrados respecto a expuestas';
  }
  return 'Sin partos suficientes registrados';
}

function buildMortalityOption(
  seasons: SeasonReproductionMetric[]
): EChartsOption {
  const labels = seasons.map((s) => s.seasonLabel);
  return {
    grid: { top: 32, right: 26, bottom: 32, left: 48 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const idx = getDataIndex(params);
        const s = seasons[idx];
        if (!s) return '';
        const statusLabel = s.mortalityAlert
          ? `<span style="color:#B91C1C;font-weight:700">Alerta: supera meta de ${MORTALITY_ALERT_THRESHOLD_PCT}%</span>`
          : s.mortalityPct !== null
            ? `<span style="color:#15803D;font-weight:700">En meta (≤ ${MORTALITY_ALERT_THRESHOLD_PCT}%)</span>`
            : 'Sin datos';
        const lines = [
          `<strong>${escapeHtml(s.seasonLabel)}</strong>`,
          `Mortalidad: <b>${formatPct(s.mortalityPct)}</b> (${statusLabel})`,
        ];
        if (s.offspringDead !== null || s.offspringBorn !== null) {
          lines.push(
            `Crías muertas: ${formatCount(s.offspringDead)} / Crías nacidas: ${formatCount(s.offspringBorn)}`
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
      max: (val) => Math.max(10, Math.ceil((val.max || 10) / 5) * 5),
      axisLabel: { color: '#334155', fontSize: 11, formatter: '{value}%' },
      splitLine: { lineStyle: { color: '#E2E8F0' } },
    },
    series: [
      {
        name: '% Mortalidad',
        type: 'bar',
        barMaxWidth: 42,
        label: {
          show: true,
          position: 'top',
          color: '#0F172A',
          fontSize: 11,
          fontWeight: 600,
          formatter: (p) =>
            typeof p.value === 'number' ? `${p.value.toFixed(1)}%` : '',
        },
        markLine: {
          symbol: 'none',
          silent: true,
          lineStyle: {
            color: '#B91C1C',
            type: 'dashed',
            width: 2,
          },
          label: {
            show: true,
            position: 'insideEndTop',
            formatter: `Meta máx. ${MORTALITY_ALERT_THRESHOLD_PCT}%`,
            color: '#B91C1C',
            fontWeight: 700,
            fontSize: 11,
          },
          data: [{ yAxis: MORTALITY_ALERT_THRESHOLD_PCT }],
        },
        data: seasons.map((s) => ({
          value: s.mortalityPct,
          itemStyle: {
            color: s.mortalityAlert ? '#B91C1C' : '#1B4332',
            borderRadius: [4, 4, 0, 0],
          },
        })),
      },
    ],
  };
}

function buildBirthAndSurvivalOption(
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
          `% Nacimientos logrados: <b>${formatPct(s.achievedBirthsPct)}</b>`,
          `% Crías vivas al destete: <b>${formatPct(s.weaningSurvivalPct)}</b>`,
        ];
        if (s.offspringBorn !== null) {
          lines.push(
            `Crías nacidas: ${s.offspringBorn} · Partos: ${formatCount(s.births)}`
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
        name: '% Nacimientos logrados',
        type: 'bar',
        barMaxWidth: 28,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        data: seasons.map((s) => s.achievedBirthsPct),
      },
      {
        name: '% Vivas al destete',
        type: 'bar',
        barMaxWidth: 28,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        data: seasons.map((s) => s.weaningSurvivalPct),
      },
    ],
  };
}

function buildWeaningWeightOption(
  summary: MortalityWeaningSummary,
  seasons: SeasonReproductionMetric[]
): { option: EChartsOption | null; subtitle: string; pill: string } {
  const { weaningWeight } = summary;
  const stageAverages = weaningWeight.stageAverages;

  if (stageAverages.length > 0) {
    const sexBreakdown: string[] = [];
    if (weaningWeight.femalesAvgKg !== null) {
      sexBreakdown.push(
        `Hembras: ${weaningWeight.femalesAvgKg.toFixed(2)} kg (${weaningWeight.femalesCount})`
      );
    }
    if (weaningWeight.malesAvgKg !== null) {
      sexBreakdown.push(
        `Machos: ${weaningWeight.malesAvgKg.toFixed(2)} kg (${weaningWeight.malesCount})`
      );
    }
    return {
      subtitle:
        sexBreakdown.length > 0
          ? `Referencia por hito productivo · Destete ${sexBreakdown.join(' · ')}`
          : 'Peso promedio registrado por hito productivo destacando Destete (WEANING)',
      pill:
        weaningWeight.averageWeaningWeightKg !== null
          ? `Destete prom.: ${formatWeightKg(weaningWeight.averageWeaningWeightKg)}`
          : `${stageAverages.length} hitos`,
      option: {
        grid: { top: 28, right: 20, bottom: 32, left: 52 },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: (params) => {
            const idx = getDataIndex(params);
            const st = stageAverages[idx];
            if (!st) return '';
            return [
              `<strong>${escapeHtml(st.stageLabel)}</strong>`,
              `Peso promedio: <b>${st.averageWeightKg.toFixed(2)} kg</b>`,
              `Registros: ${st.sampleCount}`,
            ].join('<br/>');
          },
        },
        xAxis: {
          type: 'category',
          data: stageAverages.map((s) => s.stageLabel),
          axisLine: { lineStyle: { color: '#CBD5E1' } },
          axisLabel: { color: '#334155', fontSize: 12 },
        },
        yAxis: {
          type: 'value',
          min: 0,
          axisLabel: {
            color: '#334155',
            fontSize: 11,
            formatter: '{value} kg',
          },
          splitLine: { lineStyle: { color: '#E2E8F0' } },
        },
        series: [
          {
            name: 'Peso promedio (kg)',
            type: 'bar',
            barMaxWidth: 46,
            label: {
              show: true,
              position: 'top',
              color: '#0F172A',
              fontSize: 11,
              fontWeight: 600,
              formatter: (p) =>
                typeof p.value === 'number' ? `${p.value.toFixed(1)} kg` : '',
            },
            data: stageAverages.map((st) => ({
              value: st.averageWeightKg,
              itemStyle: {
                color: st.stageKey === 'WEANING' ? '#1E40AF' : '#64748B',
                borderRadius: [4, 4, 0, 0],
              },
            })),
          },
        ],
      },
    };
  }

  const seasonWeights = seasons.filter((s) => s.averageWeaningWeightKg !== null);
  if (seasonWeights.length > 0) {
    return {
      subtitle: 'Evolución por temporada del peso promedio registrado al destete',
      pill: `Promedio: ${formatWeightKg(weaningWeight.averageWeaningWeightKg)}`,
      option: {
        color: ['#1E40AF'],
        grid: { top: 28, right: 20, bottom: 32, left: 52 },
        tooltip: {
          trigger: 'axis',
          formatter: (params) => {
            const idx = getDataIndex(params);
            const st = seasonWeights[idx];
            if (!st) return '';
            return `<strong>${escapeHtml(st.seasonLabel)}</strong><br/>Peso prom. destete: <b>${formatWeightKg(st.averageWeaningWeightKg)}</b>`;
          },
        },
        xAxis: {
          type: 'category',
          data: seasonWeights.map((s) => s.seasonLabel),
          axisLine: { lineStyle: { color: '#CBD5E1' } },
          axisLabel: { color: '#334155', fontSize: 12 },
        },
        yAxis: {
          type: 'value',
          min: 0,
          axisLabel: {
            color: '#334155',
            fontSize: 11,
            formatter: '{value} kg',
          },
          splitLine: { lineStyle: { color: '#E2E8F0' } },
        },
        series: [
          {
            name: 'Peso promedio al destete (kg)',
            type: 'bar',
            barMaxWidth: 44,
            itemStyle: { borderRadius: [4, 4, 0, 0] },
            data: seasonWeights.map((s) => s.averageWeaningWeightKg),
          },
        ],
      },
    };
  }

  return {
    subtitle: 'Pesajes en hito Destete (WEANING) del rancho activo',
    pill:
      weaningWeight.averageWeaningWeightKg !== null
        ? formatWeightKg(weaningWeight.averageWeaningWeightKg)
        : 'Sin serie por hito',
    option: null,
  };
}

export function MortalityWeaningView({
  username,
  multiRanch,
  activeRanchId,
  ranchName,
  ranchesLoading,
  ranchesError,
  onRetryRanches,
}: MortalityWeaningViewProps) {
  const { query, overview, loading, errorMessage } = useAnalyticsOverview(
    username,
    activeRanchId,
    'las métricas de mortalidad y destete'
  );

  const seasons = overview?.seasons ?? [];
  const summary = overview?.mortalityWeaning;

  const mortalityOption = useMemo(
    () => buildMortalityOption(seasons),
    [seasons]
  );
  const birthSurvivalOption = useMemo(
    () => buildBirthAndSurvivalOption(seasons),
    [seasons]
  );
  const weaningWeightChart = useMemo(
    () =>
      summary
        ? buildWeaningWeightOption(summary, seasons)
        : { subtitle: '', pill: '', option: null },
    [summary, seasons]
  );

  if (!activeRanchId) {
    return (
      <RanchContextNotice
        eyebrow="Mortalidad y destete"
        multiRanch={multiRanch}
        loading={ranchesLoading}
        error={ranchesError}
        onRetry={onRetryRanches}
        contextLabel="las métricas de mortalidad y destete"
      />
    );
  }

  const alertSeasonsCount = summary?.alertSeasons.length ?? 0;

  return (
    <div className="analytics-view">
      <div className="title-row">
        <div>
          <p className="eyebrow">
            {ranchName ? `${ranchName} · ` : ''}
            Analítica zootécnica · RF-WEB-08
          </p>
          <h1>Mortalidad y destete</h1>
          <p className="intro">
            Seguimiento de nacimientos logrados, mortalidad al nacimiento y
            predestete (meta 2%–3%, alerta visual cuando supera el 3%), crías
            vivas al destete y peso promedio al destete.
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
            <strong>No se pudieron cargar las métricas de mortalidad y destete</strong>
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
            Cargando gráficas de mortalidad y destete del rancho activo…
          </p>
        </section>
      ) : !overview || !summary || !summary.hasData ? (
        <section className="empty-panel">
          <p className="eyebrow">Sin datos suficientes</p>
          <h1>No hay indicadores de mortalidad ni destete</h1>
          <p className="intro">
            Aún no existen registros suficientes de partos, mortalidad de crías
            o pesajes al destete en {ranchName || 'el rancho activo'}.
          </p>
        </section>
      ) : (
        <>
          {summary.mortalityAlert ? (
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
                    Alerta visual: mortalidad de crías supera la meta del{' '}
                    {MORTALITY_ALERT_THRESHOLD_PCT}%
                  </strong>
                  <p>
                    {summary.overallMortalityPct !== null
                      ? `Mortalidad global actual: ${summary.overallMortalityPct.toFixed(1)}% (meta recomendada: ≤ 2%–3%).`
                      : 'Al menos una temporada supera la meta máxima de mortalidad (3.0%).'}
                    {alertSeasonsCount > 0
                      ? ` Temporadas en alerta: ${summary.alertSeasons
                          .map(
                            (s) =>
                              `${s.seasonLabel} (${formatPct(s.mortalityPct)})`
                          )
                          .join(', ')}.`
                      : ''}
                  </p>
                </div>
              </div>
              <span className="analytics-threshold-pill threshold-alert">
                <AlertTriangleIcon size={14} />
                Supera {MORTALITY_ALERT_THRESHOLD_PCT}%
              </span>
            </section>
          ) : (
            summary.overallMortalityPct !== null && (
              <section
                className="analytics-status-banner-ok"
                role="status"
                aria-label="Mortalidad dentro de la meta"
              >
                <div className="analytics-alert-icon-row">
                  <span className="analytics-ok-icon-badge">
                    <CheckCircleIcon size={17} />
                  </span>
                  <div>
                    <strong>
                      Mortalidad dentro de la meta (
                      {summary.overallMortalityPct.toFixed(1)}% ≤{' '}
                      {MORTALITY_ALERT_THRESHOLD_PCT}%)
                    </strong>
                    <p>
                      Ninguna temporada supera el umbral crítico del 3.0% al
                      nacimiento o predestete.
                    </p>
                  </div>
                </div>
                <span className="analytics-threshold-pill threshold-ok">
                  <CheckCircleIcon size={14} />
                  En meta ≤ {MORTALITY_ALERT_THRESHOLD_PCT}%
                </span>
              </section>
            )
          )}

          <section
            className="analytics-kpi-grid"
            aria-label="Cuatro indicadores clave de mortalidad y destete"
          >
            <article className="analytics-kpi-card">
              <span className="analytics-kpi-label">
                % de nacimientos logrados
              </span>
              <strong className="analytics-kpi-value">
                {formatPct(summary.overallAchievedBirthsPct)}
              </strong>
              <small className="analytics-kpi-meta">
                {getAchievedBirthsCaption(summary)}
              </small>
            </article>

            <article
              className={`analytics-kpi-card${summary.mortalityAlert ? ' analytics-kpi-danger' : ''}`}
            >
              <span className="analytics-kpi-label">
                % mortalidad nac. y predestete
              </span>
              <div className="analytics-kpi-value-row">
                <strong className="analytics-kpi-value">
                  {formatPct(summary.overallMortalityPct)}
                </strong>
                {summary.mortalityAlert ? (
                  <span
                    className="analytics-threshold-pill threshold-alert"
                    role="status"
                  >
                    <AlertTriangleIcon size={14} />
                    Alerta (&gt;{MORTALITY_ALERT_THRESHOLD_PCT}%)
                  </span>
                ) : (
                  summary.overallMortalityPct !== null && (
                    <span className="analytics-threshold-pill threshold-ok">
                      <CheckCircleIcon size={14} />
                      En meta
                    </span>
                  )
                )}
              </div>
              <small className="analytics-kpi-meta">
                Meta: 2%–3% ·{' '}
                {summary.mortalityRatio
                  ? `${summary.mortalityRatio.numerator} bajas / ${summary.mortalityRatio.denominator} crías`
                  : 'Umbral de alerta > 3.0%'}
              </small>
              {(summary.overallBirthMortalityPct !== null ||
                summary.overallPreWeaningMortalityPct !== null) && (
                <small className="analytics-kpi-meta">
                  Nacimiento: {formatPct(summary.overallBirthMortalityPct)} ·
                  Predestete: {formatPct(summary.overallPreWeaningMortalityPct)}
                </small>
              )}
            </article>

            <article className="analytics-kpi-card">
              <span className="analytics-kpi-label">
                % crías vivas al destete
              </span>
              <strong className="analytics-kpi-value">
                {formatPct(summary.overallWeaningSurvivalPct)}
              </strong>
              <small className="analytics-kpi-meta">
                {summary.weaningSurvivalRatio
                  ? `${summary.weaningSurvivalRatio.numerator} vivas / ${summary.weaningSurvivalRatio.denominator} crías${summary.weaningSurvivalIsDerived ? ' (100% − mortalidad)' : ''}`
                  : summary.weaningSurvivalIsDerived
                    ? 'Supervivencia calculada (100% − mortalidad)'
                    : 'Proporción de crías logradas al destete'}
              </small>
            </article>

            <article className="analytics-kpi-card">
              <span className="analytics-kpi-label">
                Peso promedio al destete
              </span>
              <strong className="analytics-kpi-value">
                {formatWeightKg(summary.weaningWeight.averageWeaningWeightKg)}
              </strong>
              <small className="analytics-kpi-meta">
                {summary.weaningWeight.sampleCount !== null
                  ? `${summary.weaningWeight.sampleCount} ${summary.weaningWeight.sampleCount === 1 ? 'pesaje' : 'pesajes'} en hito destete`
                  : summary.weaningWeight.averageWeaningWeightKg !== null
                    ? 'Promedio de pesajes al destete'
                    : 'Sin pesajes al destete registrados'}
              </small>
            </article>
          </section>

          <section
            className="analytics-charts-grid"
            aria-label="Gráficas de mortalidad y destete"
          >
            <article className="analytics-chart-card">
              <div className="analytics-chart-head">
                <div>
                  <h2>Mortalidad al nacimiento y predestete</h2>
                  <p>
                    Por temporada con línea de meta máxima ({MORTALITY_ALERT_THRESHOLD_PCT}%)
                  </p>
                </div>
                {summary.mortalityAlert ? (
                  <span className="analytics-threshold-pill threshold-alert">
                    <AlertTriangleIcon size={14} />
                    {alertSeasonsCount > 0
                      ? `${alertSeasonsCount} ${alertSeasonsCount === 1 ? 'temporada > 3%' : 'temporadas > 3%'}`
                      : 'Supera 3%'}
                  </span>
                ) : (
                  <span className="analytics-chart-pill">
                    Global: {formatPct(summary.overallMortalityPct)}
                  </span>
                )}
              </div>
              {seasons.length > 0 ? (
                <EChartPanel
                  option={mortalityOption}
                  ariaLabel="Gráfica de mortalidad al nacimiento y predestete por temporada frente a la meta de 3 por ciento"
                />
              ) : (
                <div className="analytics-chart-empty">
                  <p className="muted">Sin serie por temporada disponible.</p>
                </div>
              )}
            </article>

            <article className="analytics-chart-card">
              <div className="analytics-chart-head">
                <div>
                  <h2>Nacimientos logrados vs vivas al destete</h2>
                  <p>Comparativa porcentual por temporada productiva</p>
                </div>
                <span className="analytics-chart-pill">
                  Supervivencia: {formatPct(summary.overallWeaningSurvivalPct)}
                </span>
              </div>
              {seasons.length > 0 ? (
                <EChartPanel
                  option={birthSurvivalOption}
                  ariaLabel="Gráfica comparativa de nacimientos logrados y crías que llegan vivas al destete"
                />
              ) : (
                <div className="analytics-chart-empty">
                  <p className="muted">Sin serie por temporada disponible.</p>
                </div>
              )}
            </article>

            <article className="analytics-chart-card analytics-chart-card-wide">
              <div className="analytics-chart-head">
                <div>
                  <h2>Peso promedio al destete</h2>
                  <p>{weaningWeightChart.subtitle}</p>
                </div>
                <span className="analytics-chart-pill">
                  {weaningWeightChart.pill}
                </span>
              </div>
              {weaningWeightChart.option ? (
                <EChartPanel
                  option={weaningWeightChart.option}
                  ariaLabel="Gráfica de peso promedio al destete en kilogramos"
                />
              ) : (
                <div className="analytics-chart-empty">
                  <p className="muted">
                    Aún no hay pesajes registrados en el hito Destete (WEANING)
                    para generar esta gráfica.
                  </p>
                </div>
              )}
            </article>
          </section>

          {seasons.length > 0 && (
            <section
              className="table"
              aria-label="Desglose de mortalidad y destete por temporada"
            >
              <div className="table-head">
                <b>Desglose por temporada: mortalidad y destete</b>
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
                      <th className="num">% Nacimientos logrados</th>
                      <th className="num">Crías nacidas</th>
                      <th className="num">Crías muertas</th>
                      <th className="num">% Mortalidad (Meta ≤ 3%)</th>
                      <th className="num">% Vivas al destete</th>
                      <th className="num">Peso prom. destete</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seasons.map((s) => (
                      <tr
                        key={s.seasonKey}
                        className={
                          s.mortalityAlert
                            ? 'analytics-alert-row-danger'
                            : undefined
                        }
                      >
                        <td>
                          <strong>{s.seasonLabel}</strong>
                        </td>
                        <td className="num analytics-num-strong">
                          {formatPct(s.achievedBirthsPct)}
                        </td>
                        <td className="num">{formatCount(s.offspringBorn)}</td>
                        <td className="num">{formatCount(s.offspringDead)}</td>
                        <td
                          className={`num analytics-num-strong${s.mortalityAlert ? ' analytics-mortality-high' : ''}`}
                        >
                          <div className="analytics-cell-status">
                            <span>{formatPct(s.mortalityPct)}</span>
                            {s.mortalityAlert && (
                              <span
                                className="analytics-threshold-pill threshold-alert"
                                role="status"
                              >
                                <AlertTriangleIcon size={12} />
                                Supera {MORTALITY_ALERT_THRESHOLD_PCT}%
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="num analytics-num-strong">
                          {formatPct(s.weaningSurvivalPct)}
                        </td>
                        <td className="num">
                          {formatWeightKg(s.averageWeaningWeightKg)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
