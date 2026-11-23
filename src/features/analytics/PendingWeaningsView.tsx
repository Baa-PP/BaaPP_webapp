import { useEffect, useMemo, useState } from 'react';
import { RanchContextNotice } from '../../components/RanchContextNotice';
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  formatShortDateEs,
} from './analyticsFormatters';
import {
  resolvePendingWeaningsSummary,
  type PendingWeaningRecord,
} from './analyticsOverview';
import { useAnalyticsOverview } from './useAnalyticsOverview';

export interface PendingWeaningsViewProps {
  username: string;
  multiRanch: boolean;
  activeRanchId: string | null;
  ranchName?: string;
  ranchWeaningTargetDays?: number;
  ranchesLoading: boolean;
  ranchesError?: string;
  onRetryRanches?: () => void;
  canOpenAnimalDetail: boolean;
  canEditRanch: boolean;
}

type SectionFilter = 'SEPARATED' | 'OVERDUE' | 'UPCOMING';
type UpcomingWindowFilter = 'ALL' | 'DUE_SOON' | 'TODAY';

function formatSexLabel(sex: 'FEMALE' | 'MALE' | null): string {
  if (sex === 'FEMALE') return 'Hembra';
  if (sex === 'MALE') return 'Macho';
  return '';
}

function getDaysDeltaText(item: PendingWeaningRecord): {
  headline: string;
  formula: string;
} {
  const daysLeft = item.daysToWeaning;
  if (daysLeft === null) {
    return {
      headline: item.overdue ? 'Meta vencida' : 'Pendiente',
      formula: `Meta del rancho: ${item.weaningTargetDays} días`,
    };
  }
  if (daysLeft < 0) {
    const overdueDays = Math.abs(daysLeft);
    return {
      headline: `Vencido por ${overdueDays} ${overdueDays === 1 ? 'día' : 'días'}`,
      formula:
        item.ageDays !== null
          ? `${item.ageDays} d edad − ${item.weaningTargetDays} d meta (${daysLeft} d)`
          : `${daysLeft} días respecto a meta`,
    };
  }
  if (daysLeft === 0) {
    return {
      headline: 'Cumple meta hoy (0 días)',
      formula:
        item.ageDays !== null
          ? `${item.ageDays} d edad = ${item.weaningTargetDays} d meta`
          : 'Día exacto de destete',
    };
  }
  return {
    headline: `Faltan ${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}`,
    formula:
      item.ageDays !== null
        ? `${item.weaningTargetDays} d meta − ${item.ageDays} d edad`
        : `${daysLeft} días para meta`,
  };
}

interface PendingWeaningSectionProps {
  kind: 'overdue' | 'upcoming';
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyDescription: string;
  items: PendingWeaningRecord[];
  ranchName?: string;
  loading: boolean;
  canOpenAnimalDetail: boolean;
}

function PendingWeaningSection({
  kind,
  title,
  subtitle,
  emptyTitle,
  emptyDescription,
  items,
  ranchName,
  loading,
  canOpenAnimalDetail,
}: PendingWeaningSectionProps) {
  const isOverdue = kind === 'overdue';

  return (
    <section
      className={`table analytics-weaning-section${isOverdue ? ' analytics-weaning-overdue' : ' analytics-weaning-upcoming'}`}
      aria-label={title}
    >
      <div className="table-head analytics-weaning-head">
        <div className="analytics-weaning-title-wrap">
          {isOverdue ? (
            <span className="analytics-threshold-pill threshold-alert">
              <AlertTriangleIcon size={13} />
              Vencidos ({items.length})
            </span>
          ) : (
            <span className="analytics-threshold-pill threshold-ok">
              <CheckCircleIcon size={13} />
              Próximos ({items.length})
            </span>
          )}
          <div>
            <b>{title}</b>
            <p className="analytics-weaning-subtitle">{subtitle}</p>
          </div>
        </div>
        <span>
          {loading
            ? 'Actualizando…'
            : `${items.length} ${items.length === 1 ? 'cordero' : 'corderos'}`}
        </span>
        <small>{ranchName || 'Rancho activo'}</small>
      </div>

      {items.length === 0 ? (
        <div className="analytics-weaning-empty">
          <strong>{emptyTitle}</strong>
          <p>{emptyDescription}</p>
        </div>
      ) : (
        <div className="scroll">
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Cordero (Folio)</th>
                <th className="num">Edad actual</th>
                <th className="num">Meta rancho (días)</th>
                <th>Cálculo vs meta destete</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const delta = getDaysDeltaText(item);
                const sexLabel = formatSexLabel(item.sex);
                const isDueTodayOrSoon =
                  !item.overdue &&
                  item.daysToWeaning !== null &&
                  item.daysToWeaning <= 15;
                const rowClass = item.overdue
                  ? 'analytics-alert-row-danger'
                  : item.daysToWeaning === 0
                    ? 'analytics-alert-row-warning'
                    : undefined;

                const subMetaParts = [
                  sexLabel,
                  item.motherFolio ? `Madre: ${item.motherFolio}` : '',
                  item.birthDate
                    ? `Nac.: ${formatShortDateEs(item.birthDate)}`
                    : '',
                  item.lastWeightKg !== null
                    ? `Últ. peso: ${item.lastWeightKg.toFixed(1)} kg`
                    : '',
                ].filter(Boolean);

                return (
                  <tr key={item.key} className={rowClass}>
                    <td>
                      {canOpenAnimalDetail && item.animalId ? (
                        <a
                          className="animal-link"
                          href={`#/inventario/${encodeURIComponent(item.animalId)}`}
                        >
                          {item.folioInterno}
                          {subMetaParts.length > 0 && (
                            <small>{subMetaParts.join(' · ')}</small>
                          )}
                        </a>
                      ) : (
                        <div>
                          <strong>{item.folioInterno}</strong>
                          {subMetaParts.length > 0 && (
                            <small>{subMetaParts.join(' · ')}</small>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="num analytics-num-strong">
                      {item.ageDays !== null ? `${item.ageDays} días` : '—'}
                    </td>

                    <td className="num">
                      <strong>{item.weaningTargetDays} d</strong>
                    </td>

                    <td>
                      <div>
                        <strong>{delta.headline}</strong>
                        <small>{delta.formula}</small>
                      </div>
                    </td>

                    <td>
                      {item.overdue ? (
                        <span
                          className="analytics-threshold-pill threshold-alert"
                          role="status"
                        >
                          <AlertTriangleIcon size={12} />
                          Vencido
                          {item.daysToWeaning !== null && item.daysToWeaning < 0
                            ? ` (+${Math.abs(item.daysToWeaning)} d)`
                            : ''}
                        </span>
                      ) : item.daysToWeaning === 0 ? (
                        <span
                          className="analytics-trigger-badge badge-warning"
                          role="status"
                        >
                          Hoy (día meta)
                        </span>
                      ) : isDueTodayOrSoon ? (
                        <span className="analytics-trigger-badge badge-warning">
                          Próximo (≤ 15 d)
                        </span>
                      ) : (
                        <span className="analytics-threshold-pill threshold-ok">
                          <CheckCircleIcon size={12} />
                          En tiempo
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function PendingWeaningsView({
  username,
  multiRanch,
  activeRanchId,
  ranchName,
  ranchWeaningTargetDays,
  ranchesLoading,
  ranchesError,
  onRetryRanches,
  canOpenAnimalDetail,
  canEditRanch,
}: PendingWeaningsViewProps) {
  const { query, overview, loading, errorMessage } = useAnalyticsOverview(
    username,
    activeRanchId,
    'los destetes pendientes'
  );

  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>('SEPARATED');
  const [upcomingWindow, setUpcomingWindow] =
    useState<UpcomingWindowFilter>('ALL');

  useEffect(() => {
    setSearch('');
    setSectionFilter('SEPARATED');
    setUpcomingWindow('ALL');
  }, [activeRanchId]);

  const summary = useMemo(
    () =>
      overview
        ? resolvePendingWeaningsSummary(
            overview.pendingWeanings,
            ranchWeaningTargetDays
          )
        : null,
    [overview, ranchWeaningTargetDays]
  );

  const matchesSearch = (item: PendingWeaningRecord, term: string): boolean => {
    if (!term) return true;
    const haystack = [
      item.folioInterno,
      item.animalId ?? '',
      item.motherFolio ?? '',
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(term);
  };

  const filteredOverdue = useMemo(() => {
    if (!summary) return [];
    const term = search.trim().toLowerCase();
    return summary.overdueItems.filter((item) => matchesSearch(item, term));
  }, [summary, search]);

  const filteredUpcoming = useMemo(() => {
    if (!summary) return [];
    const term = search.trim().toLowerCase();
    return summary.upcomingItems.filter((item) => {
      if (!matchesSearch(item, term)) return false;
      if (
        upcomingWindow === 'DUE_SOON' &&
        (item.daysToWeaning === null || item.daysToWeaning > 15)
      ) {
        return false;
      }
      if (upcomingWindow === 'TODAY' && item.daysToWeaning !== 0) {
        return false;
      }
      return true;
    });
  }, [summary, search, upcomingWindow]);

  if (!activeRanchId) {
    return (
      <RanchContextNotice
        eyebrow="Destetes pendientes"
        multiRanch={multiRanch}
        loading={ranchesLoading}
        error={ranchesError}
        onRetry={onRetryRanches}
        contextLabel="los destetes pendientes"
      />
    );
  }

  const totalPending = summary
    ? summary.overdueCount + summary.upcomingCount
    : 0;
  const overduePct =
    totalPending > 0 && summary
      ? Math.round((summary.overdueCount / totalPending) * 100)
      : 0;

  const hasActiveFilters =
    search.trim().length > 0 ||
    sectionFilter !== 'SEPARATED' ||
    upcomingWindow !== 'ALL';

  function resetFilters() {
    setSearch('');
    setSectionFilter('SEPARATED');
    setUpcomingWindow('ALL');
  }

  return (
    <div className="analytics-view">
      <div className="title-row">
        <div>
          <p className="eyebrow">
            {ranchName ? `${ranchName} · ` : ''}
            Analítica zootécnica · RF-WEB-08
          </p>
          <h1>Tablero de destetes pendientes</h1>
          <p className="intro">
            Corderos sin destete confirmado separados en <strong>vencidos</strong>{' '}
            y <strong>próximos</strong> según la meta del rancho (
            <code>dias_meta_destete</code>:{' '}
            {summary?.ranchWeaningTargetDays ?? ranchWeaningTargetDays ?? 75}{' '}
            días).
          </p>
        </div>
        <div className="count-card">
          <b>{totalPending}</b>
          <span>{totalPending === 1 ? 'pendiente' : 'pendientes'}</span>
        </div>
      </div>

      {errorMessage ? (
        <section className="analytics-error" role="alert">
          <div>
            <strong>No se pudieron cargar los destetes pendientes</strong>
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
            Cargando corderos pendientes de destete del rancho activo…
          </p>
        </section>
      ) : !overview || !summary || !summary.hasData ? (
        <section className="empty-panel">
          <p className="eyebrow">Al día</p>
          <h1>Sin destetes pendientes registrados</h1>
          <p className="intro">
            No existen corderos activos pendientes de destete en{' '}
            {ranchName || 'el rancho activo'}.
          </p>
        </section>
      ) : (
        <>
          <section
            className="analytics-kpi-grid"
            aria-label="Resumen de destetes pendientes"
          >
            <article className="analytics-kpi-card">
              <span className="analytics-kpi-label">Meta destete del rancho</span>
              <strong className="analytics-kpi-value">
                {summary.ranchWeaningTargetDays} días
              </strong>
              <small className="analytics-kpi-meta">
                <code>dias_meta_destete</code> configurado para el rancho
                {canEditRanch && (
                  <>
                    {' '}
                    ·{' '}
                    <a className="animal-link" href="#/rancho">
                      Ajustar
                    </a>
                  </>
                )}
              </small>
            </article>

            <article
              className={`analytics-kpi-card${summary.overdueCount > 0 ? ' analytics-kpi-danger' : ''}`}
            >
              <span className="analytics-kpi-label">Destetes vencidos</span>
              <div className="analytics-kpi-value-row">
                <strong className="analytics-kpi-value">
                  {summary.overdueCount}
                </strong>
                {summary.overdueCount > 0 && (
                  <span className="analytics-threshold-pill threshold-alert">
                    <AlertTriangleIcon size={13} />
                    Atrasados
                  </span>
                )}
              </div>
              <small className="analytics-kpi-meta">
                Superaron los {summary.ranchWeaningTargetDays} días sin destete
              </small>
            </article>

            <article
              className={`analytics-kpi-card${summary.dueSoonCount > 0 ? ' analytics-kpi-warning' : ''}`}
            >
              <span className="analytics-kpi-label">Destetes próximos</span>
              <strong className="analytics-kpi-value">
                {summary.upcomingCount}
              </strong>
              <small className="analytics-kpi-meta">
                {summary.dueSoonCount} dentro de ≤ 15 días de su fecha meta
              </small>
            </article>

            <article className="analytics-kpi-card">
              <span className="analytics-kpi-label">Total por destetar</span>
              <strong className="analytics-kpi-value">{totalPending}</strong>
              <small className="analytics-kpi-meta">
                {overduePct}% vencidos · {summary.upcomingCount} en tiempo
              </small>
            </article>
          </section>

          {summary.items.length > 0 && (
            <>
              <section
                className="filters analytics-alerts-filters"
                aria-label="Filtros de destetes pendientes"
              >
                <div className="filter-title">
                  <div className="filter-title-left">
                    <strong>Filtrar destetes vencidos y próximos</strong>
                    <span className="filter-count-badge">
                      {filteredOverdue.length} vencidos ·{' '}
                      {filteredUpcoming.length} próximos
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

                <div className="analytics-filter-grid">
                  <label>
                    Buscar cordero por folio o madre
                    <input
                      type="search"
                      placeholder="Ej. CORD-14 o OV-102…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>

                  <label>
                    Secciones visibles
                    <select
                      aria-label="Estado de destete"
                      value={sectionFilter}
                      onChange={(e) =>
                        setSectionFilter(e.target.value as SectionFilter)
                      }
                    >
                      <option value="SEPARATED">
                        Separar vencidos y próximos ({summary.items.length})
                      </option>
                      <option value="OVERDUE">
                        Solo destetes vencidos ({summary.overdueItems.length})
                      </option>
                      <option value="UPCOMING">
                        Solo destetes próximos ({summary.upcomingItems.length})
                      </option>
                    </select>
                  </label>

                  <label>
                    Ventana de próximos
                    <select
                      aria-label="Ventana de próximos"
                      value={upcomingWindow}
                      disabled={sectionFilter === 'OVERDUE'}
                      onChange={(e) =>
                        setUpcomingWindow(e.target.value as UpcomingWindowFilter)
                      }
                    >
                      <option value="ALL">Todos los próximos</option>
                      <option value="DUE_SOON">Próximos ≤ 15 días</option>
                      <option value="TODAY">Solo vencen hoy (0 d)</option>
                    </select>
                  </label>
                </div>
              </section>

              {(sectionFilter === 'SEPARATED' ||
                sectionFilter === 'OVERDUE') && (
                <PendingWeaningSection
                  kind="overdue"
                  title="Destetes vencidos"
                  subtitle={`Corderos con edad mayor a ${summary.ranchWeaningTargetDays} días sin destete confirmado`}
                  emptyTitle="Sin destetes vencidos"
                  emptyDescription={
                    hasActiveFilters
                      ? 'Ningún destete vencido coincide con la búsqueda actual.'
                      : `Ningún cordero supera la meta de ${summary.ranchWeaningTargetDays} días.`
                  }
                  items={filteredOverdue}
                  ranchName={ranchName}
                  loading={loading}
                  canOpenAnimalDetail={canOpenAnimalDetail}
                />
              )}

              {(sectionFilter === 'SEPARATED' ||
                sectionFilter === 'UPCOMING') && (
                <PendingWeaningSection
                  kind="upcoming"
                  title="Destetes próximos"
                  subtitle={`Corderos próximos a cumplir o en día meta (${summary.ranchWeaningTargetDays} días)`}
                  emptyTitle="Sin destetes próximos en este filtro"
                  emptyDescription={
                    hasActiveFilters
                      ? 'Ajusta la búsqueda o la ventana de días para ver otros corderos.'
                      : 'No hay corderos próximos pendientes de destete.'
                  }
                  items={filteredUpcoming}
                  ranchName={ranchName}
                  loading={loading}
                  canOpenAnimalDetail={canOpenAnimalDetail}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
