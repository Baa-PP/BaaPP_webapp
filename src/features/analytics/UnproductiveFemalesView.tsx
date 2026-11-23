import { RanchContextNotice } from '../../components/RanchContextNotice';
import { UnproductiveFemalesPanel } from './UnproductiveFemalesPanel';
import { useAnalyticsOverview } from './useAnalyticsOverview';

export interface UnproductiveFemalesViewProps {
  username: string;
  multiRanch: boolean;
  activeRanchId: string | null;
  ranchName?: string;
  ranchesLoading: boolean;
  ranchesError?: string;
  onRetryRanches?: () => void;
  canOpenAnimalDetail: boolean;
}

export function UnproductiveFemalesView({
  username,
  multiRanch,
  activeRanchId,
  ranchName,
  ranchesLoading,
  ranchesError,
  onRetryRanches,
  canOpenAnimalDetail,
}: UnproductiveFemalesViewProps) {
  const { query, overview, loading, errorMessage } = useAnalyticsOverview(
    username,
    activeRanchId,
    'las alertas de vientres improductivos'
  );

  if (!activeRanchId) {
    return (
      <RanchContextNotice
        eyebrow="Vientres improductivos"
        multiRanch={multiRanch}
        loading={ranchesLoading}
        error={ranchesError}
        onRetry={onRetryRanches}
        contextLabel="las alertas de vientres improductivos"
      />
    );
  }

  const summary = overview?.unproductive;
  const alertCount = summary?.alertItems.length ?? 0;

  return (
    <div className="analytics-view">
      <div className="title-row">
        <div>
          <p className="eyebrow">
            {ranchName ? `${ranchName} · ` : ''}
            Analítica zootécnica · RF-WEB-08
          </p>
          <h1>Tablero de alertas de vientres improductivos</h1>
          <p className="intro">
            Identificación sobre historial reproductivo de borregas con
            infertilidad prolongada o mortalidad consecutiva de crías, con
            destino sugerido <code>CULL</code> (desecho a rastro) o{' '}
            <code>SELL</code>.
          </p>
        </div>
        <div className="count-card">
          <b>{alertCount}</b>
          <span>{alertCount === 1 ? 'alerta' : 'alertas'}</span>
        </div>
      </div>

      {errorMessage ? (
        <section className="analytics-error" role="alert">
          <div>
            <strong>No se pudieron cargar las alertas de vientres</strong>
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
      ) : query.isLoading || !summary ? (
        <section className="empty-panel" role="status" aria-live="polite">
          <p className="muted">
            Cargando evaluación reproductiva de vientres del rancho activo…
          </p>
        </section>
      ) : (
        <UnproductiveFemalesPanel
          summary={summary}
          activeRanchId={activeRanchId}
          ranchName={ranchName}
          loading={loading}
          canOpenAnimalDetail={canOpenAnimalDetail}
        />
      )}
    </div>
  );
}
