import { useEffect, useMemo, useState } from 'react';
import type {
  SuggestedDestination,
  UnproductiveFemaleAlert,
  UnproductiveFemalesSummary,
} from './analyticsOverview';

type DestinationFilter = 'ALERTS' | 'CULL' | 'SELL' | 'ALL';
type ReasonFilter = 'ALL' | 'MORTALITY' | 'INFERTILITY' | 'BOTH';

export interface UnproductiveFemalesPanelProps {
  summary: UnproductiveFemalesSummary;
  activeRanchId: string | null;
  ranchName?: string;
  loading: boolean;
  canOpenAnimalDetail: boolean;
}

function formatAgeSummary(ageDays: number | null): string {
  if (ageDays === null) return 'Edad no registrada';
  if (ageDays < 60) return `${ageDays} días`;
  const months = Math.floor(ageDays / 30);
  return `${months} meses (${ageDays} d)`;
}

function formatPct(value: number | null): string {
  return value !== null && Number.isFinite(value) ? `${value.toFixed(1)}%` : '—';
}

function formatLastBirthDate(isoDate: string | null): string | null {
  if (!isoDate) return null;
  const parsed = new Date(isoDate + (isoDate.length === 10 ? 'T00:00:00' : ''));
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

function getDestinationMeta(suggestion: SuggestedDestination | null): {
  code: string;
  label: string;
  badgeClass: string;
} {
  if (suggestion === 'CULL') {
    return {
      code: 'CULL',
      label: 'Desecho a rastro',
      badgeClass: 'analytics-dest-badge dest-cull',
    };
  }
  if (suggestion === 'SELL') {
    return {
      code: 'SELL',
      label: 'Venta recomendada',
      badgeClass: 'analytics-dest-badge dest-sell',
    };
  }
  if (suggestion === 'BREEDING') {
    return {
      code: 'BREEDING',
      label: 'Continuar en cría',
      badgeClass: 'analytics-dest-badge dest-breeding',
    };
  }
  return {
    code: 'REVISIÓN',
    label: 'Evaluar vientre',
    badgeClass: 'analytics-dest-badge dest-review',
  };
}

function getMortalityReasonDetail(item: UnproductiveFemaleAlert): {
  title: string;
  detail: string;
} | null {
  if (!item.hasConsecutiveMortality && !item.hasHighMortality) return null;
  if (item.hasConsecutiveMortality) {
    return {
      title: 'Mortalidad consecutiva',
      detail:
        item.consecutiveLambDeaths !== null
          ? `${item.consecutiveLambDeaths} pérdidas consecutivas${item.mortalityPct !== null ? ` (${item.mortalityPct.toFixed(1)}%)` : ''}`
          : item.mortalityPct !== null
            ? `${item.mortalityPct.toFixed(1)}% mortalidad en crías`
            : 'Pérdida consecutiva de crías',
    };
  }
  return {
    title: 'Mortalidad elevada (>30%)',
    detail:
      item.mortalityPct !== null
        ? `${item.mortalityPct.toFixed(1)}% de crías fallecidas`
        : 'Pérdida elevada de crías',
  };
}

function getInfertilityReasonDetail(item: UnproductiveFemaleAlert): {
  title: string;
  detail: string;
} | null {
  if (!item.hasProlongedInfertility) return null;

  if (item.daysSinceLastBirth !== null && item.daysSinceLastBirth > 365) {
    return {
      title: 'Infertilidad prolongada',
      detail: `${item.daysSinceLastBirth} días sin parir${item.pregnant === false ? ' · vacía' : ''}`,
    };
  }
  if (item.ageDays !== null && item.ageDays > 600 && item.births === 0) {
    return {
      title: 'Infertilidad prolongada',
      detail: `${item.ageDays} días de edad · sin partos registrados`,
    };
  }
  if (
    item.diagnosed !== null &&
    item.diagnosed >= 2 &&
    item.pregnancyPct !== null &&
    item.pregnancyPct < 50
  ) {
    return {
      title: 'Infertilidad prolongada',
      detail: `${item.pregnancyPct.toFixed(1)}% preñez (${item.pregnantCount ?? '—'}/${item.diagnosed} diagn.)`,
    };
  }
  if (item.pregnancyPct !== null) {
    return {
      title: 'Infertilidad prolongada',
      detail: `${item.pregnancyPct.toFixed(1)}% preñez · ${item.births ?? 0} ${item.births === 1 ? 'parto' : 'partos'}`,
    };
  }
  return {
    title: 'Infertilidad prolongada',
    detail: 'Sin gestación ni parto efectivo en el periodo',
  };
}

export function UnproductiveFemalesPanel({
  summary,
  activeRanchId,
  ranchName,
  loading,
  canOpenAnimalDetail,
}: UnproductiveFemalesPanelProps) {
  const [search, setSearch] = useState('');
  const [destinationFilter, setDestinationFilter] =
    useState<DestinationFilter>('ALERTS');
  const [reasonFilter, setReasonFilter] = useState<ReasonFilter>('ALL');

  useEffect(() => {
    setSearch('');
    setDestinationFilter('ALERTS');
    setReasonFilter('ALL');
  }, [activeRanchId]);

  const filteredItems = useMemo(() => {
    const queryText = search.trim().toLowerCase();

    return summary.items.filter((item) => {
      if (destinationFilter === 'ALERTS' && !item.isAlertCandidate) {
        return false;
      }
      if (destinationFilter === 'CULL' && item.suggestion !== 'CULL') {
        return false;
      }
      if (destinationFilter === 'SELL' && item.suggestion !== 'SELL') {
        return false;
      }

      const hasMortality =
        item.hasConsecutiveMortality || item.hasHighMortality;
      if (reasonFilter === 'MORTALITY' && !hasMortality) {
        return false;
      }
      if (reasonFilter === 'INFERTILITY' && !item.hasProlongedInfertility) {
        return false;
      }
      if (
        reasonFilter === 'BOTH' &&
        (!hasMortality || !item.hasProlongedInfertility)
      ) {
        return false;
      }

      if (queryText) {
        const haystack = [
          item.folioInterno,
          item.animalId ?? '',
          item.alertReason ?? '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(queryText)) {
          return false;
        }
      }

      return true;
    });
  }, [summary.items, destinationFilter, reasonFilter, search]);

  const hasActiveFilters =
    search.trim().length > 0 ||
    destinationFilter !== 'ALERTS' ||
    reasonFilter !== 'ALL';

  function resetFilters() {
    setSearch('');
    setDestinationFilter('ALERTS');
    setReasonFilter('ALL');
  }

  if (summary.items.length === 0) {
    return (
      <section className="empty-panel">
        <p className="eyebrow">Sin alertas activas</p>
        <h1>Sin vientres improductivos detectados</h1>
        <p className="intro">
          No se identificaron borregas sin parir/gestar ni casos de mortalidad
          crítica de crías en {ranchName || 'el rancho activo'}.
        </p>
      </section>
    );
  }

  return (
    <>
      <section
        className="analytics-kpi-grid"
        aria-label="Resumen de alertas de vientres improductivos"
      >
        <article className="analytics-kpi-card analytics-kpi-danger">
          <span className="analytics-kpi-label">CULL · Desecho a rastro</span>
          <strong className="analytics-kpi-value">{summary.cullCount}</strong>
          <small className="analytics-kpi-meta">
            Baja fertilidad o historial improductivo crítico
          </small>
        </article>

        <article className="analytics-kpi-card analytics-kpi-warning">
          <span className="analytics-kpi-label">SELL · Venta recomendada</span>
          <strong className="analytics-kpi-value">{summary.sellCount}</strong>
          <small className="analytics-kpi-meta">
            Descarte comercial o reemplazo de vientre
          </small>
        </article>

        <article className="analytics-kpi-card analytics-kpi-danger">
          <span className="analytics-kpi-label">Mortalidad en crías</span>
          <strong className="analytics-kpi-value">
            {summary.mortalityAlertCount}
          </strong>
          <small className="analytics-kpi-meta">
            {summary.consecutiveMortalityCount > 0
              ? `${summary.consecutiveMortalityCount} con pérdida consecutiva reportada`
              : 'Mortalidad consecutiva o superior al 30%'}
          </small>
        </article>

        <article className="analytics-kpi-card analytics-kpi-warning">
          <span className="analytics-kpi-label">Infertilidad prolongada</span>
          <strong className="analytics-kpi-value">
            {summary.infertilityAlertCount}
          </strong>
          <small className="analytics-kpi-meta">
            &gt;600 días sin parto, &gt;365 días abierta o baja preñez
          </small>
        </article>
      </section>

      <section
        className="filters analytics-alerts-filters"
        aria-label="Filtros de vientres improductivos"
      >
        <div className="filter-title">
          <div className="filter-title-left">
            <strong>Filtrar vientres y destinos CULL / SELL</strong>
            <span className="filter-count-badge">
              {filteredItems.length}{' '}
              {filteredItems.length === 1 ? 'vientre' : 'vientres'}
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
            Buscar por folio o ID
            <input
              type="search"
              placeholder="Ej. OV-104 o UUID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>

          <label>
            Destino sugerido
            <select
              value={destinationFilter}
              onChange={(e) =>
                setDestinationFilter(e.target.value as DestinationFilter)
              }
            >
              <option value="ALERTS">
                Todas las alertas CULL / SELL ({summary.alertItems.length})
              </option>
              <option value="CULL">
                CULL · Desecho a rastro ({summary.cullCount})
              </option>
              <option value="SELL">
                SELL · Venta recomendada ({summary.sellCount})
              </option>
              {summary.breedingCount > 0 && (
                <option value="ALL">
                  Incluir en cría / BREEDING ({summary.items.length})
                </option>
              )}
            </select>
          </label>

          <label>
            Criterio de alerta
            <select
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value as ReasonFilter)}
            >
              <option value="ALL">Todos los criterios</option>
              <option value="MORTALITY">Mortalidad consecutiva / elevada</option>
              <option value="INFERTILITY">Infertilidad prolongada</option>
              <option value="BOTH">Ambas alertas combinadas</option>
            </select>
          </label>
        </div>
      </section>

      {summary.alertItems.length === 0 && destinationFilter === 'ALERTS' ? (
        <section className="empty-panel">
          <p className="eyebrow">Sin alertas críticas</p>
          <h1>No hay hembras marcadas con CULL o SELL</h1>
          <p className="intro">
            Las {summary.breedingCount} hembras evaluadas en{' '}
            {ranchName || 'el rancho activo'} permanecen aptas para cría (
            <code>BREEDING</code>).
          </p>
          {summary.breedingCount > 0 && (
            <button
              type="button"
              className="secondary-button empty-reset-button"
              onClick={() => setDestinationFilter('ALL')}
            >
              Ver hembras evaluadas (BREEDING)
            </button>
          )}
        </section>
      ) : filteredItems.length === 0 ? (
        <section className="empty-panel">
          <p className="eyebrow">Sin coincidencias</p>
          <h1>Ningún vientre coincide con el filtro actual</h1>
          <p className="intro">
            Ajusta el criterio de búsqueda, destino CULL/SELL o motivo de alerta.
          </p>
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
          aria-label="Lista de vientres improductivos con destino sugerido CULL o SELL"
        >
          <div className="table-head">
            <b>Lista de vientres evaluados (CULL / SELL)</b>
            <span>
              {loading
                ? 'Actualizando…'
                : `${filteredItems.length} ${filteredItems.length === 1 ? 'registro' : 'registros'}`}
            </span>
            <small>{ranchName || 'Rancho activo'}</small>
          </div>

          <div className="scroll">
            <table className="analytics-table analytics-alerts-table">
              <thead>
                <tr>
                  <th>Hembra (Folio)</th>
                  <th>Alertas destacadas</th>
                  <th className="num">Partos</th>
                  <th className="num">% Preñez</th>
                  <th className="num">% Mortalidad crías</th>
                  <th>Último parto / estado</th>
                  <th>Destino sugerido</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const destMeta = getDestinationMeta(item.suggestion);
                  const mortalityInfo = getMortalityReasonDetail(item);
                  const infertilityInfo = getInfertilityReasonDetail(item);
                  const hasCriticalRowAlert =
                    item.hasConsecutiveMortality ||
                    item.hasHighMortality ||
                    item.hasProlongedInfertility;
                  const rowHighlightClass =
                    item.hasConsecutiveMortality || item.suggestion === 'CULL'
                      ? 'analytics-alert-row analytics-alert-row-danger'
                      : hasCriticalRowAlert || item.suggestion === 'SELL'
                        ? 'analytics-alert-row analytics-alert-row-warning'
                        : '';
                  const formattedLastBirth = formatLastBirthDate(
                    item.lastBirthDate
                  );

                  return (
                    <tr key={item.key} className={rowHighlightClass}>
                      <td>
                        {canOpenAnimalDetail && item.animalId ? (
                          <a
                            className="animal-link"
                            href={`#/inventario/${encodeURIComponent(item.animalId)}`}
                          >
                            {item.folioInterno}
                            <small>{formatAgeSummary(item.ageDays)}</small>
                          </a>
                        ) : (
                          <div>
                            <strong>{item.folioInterno}</strong>
                            <small>{formatAgeSummary(item.ageDays)}</small>
                          </div>
                        )}
                      </td>

                      <td>
                        <div className="analytics-trigger-stack">
                          {mortalityInfo && (
                            <div className="analytics-trigger-item analytics-trigger-danger">
                              <span
                                className="analytics-trigger-badge badge-danger"
                                role="status"
                              >
                                <span aria-hidden="true">▲</span>{' '}
                                {mortalityInfo.title}
                              </span>
                              <small>{mortalityInfo.detail}</small>
                            </div>
                          )}

                          {infertilityInfo && (
                            <div className="analytics-trigger-item analytics-trigger-warning">
                              <span
                                className="analytics-trigger-badge badge-warning"
                                role="status"
                              >
                                <span aria-hidden="true">●</span>{' '}
                                {infertilityInfo.title}
                              </span>
                              <small>{infertilityInfo.detail}</small>
                            </div>
                          )}

                          {!mortalityInfo && !infertilityInfo && (
                            <span className="analytics-trigger-neutral">
                              {item.alertReason || 'Sin alertas activas'}
                            </span>
                          )}

                          {item.alertReason &&
                            (mortalityInfo !== null ||
                              infertilityInfo !== null) && (
                              <small className="analytics-custom-reason">
                                {item.alertReason}
                              </small>
                            )}
                        </div>
                      </td>

                      <td className="num">
                        <strong>
                          {item.births !== null ? item.births : '—'}
                        </strong>
                        {item.offspringBorn !== null && (
                          <small>
                            {item.offspringBorn} nacidas
                            {item.offspringDead !== null
                              ? ` · ${item.offspringDead} bajas`
                              : ''}
                          </small>
                        )}
                      </td>

                      <td className="num analytics-num-strong">
                        {formatPct(item.pregnancyPct)}
                        {item.diagnosed !== null && (
                          <small>
                            {item.pregnantCount ?? '—'}/{item.diagnosed} diagn.
                          </small>
                        )}
                      </td>

                      <td
                        className={`num analytics-num-strong${item.hasConsecutiveMortality || item.hasHighMortality ? ' analytics-mortality-high' : ''}`}
                      >
                        {formatPct(item.mortalityPct)}
                        {item.hasConsecutiveMortality && (
                          <small>Pérdida consecutiva</small>
                        )}
                      </td>

                      <td>
                        {formattedLastBirth ? (
                          <div>
                            <span>{formattedLastBirth}</span>
                            {item.daysSinceLastBirth !== null && (
                              <small>Hace {item.daysSinceLastBirth} días</small>
                            )}
                          </div>
                        ) : item.daysSinceLastBirth !== null ? (
                          <div>
                            <span>Hace {item.daysSinceLastBirth} días</span>
                            <small>
                              {item.pregnant === true
                                ? 'Gestante'
                                : item.pregnant === false
                                  ? 'Vacía'
                                  : 'Sin gestación confirmada'}
                            </small>
                          </div>
                        ) : item.births === 0 ? (
                          <div>
                            <span>Sin partos</span>
                            <small>
                              {item.pregnant === true
                                ? 'Gestante'
                                : 'Sin historial de parto'}
                            </small>
                          </div>
                        ) : (
                          <span>
                            {item.pregnant === true
                              ? 'Gestante'
                              : item.pregnant === false
                                ? 'Vacía'
                                : '—'}
                          </span>
                        )}
                      </td>

                      <td>
                        <div className={destMeta.badgeClass}>
                          <strong>{destMeta.code}</strong>
                          <span>{destMeta.label}</span>
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
  );
}
