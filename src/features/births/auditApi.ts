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

export function resolveEvidenceMimeType(file: File): string | null {
  const normalized = file.type.trim().toLowerCase();
  if (ALLOWED_EVIDENCE_MIME_TYPES.has(normalized)) {
    return normalized;
  }
  const ext = file.name.split('.').pop()?.trim().toLowerCase() ?? '';
  return MIME_BY_EXTENSION[ext] ?? null;
}

export function validateEvidenceFile(file: File | null): {
  valid: boolean;
  mimeType: string | null;
  error: string | null;
} {
  if (!file) {
    return {
      valid: false,
      mimeType: null,
      error: 'Debes adjuntar una fotografía de evidencia antes de guardar.',
    };
  }
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
  return { valid: true, mimeType, error: null };
}

export async function uploadBirthEvidenceToS3(
  file: File,
  mimeType: string,
  ranchId: string
): Promise<string> {
  const presigned = await apiFetch<PresignedUploadResponse>(
    '/media/presigned-upload',
    {
      method: 'POST',
      ranchId,
      body: JSON.stringify({
        contentType: mimeType,
        sizeBytes: file.size,
        category: 'birth-audits',
      }),
    }
  );

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
      headers: {
        'Content-Type': mimeType,
      },
      body: file,
    });
  } catch {
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
          conceptionMethod: input.conceptionMethod,
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

function extractAnimalListAndTotalPages(res: unknown): {
  list: unknown[];
  totalPages: number;
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
    const rawList = obj.items ?? obj.content ?? obj.animals;
    const totalPagesRaw = Number(obj.totalPages ?? 1);
    return {
      list: Array.isArray(rawList) ? rawList : [],
      totalPages: Number.isFinite(totalPagesRaw) && totalPagesRaw > 0 ? totalPagesRaw : 1,
    };
  }
  return { list: [], totalPages: 1 };
}

export async function fetchRanchParentAnimals(
  ranchId: string,
  sex: 'FEMALE' | 'MALE'
): Promise<RanchAnimalOption[]> {
  const MAX_PAGES = 5;
  const collected: RanchAnimalOption[] = [];

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await apiFetch<unknown>(
      `/animals?sexo=${sex}&estado=ACTIVE&page=${page}&size=100`,
      { ranchId }
    );
    const { list, totalPages } = extractAnimalListAndTotalPages(res);

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
      collected.push({
        id,
        folioInterno,
        registroUno: asNonEmptyString(obj.registroUno, obj.registro_uno),
        breed: asNonEmptyString(obj.breed, obj.raza),
        sex: normalizedSex,
      });
    }

    if (page + 1 >= totalPages || list.length < 100) {
      break;
    }
  }

  return collected.sort((a, b) =>
    a.folioInterno.localeCompare(b.folioInterno, 'es-MX', { numeric: true })
  );
}
