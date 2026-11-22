interface RanchContextNoticeProps {
  eyebrow: string;
  multiRanch: boolean;
  loading: boolean;
  error?: string;
  onRetry?: () => void;
}

/**
 * Fallback view shown when a ranch-scoped screen has no activeRanchId yet:
 * renders loading, ranch fetch error with retry, or missing-ranch guidance.
 */
export function RanchContextNotice({
  eyebrow,
  multiRanch,
  loading,
  error,
  onRetry,
}: RanchContextNoticeProps) {
  if (loading) {
    return (
      <section className="empty-panel">
        <p className="muted">
          {multiRanch ? 'Cargando ranchos afiliados…' : 'Cargando datos del rancho…'}
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="empty-panel">
        <p className="eyebrow">{eyebrow}</p>
        <h1>No se pudieron cargar los ranchos</h1>
        <p className="error" role="alert">
          {error}
        </p>
        {onRetry && (
          <button
            type="button"
            className="secondary-button"
            onClick={onRetry}
          >
            Reintentar
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="empty-panel">
      <p className="eyebrow">Contexto de rancho</p>
      <h1>Sin rancho activo seleccionado</h1>
      <p className="intro">
        {multiRanch
          ? 'Selecciona un rancho afiliado en la barra superior para consultar su inventario.'
          : 'No se encontró un rancho activo asignado a tu cuenta.'}
      </p>
    </section>
  );
}
