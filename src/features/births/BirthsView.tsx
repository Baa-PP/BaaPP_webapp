import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';
import { RanchContextNotice } from '../../components/RanchContextNotice';

export interface BirthRecord {
  id: string;
  ranchId?: string;
  damLabel: string;
  damUno?: string;
  sireLabel: string;
  sireUno?: string;
  birthDate: string;
  liveBornCount: number;
  stillbornCount: number;
  registeredLambsCount: number | null;
  evidencePhotoUrl?: string;
  evidencePhotoS3Key?: string;
  isLocked: boolean;
  daysElapsed: number | null;
  parturitionType?: string;
  notes?: string;
}

export interface BirthsViewProps {
  username: string;
  userRole: string;
  multiRanch: boolean;
  activeRanchId: string | null;
  ranchName?: string;
  ranchesLoading: boolean;
  ranchesError?: string;
  onRetryRanches?: () => void;
}

const AUDIT_ROLES = new Set(['ASSOCIATION_SUPERUSER', 'VET_TECHNICIAN']);
const LOCK_THRESHOLD_DAYS = 30;
const MS_PER_DAY = 86_400_000;

function toNonEmptyString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return undefined;
}

function toOptionalNonNegativeInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.trunc(n);
}

function firstValidInt(...values: unknown[]): number | null {
  for (const v of values) {
    const parsed = toOptionalNonNegativeInt(v);
    if (parsed !== null) return parsed;
  }
  return null;
}

function sanitizePhotoUrl(raw?: string): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function computeDaysElapsed(birthDate?: string): number | null {
  if (!birthDate) return null;
  const trimmed = birthDate.trim();
  if (!trimmed) return null;

  const now = new Date();
  const todayMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    const birthMidnight = new Date(year, month, day);
    if (
      birthMidnight.getFullYear() === year &&
      birthMidnight.getMonth() === month &&
      birthMidnight.getDate() === day
    ) {
      const diff = Math.round(
        (todayMidnight.getTime() - birthMidnight.getTime()) / MS_PER_DAY
      );
      return Math.max(0, diff);
    }
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  const parsedMidnight = new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate()
  );
  const diff = Math.round(
    (todayMidnight.getTime() - parsedMidnight.getTime()) / MS_PER_DAY
  );
  return Math.max(0, diff);
}

function extractYearMonth(birthDate?: string): string | null {
  if (!birthDate) return null;
  const trimmed = birthDate.trim();
  const match = /^(\d{4}-\d{2})/.exec(trimmed);
  if (match) return match[1];

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getCurrentYearMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function formatDate(value?: string): string {
  if (!value) return '—';
  const trimmed = value.trim();
  if (!trimmed) return '—';
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? `${trimmed}T00:00:00`
    : trimmed;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

function compareBirthDatesDesc(a: BirthRecord, b: BirthRecord): number {
  const isoA = /^(\d{4}-\d{2}-\d{2})/.exec(a.birthDate)?.[1] ?? '';
  const isoB = /^(\d{4}-\d{2}-\d{2})/.exec(b.birthDate)?.[1] ?? '';
  if (isoA && isoB && isoA !== isoB) {
    return isoB.localeCompare(isoA);
  }
  const timeA = a.birthDate ? new Date(a.birthDate).getTime() : NaN;
  const timeB = b.birthDate ? new Date(b.birthDate).getTime() : NaN;
  if (Number.isFinite(timeA) && Number.isFinite(timeB) && timeA !== timeB) {
    return timeB - timeA;
  }
  return b.id.localeCompare(a.id);
}

export function normalizeBirth(raw: unknown, index: number): BirthRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const id =
    toNonEmptyString(
      obj.id,
      obj.birthId,
      obj.birth_id,
      typeof obj.id === 'number' ? String(obj.id) : undefined
    ) ?? `birth-${index}`;

  const birthDate =
    toNonEmptyString(obj.birthDate, obj.birth_date, obj.fecha_parto, obj.fecha) ??
    '';

  const damLabel =
    toNonEmptyString(
      obj.damFolio,
      obj.dam_folio,
      obj.madre_folio,
      obj.damName,
      obj.dam_name,
      obj.madre_name,
      obj.madre,
      obj.externalDamFolio,
      obj.external_dam_folio,
      obj.damId,
      obj.dam_id
    ) ?? '—';

  const sireLabel =
    toNonEmptyString(
      obj.sireFolio,
      obj.sire_folio,
      obj.padre_folio,
      obj.sireName,
      obj.sire_name,
      obj.padre_name,
      obj.padre,
      obj.externalSireFolio,
      obj.external_sire_folio,
      obj.sireId,
      obj.sire_id
    ) ?? '—';

  const lambsArray = obj.lambs ?? obj.crias ?? obj.offspring;
  const registeredLambsCount = Array.isArray(lambsArray)
    ? lambsArray.length
    : firstValidInt(
        obj.registeredLambsCount,
        obj.registered_lambs_count,
        obj.registeredLambs,
        obj.registered_lambs,
        obj.crias_registradas,
        obj.registeredCount,
        obj.registered_count
      );

  const liveBornCount =
    firstValidInt(
      obj.liveBornCount,
      obj.live_born_count,
      obj.liveBirths,
      obj.live_births,
      obj.nacidos_vivos
    ) ?? 0;

  const stillbornCount =
    firstValidInt(
      obj.stillbornCount,
      obj.stillborn_count,
      obj.stillborn,
      obj.stillbirths,
      obj.nacidos_muertos
    ) ?? 0;

  const evidencePhotoUrl = sanitizePhotoUrl(
    toNonEmptyString(
      obj.evidencePhotoUrl,
      obj.evidence_photo_url,
      obj.presignedEvidencePhotoUrl,
      obj.presigned_evidence_photo_url,
      obj.photoPresignedUrl,
      obj.photo_presigned_url,
      obj.presignedPhotoUrl,
      obj.presigned_photo_url,
      obj.photoUrl,
      obj.photo_url,
      obj.foto_evidencia_url,
      obj.foto_evidencia
    )
  );

  const evidencePhotoS3Key = toNonEmptyString(
    obj.evidencePhotoS3Key,
    obj.evidence_photo_s3_key,
    obj.foto_evidencia_s3_key
  );

  const daysElapsed = computeDaysElapsed(birthDate);
  const rawStatus = toNonEmptyString(obj.status, obj.estado)?.toUpperCase();
  const explicitLocked =
    obj.isLocked === true ||
    obj.locked === true ||
    obj.isBlocked === true ||
    obj.is_blocked === true ||
    obj.bloqueado === true;

  const isLocked =
    explicitLocked ||
    rawStatus === 'LOCKED' ||
    rawStatus === 'BLOQUEADO' ||
    (daysElapsed !== null && daysElapsed > LOCK_THRESHOLD_DAYS);

  return {
    id,
    ranchId: toNonEmptyString(obj.ranchId, obj.ranch_id),
    damLabel,
    damUno: toNonEmptyString(obj.damUno, obj.dam_uno, obj.folio_uno_madre),
    sireLabel,
    sireUno: toNonEmptyString(obj.sireUno, obj.sire_uno, obj.folio_uno_padre),
    birthDate,
    liveBornCount,
    stillbornCount,
    registeredLambsCount,
    evidencePhotoUrl,
    evidencePhotoS3Key,
    isLocked,
    daysElapsed,
    parturitionType: toNonEmptyString(
      obj.parturitionType,
      obj.birthType,
      obj.birth_type,
      obj.tipo_parto
    ),
    notes: toNonEmptyString(obj.notes, obj.notas),
  };
}

export function normalizeBirthList(payload: unknown): BirthRecord[] {
  const unwrapped =
    payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)
      ? (payload as Record<string, unknown>).data
      : payload;

  let rawList: unknown[] = [];
  if (Array.isArray(payload)) {
    rawList = payload;
  } else if (Array.isArray(unwrapped)) {
    rawList = unwrapped;
  } else if (unwrapped && typeof unwrapped === 'object') {
    const obj = unwrapped as Record<string, unknown>;
    const candidate =
      obj.births ?? obj.partos ?? obj.items ?? obj.content ?? obj.results;
    if (Array.isArray(candidate)) {
      rawList = candidate;
    }
  }

  return rawList
    .map((item, idx) => normalizeBirth(item, idx))
    .filter((item): item is BirthRecord => item !== null);
}

export function BirthsView({
  username,
  userRole,
  multiRanch,
  activeRanchId,
  ranchName,
  ranchesLoading,
  ranchesError,
  onRetryRanches,
}: BirthsViewProps) {
  const [monthFilter, setMonthFilter] = useState<string>('');
  const [selectedEvidence, setSelectedEvidence] = useState<BirthRecord | null>(null);
  const [modalImgError, setModalImgError] = useState<boolean>(false);

  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);

  const isAuditRole = AUDIT_ROLES.has(userRole);
  const isOwner = userRole === 'OWNER';

  // Reset modal selection when switching ranch or month filter
  useEffect(() => {
    setSelectedEvidence(null);
    setModalImgError(false);
    lastTriggerRef.current = null;
  }, [activeRanchId, monthFilter]);

  useEffect(() => {
    setModalImgError(false);
  }, [selectedEvidence]);

  function openEvidenceModal(birth: BirthRecord, triggerEl: HTMLButtonElement | null) {
    lastTriggerRef.current = triggerEl;
    setModalImgError(false);
    setSelectedEvidence(birth);
  }

  function closeEvidenceModal() {
    setSelectedEvidence(null);
    const trigger = lastTriggerRef.current;
    lastTriggerRef.current = null;
    if (trigger && trigger.isConnected) {
      requestAnimationFrame(() => trigger.focus());
    }
  }

  useEffect(() => {
    if (!selectedEvidence) return;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeEvidenceModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedEvidence]);

  const birthsQuery = useQuery({
    queryKey: ['births', username, activeRanchId, monthFilter] as const,
    queryFn: async ({ queryKey }) => {
      const ranchId = queryKey[2];
      const month = queryKey[3];
      const qs = month ? `?month=${encodeURIComponent(month)}` : '';
      const res = await apiFetch<unknown>(`/births${qs}`, {
        ranchId: ranchId ?? undefined,
      });
      return normalizeBirthList(res);
    },
    enabled: Boolean(activeRanchId),
  });

  if (!activeRanchId) {
    return (
      <RanchContextNotice
        eyebrow={isAuditRole ? 'Bandeja de auditoría' : 'Partos del rancho'}
        multiRanch={multiRanch}
        loading={ranchesLoading}
        error={ranchesError}
        onRetry={onRetryRanches}
        contextLabel="sus partos"
      />
    );
  }

  const allBirths = birthsQuery.data ?? [];
  const filteredBirths = monthFilter
    ? allBirths.filter((b) => extractYearMonth(b.birthDate) === monthFilter)
    : allBirths;
  const visibleBirths = [...filteredBirths].sort(compareBirthDatesDesc);

  const totalLiveBorn = visibleBirths.reduce((acc, b) => acc + b.liveBornCount, 0);
  const totalStillborn = visibleBirths.reduce((acc, b) => acc + b.stillbornCount, 0);
  const totalLocked = visibleBirths.filter((b) => b.isLocked).length;

  const loading = birthsQuery.isFetching;
  const error =
    birthsQuery.error instanceof Error
      ? birthsQuery.error.message
      : birthsQuery.isError
        ? 'No se pudo cargar el listado de partos del rancho.'
        : '';

  return (
    <div className="births-view">
      <div className="title-row">
        <div>
          <p className="eyebrow">
            {ranchName ? `${ranchName} · ` : ''}
            {isAuditRole ? 'Control anti-fraude · RF-WEB-06' : 'Registro de partos'}
          </p>
          <h1>
            {isAuditRole
              ? 'Bandeja de auditoría de nacimientos'
              : 'Partos del rancho'}
          </h1>
          <p className="intro">
            Consulta mensual de nacimientos, validación del bloqueo anti-fraude mayor a 30 días
            e inspección de fotografías de evidencia en S3.
          </p>
        </div>
        <div className="count-card">
          <b>{visibleBirths.length}</b>
          <span>{visibleBirths.length === 1 ? 'parto' : 'partos'}</span>
        </div>
      </div>

      <div className="births-notice" role="note">
        <span className="births-notice-icon" aria-hidden="true">
          ℹ
        </span>
        <div>
          {isOwner ? (
            <>
              <strong>Política anti-fraude (solo lectura):</strong> los partos con más de{' '}
              {LOCK_THRESHOLD_DAYS} días quedan bloqueados contra edición o eliminación. Si
              requieres corregir un registro o capturar un parto fuera de plazo, solicita la
              revisión al técnico veterinario o administrador de la asociación.
            </>
          ) : (
            <>
              <strong>Control de ventana de {LOCK_THRESHOLD_DAYS} días:</strong> los partos
              que superan el plazo aparecen marcados como bloqueados. Las acciones de corrección
              auditada se habilitarán en el módulo correspondiente (WEB-016).
            </>
          )}
        </div>
      </div>

      <section className="births-filter-bar" aria-label="Filtros de partos">
        <div className="births-filter-controls">
          <label className="births-filter-label" htmlFor="births-month-filter">
            Mes de parto
          </label>
          <input
            id="births-month-filter"
            type="month"
            className="births-month-input"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
          />
          <button
            type="button"
            className="secondary-button"
            onClick={() => setMonthFilter(getCurrentYearMonth())}
          >
            Mes actual
          </button>
          <button
            type="button"
            className="link-button"
            disabled={!monthFilter}
            onClick={() => setMonthFilter('')}
          >
            Todos los meses
          </button>
        </div>

        <div className="births-summary-pills" aria-label="Resumen de partos mostrados">
          <span className="births-stat-pill">
            Nacidos vivos: <b>{totalLiveBorn}</b>
          </span>
          <span className="births-stat-pill">
            Nacidos muertos: <b>{totalStillborn}</b>
          </span>
          <span className="births-stat-pill">
            Bloqueados (&gt;{LOCK_THRESHOLD_DAYS}d): <b>{totalLocked}</b>
          </span>
        </div>
      </section>

      {error ? (
        <section className="births-error" role="alert">
          <div>
            <strong>No se pudieron consultar los partos</strong>
            <p className="error">{error}</p>
          </div>
          <button
            type="button"
            className="secondary-button"
            disabled={loading}
            onClick={() => {
              void birthsQuery.refetch();
            }}
          >
            {loading ? 'Reintentando…' : 'Reintentar'}
          </button>
        </section>
      ) : birthsQuery.isLoading ? (
        <section className="empty-panel" role="status" aria-live="polite">
          <p className="muted">Cargando partos registrados…</p>
        </section>
      ) : visibleBirths.length === 0 ? (
        <section className="empty-panel">
          <p className="eyebrow">Sin resultados</p>
          <h1>No hay partos registrados para el filtro seleccionado</h1>
          <p className="intro">
            {monthFilter
              ? `No se encontraron nacimientos en el mes ${monthFilter} para ${ranchName || 'el rancho activo'}.`
              : `Aún no existen eventos de parto sincronizados para ${ranchName || 'el rancho activo'}.`}
          </p>
          {monthFilter && (
            <button
              type="button"
              className="secondary-button empty-reset-button"
              onClick={() => setMonthFilter('')}
            >
              Ver todos los meses
            </button>
          )}
        </section>
      ) : (
        <section className="table" aria-label="Listado de partos">
          <div className="table-head">
            <b>Partos registrados</b>
            <span>
              {loading
                ? 'Actualizando…'
                : `${visibleBirths.length} ${visibleBirths.length === 1 ? 'evento' : 'eventos'}`}
            </span>
            <small>{ranchName || 'Rancho activo'}</small>
          </div>

          <div className="scroll">
            <table className="births-table">
              <thead>
                <tr>
                  <th>Fecha de parto</th>
                  <th>Madre (Vientre)</th>
                  <th>Padre (Semental)</th>
                  <th className="num">Nacidos vivos</th>
                  <th className="num">Nacidos muertos</th>
                  <th className="num">Crías registradas</th>
                  <th>Estado / Bloqueo (&gt;30 días)</th>
                  <th>Evidencia S3</th>
                  <th>Control</th>
                </tr>
              </thead>
              <tbody>
                {visibleBirths.map((b) => (
                  <tr
                    key={b.id}
                    className={b.isLocked ? 'birth-row-locked' : undefined}
                  >
                    <td>
                      <strong>{formatDate(b.birthDate)}</strong>
                      {b.daysElapsed !== null && (
                        <small>
                          hace {b.daysElapsed}{' '}
                          {b.daysElapsed === 1 ? 'día' : 'días'}
                        </small>
                      )}
                    </td>
                    <td>
                      <strong>{b.damLabel}</strong>
                      {b.damUno && <small>UNO: {b.damUno}</small>}
                    </td>
                    <td>
                      <span>{b.sireLabel}</span>
                      {b.sireUno && <small>UNO: {b.sireUno}</small>}
                    </td>
                    <td className="num birth-count-live">{b.liveBornCount}</td>
                    <td
                      className={
                        b.stillbornCount > 0
                          ? 'num birth-count-dead'
                          : 'num'
                      }
                    >
                      {b.stillbornCount}
                    </td>
                    <td className="num">
                      {b.registeredLambsCount !== null
                        ? b.registeredLambsCount
                        : '—'}
                    </td>
                    <td>
                      {b.isLocked ? (
                        <span className="birth-badge birth-badge-locked">
                          Bloqueado (&gt;30 días)
                        </span>
                      ) : (
                        <span className="birth-badge birth-badge-open">
                          En ventana (≤30 días)
                        </span>
                      )}
                    </td>
                    <td>
                      {b.evidencePhotoUrl ? (
                        <button
                          type="button"
                          className="birth-thumb-btn"
                          onClick={(e) =>
                            openEvidenceModal(b, e.currentTarget)
                          }
                          aria-label={`Ver fotografía de evidencia del parto de ${b.damLabel}`}
                        >
                          <img
                            src={b.evidencePhotoUrl}
                            alt={`Evidencia parto ${b.damLabel}`}
                            className="birth-thumb-img"
                            loading="lazy"
                          />
                          <span>Ver foto</span>
                        </button>
                      ) : b.evidencePhotoS3Key ? (
                        <span className="muted">En S3 (sin enlace)</span>
                      ) : (
                        <span className="muted">Sin evidencia</span>
                      )}
                    </td>
                    <td>
                      {isOwner ? (
                        <span className="birth-readonly-tag">
                          {b.isLocked ? 'Solo lectura (bloqueado)' : 'Solo lectura'}
                        </span>
                      ) : (
                        <span className="birth-audit-tag">
                          {b.isLocked ? 'Auditoría (WEB-016)' : 'En ventana'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {selectedEvidence && (
        <div
          className="birth-modal-backdrop"
          onClick={closeEvidenceModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="birth-evidence-modal-title"
        >
          <div
            className="birth-modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="birth-modal-header">
              <div>
                <h2 id="birth-evidence-modal-title">
                  Evidencia fotográfica de parto
                </h2>
                <p className="birth-modal-subtitle">
                  Madre: <b>{selectedEvidence.damLabel}</b> · Padre:{' '}
                  <b>{selectedEvidence.sireLabel}</b> · Fecha:{' '}
                  {formatDate(selectedEvidence.birthDate)}
                </p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                className="birth-modal-close"
                onClick={closeEvidenceModal}
                aria-label="Cerrar visor"
              >
                ✕
              </button>
            </div>

            <div className="birth-modal-body">
              {selectedEvidence.evidencePhotoUrl && !modalImgError ? (
                <img
                  src={selectedEvidence.evidencePhotoUrl}
                  alt={`Fotografía de evidencia S3 del parto de ${selectedEvidence.damLabel}`}
                  className="birth-modal-img"
                  onError={() => setModalImgError(true)}
                />
              ) : (
                <div className="birth-modal-fallback" role="status">
                  <p>
                    No fue posible cargar la vista previa de la fotografía desde S3.
                  </p>
                  {selectedEvidence.evidencePhotoS3Key && (
                    <small className="muted">
                      Clave S3: {selectedEvidence.evidencePhotoS3Key}
                    </small>
                  )}
                </div>
              )}
            </div>

            <div className="birth-modal-footer">
              <div className="birth-modal-meta">
                {selectedEvidence.isLocked ? (
                  <span className="birth-badge birth-badge-locked">
                    Bloqueado (&gt;30 días)
                  </span>
                ) : (
                  <span className="birth-badge birth-badge-open">
                    En ventana (≤30 días)
                  </span>
                )}
                <span className="birth-modal-counts">
                  Vivos: <b>{selectedEvidence.liveBornCount}</b> · Muertos:{' '}
                  <b>{selectedEvidence.stillbornCount}</b> · Crías registradas:{' '}
                  <b>
                    {selectedEvidence.registeredLambsCount !== null
                      ? selectedEvidence.registeredLambsCount
                      : '—'}
                  </b>
                </span>
              </div>

              <div className="birth-modal-actions">
                {selectedEvidence.evidencePhotoUrl && (
                  <a
                    href={selectedEvidence.evidencePhotoUrl}
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
                  onClick={closeEvidenceModal}
                >
                  Cerrar visor
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
