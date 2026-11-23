import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, getSessionGeneration } from '../../api/client';
import { AnimalWeightsSection } from './AnimalWeightsSection';

export interface AnimalWeight {
  id?: string;
  milestone: string;
  weightKg: number;
  date?: string;
  scrotalCircumferenceCm?: number | null;
}

export interface AnimalDetail {
  id: string;
  ranchId?: string;
  folioInterno: string;
  siniigaChip?: string | null;
  registroUno?: string | null;
  adn?: string | null;
  breed?: string;
  color?: string;
  sex: 'FEMALE' | 'MALE' | 'UNKNOWN';
  birthDate?: string;
  ageDays?: number;
  weaningDate?: string | null;
  entryReason?: string;
  criador?: string | null;
  propietario?: string | null;
  lifeStage?: string;
  reproductiveStatus?: string;
  status?: string;
  parturitionType?: string;
  conceptionMethod?: string;
  mortalityDate?: string | null;
  mortalityCause?: string | null;
  lifeStageAtDeath?: string | null;
  sireLabel?: string | null;
  sireUno?: string | null;
  damLabel?: string | null;
  damUno?: string | null;
  weights: AnimalWeight[];
  photoS3Key?: string | null;
  photoUrl?: string | null;
}

const LABELS: Record<string, string> = {
  FEMALE: 'Hembra',
  MALE: 'Macho',
  UNKNOWN: 'Sexo sin especificar',
  LAMB_LACTATING: 'Cordero lactante',
  LAMB_FATTENING: 'Cordero en engorda',
  EWE_REPLACEMENT: 'Reemplazo',
  ADULT: 'Adulto',
  EMPTY: 'Vacía',
  PREGNANT: 'Gestante',
  LACTATING: 'Lactante',
  STUD_RAM: 'Semental',
  ACTIVE: 'Activo',
  SOLD: 'Vendido',
  DECEASED: 'Fallecido',
  BIRTH: 'Nacimiento',
  WEANING: 'Destete',
  DAY_120: '120 días',
  DAY_150: '150 días',
  EVALUATION: 'Evaluación',
  MN: 'Monta natural',
  IA: 'Inseminación artificial',
  TE: 'Transferencia de embriones',
  SIMPLE: 'Parto simple',
  TWIN: 'Parto gemelar',
  DOBLE: 'Parto doble',
  TRIPLET: 'Parto triple',
  TRIPLE: 'Parto triple',
  QUADRUPLET: 'Parto cuádruple',
  QUINTUPLET: 'Parto quíntuple',
  PURCHASE: 'Compra',
  REENTRY: 'Reingreso',
  TRANSFER: 'Traslado',
  OTHER: 'Otro',
};

function labelOf(value?: string | null): string {
  if (!value) return '—';
  return LABELS[value] || value.replace(/_/g, ' ').toLowerCase();
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isSafeHttpUrl(raw?: string | null): raw is string {
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value + (value.length === 10 ? 'T00:00:00' : ''));
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

/**
 * Calcula la edad dinámica en meses y días calendario a partir de birthDate.
 * Si no hay birthDate válida, usa ageDays del backend como respaldo.
 */
export function formatDynamicAge(birthDate?: string | null, fallbackAgeDays?: number): string {
  if (birthDate) {
    const birth = new Date(birthDate + (birthDate.length === 10 ? 'T00:00:00' : ''));
    if (!Number.isNaN(birth.getTime())) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const birthDay = new Date(birth.getFullYear(), birth.getMonth(), birth.getDate());
      if (today < birthDay) {
        return '0 meses, 0 días';
      }
      const buildMonthAnchor = (monthOffset: number) => {
        const rawMonth = birthDay.getMonth() + monthOffset;
        const targetYear = birthDay.getFullYear() + Math.floor(rawMonth / 12);
        const targetMonth = ((rawMonth % 12) + 12) % 12;
        const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
        return new Date(targetYear, targetMonth, Math.min(birthDay.getDate(), lastDayOfTargetMonth));
      };
      let months =
        (today.getFullYear() - birthDay.getFullYear()) * 12 +
        (today.getMonth() - birthDay.getMonth());
      if (today < buildMonthAnchor(months)) {
        months -= 1;
      }
      const adjustedAnchor = buildMonthAnchor(months);
      const days = Math.max(
        0,
        Math.round((today.getTime() - adjustedAnchor.getTime()) / 86400000)
      );
      return `${months} ${months === 1 ? 'mes' : 'meses'}, ${days} ${days === 1 ? 'día' : 'días'}`;
    }
  }
  if (typeof fallbackAgeDays === 'number' && Number.isFinite(fallbackAgeDays) && fallbackAgeDays >= 0) {
    const months = Math.floor(fallbackAgeDays / 30);
    const days = fallbackAgeDays % 30;
    return `${months} ${months === 1 ? 'mes' : 'meses'}, ${days} ${days === 1 ? 'día' : 'días'}`;
  }
  return '—';
}

function normalizeWeights(raw: unknown): AnimalWeight[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): AnimalWeight | null => {
      if (!item || typeof item !== 'object') return null;
      const m = item as Record<string, unknown>;
      const weightKg = Number(m.weightKg ?? m.weight_kg ?? m.peso_kg);
      if (!Number.isFinite(weightKg)) return null;
      const rawScrotal =
        m.scrotalCircumferenceCm ??
        m.scrotal_circumference_cm ??
        m.circunferencia_escrotal_cm;
      const parsedScrotal =
        rawScrotal !== null && rawScrotal !== undefined && rawScrotal !== ''
          ? Number(rawScrotal)
          : null;
      return {
        id: asNonEmptyString(m.id) ?? undefined,
        milestone: String(m.milestone ?? m.hito ?? '').toUpperCase(),
        weightKg,
        date: asNonEmptyString(m.date ?? m.measured_at ?? m.fecha) ?? undefined,
        scrotalCircumferenceCm:
          parsedScrotal !== null && Number.isFinite(parsedScrotal) ? parsedScrotal : null,
      };
    })
    .filter((w): w is AnimalWeight => w !== null);
}

export function normalizeAnimalDetail(raw: unknown): AnimalDetail {
  const unwrapped =
    raw && typeof raw === 'object' && 'data' in (raw as Record<string, unknown>)
      ? (raw as Record<string, unknown>).data
      : raw;
  const nested =
    unwrapped && typeof unwrapped === 'object' && 'animal' in (unwrapped as Record<string, unknown>)
      ? (unwrapped as Record<string, unknown>).animal
      : unwrapped;
  const a = (nested && typeof nested === 'object' ? nested : {}) as Record<string, unknown>;

  const rawSex = String(a.sex ?? a.sexo ?? '').trim().toUpperCase();
  const sex: AnimalDetail['sex'] =
    rawSex === 'FEMALE' ? 'FEMALE' : rawSex === 'MALE' ? 'MALE' : 'UNKNOWN';

  const rawAgeDays = a.ageDays ?? a.age_days ?? a.edad_dias;
  const parsedAgeDays =
    rawAgeDays !== null && rawAgeDays !== undefined && rawAgeDays !== ''
      ? Number(rawAgeDays)
      : undefined;

  return {
    id: String(a.id ?? a.animalId ?? a.animal_id ?? '').trim(),
    ranchId: asNonEmptyString(a.ranchId ?? a.ranch_id) ?? undefined,
    folioInterno: asNonEmptyString(a.folioInterno ?? a.folio_interno) ?? '',
    siniigaChip: asNonEmptyString(a.siniigaChip ?? a.siniiga_chip ?? a.chip_siniiga),
    registroUno: asNonEmptyString(a.registroUno ?? a.registro_uno),
    adn: asNonEmptyString(a.adn),
    breed: asNonEmptyString(a.breed ?? a.raza) ?? undefined,
    color: asNonEmptyString(a.color) ?? undefined,
    sex,
    birthDate: asNonEmptyString(a.birthDate ?? a.birth_date ?? a.fecha_nacimiento) ?? undefined,
    ageDays:
      parsedAgeDays !== undefined && Number.isFinite(parsedAgeDays) ? parsedAgeDays : undefined,
    weaningDate: asNonEmptyString(a.weaningDate ?? a.weaning_date ?? a.fecha_destete),
    entryReason: asNonEmptyString(a.entryReason ?? a.entry_reason ?? a.motivo_alta) ?? undefined,
    criador: asNonEmptyString(a.criador ?? a.criador_name),
    propietario: asNonEmptyString(a.propietario ?? a.owner_name ?? a.ranch_name),
    lifeStage: asNonEmptyString(a.lifeStage ?? a.life_stage ?? a.etapa_vida) ?? undefined,
    reproductiveStatus:
      asNonEmptyString(
        a.reproductiveStatus ?? a.reproductive_status ?? a.estado_reproductivo
      ) ?? undefined,
    status: asNonEmptyString(a.status ?? a.estado) ?? undefined,
    parturitionType:
      asNonEmptyString(a.parturitionType ?? a.birth_type ?? a.tipo_parto) ?? undefined,
    conceptionMethod:
      asNonEmptyString(a.conceptionMethod ?? a.conception_method ?? a.metodo_concepcion) ??
      undefined,
    mortalityDate: asNonEmptyString(
      a.mortalityDate ?? a.mortality_date ?? a.fecha_muerte ?? a.saleDate ?? a.sale_date
    ),
    mortalityCause: asNonEmptyString(
      a.mortalityCause ??
        a.mortality_cause ??
        a.causa_muerte ??
        a.saleCause ??
        a.sale_cause ??
        a.saleReason ??
        a.sale_reason
    ),
    lifeStageAtDeath: asNonEmptyString(
      a.lifeStageAtDeath ?? a.life_stage_at_death ?? a.etapa_al_morir
    ),
    sireLabel: asNonEmptyString(
      a.sire_name ?? a.padre_name ?? a.padre ?? a.sire ?? a.externalSireFolio ?? a.folio_padre_externo
    ),
    sireUno: asNonEmptyString(a.sire_uno ?? a.folio_uno_padre ?? a.sire_folio ?? a.padre_folio),
    damLabel: asNonEmptyString(
      a.dam_name ?? a.madre_name ?? a.madre ?? a.dam ?? a.externalDamFolio ?? a.folio_madre_externo
    ),
    damUno: asNonEmptyString(a.dam_uno ?? a.folio_uno_madre ?? a.dam_folio ?? a.madre_folio),
    weights: normalizeWeights(a.weights ?? a.measurements ?? a.weight_measurements ?? a.pesajes),
    photoS3Key: asNonEmptyString(a.photoS3Key ?? a.photo_s3_key ?? a.foto_s3_key),
    photoUrl:
      [a.photoUrl, a.presigned_photo_url, a.photo_presigned_url, a.photo_url]
        .map(asNonEmptyString)
        .find((url): url is string => isSafeHttpUrl(url)) ?? null,
  };
}

interface AnimalPhotoProps {
  animalId: string;
  initialUrl?: string | null;
  s3Key?: string | null;
  ranchId?: string | null;
  altText: string;
}

function AnimalPhoto({ animalId, initialUrl, s3Key, ranchId, altText }: AnimalPhotoProps) {
  const safeInitial = isSafeHttpUrl(initialUrl) ? initialUrl : null;
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(safeInitial);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [fetchError, setFetchError] = useState('');

  const autoRetriedRef = useRef(false);
  const reqSeqRef = useRef(0);

  const requestPresignedDownload = useCallback(async () => {
    if (!s3Key) return;
    const seq = ++reqSeqRef.current;
    const sessionGen = getSessionGeneration();
    setLoadingUrl(true);
    setFetchError('');
    try {
      const res = await apiFetch<{ downloadUrl?: string; url?: string; data?: { downloadUrl?: string } }>(
        `/media/presigned-download?s3Key=${encodeURIComponent(s3Key)}`,
        { ranchId: ranchId ?? undefined }
      );
      if (seq !== reqSeqRef.current || getSessionGeneration() !== sessionGen) return;
      const nextUrl = res?.downloadUrl ?? res?.data?.downloadUrl ?? res?.url ?? null;
      if (isSafeHttpUrl(nextUrl)) {
        setResolvedUrl(nextUrl);
        setImgError(false);
      } else {
        setImgError(true);
        setFetchError('No se recibió una URL pre-firmada válida para la fotografía.');
      }
    } catch (err) {
      if (seq !== reqSeqRef.current || getSessionGeneration() !== sessionGen) return;
      setImgError(true);
      setFetchError(
        err instanceof Error ? err.message : 'No se pudo obtener la fotografía desde S3.'
      );
    } finally {
      if (seq === reqSeqRef.current) {
        setLoadingUrl(false);
      }
    }
  }, [s3Key, ranchId]);

  useEffect(() => {
    reqSeqRef.current += 1;
    autoRetriedRef.current = false;
    setResolvedUrl(safeInitial);
    setImgError(false);
    setFetchError('');
    setLoadingUrl(false);

    if (!safeInitial && s3Key) {
      void requestPresignedDownload();
    }

    return () => {
      reqSeqRef.current += 1;
    };
  }, [animalId, safeInitial, s3Key, requestPresignedDownload]);

  function handleImageError() {
    if (s3Key && !autoRetriedRef.current) {
      autoRetriedRef.current = true;
      void requestPresignedDownload();
      return;
    }
    setImgError(true);
  }

  return (
    <figure className="photo-frame">
      <div className="photo">
        {loadingUrl ? (
          <div className="photo-placeholder">
            <span aria-hidden="true">◎</span>
            <small>Cargando fotografía S3…</small>
          </div>
        ) : resolvedUrl && !imgError ? (
          <img
            src={resolvedUrl}
            alt={altText}
            loading="eager"
            onError={handleImageError}
          />
        ) : imgError || fetchError ? (
          <div className="photo-placeholder photo-placeholder-error">
            <span aria-hidden="true">!</span>
            <small>{fetchError || 'No se pudo cargar la fotografía.'}</small>
            {s3Key && (
              <button
                type="button"
                className="link-button photo-retry-btn"
                onClick={() => {
                  autoRetriedRef.current = true;
                  void requestPresignedDownload();
                }}
              >
                Reintentar foto
              </button>
            )}
          </div>
        ) : (
          <div className="photo-placeholder">
            <span aria-hidden="true">◉</span>
            <small>Sin fotografía registrada</small>
          </div>
        )}
      </div>
      <figcaption className="photo-caption">
        {resolvedUrl && !imgError
          ? 'Fotografía S3 (URL pre-firmada)'
          : s3Key
            ? 'Archivo S3 vinculado'
            : 'Sin fotografía en S3'}
      </figcaption>
    </figure>
  );
}

interface AnimalCertificateProps {
  animal: AnimalDetail;
  activeRanchId: string | null;
  activeRanchOwner?: string;
}

export function AnimalCertificate({
  animal,
  activeRanchId,
  activeRanchOwner,
}: AnimalCertificateProps) {
  const isFemale = animal.sex === 'FEMALE';
  const isMale = animal.sex === 'MALE';
  const variantClass = isFemale ? 'pink' : isMale ? 'blue' : 'neutral';
  const sexSymbol = isFemale ? '♀' : isMale ? '♂' : '◎';
  const sexTitle = isFemale ? 'HEMBRA' : isMale ? 'MACHO' : 'SIN ESPECIFICAR';
  const sheetLabel = isFemale ? 'HOJA ROSA' : isMale ? 'HOJA AZUL' : 'FICHA INDIVIDUAL';

  const criadorValue = animal.criador || 'No especificado';
  const effectiveOwner =
    asNonEmptyString(animal.propietario) ?? asNonEmptyString(activeRanchOwner);
  const propietarioValue = effectiveOwner || 'Sin dato';
  const differentOrigin = Boolean(
    animal.criador &&
      effectiveOwner &&
      animal.criador.trim().toLowerCase() !== effectiveOwner.toLowerCase()
  );

  const hasGenealogy = Boolean(
    animal.sireLabel ||
      animal.sireUno ||
      animal.damLabel ||
      animal.damUno ||
      animal.conceptionMethod ||
      animal.parturitionType
  );

  const isDeceased = animal.status === 'DECEASED';
  const isSold = animal.status === 'SOLD';
  const isExited = isDeceased || isSold;

  return (
    <article
      className={`certificate ${variantClass}`}
      aria-label={`Certificado individual de ${animal.folioInterno || 'ejemplar'} (${sexTitle})`}
    >
      <header className="cert-head">
        <div>
          <small>BAAPP (OVIAPP) · CERTIFICADO OFICIAL DE REBAÑO</small>
          <h1>
            Reseña individual
            {animal.folioInterno ? ` · Arete ${animal.folioInterno}` : ''}
          </h1>
          <p>Identificación oficial, origen, propiedad y seguimiento productivo</p>
        </div>
        <div
          className="seal"
          aria-label={`Sexo: ${sexTitle} (${sheetLabel})`}
        >
          <b>
            <span className="seal-icon" aria-hidden="true">
              {sexSymbol}
            </span>{' '}
            {sexTitle}
          </b>
          <small>{sheetLabel}</small>
        </div>
      </header>

      {isExited && (
        <section
          className={`life-alert ${isSold ? 'sold' : 'deceased'}`}
          role="status"
          aria-label={`Registro de baja: ${labelOf(animal.status)}`}
        >
          <div className="life-alert-head">
            <span className="baja-badge">
              {isDeceased ? 'BAJA · FALLECIDO (DECEASED)' : 'BAJA · VENDIDO (SOLD)'}
            </span>
            <span className="baja-note">
              Registro histórico preservado · sin borrado físico
            </span>
          </div>
          <dl className="baja-grid">
            <div>
              <dt>{isDeceased ? 'Fecha de fallecimiento' : 'Fecha de venta / baja'}</dt>
              <dd>{animal.mortalityDate ? formatDate(animal.mortalityDate) : 'No registrada'}</dd>
            </div>
            <div>
              <dt>{isDeceased ? 'Causa de muerte' : 'Causa / motivo de baja'}</dt>
              <dd>{animal.mortalityCause || 'No especificada'}</dd>
            </div>
            <div>
              <dt>{isDeceased ? 'Etapa al morir' : 'Etapa al causar baja'}</dt>
              <dd>
                {labelOf(
                  isDeceased
                    ? animal.lifeStageAtDeath || animal.lifeStage
                    : animal.lifeStage
                )}
              </dd>
            </div>
          </dl>
        </section>
      )}

      <div className="cert-body">
        <AnimalPhoto
          animalId={animal.id}
          initialUrl={animal.photoUrl}
          s3Key={animal.photoS3Key}
          ranchId={animal.ranchId ?? activeRanchId}
          altText={`Fotografía del ejemplar ${animal.folioInterno || animal.id}`}
        />

        <div className="cert-primary-col">
          <small className="section-label">IDENTIFICACIÓN OFICIAL</small>
          <dl className="id-grid">
            <div>
              <dt>Folio de registro UNO</dt>
              <dd>{animal.registroUno || 'Sin registro'}</dd>
            </div>
            <div>
              <dt>Número SINIIGA (484…)</dt>
              <dd>{animal.siniigaChip || 'Sin chip SINIIGA'}</dd>
            </div>
            <div>
              <dt>Folio interno de rancho</dt>
              <dd>{animal.folioInterno || '—'}</dd>
            </div>
            <div>
              <dt>ADN</dt>
              <dd>{animal.adn || 'Sin registro'}</dd>
            </div>
            <div>
              <dt>Fecha de nacimiento</dt>
              <dd>{formatDate(animal.birthDate)}</dd>
            </div>
            <div>
              <dt>Edad actual</dt>
              <dd>{formatDynamicAge(animal.birthDate, animal.ageDays)}</dd>
            </div>
          </dl>

          <div className="ownership-section">
            <div className="ownership-header">
              <small className="section-label">ORIGEN Y PROPIEDAD VIGENTE</small>
              {differentOrigin && (
                <span className="origin-diff-badge">
                  Criador distinto al propietario actual
                </span>
              )}
            </div>
            <div className="owners">
              <div className="owner-box owner-box-breeder">
                <div className="owner-box-top">
                  <small>Criador (Rancho de origen)</small>
                  <span className="owner-role-tag">Origen</span>
                </div>
                <b>{criadorValue}</b>
                <span className="owner-box-hint">Rancho donde nació el ejemplar</span>
              </div>
              <div className="owner-box owner-box-current">
                <div className="owner-box-top">
                  <small>Propietario actual</small>
                  <span className="owner-role-tag current">Vigente</span>
                </div>
                <b>{propietarioValue}</b>
                <span className="owner-box-hint">Dueño actual registrado</span>
              </div>
            </div>
          </div>

          <div className="genealogy-block">
            <small className="section-label">GENEALOGÍA</small>
            {hasGenealogy ? (
              <div className="id-grid">
                <div>
                  <small>Semental</small>
                  <b>
                    {animal.sireLabel || '—'}
                    {animal.sireUno ? ` (UNO: ${animal.sireUno})` : ''}
                  </b>
                </div>
                <div>
                  <small>Madre (Vientre)</small>
                  <b>
                    {animal.damLabel || '—'}
                    {animal.damUno ? ` (UNO: ${animal.damUno})` : ''}
                  </b>
                </div>
                {animal.conceptionMethod && (
                  <div>
                    <small>Concepción</small>
                    <b>{labelOf(animal.conceptionMethod)}</b>
                  </div>
                )}
                {animal.parturitionType && (
                  <div>
                    <small>Tipo de parto</small>
                    <b>{labelOf(animal.parturitionType)}</b>
                  </div>
                )}
              </div>
            ) : (
              <p className="muted genealogy-empty">Sin datos genealógicos registrados</p>
            )}
          </div>
        </div>
      </div>

      <div className="badges">
        <span>
          <span aria-hidden="true">{sexSymbol}</span> {labelOf(animal.sex)} ({sheetLabel})
        </span>
        <span>
          ◇ {animal.breed || 'Raza sin especificar'}
          {animal.color ? ` · ${animal.color}` : ''}
        </span>
        <span>◷ {labelOf(animal.lifeStage)}</span>
        <span>♡ {labelOf(animal.reproductiveStatus)}</span>
        {animal.entryReason && <span>↳ Alta: {labelOf(animal.entryReason)}</span>}
      </div>

      <AnimalWeightsSection animal={animal} activeRanchId={activeRanchId} />

      <footer>
        <span>
          Criador: <b>{criadorValue}</b> · Propietario actual: <b>{propietarioValue}</b>
        </span>
        <span>BAAPP (OVIAPP) · {sheetLabel}</span>
      </footer>
    </article>
  );
}
