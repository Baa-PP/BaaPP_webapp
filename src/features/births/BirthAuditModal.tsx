import { ChangeEvent, FormEvent, RefObject, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSessionGeneration } from '../../api/client';
import { ModalDialog } from '../../components/ModalDialog';
import {
  fetchRanchParentAnimals,
  RecordedBirthAuditSummary,
  submitBirthAudit,
  uploadBirthEvidenceToS3,
  validateEvidenceFile,
} from './auditApi';
import type { BirthRecord } from './BirthsView';

export type BirthAuditMode = 'correct' | 'create_late';

export interface BirthAuditModalProps {
  open: boolean;
  mode: BirthAuditMode;
  activeRanchId: string;
  ranchName?: string;
  localDateKey: string;
  birth: BirthRecord | null;
  triggerRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  onSuccess: (summary: RecordedBirthAuditSummary) => void;
}

const CONCEPTION_OPTIONS = [
  { value: 'MN', label: 'Monta natural (MN)' },
  { value: 'IA', label: 'Inseminación artificial (IA)' },
  { value: 'TE', label: 'Transferencia de embriones (TE)' },
] as const;

function toDateInputValue(raw?: string): string {
  if (!raw) return '';
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(raw.trim());
  return match ? match[1] : '';
}

function parseNonNegativeInt(raw: string): number | null {
  if (raw.trim() === '') return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

function computeDateDeltaDays(birthDate: string, todayKey: string): number | null {
  const bMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  const tMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(todayKey);
  if (!bMatch || !tMatch) return null;
  const bDate = new Date(Number(bMatch[1]), Number(bMatch[2]) - 1, Number(bMatch[3]));
  const tDate = new Date(Number(tMatch[1]), Number(tMatch[2]) - 1, Number(tMatch[3]));
  if (
    bDate.getFullYear() !== Number(bMatch[1]) ||
    bDate.getMonth() !== Number(bMatch[2]) - 1 ||
    bDate.getDate() !== Number(bMatch[3])
  ) {
    return null;
  }
  return Math.round((tDate.getTime() - bDate.getTime()) / 86_400_000);
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1_048_576) {
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function BirthAuditModal({
  open,
  mode,
  activeRanchId,
  ranchName,
  localDateKey,
  birth,
  triggerRef,
  onClose,
  onSuccess,
}: BirthAuditModalProps) {
  const qc = useQueryClient();

  const [damId, setDamId] = useState('');
  const [sireId, setSireId] = useState('');
  const [externalSireFolio, setExternalSireFolio] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [liveBornInput, setLiveBornInput] = useState('1');
  const [stillbornInput, setStillbornInput] = useState('0');
  const [conceptionMethod, setConceptionMethod] = useState('MN');
  const [reason, setReason] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedPhoto, setUploadedPhoto] = useState<{
    file: File;
    ranchId: string;
    s3Key: string;
  } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState('');
  const [formError, setFormError] = useState('');
  const [submitStage, setSubmitStage] = useState<'idle' | 'uploading' | 'saving'>(
    'idle'
  );
  const [fileInputKey, setFileInputKey] = useState(0);

  const currentRanchRef = useRef(activeRanchId);
  currentRanchRef.current = activeRanchId;

  useEffect(() => {
    if (!open) return;

    if (mode === 'correct' && birth) {
      setDamId(birth.damId ?? '');
      setSireId(birth.sireId ?? '');
      setExternalSireFolio(birth.externalSireFolio ?? '');
      setBirthDate(toDateInputValue(birth.birthDate));
      setLiveBornInput(String(birth.liveBornCount));
      setStillbornInput(String(birth.stillbornCount));
      setConceptionMethod(birth.conceptionMethod || 'MN');
    } else {
      setDamId('');
      setSireId('');
      setExternalSireFolio('');
      setBirthDate('');
      setLiveBornInput('1');
      setStillbornInput('0');
      setConceptionMethod('MN');
    }

    setReason('');
    setSelectedFile(null);
    setUploadedPhoto(null);
    setFileError('');
    setFormError('');
    setSubmitStage('idle');
    setFileInputKey((k) => k + 1);
  }, [open, mode, birth?.id, activeRanchId]);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedFile]);

  const damsQuery = useQuery({
    queryKey: ['birth-audit-dams', activeRanchId] as const,
    queryFn: ({ queryKey }) => fetchRanchParentAnimals(queryKey[1], 'FEMALE'),
    enabled: open && mode === 'create_late' && Boolean(activeRanchId),
  });

  const siresQuery = useQuery({
    queryKey: ['birth-audit-sires', activeRanchId] as const,
    queryFn: ({ queryKey }) => fetchRanchParentAnimals(queryKey[1], 'MALE'),
    enabled: open && mode === 'create_late' && Boolean(activeRanchId),
  });

  const isSubmitting = submitStage !== 'idle';
  const trimmedReason = reason.trim();
  const hasPhotoAndReason = Boolean(selectedFile) && trimmedReason.length > 0;
  const deltaDays = birthDate ? computeDateDeltaDays(birthDate, localDateKey) : null;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0] ?? null;
    if (!picked) {
      setSelectedFile(null);
      setUploadedPhoto(null);
      setFileError('');
      return;
    }

    const check = validateEvidenceFile(picked);
    if (!check.valid) {
      setSelectedFile(null);
      setUploadedPhoto(null);
      setFileError(check.error ?? 'Fotografía no válida.');
      setFileInputKey((k) => k + 1);
      return;
    }

    setFileError('');
    setFormError('');
    setSelectedFile(picked);
    if (uploadedPhoto && uploadedPhoto.file !== picked) {
      setUploadedPhoto(null);
    }
  }

  function handleClearFile() {
    setSelectedFile(null);
    setUploadedPhoto(null);
    setFileError('');
    setFileInputKey((k) => k + 1);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setFormError('');

    if (mode === 'correct' && !birth) {
      setFormError('No se encontró el registro de parto a corregir.');
      return;
    }

    if (mode === 'create_late' && !damId) {
      setFormError('Selecciona la madre (hembra del rancho) para registrar el parto.');
      return;
    }

    if (!birthDate) {
      setFormError('Captura la fecha del parto.');
      return;
    }

    if (deltaDays === null || deltaDays < 0) {
      setFormError('La fecha del parto debe ser válida y no puede ser futura.');
      return;
    }

    const liveBornCount = parseNonNegativeInt(liveBornInput);
    const stillbornCount = parseNonNegativeInt(stillbornInput);
    if (liveBornCount === null || stillbornCount === null) {
      setFormError('Nacidos vivos y nacidos muertos deben ser números enteros mayores o iguales a 0.');
      return;
    }

    if (liveBornCount + stillbornCount < 1) {
      setFormError('El parto debe registrar al menos una cría (viva o muerta).');
      return;
    }

    const fileValidation = validateEvidenceFile(selectedFile);
    if (!fileValidation.valid || !selectedFile || !fileValidation.mimeType) {
      setFormError(
        fileValidation.error ??
          'La fotografía de evidencia es obligatoria para guardar la auditoría.'
      );
      return;
    }

    if (!trimmedReason) {
      setFormError('Escribe el motivo textual que justifica esta auditoría.');
      return;
    }

    const submissionRanchId = activeRanchId;
    const startGeneration = getSessionGeneration();

    try {
      let s3Key =
        uploadedPhoto &&
        uploadedPhoto.file === selectedFile &&
        uploadedPhoto.ranchId === submissionRanchId
          ? uploadedPhoto.s3Key
          : '';

      if (!s3Key) {
        setSubmitStage('uploading');
        s3Key = await uploadBirthEvidenceToS3(
          selectedFile,
          fileValidation.mimeType,
          submissionRanchId
        );

        if (
          getSessionGeneration() !== startGeneration ||
          currentRanchRef.current !== submissionRanchId
        ) {
          return;
        }
        setUploadedPhoto({ file: selectedFile, ranchId: submissionRanchId, s3Key });
      }

      setSubmitStage('saving');

      const selectedDam = damsQuery.data?.find((d) => d.id === damId);
      const damLabel =
        mode === 'correct' && birth
          ? birth.damLabel
          : selectedDam?.folioInterno ?? damId;

      const summary = await submitBirthAudit({
        ranchId: submissionRanchId,
        action: mode === 'correct' ? 'CORRECT_BIRTH' : 'REGISTER_LATE_BIRTH',
        birthId: mode === 'correct' ? birth?.id : undefined,
        damId: mode === 'create_late' ? damId : undefined,
        damLabel,
        sireId: mode === 'create_late' && sireId ? sireId : undefined,
        externalSireFolio:
          mode === 'create_late' && !sireId && externalSireFolio.trim()
            ? externalSireFolio.trim()
            : undefined,
        birthDate,
        liveBornCount,
        stillbornCount,
        conceptionMethod,
        reason: trimmedReason,
        evidencePhotoS3Key: s3Key,
        previousLiveBornCount: birth?.liveBornCount,
        previousStillbornCount: birth?.stillbornCount,
        previousBirthDate: birth ? toDateInputValue(birth.birthDate) || birth.birthDate : undefined,
      });

      if (
        getSessionGeneration() !== startGeneration ||
        currentRanchRef.current !== submissionRanchId
      ) {
        return;
      }

      await Promise.all([
        qc.invalidateQueries({ queryKey: ['births'] }),
        qc.invalidateQueries({ queryKey: ['association-audits'] }),
        qc.invalidateQueries({ queryKey: ['animals'] }),
      ]);

      onSuccess(summary);
    } catch (err) {
      if (
        getSessionGeneration() !== startGeneration ||
        currentRanchRef.current !== submissionRanchId
      ) {
        return;
      }
      setFormError(
        err instanceof Error
          ? err.message
          : 'No se pudo registrar la corrección auditada.'
      );
    } finally {
      if (
        getSessionGeneration() === startGeneration &&
        currentRanchRef.current === submissionRanchId
      ) {
        setSubmitStage('idle');
      }
    }
  }

  const title =
    mode === 'correct'
      ? 'Corrección auditada de parto'
      : 'Registrar parto fuera de ventana (>30 días)';

  const subtitle =
    mode === 'correct' && birth ? (
      <>
        Madre: <b>{birth.damLabel}</b> · Padre: <b>{birth.sireLabel}</b> ·{' '}
        {ranchName || 'Rancho activo'}
      </>
    ) : (
      <>
        Alta extemporánea auditada en <b>{ranchName || 'Rancho activo'}</b>
      </>
    );

  const dams = damsQuery.data ?? [];
  const sires = siresQuery.data ?? [];

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      titleId="birth-audit-modal-title"
      title={title}
      subtitle={subtitle}
      closeLabel="Cerrar formulario de auditoría"
      disableClose={isSubmitting}
      triggerRef={triggerRef}
      cardClassName="birth-audit-modal-card"
    >
      <form className="birth-audit-form" onSubmit={handleSubmit} noValidate>
        <div className="birth-modal-body birth-audit-body">
          <div className="birth-audit-grid">
            {mode === 'correct' && birth ? (
              <div className="birth-audit-context">
                <span className="birth-badge birth-badge-locked">
                  Auditoría inmutable (auditorias_parto)
                </span>
                <p className="muted">
                  Estado actual: fecha{' '}
                  <b>{toDateInputValue(birth.birthDate) || birth.birthDate}</b> ·{' '}
                  <b>{birth.liveBornCount}</b> vivos ·{' '}
                  <b>{birth.stillbornCount}</b> muertos.
                </p>
              </div>
            ) : (
              <>
                <label className="birth-audit-field">
                  <span>Madre (hembra activa) *</span>
                  <select
                    value={damId}
                    disabled={isSubmitting || damsQuery.isLoading}
                    onChange={(e) => setDamId(e.target.value)}
                    required
                  >
                    <option value="">
                      {damsQuery.isLoading
                        ? 'Cargando hembras del rancho…'
                        : 'Selecciona una hembra…'}
                    </option>
                    {dams.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.folioInterno}
                        {d.registroUno ? ` · UNO ${d.registroUno}` : ''}
                        {d.breed ? ` (${d.breed})` : ''}
                      </option>
                    ))}
                  </select>
                  {damsQuery.isError && (
                    <span className="birth-audit-inline-error">
                      No se pudo cargar el catálogo de hembras.{' '}
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => void damsQuery.refetch()}
                      >
                        Reintentar
                      </button>
                    </span>
                  )}
                </label>

                <label className="birth-audit-field">
                  <span>Padre registrado (opcional)</span>
                  <select
                    value={sireId}
                    disabled={isSubmitting || siresQuery.isLoading}
                    onChange={(e) => setSireId(e.target.value)}
                  >
                    <option value="">
                      {siresQuery.isLoading
                        ? 'Cargando sementales…'
                        : 'Sin semental interno / usar folio externo'}
                    </option>
                    {sires.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.folioInterno}
                        {s.registroUno ? ` · UNO ${s.registroUno}` : ''}
                        {s.breed ? ` (${s.breed})` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                {!sireId && (
                  <label className="birth-audit-field">
                    <span>Folio de semental externo (opcional)</span>
                    <input
                      type="text"
                      maxLength={60}
                      value={externalSireFolio}
                      disabled={isSubmitting}
                      placeholder="Ej. EXT-484-019"
                      onChange={(e) => setExternalSireFolio(e.target.value)}
                    />
                  </label>
                )}
              </>
            )}

            <div className="birth-audit-row">
              <label className="birth-audit-field">
                <span>Fecha de parto *</span>
                <input
                  type="date"
                  max={localDateKey}
                  value={birthDate}
                  disabled={isSubmitting}
                  onChange={(e) => setBirthDate(e.target.value)}
                  required
                />
                {mode === 'create_late' &&
                  deltaDays !== null &&
                  deltaDays >= 0 &&
                  deltaDays <= 30 && (
                    <small className="birth-audit-hint">
                      Nota: hace {deltaDays} {deltaDays === 1 ? 'día' : 'días'} aún
                      se encuentra en ventana de 30 días, también se auditará al guardar.
                    </small>
                  )}
              </label>

              <label className="birth-audit-field">
                <span>Método de concepción</span>
                <select
                  value={conceptionMethod}
                  disabled={isSubmitting}
                  onChange={(e) => setConceptionMethod(e.target.value)}
                >
                  {CONCEPTION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="birth-audit-row">
              <label className="birth-audit-field">
                <span>Nacidos vivos *</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={liveBornInput}
                  disabled={isSubmitting}
                  onChange={(e) => setLiveBornInput(e.target.value)}
                  required
                />
              </label>

              <label className="birth-audit-field">
                <span>Nacidos muertos *</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={stillbornInput}
                  disabled={isSubmitting}
                  onChange={(e) => setStillbornInput(e.target.value)}
                  required
                />
              </label>
            </div>

            <div className="birth-audit-field">
              <label htmlFor="birth-audit-photo-input">
                <span>Fotografía de evidencia (S3 obligatoria) *</span>
              </label>
              <input
                key={fileInputKey}
                id="birth-audit-photo-input"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={isSubmitting}
                onChange={handleFileChange}
              />
              <small className="birth-audit-hint">
                Formatos permitidos: JPG, PNG o WebP (máx. 10 MB).
              </small>
              {fileError && (
                <p className="error" role="alert">
                  {fileError}
                </p>
              )}
              {selectedFile && previewUrl && (
                <div className="birth-audit-preview">
                  <img
                    src={previewUrl}
                    alt="Vista previa de fotografía de evidencia"
                    className="birth-audit-preview-img"
                  />
                  <div className="birth-audit-preview-meta">
                    <strong>{selectedFile.name}</strong>
                    <small className="muted">
                      {formatFileSize(selectedFile.size)}
                      {uploadedPhoto?.file === selectedFile
                        ? ' · Subida a S3 lista'
                        : ' · Se subirá a S3 al confirmar'}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="link-button"
                    disabled={isSubmitting}
                    onClick={handleClearFile}
                  >
                    Quitar
                  </button>
                </div>
              )}
            </div>

            <label className="birth-audit-field">
              <span>Motivo de la corrección / auditoría *</span>
              <textarea
                rows={3}
                maxLength={500}
                value={reason}
                disabled={isSubmitting}
                placeholder="Describe qué se corrige o por qué se registra fuera de la ventana de 30 días."
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </label>

            {formError && (
              <div className="birth-audit-alert" role="alert">
                {formError}
              </div>
            )}
          </div>
        </div>

        <div className="birth-modal-footer">
          <span className="birth-audit-requirement">
            {!hasPhotoAndReason
              ? 'Foto de evidencia y motivo obligatorios para guardar.'
              : 'Se registrará un movimiento inmutable en el historial de auditoría.'}
          </span>

          <div className="birth-modal-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={isSubmitting}
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="primary"
              disabled={isSubmitting || !hasPhotoAndReason}
            >
              {submitStage === 'uploading'
                ? 'Subiendo fotografía a S3…'
                : submitStage === 'saving'
                  ? 'Guardando auditoría…'
                  : mode === 'correct'
                    ? 'Guardar corrección auditada'
                    : 'Registrar parto auditado'}
            </button>
          </div>
        </div>
      </form>
    </ModalDialog>
  );
}
