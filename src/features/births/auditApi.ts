import { apiFetch } from '../../api/client';

const LOCAL_HTTP_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function isSafePresignedUploadUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.username || parsed.password) return false;
    if (parsed.protocol === 'https:') return true;
    const pageProtocol =
      typeof window !== 'undefined' ? window.location.protocol : undefined;
    return (
      parsed.protocol === 'http:' &&
      LOCAL_HTTP_HOSTS.has(parsed.hostname) &&
      pageProtocol !== 'https:'
    );
  } catch {
    return false;
  }
}

export function sanitizeHttpMediaUrl(rawUrl?: string): string | undefined {
  if (!rawUrl) return undefined;
  const trimmed = rawUrl.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }
  return isSafePresignedUploadUrl(trimmed) ? trimmed : undefined;
}

export function associationAuditsQueryKey(
  username: string,
  ranchId: string | null
) {
  return ['association-audits', username, ranchId] as const;
}

export interface AuditDiffRow {
  key: string;
  label: string;
  previousDisplay: string;
  newDisplay: string;
  changed: boolean;
}

export interface AuditHistoryEntry {
  id: string;
  birthId?: string;
  ranchId?: string;
  damLabel?: string;
  approverLabel: string;
  reason: string;
  evidencePhotoS3Key?: string;
  evidencePhotoUrl?: string;
  createdAt: string;
  previousState: Record<string, unknown>;
  newState: Record<string, unknown>;
  diffRows: AuditDiffRow[];
  changedCount: number;
  isLateCreation: boolean;
}

export const ALLOWED_EVIDENCE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const MAX_EVIDENCE_SIZE_BYTES = 10_485_760; // 10 MiB (MediaPolicy BE-010)

export type BirthAuditAction = 'CORRECT_BIRTH' | 'REGISTER_LATE_BIRTH';

export interface PresignedUploadResponse {
  uploadUrl: string;
  s3Key: string;
  expiresInSeconds: number;
}

export interface BirthAuditSubmitInput {
  ranchId: string;
  action: BirthAuditAction;
  birthId?: string;
  damId?: string;
  damLabel: string;
  sireId?: string;
  externalSireFolio?: string;
  birthDate: string;
  liveBornCount: number;
  stillbornCount: number;
  conceptionMethod?: string;
  reason: string;
  evidencePhotoS3Key: string;
  previousLiveBornCount?: number;
  previousStillbornCount?: number;
  previousBirthDate?: string;
}

export interface RecordedBirthAuditSummary {
  id: string;
  ranchId: string;
  birthId?: string;
  action: BirthAuditAction;
  damLabel: string;
  birthDate: string;
  previousSummary: string;
  newSummary: string;
  reason: string;
  evidencePhotoS3Key: string;
  createdAt: string;
}

export interface RanchAnimalOption {
  id: string;
  folioInterno: string;
  registroUno?: string;
  breed?: string;
  sex: 'FEMALE' | 'MALE' | string;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function resolveEvidenceMimeType(file: File): string | null {
  const normalized = file.type.trim().toLowerCase();
  if (ALLOWED_EVIDENCE_MIME_TYPES.has(normalized)) {
    return normalized;
  }
  const ext = file.name.split('.').pop()?.trim().toLowerCase() ?? '';
  return MIME_BY_EXTENSION[ext] ?? null;
}

export async function validateEvidenceFile(file: File): Promise<{
  valid: boolean;
  mimeType: string | null;
  error: string | null;
}> {
  const mimeType = resolveEvidenceMimeType(file);
  if (!mimeType) {
    return {
      valid: false,
      mimeType: null,
      error: 'Formato de imagen no compatible. Usa fotografía JPG, PNG o WebP.',
    };
  }
  if (file.size <= 0) {
    return {
      valid: false,
      mimeType: null,
      error: 'El archivo seleccionado está vacío.',
    };
  }
  if (file.size > MAX_EVIDENCE_SIZE_BYTES) {
    return {
      valid: false,
      mimeType: null,
      error: 'La fotografía excede el límite permitido de 10 MB.',
    };
  }
  try {
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const matches = (signature: number[], offset = 0) =>
      signature.every((byte, index) => header[offset + index] === byte);
    const matchesFormat =
      (mimeType === 'image/jpeg' && matches([0xff, 0xd8, 0xff])) ||
      (mimeType === 'image/png' && matches([137, 80, 78, 71, 13, 10, 26, 10])) ||
      (mimeType === 'image/webp' &&
        matches([82, 73, 70, 70]) && matches([87, 69, 66, 80], 8));
    if (matchesFormat) {
      if (typeof createImageBitmap === 'function') {
        const bitmap = await createImageBitmap(file);
        bitmap.close();
      } else if (
        typeof Image !== 'undefined' &&
        typeof URL !== 'undefined' &&
        typeof URL.createObjectURL === 'function'
      ) {
        const decoded = await new Promise<boolean>((resolve) => {
          const objectUrl = URL.createObjectURL(file);
          const img = new Image();
          img.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(img.naturalWidth > 0 && img.naturalHeight > 0);
          };
          img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(false);
          };
          img.src = objectUrl;
        });
        if (!decoded) {
          return {
            valid: false,
            mimeType: null,
            error:
              'No se pudo abrir la fotografía como una imagen JPG, PNG o WebP válida.',
          };
        }
      }
      return { valid: true, mimeType, error: null };
    }
  } catch {
    // A file with a valid name and header may still fail to decode.
  }
  return {
    valid: false,
    mimeType: null,
    error: 'No se pudo abrir la fotografía como una imagen JPG, PNG o WebP válida.',
  };
}

export async function uploadBirthEvidenceToS3(
  file: File,
  mimeType: string,
  ranchId: string,
  controller: AbortController,
  timeoutMs: number = 60_000
): Promise<string> {
  const { signal } = controller;
  const timeout = globalThis.setTimeout(() => {
    controller.abort(new Error('La carga de la fotografía tardó demasiado. Inténtalo de nuevo.'));
  }, timeoutMs);

  // apiFetch can wait for a shared session refresh even after its request is aborted.
  let onAbort!: () => void;
  const interrupted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
  });

  try {
    signal.throwIfAborted();
    const uploadPromise = requestEvidenceUpload(file, mimeType, ranchId, signal);
    uploadPromise.catch(() => undefined);
    return await Promise.race([interrupted, uploadPromise]);
  } finally {
    globalThis.clearTimeout(timeout);
    signal.removeEventListener('abort', onAbort);
  }
}

async function requestEvidenceUpload(
  file: File,
  mimeType: string,
  ranchId: string,
  signal: AbortSignal
): Promise<string> {
  const presigned = await apiFetch<PresignedUploadResponse>(
    '/media/presigned-upload',
    {
      method: 'POST',
      ranchId,
      signal,
      body: JSON.stringify({
        contentType: mimeType,
        sizeBytes: file.size,
        category: 'birth-audits',
      }),
    }
  );

  signal.throwIfAborted();

  if (!presigned?.uploadUrl || !presigned?.s3Key) {
    throw new Error(
      'El servidor no generó una URL pre-firmada válida para subir la evidencia.'
    );
  }

  if (!isSafePresignedUploadUrl(presigned.uploadUrl)) {
    throw new Error(
      'La URL de carga a S3 fue rechazada por política de transporte HTTPS.'
    );
  }

  let uploadRes: Response;
  try {
    uploadRes = await fetch(presigned.uploadUrl, {
      method: 'PUT',
      redirect: 'error',
      signal,
      headers: {
        'Content-Type': mimeType,
      },
      body: file,
    });
  } catch {
    signal.throwIfAborted();
    throw new Error(
      'No se pudo cargar la fotografía de evidencia a S3. Revisa tu conexión e inténtalo de nuevo.'
    );
  }

  if (
    uploadRes.redirected ||
    (uploadRes.status >= 300 && uploadRes.status < 400)
  ) {
    throw new Error(
      'La subida de evidencia a S3 fue bloqueada al intentar redirigirse.'
    );
  }

  if (!uploadRes.ok) {
    throw new Error(
      `S3 rechazó la subida de la evidencia (HTTP ${uploadRes.status}).`
    );
  }

  return presigned.s3Key;
}

function asNonEmptyString(...values: unknown[]): string | undefined {
  for (const val of values) {
    if (typeof val === 'string' && val.trim().length > 0) {
      return val.trim();
    }
  }
  return undefined;
}

export function normalizeAuditSummary(
  raw: unknown,
  input: BirthAuditSubmitInput
): RecordedBirthAuditSummary {
  const unwrapped =
    raw &&
    typeof raw === 'object' &&
    'data' in (raw as Record<string, unknown>) &&
    (raw as Record<string, unknown>).data &&
    typeof (raw as Record<string, unknown>).data === 'object'
      ? ((raw as Record<string, unknown>).data as Record<string, unknown>)
      : raw && typeof raw === 'object'
        ? (raw as Record<string, unknown>)
        : {};

  const auditId =
    asNonEmptyString(unwrapped.id, unwrapped.auditId, unwrapped.audit_id) ??
    'Registrada';
  const createdAt =
    asNonEmptyString(unwrapped.createdAt, unwrapped.created_at, unwrapped.creado_en) ??
    new Date().toISOString();

  const previousSummary =
    input.action === 'CORRECT_BIRTH'
      ? `Fecha ${input.previousBirthDate || '—'} · ${input.previousLiveBornCount ?? 0} vivos / ${input.previousStillbornCount ?? 0} muertos`
      : 'Sin registro previo (alta extemporánea >30 días)';

  const newSummary = `Fecha ${input.birthDate} · ${input.liveBornCount} vivos / ${input.stillbornCount} muertos`;

  return {
    id: auditId,
    ranchId: input.ranchId,
    birthId:
      asNonEmptyString(unwrapped.birthId, unwrapped.birth_id, unwrapped.parto_id) ??
      input.birthId,
    action: input.action,
    damLabel: input.damLabel,
    birthDate: input.birthDate,
    previousSummary,
    newSummary,
    reason: input.reason.trim(),
    evidencePhotoS3Key:
      asNonEmptyString(
        unwrapped.evidencePhotoS3Key,
        unwrapped.evidence_photo_s3_key,
        unwrapped.foto_evidencia_s3_key
      ) ?? input.evidencePhotoS3Key,
    createdAt,
  };
}

export async function submitBirthAudit(
  input: BirthAuditSubmitInput
): Promise<RecordedBirthAuditSummary> {
  const payload =
    input.action === 'CORRECT_BIRTH'
      ? {
          action: input.action,
          birthId: input.birthId,
          birthDate: input.birthDate,
          liveBornCount: input.liveBornCount,
          stillbornCount: input.stillbornCount,
          ...(input.conceptionMethod ? { conceptionMethod: input.conceptionMethod } : {}),
          evidencePhotoS3Key: input.evidencePhotoS3Key,
          reason: input.reason.trim(),
        }
      : {
          action: input.action,
          damId: input.damId,
          ...(input.sireId ? { sireId: input.sireId } : {}),
          ...(input.externalSireFolio?.trim()
            ? { externalSireFolio: input.externalSireFolio.trim() }
            : {}),
          birthDate: input.birthDate,
          liveBornCount: input.liveBornCount,
          stillbornCount: input.stillbornCount,
          conceptionMethod: input.conceptionMethod || 'MN',
          evidencePhotoS3Key: input.evidencePhotoS3Key,
          reason: input.reason.trim(),
        };

  const response = await apiFetch<unknown>('/association/audits', {
    method: 'POST',
    ranchId: input.ranchId,
    body: JSON.stringify(payload),
  });

  return normalizeAuditSummary(response, input);
}

function extractPaginatedList(
  res: unknown,
  candidateKeys: ReadonlyArray<string>
): {
  list: unknown[];
  totalPages: number;
  pageSize?: number;
} {
  const unwrapped =
    res && typeof res === 'object' && 'data' in (res as Record<string, unknown>)
      ? (res as Record<string, unknown>).data
      : res;

  if (Array.isArray(res)) {
    return { list: res, totalPages: 1 };
  }
  if (Array.isArray(unwrapped)) {
    return { list: unwrapped, totalPages: 1 };
  }
  if (unwrapped && typeof unwrapped === 'object') {
    const obj = unwrapped as Record<string, unknown>;
    let rawList: unknown;
    for (const key of candidateKeys) {
      if (Array.isArray(obj[key])) {
        rawList = obj[key];
        break;
      }
    }
    const totalPagesRaw = Number(obj.totalPages ?? obj.total_pages ?? 1);
    const sizeRaw = Number(obj.size ?? obj.pageSize ?? obj.page_size);
    return {
      list: Array.isArray(rawList) ? rawList : [],
      totalPages:
        Number.isSafeInteger(totalPagesRaw) && totalPagesRaw > 0
          ? totalPagesRaw
          : 1,
      pageSize:
        Number.isSafeInteger(sizeRaw) && sizeRaw > 0 ? sizeRaw : undefined,
    };
  }
  return { list: [], totalPages: 1 };
}

export async function fetchRanchParentAnimalsPage(
  ranchId: string,
  sex: 'FEMALE' | 'MALE',
  page: number,
  signal: AbortSignal
): Promise<{ items: RanchAnimalOption[]; nextPage?: number }> {
  const res = await apiFetch<unknown>(
    `/animals?sexo=${sex}&estado=ACTIVE&page=${page}&size=100`,
    { ranchId, signal }
  );
  const { list, totalPages } = extractPaginatedList(res, [
    'items',
    'content',
    'animals',
  ]);
  const items: RanchAnimalOption[] = [];

  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const id = asNonEmptyString(obj.id, obj.animalId, obj.animal_id);
    const folioInterno = asNonEmptyString(
      obj.folioInterno,
      obj.folio_interno,
      obj.folio
    );
    if (!id || !folioInterno) continue;
    const normalizedSex = asNonEmptyString(obj.sex, obj.sexo) ?? sex;
    if (normalizedSex.toUpperCase() !== sex) continue;
    items.push({
      id,
      folioInterno,
      registroUno: asNonEmptyString(obj.registroUno, obj.registro_uno),
      breed: asNonEmptyString(obj.breed, obj.raza),
      sex: normalizedSex,
    });
  }

  return {
    items,
    nextPage: list.length > 0 && page + 1 < totalPages ? page + 1 : undefined,
  };
}

const AUDIT_FIELD_LABELS: Record<string, string> = {
  fecha: 'Fecha de parto',
  birthDate: 'Fecha de parto',
  birth_date: 'Fecha de parto',
  nacidos_vivos: 'Nacidos vivos',
  liveBornCount: 'Nacidos vivos',
  live_born_count: 'Nacidos vivos',
  nacidos_muertos: 'Nacidos muertos',
  stillbornCount: 'Nacidos muertos',
  stillborn_count: 'Nacidos muertos',
  tipo_parto: 'Tipo de parto',
  parturitionType: 'Tipo de parto',
  parturition_type: 'Tipo de parto',
  birthType: 'Tipo de parto',
  birth_type: 'Tipo de parto',
  metodo_concepcion: 'Método de concepción',
  conceptionMethod: 'Método de concepción',
  conception_method: 'Método de concepción',
  madre_folio: 'Madre (folio)',
  damFolio: 'Madre (folio)',
  dam_folio: 'Madre (folio)',
  madre_id: 'Madre (ID)',
  damId: 'Madre (ID)',
  dam_id: 'Madre (ID)',
  padre_folio: 'Padre (folio)',
  sireFolio: 'Padre (folio)',
  sire_folio: 'Padre (folio)',
  padre_id: 'Padre (ID)',
  sireId: 'Padre (ID)',
  sire_id: 'Padre (ID)',
  semental_externo_folio: 'Semental externo',
  externalSireFolio: 'Semental externo',
  external_sire_folio: 'Semental externo',
  foto_evidencia_s3_key: 'Evidencia S3',
  evidencePhotoS3Key: 'Evidencia S3',
  evidence_photo_s3_key: 'Evidencia S3',
  bloqueado: 'Bloqueo >30 días',
  locked: 'Bloqueo >30 días',
  isLocked: 'Bloqueo >30 días',
};

const PRIORITY_AUDIT_KEYS = [
  'fecha',
  'birthDate',
  'birth_date',
  'nacidos_vivos',
  'liveBornCount',
  'live_born_count',
  'nacidos_muertos',
  'stillbornCount',
  'stillborn_count',
  'tipo_parto',
  'parturitionType',
  'parturition_type',
  'metodo_concepcion',
  'conceptionMethod',
  'conception_method',
  'madre_folio',
  'damFolio',
  'madre_id',
  'damId',
  'padre_folio',
  'sireFolio',
  'padre_id',
  'sireId',
  'semental_externo_folio',
  'externalSireFolio',
  'foto_evidencia_s3_key',
  'evidencePhotoS3Key',
] as const;

const VALUE_TRANSLATIONS: Record<string, string> = {
  MN: 'Monta natural (MN)',
  IA: 'Inseminación artificial (IA)',
  TE: 'Transferencia de embriones (TE)',
  SIMPLE: 'Simple',
  TWIN: 'Gemelar',
  TRIPLET: 'Triple',
  QUADRUPLET: 'Cuádruple',
  QUINTUPLET: 'Quíntuple',
};

function parseJsonSnapshot(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
    return {};
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function stableNormalizeValue(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value)) {
    return value.map(stableNormalizeValue);
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = stableNormalizeValue(obj[key]);
    }
    return sorted;
  }
  return value;
}

function auditValuesEqual(a: unknown, b: unknown): boolean {
  return (
    JSON.stringify(stableNormalizeValue(a)) ===
    JSON.stringify(stableNormalizeValue(b))
  );
}

function formatAuditFieldLabel(key: string): string {
  if (AUDIT_FIELD_LABELS[key]) return AUDIT_FIELD_LABELS[key];
  const spaced = key
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key;
}

function formatAuditFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '—';
    return VALUE_TRANSLATIONS[trimmed.toUpperCase()] ?? trimmed;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function computeAuditStateDiff(
  previousState: Record<string, unknown>,
  newState: Record<string, unknown>
): {
  diffRows: AuditDiffRow[];
  changedCount: number;
  isLateCreation: boolean;
} {
  const prevKeys = Object.keys(previousState);
  const newKeys = Object.keys(newState);
  const isLateCreation = prevKeys.length === 0 && newKeys.length > 0;

  const allKeys = Array.from(new Set([...prevKeys, ...newKeys]));
  const priorityIndex = new Map<string, number>(
    PRIORITY_AUDIT_KEYS.map((key, idx) => [key, idx])
  );

  allKeys.sort((a, b) => {
    const idxA = priorityIndex.get(a);
    const idxB = priorityIndex.get(b);
    if (idxA !== undefined && idxB !== undefined) return idxA - idxB;
    if (idxA !== undefined) return -1;
    if (idxB !== undefined) return 1;
    return a.localeCompare(b, 'es-MX');
  });

  const diffRows: AuditDiffRow[] = allKeys.map((key) => {
    const hasPrev = Object.prototype.hasOwnProperty.call(previousState, key);
    const hasNext = Object.prototype.hasOwnProperty.call(newState, key);
    const prevVal = hasPrev ? previousState[key] : undefined;
    const nextVal = hasNext ? newState[key] : undefined;
    const changed = isLateCreation || !auditValuesEqual(prevVal, nextVal);

    return {
      key,
      label: formatAuditFieldLabel(key),
      previousDisplay: isLateCreation
        ? 'Sin registro previo'
        : formatAuditFieldValue(prevVal),
      newDisplay: formatAuditFieldValue(nextVal),
      changed,
    };
  });

  return {
    diffRows,
    changedCount: diffRows.filter((row) => row.changed).length,
    isLateCreation,
  };
}

export function normalizeAuditHistoryEntry(
  raw: unknown,
  index: number
): AuditHistoryEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;

  const id =
    asNonEmptyString(obj.id, obj.auditId, obj.audit_id) ?? `audit-${index}`;

  const previousState = parseJsonSnapshot(
    obj.previousState ?? obj.previous_state ?? obj.estadoAnterior ?? obj.estado_anterior
  );
  const newState = parseJsonSnapshot(
    obj.newState ?? obj.new_state ?? obj.estadoNuevo ?? obj.estado_nuevo
  );

  const { diffRows, changedCount, isLateCreation } = computeAuditStateDiff(
    previousState,
    newState
  );

  const approverLabel =
    asNonEmptyString(
      obj.approvedByUsername,
      obj.approved_by_username,
      obj.approverUsername,
      obj.approver_username,
      obj.approvedBy,
      obj.approved_by,
      obj.aprobadoPorUsuario,
      obj.aprobado_por_usuario,
      obj.approvedByUserId,
      obj.approved_by_user_id,
      obj.aprobadoPorUsuarioId,
      obj.aprobado_por_usuario_id
    ) ?? 'Usuario de asociación';

  const reason =
    asNonEmptyString(obj.reason, obj.motivo) ?? 'Sin motivo registrado';

  const evidencePhotoS3Key = asNonEmptyString(
    obj.evidencePhotoS3Key,
    obj.evidence_photo_s3_key,
    obj.fotoEvidenciaS3Key,
    obj.foto_evidencia_s3_key,
    newState.evidencePhotoS3Key,
    newState.foto_evidencia_s3_key
  );

  const evidencePhotoUrl = sanitizeHttpMediaUrl(
    asNonEmptyString(
      obj.evidencePhotoUrl,
      obj.evidence_photo_url,
      obj.presignedEvidencePhotoUrl,
      obj.presigned_evidence_photo_url,
      obj.photoPresignedUrl,
      obj.photo_presigned_url,
      obj.presignedPhotoUrl,
      obj.presigned_photo_url,
      obj.photoUrl,
      obj.photo_url
    )
  );

  const damLabel = asNonEmptyString(
    obj.damFolio,
    obj.dam_folio,
    obj.madreFolio,
    obj.madre_folio,
    obj.damLabel,
    obj.dam_label,
    newState.madre_folio,
    newState.damFolio,
    previousState.madre_folio,
    previousState.damFolio
  );

  const createdAt =
    asNonEmptyString(obj.createdAt, obj.created_at, obj.creadoEn, obj.creado_en) ??
    '';

  return {
    id,
    birthId: asNonEmptyString(
      obj.birthId,
      obj.birth_id,
      obj.partoId,
      obj.parto_id
    ),
    ranchId: asNonEmptyString(
      obj.ranchId,
      obj.ranch_id,
      obj.ranchoId,
      obj.rancho_id
    ),
    damLabel,
    approverLabel,
    reason,
    evidencePhotoS3Key,
    evidencePhotoUrl,
    createdAt,
    previousState,
    newState,
    diffRows,
    changedCount,
    isLateCreation,
  };
}

export async function fetchAssociationAuditsPage(
  ranchId: string,
  page: number,
  signal?: AbortSignal,
  requestedSize?: number
): Promise<{ items: AuditHistoryEntry[]; nextPage?: number; pageSize?: number }> {
  const path =
    page > 0 && requestedSize
      ? `/association/audits?page=${page}&size=${requestedSize}`
      : '/association/audits';

  const res = await apiFetch<unknown>(path, { ranchId, signal });
  const { list, totalPages, pageSize } = extractPaginatedList(res, [
    'audits',
    'auditorias',
    'items',
    'content',
    'results',
  ]);

  const items = list
    .map((item, idx) => normalizeAuditHistoryEntry(item, page * 50 + idx))
    .filter((item): item is AuditHistoryEntry => item !== null);

  return {
    items,
    pageSize: pageSize ?? (list.length > 0 ? list.length : undefined),
    nextPage: list.length > 0 && page + 1 < totalPages ? page + 1 : undefined,
  };
}

export async function fetchPresignedEvidenceDownload(
  ranchId: string,
  s3Key: string,
  signal?: AbortSignal
): Promise<string> {
  const res = await apiFetch<unknown>(
    `/media/presigned-download?s3Key=${encodeURIComponent(s3Key)}`,
    { ranchId, signal }
  );

  const obj =
    res &&
    typeof res === 'object' &&
    'data' in (res as Record<string, unknown>) &&
    (res as Record<string, unknown>).data &&
    typeof (res as Record<string, unknown>).data === 'object'
      ? ((res as Record<string, unknown>).data as Record<string, unknown>)
      : res && typeof res === 'object'
        ? (res as Record<string, unknown>)
        : {};

  const rawUrl = asNonEmptyString(
    obj.downloadUrl,
    obj.download_url,
    obj.presignedUrl,
    obj.presigned_url,
    obj.url
  );
  const safeUrl = sanitizeHttpMediaUrl(rawUrl);
  if (!safeUrl) {
    throw new Error(
      'No se recibió una URL HTTPS válida para visualizar la fotografía en S3.'
    );
  }
  return safeUrl;
}
