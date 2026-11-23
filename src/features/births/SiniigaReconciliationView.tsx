import { useEffect, useMemo, useState } from 'react';
import {
  buildMonthlySiniigaReconciliation,
  FIVE_MONTH_WINDOW_DAYS,
  type BirthReconciliationInput,
} from './siniigaReconciliation';

type MonthScopeFilter = 'ALL' | 'FIVE_MONTHS' | 'EXCESS';

export interface SiniigaReconciliationViewProps {
  activeRanchId: string;
  ranchName?: string;
  rawPayload: unknown;
  births: BirthReconciliationInput[];
  loading: boolean;
  error?: string;
  referenceDateKey?: string;
  manualRequests?: Record<string, number | null>;
  onManualRequestsChange?: (
    updater:
      | Record<string, number | null>
      | ((prev: Record<string, number | null>) => Record<string, number | null>)
  ) => void;
  onRetry?: () => void;
  onInspectMonthBirths?: (monthKey: string) => void;
}

export function SiniigaReconciliationView({
  activeRanchId,
  ranchName,
  rawPayload,
  births,
  loading,
  error,
  referenceDateKey,
  manualRequests: controlledManualRequests,
  onManualRequestsChange,
  onRetry,
  onInspectMonthBirths,
}: SiniigaReconciliationViewProps) {
  const [scopeFilter, setScopeFilter] = useState<MonthScopeFilter>('ALL');
  const [localManualRequests, setLocalManualRequests] = useState<
    Record<string, number | null>
  >({});

  const manualRequests = controlledManualRequests ?? localManualRequests;
  const setManualRequests = onManualRequestsChange ?? setLocalManualRequests;

  useEffect(() => {
    setScopeFilter('ALL');
    if (!onManualRequestsChange) {
      setLocalManualRequests({});
    }
  }, [activeRanchId, onManualRequestsChange]);

  const reconciliation = useMemo(
    () =>
      buildMonthlySiniigaReconciliation(
        rawPayload,
        births,
        manualRequests,
        referenceDateKey
      ),
    [rawPayload, births, manualRequests, referenceDateKey]
  );

  const visibleMonths = useMemo(() => {
    if (scopeFilter === 'FIVE_MONTHS') {
      return reconciliation.months.filter((m) => m.inFiveMonthWindow);
    }
    if (scopeFilter === 'EXCESS') {
      return reconciliation.months.filter((m) => m.exceedsAllowed);
    }
    return reconciliation.months;
  }, [reconciliation.months, scopeFilter]);

  const hasRegisteredData = reconciliation.months.some(
    (m) => m.registeredLambsCount !== null
  );
  const hasManualEdits = Object.keys(manualRequests).length > 0;

  function handleRequestedChange(monthKey: string, rawValue: string) {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      setManualRequests((prev) => ({ ...prev, [monthKey]: null }));
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    setManualRequests((prev) => ({
      ...prev,
      [monthKey]: Math.trunc(parsed),
    }));
  }

  function prefillFromRegistered() {
    const next: Record<string, number | null> = {};
    for (const month of reconciliation.months) {
      if (month.registeredLambsCount !== null) {
        next[month.monthKey] = month.registeredLambsCount;
      }
    }
    setManualRequests(next);
  }

  if (error) {
    return (
      <section className="births-error" role="alert">
        <div>
          <strong>No se pudo calcular la conciliación SINIIGA</strong>
          <p className="error">{error}</p>
        </div>
        {onRetry && (
          <button
            type="button"
            className="secondary-button"
            disabled={loading}
            onClick={onRetry}
          >
            {loading ? 'Reintentando…' : 'Reintentar'}
          </button>
        )}
      </section>
    );
  }

  if (loading && reconciliation.months.length === 0) {
    return (
      <section className="empty-panel" role="status" aria-live="polite">
        <p className="muted">
          Calculando conciliación mensual de chips SINIIGA…
        </p>
      </section>
    );
  }

  if (reconciliation.months.length === 0) {
    return (
      <section className="empty-panel">
        <p className="eyebrow">Conciliación SINIIGA a 5 meses</p>
        <h1>Sin nacimientos registrados por conciliar</h1>
        <p className="intro">
          Aún no hay partos mensuales en {ranchName || 'el rancho activo'} para
          calcular nacidos vivos frente a crías fallecidas posteriores (DECEASED).
        </p>
      </section>
    );
  }

  const excessMonthLabels = reconciliation.months
    .filter((m) => m.exceedsAllowed)
    .map((m) => `${m.monthLabel} (${m.effectiveRequestedChips}/${m.allowedChipsCount})`);

  return (
    <div className="siniiga-view">
      {reconciliation.excessMonthsCount > 0 && (
        <section className="births-error siniiga-excess-banner" role="alert">
          <div>
            <strong>
              Alerta SINIIGA: {reconciliation.excessMonthsCount}{' '}
              {reconciliation.excessMonthsCount === 1
                ? 'mes solicita más aretes de los permitidos'
                : 'meses solicitan más aretes de los permitidos'}
            </strong>
            <p className="error">
              Límite permitido = <code>nacidos_vivos − crías_fallecidas_posteriores (DECEASED)</code>.
              Meses con exceso: {excessMonthLabels.join(', ')}.
            </p>
          </div>
        </section>
      )}

      <section
        className="siniiga-kpi-grid"
        aria-label="Resumen acumulado de conciliación SINIIGA"
      >
        <article className="siniiga-kpi-card">
          <span className="siniiga-kpi-label">Nacidos vivos</span>
          <strong className="siniiga-kpi-value">
            {reconciliation.totalLiveBorn}
          </strong>
          <small className="siniiga-kpi-meta">
            En {reconciliation.totalBirths}{' '}
            {reconciliation.totalBirths === 1 ? 'parto' : 'partos'} registrados
          </small>
        </article>

        <article className="siniiga-kpi-card">
          <span className="siniiga-kpi-label">Fallecidas post. (DECEASED)</span>
          <strong className="siniiga-kpi-value">
            {reconciliation.totalSubsequentDeceased}
          </strong>
          <small className="siniiga-kpi-meta">
            Bajas posteriores al nacimiento descontadas del cupo
          </small>
        </article>

        <article className="siniiga-kpi-card">
          <span className="siniiga-kpi-label">Aretes SINIIGA permitidos</span>
          <strong className="siniiga-kpi-value">
            {reconciliation.totalAllowedChips}
          </strong>
          <small className="siniiga-kpi-meta">
            Tope acumulable (nacidos vivos − DECEASED)
          </small>
        </article>

        <article
          className={`siniiga-kpi-card${reconciliation.excessMonthsCount > 0 ? ' siniiga-kpi-danger' : ''}`}
        >
          <span className="siniiga-kpi-label">Meses con exceso</span>
          <strong className="siniiga-kpi-value">
            {reconciliation.excessMonthsCount}
          </strong>
          <small className="siniiga-kpi-meta">
            {reconciliation.fiveMonthWindowCount}{' '}
            {reconciliation.fiveMonthWindowCount === 1 ? 'mes' : 'meses'} en
            ventana ≥{FIVE_MONTH_WINDOW_DAYS} d (~5 meses)
          </small>
        </article>
      </section>

      <section
        className="births-filter-bar"
        aria-label="Controles de conciliación SINIIGA por mes"
      >
        <div className="births-filter-controls">
          <label className="births-filter-label" htmlFor="siniiga-scope-select">
            Mostrar meses
          </label>
          <select
            id="siniiga-scope-select"
            className="siniiga-scope-select"
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value as MonthScopeFilter)}
          >
            <option value="ALL">
              Todos los meses ({reconciliation.months.length})
            </option>
            <option value="FIVE_MONTHS">
              Ventana ≥ 5 meses / 150 d ({reconciliation.fiveMonthWindowCount})
            </option>
            <option value="EXCESS">
              Solo meses con exceso ({reconciliation.excessMonthsCount})
            </option>
          </select>

          {hasRegisteredData && (
            <button
              type="button"
              className="secondary-button"
              onClick={prefillFromRegistered}
            >
              Validar con crías registradas
            </button>
          )}

          {hasManualEdits && (
            <button
              type="button"
              className="link-button"
              onClick={() => setManualRequests({})}
            >
              Restablecer solicitudes
            </button>
          )}
        </div>

        <p className="siniiga-formula-note">
          Regla a 5 meses: <code>aretes_solicitados ≤ nacidos_vivos − crías_fallecidas_posteriores</code>
        </p>
      </section>

      {visibleMonths.length === 0 ? (
        <section className="empty-panel">
          <p className="eyebrow">Sin coincidencias</p>
          <h1>Ningún mes cumple este filtro</h1>
          <p className="intro">
            Cambia el filtro de meses para revisar el resto del historial mensual
            del rancho.
          </p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setScopeFilter('ALL')}
          >
            Ver todos los meses
          </button>
        </section>
      ) : (
        <section
          className="table"
          aria-label="Resumen mensual de conciliación de chips SINIIGA"
        >
          <div className="table-head">
            <b>Resumen mensual de conciliación SINIIGA</b>
            <span>
              {loading
                ? 'Actualizando…'
                : `${visibleMonths.length} ${visibleMonths.length === 1 ? 'mes' : 'meses'}`}
            </span>
            <small>{ranchName || 'Rancho activo'}</small>
          </div>

          <div className="scroll">
            <table className="births-table siniiga-table">
              <thead>
                <tr>
                  <th>Mes del parto</th>
                  <th>Ventana 5 meses</th>
                  <th className="num">Partos</th>
                  <th className="num">Nacidos vivos</th>
                  <th className="num">Crías DECEASED post.</th>
                  <th className="num">Máx. aretes permitidos</th>
                  <th className="num">Aretes solicitados</th>
                  <th>Validación SINIIGA</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {visibleMonths.map((month) => (
                  <tr
                    key={month.monthKey}
                    className={
                      month.exceedsAllowed ? 'siniiga-row-excess' : undefined
                    }
                  >
                    <td>
                      <strong>{month.monthLabel}</strong>
                      <small>{month.monthKey}</small>
                    </td>

                    <td>
                      {month.inFiveMonthWindow ? (
                        <span className="siniiga-window-pill window-ready">
                          Ventana 5 meses ({month.maxDaysElapsed} d)
                        </span>
                      ) : (
                        <span className="siniiga-window-pill window-pending">
                          {month.maxDaysElapsed !== null
                            ? `${month.maxDaysElapsed} d (<150 d)`
                            : 'En curso'}
                        </span>
                      )}
                    </td>

                    <td className="num">{month.birthsCount}</td>
                    <td className="num">{month.liveBornCount}</td>
                    <td className="num">
                      <span
                        className={
                          month.subsequentDeceasedCount > 0
                            ? 'siniiga-deceased-count'
                            : undefined
                        }
                      >
                        {month.subsequentDeceasedCount}
                      </span>
                    </td>
                    <td className="num siniiga-allowed-cell">
                      <strong>{month.allowedChipsCount}</strong>
                      {month.registeredLambsCount !== null && (
                        <small>
                          Reg.: {month.registeredLambsCount}
                          {month.registeredExceedsAllowed ? ' (> cupo)' : ''}
                        </small>
                      )}
                    </td>

                    <td className="num">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        className={`siniiga-request-input${month.exceedsAllowed ? ' siniiga-input-excess' : ''}`}
                        aria-label={`Aretes solicitados para ${month.monthLabel}`}
                        placeholder={`Máx. ${month.allowedChipsCount}`}
                        value={
                          month.effectiveRequestedChips !== null
                            ? String(month.effectiveRequestedChips)
                            : ''
                        }
                        onChange={(e) =>
                          handleRequestedChange(month.monthKey, e.target.value)
                        }
                      />
                    </td>

                    <td>
                      {month.exceedsAllowed ? (
                        <span
                          className="siniiga-status-badge status-excess"
                          role="status"
                        >
                          <span aria-hidden="true">▲</span> Excede permitidos (+
                          {month.excessChips})
                        </span>
                      ) : month.effectiveRequestedChips !== null ? (
                        <span className="siniiga-status-badge status-ok">
                          Permitido ({month.effectiveRequestedChips} ≤{' '}
                          {month.allowedChipsCount})
                        </span>
                      ) : month.registeredExceedsAllowed && month.registeredLambsCount !== null ? (
                        <span className="siniiga-status-badge status-warn">
                          Reg. ({month.registeredLambsCount}) supera cupo por +
                          {month.registeredLambsCount - month.allowedChipsCount}
                          {month.subsequentDeceasedCount > 0
                            ? ` (${month.subsequentDeceasedCount} DECEASED)`
                            : ''}
                        </span>
                      ) : (
                        <span className="siniiga-status-badge status-neutral">
                          Cupo: {month.allowedChipsCount} aretes
                        </span>
                      )}
                    </td>

                    <td>
                      {onInspectMonthBirths && month.monthKey !== 'sin-fecha' ? (
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => onInspectMonthBirths(month.monthKey)}
                        >
                          Ver partos
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
