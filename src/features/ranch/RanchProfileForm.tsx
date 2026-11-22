import { FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiFetch, getSessionGeneration } from '../../api/client';
import type { Ranch } from '../../store/useRanchContextStore';

export const ALLOWED_WEANING_DAYS = [60, 75, 90] as const;
export type WeaningTargetDays = (typeof ALLOWED_WEANING_DAYS)[number];
const DEFAULT_WEANING_DAYS: WeaningTargetDays = 75;

function toValidWeaningDays(value?: number): WeaningTargetDays {
  return value === 60 || value === 75 || value === 90 ? value : DEFAULT_WEANING_DAYS;
}

function normalizeRanchResponse(
  raw: unknown,
  fallback: {
    ranchId: string;
    name: string;
    address: string;
    owner: string;
    weaningTargetDays: WeaningTargetDays;
  }
): Ranch {
  const obj = ((raw as Record<string, unknown>)?.data ?? raw) as Record<string, unknown>;
  const rawWeaning = obj?.weaningTargetDays ?? obj?.weaning_days_target ?? obj?.weaningDaysTarget;
  return {
    id: String(obj?.id ?? obj?.ranchId ?? obj?.ranch_id ?? fallback.ranchId).trim(),
    name: String(obj?.name ?? obj?.ranchName ?? obj?.ranch_name ?? fallback.name),
    address: String(obj?.address ?? obj?.domicilio ?? fallback.address),
    owner_name: String(obj?.owner ?? obj?.owner_name ?? obj?.ownerName ?? obj?.propietario ?? fallback.owner),
    weaning_days_target:
      rawWeaning !== undefined
        ? toValidWeaningDays(Number(rawWeaning))
        : fallback.weaningTargetDays,
    last_sync_at:
      typeof (obj?.lastSyncedAt ?? obj?.last_sync_at ?? obj?.lastSyncAt) === 'string'
        ? String(obj?.lastSyncedAt ?? obj?.last_sync_at ?? obj?.lastSyncAt)
        : undefined,
  };
}

interface RanchProfileFormProps {
  ranch: Ranch | null;
  loading: boolean;
  error?: string;
  onRetry?: () => void;
  onSaved: (updated: Ranch) => void;
}

export function RanchProfileForm({ ranch, loading, error, onRetry, onSaved }: RanchProfileFormProps) {
  const [name, setName] = useState(ranch?.name ?? '');
  const [address, setAddress] = useState(ranch?.address ?? '');
  const [owner, setOwner] = useState(ranch?.owner_name ?? '');
  const [weaningTargetDays, setWeaningTargetDays] = useState<WeaningTargetDays>(
    toValidWeaningDays(ranch?.weaning_days_target)
  );
  const [validationError, setValidationError] = useState('');
  const [savedNotice, setSavedNotice] = useState('');

  const currentRanchIdRef = useRef<string | null>(ranch?.id ?? null);
  const prevRanchIdRef = useRef<string | null>(ranch?.id ?? null);
  const isDirtyRef = useRef(false);
  currentRanchIdRef.current = ranch?.id ?? null;

  useEffect(() => {
    const ranchChanged = prevRanchIdRef.current !== (ranch?.id ?? null);
    prevRanchIdRef.current = ranch?.id ?? null;
    if (ranchChanged) {
      isDirtyRef.current = false;
    }
    if (ranchChanged || !isDirtyRef.current) {
      setName(ranch?.name ?? '');
      setAddress(ranch?.address ?? '');
      setOwner(ranch?.owner_name ?? '');
      setWeaningTargetDays(toValidWeaningDays(ranch?.weaning_days_target));
    }
  }, [ranch?.id, ranch?.name, ranch?.address, ranch?.owner_name, ranch?.weaning_days_target]);

  const updateMutation = useMutation({
    mutationFn: async (payload: {
      ranchId: string;
      name: string;
      address: string;
      owner: string;
      weaningTargetDays: WeaningTargetDays;
      sessionGen: number;
    }) => {
      const response = await apiFetch<unknown>(
        `/ranches/${encodeURIComponent(payload.ranchId)}`,
        {
          method: 'PUT',
          ranchId: payload.ranchId,
          body: JSON.stringify({
            name: payload.name,
            address: payload.address,
            owner: payload.owner,
            weaningTargetDays: payload.weaningTargetDays,
          }),
        }
      );
      return normalizeRanchResponse(response, payload);
    },
    onSuccess: (updated, variables) => {
      if (getSessionGeneration() !== variables.sessionGen) {
        return;
      }
      isDirtyRef.current = false;
      onSaved(updated);
      if (currentRanchIdRef.current === updated.id) {
        setSavedNotice('Perfil del rancho guardado correctamente.');
      }
    },
  });

  const resetMutation = updateMutation.reset;
  useEffect(() => {
    setValidationError('');
    setSavedNotice('');
    resetMutation();
  }, [ranch?.id, resetMutation]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ranch) return;
    setValidationError('');
    setSavedNotice('');

    const trimmedName = name.trim();
    const trimmedAddress = address.trim();
    const trimmedOwner = owner.trim();

    if (!trimmedName || !trimmedAddress || !trimmedOwner) {
      setValidationError('Completa nombre del rancho, domicilio y propietario antes de guardar.');
      return;
    }
    if (!ALLOWED_WEANING_DAYS.includes(weaningTargetDays)) {
      setValidationError('La meta de destete debe ser 60, 75 o 90 días.');
      return;
    }

    const sessionGen = getSessionGeneration();
    updateMutation.mutate({
      ranchId: ranch.id,
      name: trimmedName,
      address: trimmedAddress,
      owner: trimmedOwner,
      weaningTargetDays,
      sessionGen,
    });
  }

  if (loading && !ranch) {
    return (
      <section className="empty-panel">
        <p className="muted">Cargando perfil del rancho…</p>
      </section>
    );
  }

  if (!ranch && error) {
    return (
      <section className="empty-panel">
        <p className="eyebrow">Administración del rancho</p>
        <h1>Perfil del rancho</h1>
        <p className="error" role="alert">
          {error}
        </p>
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

  if (!ranch) {
    return (
      <section className="empty-panel">
        <p className="eyebrow">Administración del rancho</p>
        <h1>Perfil del rancho</h1>
        <p className="intro">
          No hay un rancho activo disponible para editar en este momento.
        </p>
      </section>
    );
  }

  const mutationError =
    updateMutation.error instanceof Error ? updateMutation.error.message : '';
  const errorText = validationError || mutationError;

  return (
    <section className="ranch-profile">
      <div className="title-row">
        <div>
          <p className="eyebrow">Administración · RF-WEB-03</p>
          <h1>Perfil del rancho</h1>
          <p className="intro">
            Actualiza los datos generales y la meta oficial de destete del rancho activo.
          </p>
        </div>
      </div>

      <form className="ranch-form-card" onSubmit={handleSubmit}>
        <div className="ranch-form-head">
          <strong>Datos del rancho</strong>
          <span>ID: {ranch.id}</span>
        </div>

        <div className="ranch-form-body">
          <div className="ranch-form-grid">
            <div className="field">
              <label htmlFor="ranch-name">Nombre del rancho</label>
              <input
                id="ranch-name"
                name="name"
                maxLength={150}
                placeholder="Ej. Rancho Los Sauces"
                value={name}
                disabled={updateMutation.isPending}
                onChange={(e) => {
                  isDirtyRef.current = true;
                  setName(e.target.value);
                  setSavedNotice('');
                }}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="ranch-owner">Propietario</label>
              <input
                id="ranch-owner"
                name="owner"
                maxLength={150}
                placeholder="Ej. Juan Pérez"
                value={owner}
                disabled={updateMutation.isPending}
                onChange={(e) => {
                  isDirtyRef.current = true;
                  setOwner(e.target.value);
                  setSavedNotice('');
                }}
                required
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="ranch-address">Domicilio</label>
            <input
              id="ranch-address"
              name="address"
              placeholder="Ej. Camino Real #45, Tlaquepaque, Jalisco"
              value={address}
              disabled={updateMutation.isPending}
              onChange={(e) => {
                isDirtyRef.current = true;
                setAddress(e.target.value);
                setSavedNotice('');
              }}
              required
            />
          </div>

          <div className="field">
            <label id="weaning-days-label">
              Meta de destete (días_meta_destete)
            </label>
            <p className="field-hint">
              Valor base recomendado: 75 días. Define la alerta operativa de destetes pendientes.
            </p>
            <div
              className="weaning-options"
              role="radiogroup"
              aria-labelledby="weaning-days-label"
            >
              {ALLOWED_WEANING_DAYS.map((days) => {
                const selected = weaningTargetDays === days;
                return (
                  <button
                    key={days}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={updateMutation.isPending}
                    className={selected ? 'weaning-option active' : 'weaning-option'}
                    onClick={() => {
                      isDirtyRef.current = true;
                      setWeaningTargetDays(days);
                      setSavedNotice('');
                    }}
                  >
                    <strong>{days} días</strong>
                    <span>{days === 75 ? 'Base estándar' : days === 60 ? 'Destete temprano' : 'Destete extendido'}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {errorText && (
            <p className="error" role="alert">
              {errorText}
            </p>
          )}

          {savedNotice && !errorText && (
            <p className="success-banner" role="status">
              {savedNotice}
            </p>
          )}

          <div className="ranch-form-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={updateMutation.isPending}
              onClick={() => {
                isDirtyRef.current = false;
                setName(ranch.name ?? '');
                setAddress(ranch.address ?? '');
                setOwner(ranch.owner_name ?? '');
                setWeaningTargetDays(toValidWeaningDays(ranch.weaning_days_target));
                setValidationError('');
                setSavedNotice('');
                updateMutation.reset();
              }}
            >
              Restablecer
            </button>
            <button
              type="submit"
              className="primary save-button"
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Guardando cambios…' : 'Guardar perfil del rancho'}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
