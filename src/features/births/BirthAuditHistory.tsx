import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getSessionGeneration } from '../../api/client';
import { ModalDialog } from '../../components/ModalDialog';
import {
  associationAuditsQueryKey,
  AuditHistoryEntry,
  fetchAssociationAuditsPage,
  fetchPresignedEvidenceDownload,
} from './auditApi';

export interface BirthAuditHistoryProps {
  username: string;
  activeRanchId: string;
  ranchName?: string;
}

function formatAuditDateTime(value?: string): string {
  if (!value) return 'Fecha no disponible';
  const trimmed = value.trim();
  if (!trimmed) return 'Fecha no disponible';
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? `${trimmed}T00:00:00`
    : trimmed;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function compareAuditsDesc(a: AuditHistoryEntry, b: AuditHistoryEntry): number {
  const timeA = a.createdAt ? new Date(a.createdAt).getTime() : NaN;
  const timeB = b.createdAt ? new Date(b.createdAt).getTime() : NaN;
  if (Number.isFinite(timeA) && Number.isFinite(timeB) && timeA !== timeB) {
    return timeB - timeA;
  }
  if (a.createdAt && b.createdAt && a.createdAt !== b.createdAt) {
    return b.createdAt.localeCompare(a.createdAt);
  }
  return b.id.localeCompare(a.id);
}

function matchesSearch(entry: AuditHistoryEntry, query: string): boolean {
  if (!query) return true;
  const needle = query.toLowerCase();
  const haystacks = [
    entry.id,
    entry.birthId,
    entry.damLabel,
    entry.approverLabel,
    entry.reason,
    entry.evidencePhotoS3Key,
    ...entry.diffRows.flatMap((row) => [
      row.label,
      row.previousDisplay,
      row.newDisplay,
    ]),
  ];
  return haystacks.some(
    (part) => typeof part === 'string' && part.toLowerCase().includes(needle)
  );
}

export function BirthAuditHistory({
  username,
  activeRanchId,
  ranchName,
}: BirthAuditHistoryProps) {
  const [searchFilter, setSearchFilter] = useState('');
  const [expandedAllKeys, setExpandedAllKeys] = useState<Record<string, boolean>>({});
  const [selectedEntry, setSelectedEntry] = useState<AuditHistoryEntry | null>(null);
  const [resolvedPhotoUrl, setResolvedPhotoUrl] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [photoImgFailed, setPhotoImgFailed] = useState(false);
  const [photoRetryNonce, setPhotoRetryNonce] = useState(0);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const photoTriggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setSelectedEntry(null);
    setResolvedPhotoUrl(null);
    setPhotoLoading(false);
    setPhotoError('');
    setPhotoImgFailed(false);
    setExpandedAllKeys({});
    photoTriggerRef.current = null;
  }, [activeRanchId]);

  const auditsQuery = useInfiniteQuery({
    queryKey: associationAuditsQueryKey(username, activeRanchId),
    queryFn: ({ pageParam, signal }) =>
      fetchAssociationAuditsPage(
        activeRanchId,
        pageParam.page,
        signal,
        pageParam.size
      ),
    initialPageParam: { page: 0, size: undefined as number | undefined },
    getNextPageParam: (lastPage) =>
      lastPage.nextPage !== undefined
        ? { page: lastPage.nextPage, size: lastPage.pageSize }
        : undefined,
    enabled: Boolean(activeRanchId),
  });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isFetchNextPageError } =
    auditsQuery;

  useEffect(() => {
    if (
      activeRanchId &&
      hasNextPage &&
      !auditsQuery.isFetching &&
      !isFetchNextPageError
    ) {
      void fetchNextPage();
    }
  }, [
    activeRanchId,
    data,
    hasNextPage,
    auditsQuery.isFetching,
    isFetchNextPageError,
    fetchNextPage,
  ]);

  useEffect(() => {
    if (!selectedEntry) {
      setResolvedPhotoUrl(null);
      setPhotoLoading(false);
      setPhotoError('');
      setPhotoImgFailed(false);
      return;
    }

    setPhotoImgFailed(false);
    setPhotoError('');

    if (selectedEntry.evidencePhotoUrl && photoRetryNonce === 0) {
      setResolvedPhotoUrl(selectedEntry.evidencePhotoUrl);
      setPhotoLoading(false);
      return;
    }

    if (!selectedEntry.evidencePhotoS3Key) {
      if (selectedEntry.evidencePhotoUrl) {
        setResolvedPhotoUrl(selectedEntry.evidencePhotoUrl);
        setPhotoLoading(false);
        return;
      }
      setResolvedPhotoUrl(null);
      setPhotoLoading(false);
      setPhotoError('Este registro de auditoría no incluye fotografía de evidencia.');
      return;
    }

    const controller = new AbortController();
    const requestRanchId = activeRanchId;
    const requestGen = getSessionGeneration();
    let active = true;

    setResolvedPhotoUrl(null);
    setPhotoLoading(true);

    fetchPresignedEvidenceDownload(
      requestRanchId,
      selectedEntry.evidencePhotoS3Key,
      controller.signal
    )
      .then((url) => {
        if (!active || getSessionGeneration() !== requestGen) return;
        setResolvedPhotoUrl(url);
      })
      .catch((err) => {
        if (
          !active ||
          controller.signal.aborted ||
          getSessionGeneration() !== requestGen
        ) {
          return;
        }
        setPhotoError(
          err instanceof Error
            ? err.message
            : 'No fue posible obtener el enlace temporal de S3.'
        );
      })
      .finally(() => {
        if (active && getSessionGeneration() === requestGen) {
          setPhotoLoading(false);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedEntry, activeRanchId, photoRetryNonce]);

  const deduped = new Map<string, AuditHistoryEntry>();
  for (const page of data?.pages ?? []) {
    for (const item of page.items) {
      deduped.set(item.id, item);
    }
  }
  const allEntries = Array.from(deduped.values()).sort(compareAuditsDesc);
  const trimmedSearch = searchFilter.trim();
  const visibleEntries = allEntries.filter((entry) =>
    matchesSearch(entry, trimmedSearch)
  );

  const errorMessage =
    auditsQuery.error instanceof Error
      ? auditsQuery.error.message
      : auditsQuery.isError
        ? 'No se pudo cargar el historial inmutable de auditoría.'
        : '';

  return (
    <div className="audit-history-view">
      <section className="births-filter-bar" aria-label="Filtros del historial de auditoría">
        <div className="births-filter-controls">
          <label className="births-filter-label" htmlFor="audit-history-search">
            Buscar en bitácora
          </label>
          <input
            ref={searchInputRef}
            id="audit-history-search"
            type="search"
            className="audit-history-search-input"
            value={searchFilter}
            placeholder="Madre, aprobador, motivo o ID de parto…"
            onChange={(e) => setSearchFilter(e.target.value)}
          />
          {trimmedSearch && (
            <button
              type="button"
              className="link-button"
              onClick={() => setSearchFilter('')}
            >
              Limpiar
            </button>
          )}
        </div>

        <div className="births-summary-pills">
          <span className="births-stat-pill">
            Registros inmutables: <b>{visibleEntries.length}</b>
          </span>
          <button
            type="button"
            className="secondary-button"
            disabled={auditsQuery.isFetching}
            onClick={() => {
              void auditsQuery.refetch();
            }}
          >
            {auditsQuery.isFetching ? 'Actualizando…' : 'Actualizar historial'}
          </button>
        </div>
      </section>

      {errorMessage ? (
        <section className="births-error" role="alert">
          <div>
            <strong>No se pudo consultar la bitácora de auditorías</strong>
            <p className="error">{errorMessage}</p>
          </div>
          <button
            type="button"
            className="secondary-button"
            disabled={auditsQuery.isFetching}
            onClick={() => {
              void (isFetchNextPageError ? fetchNextPage() : auditsQuery.refetch());
            }}
          >
            {auditsQuery.isFetching ? 'Reintentando…' : 'Reintentar'}
          </button>
        </section>
      ) : auditsQuery.isLoading ? (
        <section className="empty-panel" role="status" aria-live="polite">
          <p className="muted">Cargando historial inmutable de auditorías…</p>
        </section>
      ) : visibleEntries.length === 0 ? (
        <section className="empty-panel">
          <p className="eyebrow">Sin registros</p>
          <h1>
            {trimmedSearch
              ? 'No hay auditorías que coincidan con tu búsqueda'
              : 'Aún no existen correcciones auditadas'}
          </h1>
          <p className="intro">
            {trimmedSearch
              ? `Prueba con otro folio, usuario aprobador o motivo en ${ranchName || 'el rancho activo'}.`
              : `Cada corrección de parto o alta mayor a 30 días en ${ranchName || 'el rancho activo'} aparecerá aquí como registro permanente de solo lectura.`}
          </p>
        </section>
      ) : (
        <div className="audit-history-list" role="region" aria-label="Bitácora inmutable de auditorías">
          {visibleEntries.map((entry) => {
            const showAll = Boolean(expandedAllKeys[entry.id]);
            const changedRows = entry.diffRows.filter((row) => row.changed);
            const displayedRows =
              showAll || changedRows.length === 0 ? entry.diffRows : changedRows;
            const hiddenUnchangedCount = entry.diffRows.length - changedRows.length;

            return (
              <article key={entry.id} className="audit-history-card">
                <header className="audit-history-card-head">
                  <div className="audit-history-badges">
                    <span
                      className={
                        entry.isLateCreation
                          ? 'birth-badge birth-badge-locked'
                          : 'birth-badge birth-badge-open'
                      }
                    >
                      {entry.isLateCreation
                        ? 'Alta extemporánea (>30 días)'
                        : 'Corrección auditada'}
                    </span>
                    <span className="audit-immutable-tag">
                      Inmutable · Solo lectura
                    </span>
                    <span className="births-stat-pill">
                      {entry.changedCount === 1
                        ? '1 campo modificado'
                        : `${entry.changedCount} campos modificados`}
                    </span>
                  </div>
                  <time className="audit-history-time" dateTime={entry.createdAt || undefined}>
                    {formatAuditDateTime(entry.createdAt)}
                  </time>
                </header>

                <div className="audit-history-meta-grid">
                  <div>
                    <span className="audit-meta-label">Aprobado por</span>
                    <strong>{entry.approverLabel}</strong>
                  </div>
                  <div>
                    <span className="audit-meta-label">Parto / Madre</span>
                    <strong>
                      {entry.damLabel ? `Madre ${entry.damLabel}` : 'Registro de parto'}
                      {entry.birthId ? ` · ID ${entry.birthId}` : ''}
                    </strong>
                  </div>
                  <div>
                    <span className="audit-meta-label">ID de auditoría</span>
                    <code>{entry.id}</code>
                  </div>
                </div>

                <div className="audit-reason-box">
                  <span className="audit-meta-label">Motivo de auditoría</span>
                  <p>{entry.reason}</p>
                </div>

                {displayedRows.length > 0 ? (
                  <div className="scroll">
                    <table className="audit-diff-table">
                      <thead>
                        <tr>
                          <th>Campo</th>
                          <th>Estado anterior</th>
                          <th>Estado nuevo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayedRows.map((row) => (
                          <tr
                            key={row.key}
                            className={row.changed ? 'audit-diff-row-changed' : undefined}
                          >
                            <th>{row.label}</th>
                            <td className="audit-diff-prev">{row.previousDisplay}</td>
                            <td className="audit-diff-next">{row.newDisplay}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted">
                    No se incluyeron detalles de estado anterior ni nuevo en este evento.
                  </p>
                )}

                <footer className="audit-history-card-foot">
                  <div className="audit-history-evidence-meta">
                    {entry.evidencePhotoS3Key ? (
                      <small className="muted">
                        Clave S3: <code>{entry.evidencePhotoS3Key}</code>
                      </small>
                    ) : (
                      <small className="muted">Sin clave S3 registrada</small>
                    )}
                    {hiddenUnchangedCount > 0 && changedRows.length > 0 && (
                      <button
                        type="button"
                        className="link-button"
                        onClick={() =>
                          setExpandedAllKeys((prev) => ({
                            ...prev,
                            [entry.id]: !prev[entry.id],
                          }))
                        }
                      >
                        {showAll
                          ? 'Ocultar campos sin cambios'
                          : `Ver todos los campos (+${hiddenUnchangedCount} sin cambios)`}
                      </button>
                    )}
                  </div>

                  {(entry.evidencePhotoUrl || entry.evidencePhotoS3Key) && (
                    <button
                      type="button"
                      className="secondary-button birth-audit-btn"
                      onClick={(e) => {
                        photoTriggerRef.current = e.currentTarget;
                        setPhotoRetryNonce(0);
                        setSelectedEntry(entry);
                      }}
                      aria-label={`Ver evidencia — auditoría ${entry.id}`}
                    >
                      Ver evidencia
                    </button>
                  )}
                </footer>
              </article>
            );
          })}

          {isFetchingNextPage && (
            <p className="muted" role="status" aria-live="polite">
              Cargando registros anteriores de la bitácora…
            </p>
          )}
        </div>
      )}

      <ModalDialog
        open={Boolean(selectedEntry)}
        onClose={() => setSelectedEntry(null)}
        titleId="audit-evidence-modal-title"
        title="Evidencia fotográfica de auditoría"
        subtitle={
          selectedEntry ? (
            <>
              Auditoría <b>{selectedEntry.id}</b> · Aprobado por{' '}
              <b>{selectedEntry.approverLabel}</b> ·{' '}
              {formatAuditDateTime(selectedEntry.createdAt)}
            </>
          ) : undefined
        }
        closeLabel="Cerrar visor de evidencia"
        triggerRef={photoTriggerRef}
        fallbackFocusRef={searchInputRef}
      >
        {selectedEntry && (
          <>
            <div className="birth-modal-body">
              {photoLoading ? (
                <p className="muted" role="status" aria-live="polite">
                  Obteniendo enlace seguro de fotografía en S3…
                </p>
              ) : resolvedPhotoUrl && !photoImgFailed ? (
                <img
                  src={resolvedPhotoUrl}
                  alt={`Fotografía de evidencia S3 de la auditoría ${selectedEntry.id}`}
                  className="birth-modal-img"
                  onError={() => setPhotoImgFailed(true)}
                />
              ) : (
                <div className="birth-modal-fallback" role="status">
                  <p>
                    {photoError ||
                      'No fue posible mostrar la fotografía de evidencia desde S3.'}
                  </p>
                  {selectedEntry.evidencePhotoS3Key && (
                    <small className="muted">
                      Clave S3: {selectedEntry.evidencePhotoS3Key}
                    </small>
                  )}
                  {selectedEntry.evidencePhotoS3Key && (
                    <div className="audit-photo-retry">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setPhotoRetryNonce((n) => n + 1)}
                      >
                        Reintentar carga
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="birth-modal-footer">
              <span className="birth-audit-requirement">
                Motivo: {selectedEntry.reason}
              </span>
              <div className="birth-modal-actions">
                {resolvedPhotoUrl && !photoImgFailed && (
                  <a
                    href={resolvedPhotoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-button"
                  >
                    Abrir original
                  </a>
                )}
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setSelectedEntry(null)}
                >
                  Cerrar visor
                </button>
              </div>
            </div>
          </>
        )}
      </ModalDialog>
    </div>
  );
}
