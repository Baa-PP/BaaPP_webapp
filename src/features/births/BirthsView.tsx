import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, getSessionGeneration } from '../../api/client';
import { ModalDialog } from '../../components/ModalDialog';
import { RanchContextNotice } from '../../components/RanchContextNotice';
import {
  fetchPresignedEvidenceDownload,
  RecordedBirthAuditSummary,
  sanitizeHttpMediaUrl,
} from './auditApi';
import { BirthAuditHistory } from './BirthAuditHistory';
import { BirthAuditModal, BirthAuditMode } from './BirthAuditModal';
import { SiniigaReconciliationView } from './SiniigaReconciliationView';
import {
  computeDaysElapsed,
  extractYearMonth,
  getLocalDateKey,
} from './siniigaReconciliation';

export interface BirthRecord {
  id: string;
  ranchId?: string;
  damId?: string;
  damLabel: string;
  damUno?: string;
  sireId?: string;
  sireLabel: string;
  sireUno?: string;
  externalSireFolio?: string;
  conceptionMethod?: string;
  birthDate: string;
  liveBornCount: number;
  stillbornCount: number;
  registeredLambsCount: number | null;
  subsequentDeceasedCount: number;
  requestedChipsCount: number | null;
  evidencePhotoUrl?: string;
  evidencePhotoS3Key?: string;
  serverLocked: boolean;
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

const MAX_BIRTHS_PAGES = 20;
const MONTH_FILTER_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTHS_ES = [
  { value: '01', label: 'Enero' },
  { value: '02', label: 'Febrero' },
  { value: '03', label: 'Marzo' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Mayo' },
  { value: '06', label: 'Junio' },
  { value: '07', label: 'Julio' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Septiembre' },
  { value: '10', label: 'Octubre' },
  { value: '11', label: 'Noviembre' },
  { value: '12', label: 'Diciembre' },
] as const;

function getCurrentYearMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getYearOptions(selectedYear?: string): string[] {
  const currentYear = new Date().getFullYear();
  const years = new Set<string>();
  for (let y = currentYear + 1; y >= currentYear - 10; y -= 1) {
    years.add(String(y));
  }
  if (selectedYear && /^\d{4}$/.test(selectedYear)) {
    years.add(selectedYear);
  }
  return Array.from(years).sort((a, b) => b.localeCompare(a));
}

function readNextBirthsPage(payload: unknown, currentPage: number): number | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
  const root = payload as Record<string, unknown>;
  const unwrapped =
    'data' in root && root.data && typeof root.data === 'object' && !Array.isArray(root.data)
      ? (root.data as Record<string, unknown>)
      : root;
  const totalPages = toOptionalNonNegativeInt(
    unwrapped.totalPages ?? unwrapped.total_pages
  );
  if (totalPages !== null) {
    return currentPage + 1 < totalPages ? currentPage + 1 : undefined;
  }
  const hasNext = unwrapped.hasNext ?? unwrapped.has_next;
  if (hasNext === true) {
    return currentPage + 1;
  }
  return undefined;
}

async function fetchAllBirthsPages(
  ranchId: string | undefined,
  month: string,
  signal?: AbortSignal
): Promise<{ rawPayload: unknown; births: BirthRecord[] }> {
  const validMonth = MONTH_FILTER_REGEX.test(month) ? month : '';
  const baseParams = validMonth ? `month=${encodeURIComponent(validMonth)}` : '';
  const firstQs = baseParams ? `?${baseParams}` : '';
  const firstPayload = await apiFetch<unknown>(`/births${firstQs}`, {
    ranchId,
    signal,
  });
  const deduped = new Map<string, BirthRecord>();
  for (const item of normalizeBirthList(firstPayload)) {
    deduped.set(item.id, item);
  }

  let nextPage = readNextBirthsPage(firstPayload, 0);
  let pagesLoaded = 1;
  while (nextPage !== undefined && pagesLoaded < MAX_BIRTHS_PAGES) {
    const pageParams = [baseParams, `page=${nextPage}`].filter(Boolean).join('&');
    const nextPayload = await apiFetch<unknown>(`/births?${pageParams}`, {
      ranchId,
      signal,
    });
    const nextItems = normalizeBirthList(nextPayload);
    if (nextItems.length === 0) break;
    for (const item of nextItems) {
      deduped.set(item.id, item);
    }
    pagesLoaded += 1;
    nextPage = readNextBirthsPage(nextPayload, nextPage);
  }

  return {
    rawPayload: firstPayload,
    births: Array.from(deduped.values()),
  };
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
      obj.partoId,
      obj.parto_id,
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

  const explicitSubsequentDeceased = firstValidInt(
    obj.subsequentDeceasedCount,
    obj.subsequent_deceased_count,
    obj.subsequentDeathsCount,
    obj.subsequent_deaths_count,
    obj.deceasedOffspringCount,
    obj.deceased_offspring_count,
    obj.deceasedLambsCount,
    obj.deceased_lambs_count,
    obj.criasMuertasDespues,
    obj.crias_muertas_despues,
    obj.criasMuertasPosteriores,
    obj.crias_muertas_posteriores,
    obj.criasFallecidasPosteriores,
    obj.crias_fallecidas_posteriores,
    obj.postBirthDeaths,
    obj.post_birth_deaths
  );

  const subsequentDeceasedFromLambs = Array.isArray(lambsArray)
    ? lambsArray.filter((child) => {
        if (!child || typeof child !== 'object' || Array.isArray(child)) {
          return false;
        }
        const childObj = child as Record<string, unknown>;
        const rawChildStatus = toNonEmptyString(
          childObj.status,
          childObj.estado
        )?.toUpperCase();
        return (
          rawChildStatus === 'DECEASED' ||
          rawChildStatus === 'DEAD' ||
          rawChildStatus === 'FALLECIDO' ||
          rawChildStatus === 'FALLECIDA'
        );
      }).length
    : null;

  const subsequentDeceasedCount =
    explicitSubsequentDeceased ?? subsequentDeceasedFromLambs ?? 0;

  const requestedChipsCount = firstValidInt(
    obj.requestedChips,
    obj.requested_chips,
    obj.requestedTags,
    obj.requested_tags,
    obj.requestedEarTags,
    obj.requested_ear_tags,
    obj.aretesSolicitados,
    obj.aretes_solicitados,
    obj.chipsSolicitados,
    obj.chips_solicitados
  );

  const evidencePhotoUrl = sanitizeHttpMediaUrl(
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

  const serverLocked =
    explicitLocked ||
    rawStatus === 'LOCKED' ||
    rawStatus === 'BLOQUEADO';

  const isLocked =
    serverLocked ||
    (daysElapsed !== null && daysElapsed > LOCK_THRESHOLD_DAYS);

  return {
    id,
    ranchId: toNonEmptyString(obj.ranchId, obj.ranch_id, obj.ranchoId, obj.rancho_id),
    damId: toNonEmptyString(obj.damId, obj.dam_id, obj.madreId, obj.madre_id),
    damLabel,
    damUno: toNonEmptyString(obj.damUno, obj.dam_uno, obj.folio_uno_madre),
    sireId: toNonEmptyString(obj.sireId, obj.sire_id, obj.padreId, obj.padre_id),
    sireLabel,
    sireUno: toNonEmptyString(obj.sireUno, obj.sire_uno, obj.folio_uno_padre),
    externalSireFolio: toNonEmptyString(
      obj.externalSireFolio,
      obj.external_sire_folio,
      obj.sementalExternoFolio,
      obj.semental_externo_folio
    ),
    conceptionMethod: toNonEmptyString(
      obj.conceptionMethod,
      obj.conception_method,
      obj.metodoConcepcion,
      obj.metodo_concepcion
    ),
    birthDate,
    liveBornCount,
    stillbornCount,
    registeredLambsCount,
    subsequentDeceasedCount,
    requestedChipsCount,
    evidencePhotoUrl,
    evidencePhotoS3Key,
    serverLocked,
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
  const [localDateKey, setLocalDateKey] = useState<string>(() => getLocalDateKey());
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);
  const [modalImgError, setModalImgError] = useState<boolean>(false);
  const [resolvedEvidenceUrl, setResolvedEvidenceUrl] = useState<string | null>(null);
  const [evidenceLoading, setEvidenceLoading] = useState<boolean>(false);
  const [evidenceFetchError, setEvidenceFetchError] = useState<string>('');
  const [evidenceRetryNonce, setEvidenceRetryNonce] = useState<number>(0);
  const evidenceAutoRetriedRef = useRef<boolean>(false);
  const [manualSiniigaRequests, setManualSiniigaRequests] = useState<
    Record<string, number | null>
  >({});
  const [auditModal, setAuditModal] = useState<{
    mode: BirthAuditMode;
    birth: BirthRecord | null;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<'births' | 'siniiga' | 'history'>('births');
  const [lastAuditSummary, setLastAuditSummary] =
    useState<RecordedBirthAuditSummary | null>(null);

  const monthFilterRef = useRef<HTMLSelectElement | null>(null);
  const evidenceTriggerRef = useRef<HTMLElement | null>(null);
  const auditTriggerRef = useRef<HTMLElement | null>(null);

  const isAuditRole = AUDIT_ROLES.has(userRole);
  const effectiveTab =
    activeTab === 'history' && !isAuditRole ? 'births' : activeTab;

  // Recompute age-derived daysElapsed and lock status whenever the local calendar day rolls over
  useEffect(() => {
    let timeoutId: number | undefined;

    const syncLocalDate = () => {
      const nextKey = getLocalDateKey();
      setLocalDateKey((prev) => (prev === nextKey ? prev : nextKey));
    };

    const scheduleMidnightRollover = () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      const now = new Date();
      const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1
      );
      const delay = Math.max(1_000, nextMidnight.getTime() - now.getTime() + 50);
      timeoutId = window.setTimeout(() => {
        syncLocalDate();
        scheduleMidnightRollover();
      }, delay);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncLocalDate();
      }
    };

    scheduleMidnightRollover();
    window.addEventListener('focus', syncLocalDate);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
      window.removeEventListener('focus', syncLocalDate);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Reset modal selection, SINIIGA manual entries, and confirmation summary when switching ranch
  useEffect(() => {
    setLastAuditSummary(null);
    setAuditModal(null);
    setManualSiniigaRequests({});
    auditTriggerRef.current = null;
  }, [activeRanchId]);

  // Reset evidence modal selection when switching ranch or month filter
  useEffect(() => {
    setSelectedEvidenceId(null);
    setModalImgError(false);
    setResolvedEvidenceUrl(null);
    setEvidenceFetchError('');
    setEvidenceLoading(false);
    setEvidenceRetryNonce(0);
    evidenceAutoRetriedRef.current = false;
    evidenceTriggerRef.current = null;
  }, [activeRanchId, monthFilter]);

  useEffect(() => {
    setModalImgError(false);
    setEvidenceFetchError('');
    setEvidenceRetryNonce(0);
    evidenceAutoRetriedRef.current = false;
  }, [selectedEvidenceId]);

  function openEvidenceModal(birth: BirthRecord, triggerEl: HTMLButtonElement | null) {
    evidenceTriggerRef.current = triggerEl;
    setModalImgError(false);
    setEvidenceFetchError('');
    setEvidenceRetryNonce(0);
    evidenceAutoRetriedRef.current = false;
    setSelectedEvidenceId(birth.id);
  }

  function closeEvidenceModal() {
    setSelectedEvidenceId(null);
  }

  function openAuditModal(
    mode: BirthAuditMode,
    birth: BirthRecord | null,
    triggerEl: HTMLButtonElement | null
  ) {
    if (!isAuditRole) return;
    auditTriggerRef.current = triggerEl;
    setAuditModal({ mode, birth });
  }

  function closeAuditModal() {
    setAuditModal(null);
  }

  const validMonthFilter = MONTH_FILTER_REGEX.test(monthFilter) ? monthFilter : '';

  const birthsQuery = useQuery({
    queryKey: ['births', username, activeRanchId, validMonthFilter] as const,
    queryFn: async ({ queryKey, signal }) => {
      const ranchId = queryKey[2];
      const month = queryKey[3];
      return fetchAllBirthsPages(ranchId ?? undefined, month, signal);
    },
    enabled: Boolean(activeRanchId),
  });

  const needsSeparateReconciliationFetch =
    Boolean(activeRanchId && effectiveTab === 'siniiga' && validMonthFilter !== '');

  const reconciliationQuery = useQuery({
    queryKey: [
      'births',
      username,
      activeRanchId,
      'siniiga-reconciliation',
    ] as const,
    queryFn: async ({ queryKey, signal }) => {
      const ranchId = queryKey[2];
      return fetchAllBirthsPages(ranchId ?? undefined, '', signal);
    },
    enabled: needsSeparateReconciliationFetch,
  });

  const reconciliationSource = needsSeparateReconciliationFetch
    ? reconciliationQuery
    : birthsQuery;

  const reconciliationBirths = (
    reconciliationSource.data?.births ?? []
  ).map((birth) => {
    const daysElapsed = computeDaysElapsed(birth.birthDate, localDateKey);
    const isLocked =
      birth.serverLocked ||
      (daysElapsed !== null && daysElapsed > LOCK_THRESHOLD_DAYS);
    if (birth.daysElapsed === daysElapsed && birth.isLocked === isLocked) {
      return birth;
    }
    return { ...birth, daysElapsed, isLocked };
  });

  const allBirths = (birthsQuery.data?.births ?? []).map((birth) => {
    const daysElapsed = computeDaysElapsed(birth.birthDate, localDateKey);
    const isLocked =
      birth.serverLocked ||
      (daysElapsed !== null && daysElapsed > LOCK_THRESHOLD_DAYS);
    if (birth.daysElapsed === daysElapsed && birth.isLocked === isLocked) {
      return birth;
    }
    return { ...birth, daysElapsed, isLocked };
  });

  const selectedEvidence =
    activeRanchId && selectedEvidenceId
      ? allBirths.find((b) => b.id === selectedEvidenceId) ?? null
      : null;

  // Resolve or re-sign S3 presigned URLs on demand (handles s3Key-only rows and 5-min URL expiry)
  useEffect(() => {
    if (!selectedEvidence || !activeRanchId) {
      setResolvedEvidenceUrl(null);
      setEvidenceLoading(false);
      setEvidenceFetchError('');
      setModalImgError(false);
      return;
    }

    setModalImgError(false);
    setEvidenceFetchError('');

    if (selectedEvidence.evidencePhotoUrl && evidenceRetryNonce === 0) {
      setResolvedEvidenceUrl(selectedEvidence.evidencePhotoUrl);
      setEvidenceLoading(false);
      return;
    }

    if (!selectedEvidence.evidencePhotoS3Key) {
      if (selectedEvidence.evidencePhotoUrl) {
        setResolvedEvidenceUrl(selectedEvidence.evidencePhotoUrl);
        setEvidenceLoading(false);
        return;
      }
      setResolvedEvidenceUrl(null);
      setEvidenceLoading(false);
      setEvidenceFetchError('Este parto no incluye fotografía de evidencia en S3.');
      return;
    }

    const controller = new AbortController();
    const requestRanchId = activeRanchId;
    const requestGen = getSessionGeneration();
    let active = true;

    evidenceAutoRetriedRef.current = true;
    setResolvedEvidenceUrl(null);
    setEvidenceLoading(true);

    fetchPresignedEvidenceDownload(
      requestRanchId,
      selectedEvidence.evidencePhotoS3Key,
      controller.signal
    )
      .then((url) => {
        if (!active || getSessionGeneration() !== requestGen) return;
        setResolvedEvidenceUrl(url);
      })
      .catch((err) => {
        if (
          !active ||
          controller.signal.aborted ||
          getSessionGeneration() !== requestGen
        ) {
          return;
        }
        setEvidenceFetchError(
          err instanceof Error
            ? err.message
            : 'No fue posible obtener el enlace temporal de S3.'
        );
      })
      .finally(() => {
        if (active && getSessionGeneration() === requestGen) {
          setEvidenceLoading(false);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedEvidence, activeRanchId, evidenceRetryNonce]);

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
        <div className="births-header-actions">
          <div className="count-card">
            <b>{visibleBirths.length}</b>
            <span>{visibleBirths.length === 1 ? 'parto' : 'partos'}</span>
          </div>
          {isAuditRole && (
            <button
              type="button"
              className="primary births-create-audit-btn"
              onClick={(e) =>
                openAuditModal('create_late', null, e.currentTarget)
              }
            >
              Registrar parto (&gt;30 días)
            </button>
          )}
        </div>
      </div>

      <div className="births-notice" role="note">
        <span className="births-notice-icon" aria-hidden="true">
          ℹ
        </span>
        <div>
          {isAuditRole ? (
            <>
              <strong>Control anti-fraude y corrección auditada:</strong> los partos con más de{' '}
              {LOCK_THRESHOLD_DAYS} días quedan bloqueados para productores. Como{' '}
              <b>{userRole === 'VET_TECHNICIAN' ? 'técnico veterinario' : 'asociación'}</b>, puedes
              corregir registros o dar de alta partos fuera de ventana adjuntando evidencia fotográfica
              en S3 y motivo obligatorio en la bitácora inmutable.
            </>
          ) : (
            <>
              <strong>Política anti-fraude (solo lectura):</strong> los partos con más de{' '}
              {LOCK_THRESHOLD_DAYS} días quedan bloqueados contra edición o eliminación. Si
              requieres corregir un registro o capturar un parto fuera de plazo, solicita la
              revisión al técnico veterinario o administrador de la asociación.
            </>
          )}
        </div>
      </div>

      {lastAuditSummary && (
        <section className="birth-audit-success" role="status" aria-live="polite">
          <div>
            <strong>
              Auditoría guardada en bitácora ({lastAuditSummary.id})
            </strong>
            <p className="birth-audit-success-detail">
              Madre: <b>{lastAuditSummary.damLabel}</b> · Fecha:{' '}
              {formatDate(lastAuditSummary.birthDate)}
            </p>
            <p className="birth-audit-success-detail">
              <span>Anterior: {lastAuditSummary.previousSummary}</span> →{' '}
              <span>Nuevo: <b>{lastAuditSummary.newSummary}</b></span>
            </p>
            <p className="birth-audit-success-detail">
              Motivo: {lastAuditSummary.reason} · Clave S3:{' '}
              <code>{lastAuditSummary.evidencePhotoS3Key}</code>
            </p>
          </div>
          <div className="birth-audit-success-actions">
            {isAuditRole && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => setActiveTab('history')}
              >
                Ver historial de auditoría
              </button>
            )}
            <button
              type="button"
              className="secondary-button"
              onClick={() => setLastAuditSummary(null)}
            >
              Cerrar aviso
            </button>
          </div>
        </section>
      )}

      <div
        className="births-tabs"
        role="tablist"
        aria-label="Secciones de control de nacimientos y chips SINIIGA"
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          const tabs: ReadonlyArray<'births' | 'siniiga' | 'history'> =
            isAuditRole ? ['births', 'siniiga', 'history'] : ['births', 'siniiga'];
          const currentIdx = tabs.indexOf(effectiveTab);
          const step = e.key === 'ArrowRight' ? 1 : -1;
          const nextTab = tabs[(currentIdx + step + tabs.length) % tabs.length];
          setActiveTab(nextTab);
          const tabIdMap: Record<'births' | 'siniiga' | 'history', string> = {
            births: 'births-tab-list',
            siniiga: 'births-tab-siniiga',
            history: 'births-tab-history',
          };
          document.getElementById(tabIdMap[nextTab])?.focus();
        }}
      >
        <button
          id="births-tab-list"
          type="button"
          role="tab"
          tabIndex={effectiveTab === 'births' ? 0 : -1}
          className={
            effectiveTab === 'births'
              ? 'births-tab births-tab-active'
              : 'births-tab'
          }
          aria-selected={effectiveTab === 'births'}
          aria-controls="births-panel-list"
          onClick={() => setActiveTab('births')}
        >
          Partos registrados
        </button>
        <button
          id="births-tab-siniiga"
          type="button"
          role="tab"
          tabIndex={effectiveTab === 'siniiga' ? 0 : -1}
          className={
            effectiveTab === 'siniiga'
              ? 'births-tab births-tab-active'
              : 'births-tab'
          }
          aria-selected={effectiveTab === 'siniiga'}
          aria-controls="births-panel-siniiga"
          onClick={() => setActiveTab('siniiga')}
        >
          Conciliación SINIIGA (5 meses)
        </button>
        {isAuditRole && (
          <button
            id="births-tab-history"
            type="button"
            role="tab"
            tabIndex={effectiveTab === 'history' ? 0 : -1}
            className={
              effectiveTab === 'history'
                ? 'births-tab births-tab-active'
                : 'births-tab'
            }
            aria-selected={effectiveTab === 'history'}
            aria-controls="births-panel-history"
            onClick={() => setActiveTab('history')}
          >
            Historial de auditoría (inmutable)
          </button>
        )}
      </div>

      {effectiveTab === 'history' && isAuditRole ? (
        <div
          id="births-panel-history"
          role="tabpanel"
          aria-labelledby="births-tab-history"
        >
          <BirthAuditHistory
            username={username}
            activeRanchId={activeRanchId}
            ranchName={ranchName}
          />
        </div>
      ) : effectiveTab === 'siniiga' ? (
        <div
          id="births-panel-siniiga"
          role="tabpanel"
          aria-labelledby="births-tab-siniiga"
        >
          <SiniigaReconciliationView
            activeRanchId={activeRanchId}
            ranchName={ranchName}
            rawPayload={reconciliationSource.data?.rawPayload}
            births={reconciliationBirths}
            loading={reconciliationSource.isFetching}
            error={
              reconciliationSource.error instanceof Error
                ? reconciliationSource.error.message
                : reconciliationSource.isError
                  ? 'No se pudieron consultar los nacimientos del rancho.'
                  : undefined
            }
            referenceDateKey={localDateKey}
            manualRequests={manualSiniigaRequests}
            onManualRequestsChange={setManualSiniigaRequests}
            onRetry={() => {
              void reconciliationSource.refetch();
            }}
            onInspectMonthBirths={(monthKey) => {
              setMonthFilter(monthKey);
              setActiveTab('births');
            }}
          />
        </div>
      ) : (
        <div
          id="births-panel-list"
          role="tabpanel"
          aria-labelledby="births-tab-list"
        >
          <section className="births-filter-bar" aria-label="Filtros de partos">
        <div className="births-filter-controls">
          {(() => {
            const [selectedYear, selectedMonth] = validMonthFilter
              ? validMonthFilter.split('-')
              : ['', ''];
            const currentYear = String(new Date().getFullYear());
            const yearOptions = getYearOptions(selectedYear);
            return (
              <>
                <label className="births-filter-label" htmlFor="births-month-select">
                  Mes de parto
                </label>
                <select
                  ref={monthFilterRef}
                  id="births-month-select"
                  className="births-month-input"
                  aria-label="Mes de parto"
                  value={selectedMonth}
                  onChange={(e) => {
                    const nextMonth = e.target.value;
                    if (!nextMonth) {
                      setMonthFilter('');
                    } else {
                      setMonthFilter(`${selectedYear || currentYear}-${nextMonth}`);
                    }
                  }}
                >
                  <option value="">Todos los meses</option>
                  {MONTHS_ES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <select
                  id="births-year-select"
                  className="births-month-input"
                  aria-label="Año de parto"
                  value={selectedYear}
                  onChange={(e) => {
                    const nextYear = e.target.value;
                    if (!nextYear) {
                      setMonthFilter('');
                    } else {
                      const nextMonth =
                        selectedMonth || String(new Date().getMonth() + 1).padStart(2, '0');
                      setMonthFilter(`${nextYear}-${nextMonth}`);
                    }
                  }}
                >
                  <option value="">Año</option>
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </>
            );
          })()}
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
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={(e) =>
                            openEvidenceModal(b, e.currentTarget)
                          }
                          aria-label={`Abrir fotografía S3 del parto de ${b.damLabel}`}
                        >
                          Ver foto S3
                        </button>
                      ) : (
                        <span className="muted">Sin evidencia</span>
                      )}
                    </td>
                    <td>
                      {isAuditRole ? (
                        <button
                          type="button"
                          className="secondary-button birth-audit-btn"
                          onClick={(e) =>
                            openAuditModal('correct', b, e.currentTarget)
                          }
                          aria-label={`${b.isLocked ? 'Corregir (auditado)' : 'Auditar'} parto de ${b.damLabel} (${formatDate(b.birthDate)})`}
                        >
                          {b.isLocked ? 'Corregir (auditado)' : 'Auditar'}
                        </button>
                      ) : (
                        <span className="birth-readonly-tag">
                          {b.isLocked ? 'Solo lectura (bloqueado)' : 'Solo lectura'}
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
        </div>
      )}

      <ModalDialog
        open={Boolean(selectedEvidence)}
        onClose={closeEvidenceModal}
        titleId="birth-evidence-modal-title"
        title="Evidencia fotográfica de parto"
        subtitle={
          selectedEvidence ? (
            <>
              Madre: <b>{selectedEvidence.damLabel}</b> · Padre:{' '}
              <b>{selectedEvidence.sireLabel}</b> · Fecha:{' '}
              {formatDate(selectedEvidence.birthDate)}
            </>
          ) : undefined
        }
        closeLabel="Cerrar visor"
        triggerRef={evidenceTriggerRef}
        fallbackFocusRef={monthFilterRef}
      >
        {selectedEvidence && (
          <>
            <div className="birth-modal-body">
              {evidenceLoading ? (
                <div className="birth-modal-fallback" role="status" aria-live="polite">
                  <p className="muted">Solicitando enlace temporal S3…</p>
                </div>
              ) : resolvedEvidenceUrl && !modalImgError ? (
                <img
                  src={resolvedEvidenceUrl}
                  alt={`Fotografía de evidencia S3 del parto de ${selectedEvidence.damLabel}`}
                  className="birth-modal-img"
                  onError={() => {
                    if (
                      selectedEvidence.evidencePhotoS3Key &&
                      !evidenceAutoRetriedRef.current
                    ) {
                      evidenceAutoRetriedRef.current = true;
                      setEvidenceRetryNonce((n) => n + 1);
                      return;
                    }
                    setModalImgError(true);
                  }}
                />
              ) : (
                <div className="birth-modal-fallback" role="status">
                  <p>
                    {evidenceFetchError ||
                      'No fue posible cargar la vista previa de la fotografía desde S3.'}
                  </p>
                  {selectedEvidence.evidencePhotoS3Key && (
                    <>
                      <small className="muted">
                        Clave S3: {selectedEvidence.evidencePhotoS3Key}
                      </small>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={evidenceLoading}
                        onClick={() => {
                          evidenceAutoRetriedRef.current = true;
                          setEvidenceRetryNonce((n) => n + 1);
                        }}
                      >
                        Reintentar enlace S3
                      </button>
                    </>
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
                {resolvedEvidenceUrl && !modalImgError && (
                  <a
                    href={resolvedEvidenceUrl}
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
          </>
        )}
      </ModalDialog>

      {isAuditRole && (
        <BirthAuditModal
          open={Boolean(auditModal)}
          mode={auditModal?.mode ?? 'correct'}
          activeRanchId={activeRanchId}
          ranchName={ranchName}
          localDateKey={localDateKey}
          birth={auditModal?.birth ?? null}
          triggerRef={auditTriggerRef}
          fallbackFocusRef={monthFilterRef}
          username={username}
          onClose={closeAuditModal}
          onSuccess={(summary) => {
            setLastAuditSummary(summary);
            setAuditModal(null);
          }}
        />
      )}
    </div>
  );
}
