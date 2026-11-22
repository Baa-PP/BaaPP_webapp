import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, getSessionGeneration } from '../../api/client';

export type PermissionKey =
  | 'read_inventory'
  | 'field_capture'
  | 'edit_profile_weights'
  | 'export_data';

export type WorkerPermissions = Record<PermissionKey, boolean>;

export interface RanchWorker {
  id: string;
  ranchId: string;
  username: string;
  active: boolean;
  permissions: Record<string, unknown>;
  createdAt?: string;
}

export const PERMISSION_DEFINITIONS: ReadonlyArray<{
  key: PermissionKey;
  label: string;
  description: string;
}> = [
  {
    key: 'read_inventory',
    label: 'Lectura de inventario',
    description: 'Consultar el rebaño, filtros y reseñas individuales.',
  },
  {
    key: 'field_capture',
    label: 'Captura en campo',
    description: 'Registrar capturas operativas desde campo en BaaPP-app.',
  },
  {
    key: 'edit_profile_weights',
    label: 'Edición de ficha y pesajes',
    description: 'Editar ficha y pesajes (excluye nacimientos bloqueados).',
  },
  {
    key: 'export_data',
    label: 'Exportación',
    description: 'Exportar Sábana oficial .xlsx y reportes del rancho.',
  },
];

const DEFAULT_NEW_PERMISSIONS: WorkerPermissions = {
  read_inventory: true,
  field_capture: false,
  edit_profile_weights: false,
  export_data: false,
};

function extractPermissions(raw?: Record<string, unknown>): WorkerPermissions {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    read_inventory: src.read_inventory === true,
    field_capture: src.field_capture === true,
    edit_profile_weights: src.edit_profile_weights === true,
    export_data: src.export_data === true,
  };
}

function permissionsEqual(a: WorkerPermissions, b: WorkerPermissions): boolean {
  return (
    a.read_inventory === b.read_inventory &&
    a.field_capture === b.field_capture &&
    a.edit_profile_weights === b.edit_profile_weights &&
    a.export_data === b.export_data
  );
}

function normalizeWorker(raw: unknown, fallbackRanchId: string): RanchWorker | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = ((raw as Record<string, unknown>).data ?? raw) as Record<string, unknown>;
  const id = String(obj.id ?? obj.workerId ?? obj.worker_id ?? '').trim();
  const username = String(obj.username ?? '').trim();
  if (!id || !username) return null;
  const perms =
    obj.permissions && typeof obj.permissions === 'object' && !Array.isArray(obj.permissions)
      ? (obj.permissions as Record<string, unknown>)
      : {};
  return {
    id,
    ranchId: String(obj.ranchId ?? obj.ranch_id ?? fallbackRanchId).trim(),
    username,
    active: obj.active !== false,
    permissions: perms,
    createdAt:
      typeof (obj.createdAt ?? obj.created_at) === 'string'
        ? String(obj.createdAt ?? obj.created_at)
        : undefined,
  };
}

function normalizeWorkerList(raw: unknown, fallbackRanchId: string): RanchWorker[] {
  const payload = raw as Record<string, unknown> | unknown[];
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as Record<string, unknown>)?.data)
      ? ((payload as Record<string, unknown>).data as unknown[])
      : Array.isArray((payload as Record<string, unknown>)?.workers)
        ? ((payload as Record<string, unknown>).workers as unknown[])
        : Array.isArray((payload as Record<string, unknown>)?.content)
          ? ((payload as Record<string, unknown>).content as unknown[])
          : [];
  return list
    .map((item) => normalizeWorker(item, fallbackRanchId))
    .filter((w): w is RanchWorker => w !== null);
}

function formatCreatedAt(value?: string): string {
  if (!value) return 'Fecha no disponible';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

interface WorkerManagementProps {
  ranchId: string | null;
  ranchName?: string;
  ranchLoading: boolean;
  ranchError?: string;
  onRetryRanch?: () => void;
}

export function WorkerManagement({
  ranchId,
  ranchName,
  ranchLoading,
  ranchError,
  onRetryRanch,
}: WorkerManagementProps) {
  const qc = useQueryClient();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [newPerms, setNewPerms] = useState<WorkerPermissions>({ ...DEFAULT_NEW_PERMISSIONS });
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');

  const [drafts, setDrafts] = useState<Record<string, WorkerPermissions>>({});
  const [savingPermIds, setSavingPermIds] = useState<Record<string, boolean>>({});
  const [togglingIds, setTogglingIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setDrafts({});
    setSavingPermIds({});
    setTogglingIds({});
    setFormError('');
    setNotice('');
    setActionError('');
  }, [ranchId]);

  const workersQuery = useQuery({
    queryKey: ['workers', ranchId] as const,
    queryFn: async ({ queryKey }) => {
      const targetRanchId = queryKey[1];
      if (!targetRanchId) return [];
      const res = await apiFetch<unknown>(
        `/ranches/${encodeURIComponent(targetRanchId)}/workers`,
        { ranchId: targetRanchId }
      );
      return normalizeWorkerList(res, targetRanchId);
    },
    enabled: Boolean(ranchId),
  });

  const createMutation = useMutation({
    mutationFn: async (payload: {
      ranchId: string;
      username: string;
      password: string;
      permissions: WorkerPermissions;
      sessionGen: number;
    }) => {
      const res = await apiFetch<unknown>(
        `/ranches/${encodeURIComponent(payload.ranchId)}/workers`,
        {
          method: 'POST',
          ranchId: payload.ranchId,
          body: JSON.stringify({
            username: payload.username,
            password: payload.password,
            permissions: payload.permissions,
            active: true,
          }),
        }
      );
      return normalizeWorker(res, payload.ranchId);
    },
    onSuccess: (created, variables) => {
      if (getSessionGeneration() !== variables.sessionGen) return;
      if (created) {
        qc.setQueryData<RanchWorker[]>(['workers', variables.ranchId], (prev = []) => [
          ...prev.filter((w) => w.id !== created.id),
          created,
        ]);
      }
      qc.invalidateQueries({ queryKey: ['workers', variables.ranchId] });
      setUsername('');
      setPassword('');
      setShowPassword(false);
      setNewPerms({ ...DEFAULT_NEW_PERMISSIONS });
      setFormError('');
      setActionError('');
      setNotice(`Cuenta rama "${variables.username}" creada correctamente.`);
    },
    onError: (err, variables) => {
      if (getSessionGeneration() !== variables.sessionGen) return;
      setFormError(
        err instanceof Error ? err.message : 'No se pudo crear la cuenta rama.'
      );
    },
  });

  const patchWorkerMutation = useMutation({
    mutationFn: async (payload: {
      ranchId: string;
      workerId: string;
      username: string;
      kind: 'permissions' | 'status';
      active?: boolean;
      permissions?: Record<string, unknown>;
      sessionGen: number;
    }) => {
      const body: Record<string, unknown> = {};
      if (payload.active !== undefined) body.active = payload.active;
      if (payload.permissions !== undefined) body.permissions = payload.permissions;
      const res = await apiFetch<unknown>(
        `/ranches/${encodeURIComponent(payload.ranchId)}/workers/${encodeURIComponent(payload.workerId)}`,
        {
          method: 'PATCH',
          ranchId: payload.ranchId,
          body: JSON.stringify(body),
        }
      );
      return normalizeWorker(res, payload.ranchId);
    },
    onMutate: (variables) => {
      setActionError('');
      if (variables.kind === 'permissions') {
        setSavingPermIds((prev) => ({ ...prev, [variables.workerId]: true }));
      } else {
        setTogglingIds((prev) => ({ ...prev, [variables.workerId]: true }));
      }
    },
    onSuccess: (updated, variables) => {
      if (getSessionGeneration() !== variables.sessionGen) return;
      if (updated) {
        qc.setQueryData<RanchWorker[]>(['workers', variables.ranchId], (prev = []) =>
          prev.map((w) => (w.id === updated.id ? updated : w))
        );
      }
      qc.invalidateQueries({ queryKey: ['workers', variables.ranchId] });
      if (variables.kind === 'permissions') {
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[variables.workerId];
          return next;
        });
        setNotice(`Permisos de "${variables.username}" actualizados.`);
      } else {
        setNotice(
          variables.active
            ? `Cuenta "${variables.username}" reactivada.`
            : `Cuenta "${variables.username}" desactivada y sesiones revocadas.`
        );
      }
    },
    onError: (err, variables) => {
      if (getSessionGeneration() !== variables.sessionGen) return;
      setActionError(
        err instanceof Error
          ? err.message
          : `No se pudo actualizar la cuenta "${variables.username}".`
      );
    },
    onSettled: (_data, _err, variables) => {
      if (variables.kind === 'permissions') {
        setSavingPermIds((prev) => {
          const next = { ...prev };
          delete next[variables.workerId];
          return next;
        });
      } else {
        setTogglingIds((prev) => {
          const next = { ...prev };
          delete next[variables.workerId];
          return next;
        });
      }
    },
  });

  function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ranchId) return;
    setFormError('');
    setNotice('');

    const trimmedUser = username.trim();
    if (trimmedUser.length < 3 || trimmedUser.length > 100) {
      setFormError('El usuario debe tener entre 3 y 100 caracteres.');
      return;
    }
    if (password.trim().length === 0 || password.length < 8) {
      setFormError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (new TextEncoder().encode(password).length > 72) {
      setFormError('La contraseña no debe exceder 72 bytes en UTF-8.');
      return;
    }

    createMutation.mutate({
      ranchId,
      username: trimmedUser,
      password,
      permissions: { ...newPerms },
      sessionGen: getSessionGeneration(),
    });
  }

  function handleWorkerPermToggle(worker: RanchWorker, key: PermissionKey, checked: boolean) {
    setDrafts((prev) => {
      const current = prev[worker.id] ?? extractPermissions(worker.permissions);
      return {
        ...prev,
        [worker.id]: {
          ...current,
          [key]: checked,
        },
      };
    });
    setNotice('');
  }

  function handleSavePermissions(worker: RanchWorker) {
    if (!ranchId) return;
    const draft = drafts[worker.id] ?? extractPermissions(worker.permissions);
    patchWorkerMutation.mutate({
      ranchId,
      workerId: worker.id,
      username: worker.username,
      kind: 'permissions',
      permissions: {
        ...worker.permissions,
        ...draft,
      },
      sessionGen: getSessionGeneration(),
    });
  }

  function handleToggleActive(worker: RanchWorker) {
    if (!ranchId) return;
    setNotice('');
    patchWorkerMutation.mutate({
      ranchId,
      workerId: worker.id,
      username: worker.username,
      kind: 'status',
      active: !worker.active,
      sessionGen: getSessionGeneration(),
    });
  }

  if (ranchLoading && !ranchId) {
    return (
      <section className="empty-panel">
        <p className="muted">Cargando información del rancho…</p>
      </section>
    );
  }

  if (!ranchId && ranchError) {
    return (
      <section className="empty-panel">
        <p className="eyebrow">Administración · RF-WEB-03</p>
        <h1>Cuentas rama (WORKER_BRANCH)</h1>
        <p className="error" role="alert">
          {ranchError}
        </p>
        {onRetryRanch && (
          <button
            type="button"
            className="secondary-button"
            disabled={ranchLoading}
            onClick={onRetryRanch}
          >
            {ranchLoading ? 'Reintentando…' : 'Reintentar'}
          </button>
        )}
      </section>
    );
  }

  if (!ranchId) {
    return (
      <section className="empty-panel">
        <p className="eyebrow">Administración · RF-WEB-03</p>
        <h1>Cuentas rama (WORKER_BRANCH)</h1>
        <p className="intro">
          No hay un rancho activo disponible para administrar cuentas de trabajadores.
        </p>
      </section>
    );
  }

  const workers = workersQuery.data ?? [];
  const activeCount = workers.filter((w) => w.active).length;

  return (
    <section className="workers-page">
      <div className="title-row">
        <div>
          <p className="eyebrow">
            {ranchName ? `${ranchName} · RF-WEB-03` : 'Administración · RF-WEB-03'}
          </p>
          <h1>Cuentas rama (WORKER_BRANCH)</h1>
          <p className="intro">
            Da de alta encargados, configura sus permisos granulares y desactiva accesos cuando ya no operen en el rancho.
          </p>
        </div>
        <div className="count-card">
          <b>{activeCount}</b>
          <span>{activeCount === 1 ? 'cuenta activa' : 'cuentas activas'}</span>
        </div>
      </div>

      {notice && (
        <p className="success-banner" role="status">
          {notice}
        </p>
      )}

      {actionError && (
        <p className="error" role="alert">
          {actionError}
        </p>
      )}

      <form className="worker-create-card" onSubmit={handleCreateSubmit}>
        <div className="worker-card-head">
          <strong>Nueva cuenta rama</strong>
          <span>Rol asignado: WORKER_BRANCH</span>
        </div>
        <div className="worker-card-body">
          <div className="ranch-form-grid">
            <div className="field">
              <label htmlFor="worker-username">Usuario</label>
              <input
                id="worker-username"
                name="username"
                minLength={3}
                maxLength={100}
                autoComplete="off"
                placeholder="Ej. encargado.corral1"
                value={username}
                disabled={createMutation.isPending}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setFormError('');
                }}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="worker-password">Contraseña inicial</label>
              <div className="password-row">
                <input
                  id="worker-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  disabled={createMutation.isPending}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFormError('');
                  }}
                  required
                />
                <button
                  type="button"
                  className="toggle-password"
                  disabled={createMutation.isPending}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>
          </div>

          <fieldset className="perm-fieldset" disabled={createMutation.isPending}>
            <legend>Permisos iniciales (JSONB)</legend>
            <div className="perm-grid">
              {PERMISSION_DEFINITIONS.map((perm) => (
                <label key={perm.key} className="perm-option">
                  <input
                    type="checkbox"
                    checked={newPerms[perm.key]}
                    onChange={(e) =>
                      setNewPerms((prev) => ({
                        ...prev,
                        [perm.key]: e.target.checked,
                      }))
                    }
                  />
                  <span>
                    <strong>{perm.label}</strong>
                    <small>{perm.description}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {formError && (
            <p className="error" role="alert">
              {formError}
            </p>
          )}

          <div className="ranch-form-actions">
            <button
              type="submit"
              className="primary save-button"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Creando cuenta…' : 'Crear cuenta rama'}
            </button>
          </div>
        </div>
      </form>

      <section className="worker-list-card">
        <div className="worker-card-head">
          <strong>Trabajadores registrados</strong>
          <span>
            {workersQuery.isFetching
              ? 'Actualizando…'
              : `${workers.length} ${workers.length === 1 ? 'cuenta' : 'cuentas'}`}
          </span>
        </div>

        {workersQuery.isError && (
          <div className="worker-list-error">
            <p className="error" role="alert">
              {workersQuery.error instanceof Error
                ? workersQuery.error.message
                : 'No se pudo cargar la lista de cuentas rama.'}
            </p>
            <button
              type="button"
              className="secondary-button"
              disabled={workersQuery.isFetching}
              onClick={() => {
                void workersQuery.refetch();
              }}
            >
              {workersQuery.isFetching ? 'Reintentando…' : 'Reintentar'}
            </button>
          </div>
        )}

        {workersQuery.isLoading && workers.length === 0 ? (
          <div className="empty">
            <p className="muted">Cargando cuentas rama del rancho…</p>
          </div>
        ) : !workersQuery.isError && workers.length === 0 ? (
          <div className="empty">
            <h3>Aún no hay cuentas rama</h3>
            <p>Crea la primera cuenta arriba para asignar permisos a un encargado del rancho.</p>
          </div>
        ) : (
          <div className="worker-items">
            {workers.map((worker) => {
              const serverPerms = extractPermissions(worker.permissions);
              const currentPerms = drafts[worker.id] ?? serverPerms;
              const isDirty = !permissionsEqual(currentPerms, serverPerms);
              const isSavingPerms = Boolean(savingPermIds[worker.id]);
              const isToggling = Boolean(togglingIds[worker.id]);

              return (
                <article
                  key={worker.id}
                  className={worker.active ? 'worker-item' : 'worker-item inactive'}
                >
                  <div className="worker-item-head">
                    <div className="worker-identity">
                      <h3>{worker.username}</h3>
                      <div className="worker-meta">
                        <span
                          className={
                            worker.active ? 'state active' : 'state deceased'
                          }
                        >
                          {worker.active ? 'Activa' : 'Desactivada'}
                        </span>
                        <span className="worker-date">
                          Alta: {formatCreatedAt(worker.createdAt)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className={
                        worker.active ? 'danger-outline-button' : 'secondary-button'
                      }
                      disabled={isToggling}
                      onClick={() => handleToggleActive(worker)}
                    >
                      {isToggling
                        ? 'Actualizando…'
                        : worker.active
                          ? 'Desactivar cuenta'
                          : 'Reactivar cuenta'}
                    </button>
                  </div>

                  <fieldset className="perm-fieldset" disabled={isSavingPerms}>
                    <legend>Permisos granulares</legend>
                    <div className="perm-grid">
                      {PERMISSION_DEFINITIONS.map((perm) => (
                        <label key={perm.key} className="perm-option">
                          <input
                            type="checkbox"
                            checked={currentPerms[perm.key]}
                            onChange={(e) =>
                              handleWorkerPermToggle(worker, perm.key, e.target.checked)
                            }
                          />
                          <span>
                            <strong>{perm.label}</strong>
                            <small>{perm.description}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <div className="worker-item-actions">
                    {isDirty && (
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={isSavingPerms}
                        onClick={() => {
                          setDrafts((prev) => {
                            const next = { ...prev };
                            delete next[worker.id];
                            return next;
                          });
                        }}
                      >
                        Descartar cambios
                      </button>
                    )}
                    <button
                      type="button"
                      className="primary save-button"
                      disabled={!isDirty || isSavingPerms}
                      onClick={() => handleSavePermissions(worker)}
                    >
                      {isSavingPerms ? 'Guardando permisos…' : 'Guardar permisos'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
