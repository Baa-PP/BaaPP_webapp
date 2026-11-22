import { FormEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../api/client';

export interface AnimalSummary {
  id: string;
  ranchId?: string;
  folioInterno: string;
  siniigaChip?: string | null;
  registroUno?: string | null;
  sex?: string;
  lifeStage?: string;
  reproductiveStatus?: string;
  breed?: string;
  color?: string;
  birthDate?: string;
  ageDays?: number;
  criador?: string | null;
  propietario?: string;
  latestWeightKg?: number | null;
  latestWeightDate?: string | null;
  status?: string;
  mortalityDate?: string | null;
  mortalityCause?: string | null;
}

export interface AnimalPage {
  items: AnimalSummary[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface InventoryFilters {
  q: string;
  sexo: string;
  etapa_vida: string;
  estado_reproductivo: string;
  raza: string;
  estado: string;
}

const EMPTY_FILTERS: InventoryFilters = {
  q: '',
  sexo: '',
  etapa_vida: '',
  estado_reproductivo: '',
  raza: '',
  estado: '',
};

const PAGE_SIZES = [20, 50, 100] as const;

const LIFE_STAGES = [
  'LAMB_LACTATING',
  'LAMB_FATTENING',
  'EWE_REPLACEMENT',
  'ADULT',
] as const;

const REPRODUCTIVE_STATUSES = [
  'EMPTY',
  'PREGNANT',
  'LACTATING',
  'STUD_RAM',
] as const;

const ANIMAL_STATUSES = ['ACTIVE', 'SOLD', 'DECEASED'] as const;

const LABELS: Record<string, string> = {
  FEMALE: 'Hembra',
  MALE: 'Macho',
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
};

function labelOf(value?: string | null): string {
  if (!value) return '—';
  return LABELS[value] || value.replace(/_/g, ' ').toLowerCase();
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value + (value.length === 10 ? 'T00:00:00' : ''));
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed);
}

function buildAnimalsQueryString(
  filters: InventoryFilters,
  page: number,
  size: number
): string {
  const params = new URLSearchParams();
  const q = filters.q.trim();
  const raza = filters.raza.trim();
  if (q) params.set('q', q);
  if (filters.sexo) params.set('sexo', filters.sexo);
  if (filters.etapa_vida) params.set('etapa_vida', filters.etapa_vida);
  if (filters.estado_reproductivo) {
    params.set('estado_reproductivo', filters.estado_reproductivo);
  }
  if (raza) params.set('raza', raza);
  if (filters.estado) params.set('estado', filters.estado);
  params.set('page', String(page));
  params.set('size', String(size));
  return `?${params.toString()}`;
}

function normalizeAnimal(raw: unknown): AnimalSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const id = String(a.id ?? a.animalId ?? a.animal_id ?? '').trim();
  if (!id) return null;

  const rawWeight = a.latestWeightKg ?? a.latest_weight_kg ?? a.ultimo_peso_kg;
  const parsedWeight =
    rawWeight !== null && rawWeight !== undefined && rawWeight !== ''
      ? Number(rawWeight)
      : null;

  const rawAge = a.ageDays ?? a.age_days ?? a.edad_dias;
  const parsedAge =
    rawAge !== null && rawAge !== undefined && rawAge !== ''
      ? Number(rawAge)
      : undefined;

  return {
    id,
    ranchId:
      typeof (a.ranchId ?? a.ranch_id) === 'string'
        ? String(a.ranchId ?? a.ranch_id)
        : undefined,
    folioInterno: String(
      a.folioInterno ?? a.folio_interno ?? ''
    ).trim(),
    siniigaChip:
      typeof (a.siniigaChip ?? a.siniiga_chip ?? a.chip_siniiga) === 'string'
        ? String(a.siniigaChip ?? a.siniiga_chip ?? a.chip_siniiga)
        : null,
    registroUno:
      typeof (a.registroUno ?? a.registro_uno) === 'string'
        ? String(a.registroUno ?? a.registro_uno)
        : null,
    sex: typeof (a.sex ?? a.sexo) === 'string' ? String(a.sex ?? a.sexo) : undefined,
    lifeStage:
      typeof (a.lifeStage ?? a.life_stage ?? a.etapa_vida) === 'string'
        ? String(a.lifeStage ?? a.life_stage ?? a.etapa_vida)
        : undefined,
    reproductiveStatus:
      typeof (a.reproductiveStatus ?? a.reproductive_status ?? a.estado_reproductivo) === 'string'
        ? String(a.reproductiveStatus ?? a.reproductive_status ?? a.estado_reproductivo)
        : undefined,
    breed: typeof (a.breed ?? a.raza) === 'string' ? String(a.breed ?? a.raza) : undefined,
    color: typeof a.color === 'string' ? a.color : undefined,
    birthDate:
      typeof (a.birthDate ?? a.birth_date ?? a.fecha_nacimiento) === 'string'
        ? String(a.birthDate ?? a.birth_date ?? a.fecha_nacimiento)
        : undefined,
    ageDays: parsedAge !== undefined && Number.isFinite(parsedAge) ? parsedAge : undefined,
    criador:
      typeof (a.criador ?? a.criador_name) === 'string'
        ? String(a.criador ?? a.criador_name)
        : null,
    propietario:
      typeof (a.propietario ?? a.owner_name ?? a.ranch_name) === 'string'
        ? String(a.propietario ?? a.owner_name ?? a.ranch_name)
        : undefined,
    latestWeightKg:
      parsedWeight !== null && Number.isFinite(parsedWeight) ? parsedWeight : null,
    latestWeightDate:
      typeof (a.latestWeightDate ?? a.latest_weight_date ?? a.fecha_ultimo_peso) === 'string'
        ? String(a.latestWeightDate ?? a.latest_weight_date ?? a.fecha_ultimo_peso)
        : null,
    status:
      typeof (a.status ?? a.estado) === 'string'
        ? String(a.status ?? a.estado)
        : undefined,
    mortalityDate:
      typeof (a.mortalityDate ?? a.mortality_date ?? a.fecha_muerte) === 'string'
        ? String(a.mortalityDate ?? a.mortality_date ?? a.fecha_muerte)
        : null,
    mortalityCause:
      typeof (a.mortalityCause ?? a.mortality_cause ?? a.causa_muerte) === 'string'
        ? String(a.mortalityCause ?? a.mortality_cause ?? a.causa_muerte)
        : null,
  };
}

function normalizeAnimalPage(
  raw: unknown,
  requestedPage: number,
  requestedSize: number
): AnimalPage {
  const unwrapped =
    raw && typeof raw === 'object' && 'data' in (raw as Record<string, unknown>)
      ? (raw as Record<string, unknown>).data
      : raw;

  if (Array.isArray(unwrapped)) {
    const items = unwrapped
      .map(normalizeAnimal)
      .filter((item): item is AnimalSummary => item !== null);
    return {
      items,
      page: 0,
      size: requestedSize,
      totalElements: items.length,
      totalPages: items.length > 0 ? 1 : 0,
    };
  }

  const obj = (unwrapped && typeof unwrapped === 'object'
    ? unwrapped
    : {}) as Record<string, unknown>;
  const rawItems =
    (Array.isArray(obj.items) && obj.items) ||
    (Array.isArray(obj.content) && obj.content) ||
    (Array.isArray(obj.animals) && obj.animals) ||
    (Array.isArray(obj.results) && obj.results) ||
    [];

  const items = rawItems
    .map(normalizeAnimal)
    .filter((item): item is AnimalSummary => item !== null);

  const totalElements = Number.isFinite(Number(obj.totalElements))
    ? Number(obj.totalElements)
    : items.length;
  const page = Number.isFinite(Number(obj.page)) ? Number(obj.page) : requestedPage;
  const size =
    Number.isFinite(Number(obj.size)) && Number(obj.size) > 0
      ? Number(obj.size)
      : requestedSize;
  const totalPages = Number.isFinite(Number(obj.totalPages))
    ? Number(obj.totalPages)
    : totalElements > 0
      ? Math.ceil(totalElements / size)
      : 0;

  return {
    items,
    page,
    size,
    totalElements,
    totalPages,
  };
}

function countActiveFilters(filters: InventoryFilters): number {
  let count = 0;
  if (filters.q.trim()) count += 1;
  if (filters.sexo) count += 1;
  if (filters.etapa_vida) count += 1;
  if (filters.estado_reproductivo) count += 1;
  if (filters.raza.trim()) count += 1;
  if (filters.estado) count += 1;
  return count;
}

interface InventoryViewProps {
  username: string;
  multiRanch: boolean;
  activeRanchId: string | null;
  ranchName?: string;
  ranchesLoading: boolean;
  ranchesError?: string;
  onRetryRanches?: () => void;
}

export function InventoryView({
  username,
  multiRanch,
  activeRanchId,
  ranchName,
  ranchesLoading,
  ranchesError,
  onRetryRanches,
}: InventoryViewProps) {
  const [draft, setDraft] = useState<InventoryFilters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<InventoryFilters>(EMPTY_FILTERS);
  const [pageState, setPageState] = useState<{ ranchId: string | null; page: number }>({
    ranchId: activeRanchId,
    page: 0,
  });
  const [size, setSize] = useState<number>(20);

  // Synchronously resolve page 0 whenever activeRanchId changes to avoid out-of-bounds queries
  const page = pageState.ranchId === activeRanchId ? pageState.page : 0;
  function setPage(updater: number | ((prev: number) => number)) {
    setPageState((prev) => {
      const current = prev.ranchId === activeRanchId ? prev.page : 0;
      const next = typeof updater === 'function' ? updater(current) : updater;
      return { ranchId: activeRanchId, page: next };
    });
  }

  const canQueryAnimals = !multiRanch || Boolean(activeRanchId);

  const animalsQuery = useQuery({
    queryKey: ['animals', username, activeRanchId, applied, page, size] as const,
    queryFn: async ({ queryKey }) => {
      const ranchId = queryKey[2];
      const filters = queryKey[3];
      const targetPage = queryKey[4];
      const targetSize = queryKey[5];
      const qs = buildAnimalsQueryString(filters, targetPage, targetSize);
      const res = await apiFetch<unknown>(`/animals${qs}`, {
        ranchId: ranchId ?? undefined,
      });
      return normalizeAnimalPage(res, targetPage, targetSize);
    },
    enabled: canQueryAnimals,
  });

  function handleApplyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(0);
    setApplied({ ...draft });
  }

  function handleResetFilters() {
    setDraft(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(0);
  }

  if (multiRanch && !activeRanchId) {
    if (ranchesLoading) {
      return (
        <section className="empty-panel">
          <p className="muted">Cargando ranchos afiliados…</p>
        </section>
      );
    }
    if (ranchesError) {
      return (
        <section className="empty-panel">
          <p className="eyebrow">Inventario del rebaño</p>
          <h1>No se pudieron cargar los ranchos</h1>
          <p className="error" role="alert">
            {ranchesError}
          </p>
          {onRetryRanches && (
            <button
              type="button"
              className="secondary-button"
              onClick={onRetryRanches}
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
          Selecciona un rancho afiliado en la barra superior para consultar su inventario.
        </p>
      </section>
    );
  }

  const pageData = animalsQuery.data;
  const animals = pageData?.items ?? [];
  const totalElements = pageData?.totalElements ?? 0;
  const totalPages = pageData?.totalPages ?? 0;
  const currentPage = pageData?.page ?? page;
  const activeFilterCount = countActiveFilters(applied);
  const loading = animalsQuery.isFetching;
  const error =
    animalsQuery.error instanceof Error
      ? animalsQuery.error.message
      : animalsQuery.isError
        ? 'No se pudo cargar el inventario del rebaño.'
        : '';

  const rangeStart = animals.length === 0 ? 0 : currentPage * size + 1;
  const rangeEnd =
    animals.length === 0
      ? 0
      : Math.min(totalElements, currentPage * size + animals.length);

  return (
    <>
      <div className="title-row">
        <div>
          <p className="eyebrow">
            {ranchName ? `${ranchName} · Registro individual` : 'Rebaño · Registro individual'}
          </p>
          <h1>Inventario del rebaño</h1>
          <p className="intro">
            Busca por arete interno, chip SINIIGA o registro UNO y combina filtros del rancho activo.
          </p>
        </div>
        <div className="count-card">
          <b>{totalElements}</b>
          <span>{totalElements === 1 ? 'ejemplar' : 'ejemplares'}</span>
        </div>
      </div>

      <form className="filters" onSubmit={handleApplyFilters}>
        <div className="filter-title">
          <div className="filter-title-left">
            <b>Buscar y filtrar</b>
            {activeFilterCount > 0 && (
              <span className="filter-count-badge">
                {activeFilterCount} {activeFilterCount === 1 ? 'filtro activo' : 'filtros activos'}
              </span>
            )}
          </div>
          <button
            type="button"
            className="link-button"
            onClick={handleResetFilters}
          >
            Limpiar filtros
          </button>
        </div>

        <div className="search-bar-row">
          <label className="search-omnibox">
            <span>Buscar por arete interno, chip SINIIGA (484…) o registro UNO</span>
            <input
              type="search"
              name="q"
              placeholder="Ej. 79, 484000123456789 o 268309MM-RP"
              value={draft.q}
              onChange={(e) => setDraft((prev) => ({ ...prev, q: e.target.value }))}
            />
          </label>
        </div>

        <div className="facets">
          <label>
            Sexo
            <select
              name="sexo"
              value={draft.sexo}
              onChange={(e) => setDraft((prev) => ({ ...prev, sexo: e.target.value }))}
            >
              <option value="">Todos</option>
              <option value="FEMALE">Hembra</option>
              <option value="MALE">Macho</option>
            </select>
          </label>

          <label>
            Etapa de vida
            <select
              name="etapa_vida"
              value={draft.etapa_vida}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, etapa_vida: e.target.value }))
              }
            >
              <option value="">Todas</option>
              {LIFE_STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {labelOf(stage)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Estado reproductivo
            <select
              name="estado_reproductivo"
              value={draft.estado_reproductivo}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  estado_reproductivo: e.target.value,
                }))
              }
            >
              <option value="">Todos</option>
              {REPRODUCTIVE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {labelOf(status)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Raza
            <input
              name="raza"
              placeholder="Ej. Katahdin, Dorper"
              value={draft.raza}
              onChange={(e) => setDraft((prev) => ({ ...prev, raza: e.target.value }))}
            />
          </label>

          <label>
            Estado
            <select
              name="estado"
              value={draft.estado}
              onChange={(e) => setDraft((prev) => ({ ...prev, estado: e.target.value }))}
            >
              <option value="">Todos</option>
              {ANIMAL_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {labelOf(status)}
                </option>
              ))}
            </select>
          </label>

          <button type="submit" className="primary" disabled={loading}>
            {loading ? 'Buscando…' : 'Aplicar filtros'}
          </button>
        </div>
      </form>

      <section className="table">
        <div className="table-head">
          <b>Ejemplares</b>
          <span>
            {loading
              ? 'Actualizando…'
              : totalElements === 0 || animals.length === 0
                ? `${totalElements} registros`
                : `${rangeStart}–${rangeEnd} de ${totalElements} registros`}
          </span>
          <small>{ranchName || 'Datos del rancho activo'}</small>
        </div>

        {error && (
          <div className="table-error-box">
            <p className="error" role="alert">
              {error}
            </p>
            <button
              type="button"
              className="secondary-button"
              disabled={loading}
              onClick={() => {
                void animalsQuery.refetch();
              }}
            >
              {loading ? 'Reintentando…' : 'Reintentar'}
            </button>
          </div>
        )}

        {animalsQuery.isLoading && animals.length === 0 ? (
          <div className="empty">
            <p className="muted">Cargando inventario del rancho activo…</p>
          </div>
        ) : !loading && !error && animals.length === 0 ? (
          <div className="empty">
            <h3>No encontramos ejemplares</h3>
            <p>
              {currentPage > 0 && totalElements > 0
                ? 'Esta página ya no contiene ejemplares disponibles.'
                : activeFilterCount > 0
                  ? 'Ningún ejemplar del rancho activo coincide con la búsqueda o filtros aplicados.'
                  : 'Este rancho aún no tiene ejemplares registrados en el inventario.'}
            </p>
            {currentPage > 0 && totalElements > 0 ? (
              <button
                type="button"
                className="secondary-button empty-reset-button"
                onClick={() => setPage(0)}
              >
                Volver a la página 1
              </button>
            ) : activeFilterCount > 0 ? (
              <button
                type="button"
                className="secondary-button empty-reset-button"
                onClick={handleResetFilters}
              >
                Limpiar filtros
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Arete interno</th>
                    <th>Identificación oficial</th>
                    <th>Sexo / Raza</th>
                    <th>Etapa y reproducción</th>
                    <th>Último peso</th>
                    <th>Estado</th>
                    <th>Reseña</th>
                  </tr>
                </thead>
                <tbody>
                  {animals.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <a
                          className="animal-link"
                          href={`#/inventario/${encodeURIComponent(a.id)}`}
                        >
                          {a.folioInterno || 'Sin arete'}
                          <small>Nació {formatDate(a.birthDate)}</small>
                        </a>
                      </td>
                      <td>
                        {a.siniigaChip || '—'}
                        <small>UNO · {a.registroUno || '—'}</small>
                      </td>
                      <td>
                        <span
                          className={
                            'sex' +
                            (a.sex === 'FEMALE'
                              ? ' female'
                              : a.sex === 'MALE'
                                ? ' male'
                                : '')
                          }
                        >
                          {a.sex === 'FEMALE'
                            ? '♀ Hembra'
                            : a.sex === 'MALE'
                              ? '♂ Macho'
                              : 'Sin dato'}
                        </span>
                        <small>
                          {a.breed || 'Raza sin especificar'}
                          {a.color ? ` · ${a.color}` : ''}
                        </small>
                      </td>
                      <td>
                        {labelOf(a.lifeStage)}
                        <small>{labelOf(a.reproductiveStatus)}</small>
                      </td>
                      <td>
                        {a.latestWeightKg !== null && a.latestWeightKg !== undefined
                          ? `${a.latestWeightKg.toFixed(1)} kg`
                          : '—'}
                        <small>
                          {a.latestWeightDate ? formatDate(a.latestWeightDate) : 'Sin pesaje'}
                        </small>
                      </td>
                      <td>
                        <span
                          className={`state ${String(a.status || '').toLowerCase()}`}
                        >
                          {labelOf(a.status)}
                        </span>
                        {a.status === 'DECEASED' && a.mortalityDate && (
                          <small>{formatDate(a.mortalityDate)}</small>
                        )}
                      </td>
                      <td>
                        <a
                          className="open"
                          aria-label={`Abrir reseña de ${a.folioInterno || a.id}`}
                          href={`#/inventario/${encodeURIComponent(a.id)}`}
                        >
                          Ver →
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalElements > 0 && (
              <div className="pagination-bar">
                <label className="page-size-control">
                  <span>Por página</span>
                  <select
                    aria-label="Ejemplares por página"
                    value={size}
                    onChange={(e) => {
                      setSize(Number(e.target.value));
                      setPage(0);
                    }}
                  >
                    {PAGE_SIZES.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="pagination-actions">
                  <span className="pagination-status">
                    Página {totalPages === 0 ? 0 : currentPage + 1} de {totalPages}
                  </span>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={currentPage <= 0 || loading}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    ← Anterior
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={currentPage + 1 >= totalPages || loading}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
