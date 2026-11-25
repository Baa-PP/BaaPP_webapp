import type { Edge, Node } from '@xyflow/react';
import { apiFetch } from '../../api/client';

export type PedigreeSex = 'FEMALE' | 'MALE' | 'UNKNOWN';
export type PedigreeLineage = 'PATERNAL' | 'MATERNAL';
export type PedigreeStatus = 'ACTIVE' | 'SOLD' | 'DECEASED' | 'UNKNOWN';
export type PedigreeGenerations = 3 | 4;

export interface PedigreeSubject {
  id: string;
  folioInterno: string;
  registroUno: string | null;
  sex: PedigreeSex;
  breed: string | null;
  color: string | null;
  breeder: string | null;
  birthDate: string | null;
  status: PedigreeStatus;
  externalSireFolio: string | null;
  externalDamFolio: string | null;
}

export interface PedigreeAncestor {
  generation: number;
  path: string;
  relationship: string;
  lineage: PedigreeLineage;
  registered: boolean;
  animalId: string | null;
  folioInterno: string;
  registroUno: string | null;
  sex: PedigreeSex;
  breed: string | null;
  color: string | null;
  breeder: string | null;
  birthDate: string | null;
  status: PedigreeStatus | null;
}

export interface PedigreeOffspring {
  id: string;
  folioInterno: string;
  registroUno: string | null;
  sex: PedigreeSex;
  birthDate: string | null;
  status: PedigreeStatus;
  deathDate: string | null;
}

export interface PedigreeData {
  subject: PedigreeSubject;
  generations: number;
  ancestors: PedigreeAncestor[];
  offspring: PedigreeOffspring[];
}

export type PedigreeNodeKind = 'subject' | 'ancestor' | 'external' | 'missing';

export type PedigreeFlowNodeData = {
  kind: PedigreeNodeKind;
  path: string;
  generation: number;
  relationship: string;
  lineage: PedigreeLineage | null;
  registered: boolean;
  animalId: string | null;
  folioInterno: string;
  registroUno: string | null;
  sex: PedigreeSex;
  breed: string | null;
  color: string | null;
  breeder: string | null;
  birthDate: string | null;
  status: PedigreeStatus | null;
  offspringCount?: number;
};

export type PedigreeFlowNode = Node<PedigreeFlowNodeData, 'pedigreeNode'>;

export interface PedigreeFlowGraph {
  nodes: PedigreeFlowNode[];
  edges: Edge[];
  maxDepth: number;
  registeredAncestorCount: number;
  externalAncestorCount: number;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asBooleanOrNull(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }
  return null;
}

function asPositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function normalizeSex(raw: unknown, fallbackPath?: string): PedigreeSex {
  const s = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (s === 'FEMALE' || s === 'HEMBRA' || s === 'F' || s === 'H') return 'FEMALE';
  if (s === 'MALE' || s === 'MACHO' || s === 'M') return 'MALE';
  if (fallbackPath) {
    const last = fallbackPath[fallbackPath.length - 1];
    if (last === 'M') return 'FEMALE';
    if (last === 'P') return 'MALE';
  }
  return 'UNKNOWN';
}

function normalizeStatus(raw: unknown): PedigreeStatus {
  const s = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (s === 'ACTIVE' || s === 'ACTIVO') return 'ACTIVE';
  if (s === 'SOLD' || s === 'VENDIDO') return 'SOLD';
  if (s === 'DECEASED' || s === 'FALLECIDO' || s === 'MUERTO') return 'DECEASED';
  return 'UNKNOWN';
}

function normalizePath(raw: unknown): string | null {
  const str = asNonEmptyString(raw);
  if (!str) return null;
  const cleaned = str.toUpperCase().replace(/[^PM]/g, '');
  return cleaned.length > 0 ? cleaned : null;
}

function normalizeLineage(raw: unknown, path: string): PedigreeLineage {
  const s = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (s === 'PATERNAL' || s === 'PATERNA' || s === 'P') return 'PATERNAL';
  if (s === 'MATERNAL' || s === 'MATERNA' || s === 'M') return 'MATERNAL';
  return path.startsWith('P') ? 'PATERNAL' : 'MATERNAL';
}

export function defaultRelationshipForPath(path: string, sex?: PedigreeSex): string {
  const effectiveSex =
    sex && sex !== 'UNKNOWN'
      ? sex
      : path.endsWith('M')
        ? 'FEMALE'
        : path.endsWith('P')
          ? 'MALE'
          : 'UNKNOWN';
  const isFemale = effectiveSex === 'FEMALE';

  switch (path.length) {
    case 1:
      return isFemale ? 'Madre' : 'Padre';
    case 2:
      return isFemale ? 'Abuela' : 'Abuelo';
    case 3:
      return isFemale ? 'Bisabuela' : 'Bisabuelo';
    case 4:
      return isFemale ? 'Tatarabuela' : 'Tatarabuelo';
    default:
      return `Ancestro (Gen ${path.length})`;
  }
}

export function generationLabel(generation: number): string {
  switch (generation) {
    case 0:
      return 'Ejemplar';
    case 1:
      return 'Padres (Gen 1)';
    case 2:
      return 'Abuelos (Gen 2)';
    case 3:
      return 'Bisabuelos (Gen 3)';
    case 4:
      return 'Tatarabuelos (Gen 4)';
    default:
      return `Generación ${generation}`;
  }
}

function parseDateMs(value?: string | null): number {
  if (!value) return NaN;
  const parsed = new Date(value + (value.length === 10 ? 'T00:00:00' : ''));
  return parsed.getTime();
}

export function normalizePedigreeResponse(
  raw: unknown,
  fallbackSubject?: Partial<PedigreeSubject>
): PedigreeData {
  const unwrapped =
    raw && typeof raw === 'object' && 'data' in (raw as Record<string, unknown>)
      ? (raw as Record<string, unknown>).data
      : raw;
  const root = (
    unwrapped && typeof unwrapped === 'object' ? unwrapped : {}
  ) as Record<string, unknown>;

  const rawSubject = (
    root.subject && typeof root.subject === 'object'
      ? root.subject
      : root.animal && typeof root.animal === 'object'
        ? root.animal
        : {}
  ) as Record<string, unknown>;

  const subject: PedigreeSubject = {
    id:
      asNonEmptyString(rawSubject.id ?? rawSubject.animalId ?? rawSubject.animal_id) ??
      fallbackSubject?.id ??
      '',
    folioInterno:
      asNonEmptyString(rawSubject.folioInterno ?? rawSubject.folio_interno) ??
      fallbackSubject?.folioInterno ??
      'Sin folio',
    registroUno:
      asNonEmptyString(
        rawSubject.registroUno ??
          rawSubject.registro_uno ??
          rawSubject.folioUno ??
          rawSubject.folio_uno
      ) ??
      fallbackSubject?.registroUno ??
      null,
    sex: normalizeSex(rawSubject.sex ?? rawSubject.sexo ?? fallbackSubject?.sex),
    breed:
      asNonEmptyString(rawSubject.breed ?? rawSubject.raza) ??
      fallbackSubject?.breed ??
      null,
    color:
      asNonEmptyString(rawSubject.color) ??
      fallbackSubject?.color ??
      null,
    breeder:
      asNonEmptyString(
        rawSubject.breeder ??
          rawSubject.criador ??
          rawSubject.criadorName ??
          rawSubject.criador_name
      ) ??
      fallbackSubject?.breeder ??
      null,
    birthDate:
      asNonEmptyString(rawSubject.birthDate ?? rawSubject.birth_date ?? rawSubject.fecha_nacimiento) ??
      fallbackSubject?.birthDate ??
      null,
    status: normalizeStatus(rawSubject.status ?? rawSubject.estado ?? fallbackSubject?.status),
    externalSireFolio:
      asNonEmptyString(
        rawSubject.externalSireFolio ??
          rawSubject.external_sire_folio ??
          rawSubject.folio_padre_externo
      ) ??
      fallbackSubject?.externalSireFolio ??
      null,
    externalDamFolio:
      asNonEmptyString(
        rawSubject.externalDamFolio ??
          rawSubject.external_dam_folio ??
          rawSubject.folio_madre_externo
      ) ??
      fallbackSubject?.externalDamFolio ??
      null,
  };

  const generations = asPositiveInt(root.generations ?? root.generaciones) ?? 3;

  const rawAncestors = Array.isArray(root.ancestors)
    ? root.ancestors
    : Array.isArray(root.ancestros)
      ? root.ancestros
      : [];

  const ancestorByPath = new Map<string, PedigreeAncestor>();

  for (const item of rawAncestors) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const path = normalizePath(row.path ?? row.ruta);
    if (!path) continue;

    const generation = asPositiveInt(row.generation ?? row.generacion) ?? path.length;
    const animalId = asNonEmptyString(
      row.animalId ?? row.animal_id ?? row.ancestro_id ?? row.id
    );
    const explicitRegistered = asBooleanOrNull(row.registered ?? row.registrado);
    const registered = explicitRegistered !== null ? explicitRegistered : Boolean(animalId);
    const folioInterno =
      asNonEmptyString(row.folioInterno ?? row.folio_interno ?? row.folio) ??
      (registered ? 'Sin folio' : 'Externo sin folio');
    const sex = normalizeSex(row.sex ?? row.sexo, path);
    const lineage = normalizeLineage(row.lineage ?? row.linea, path);
    const relationship =
      asNonEmptyString(row.relationship ?? row.parentesco) ??
      defaultRelationshipForPath(path, sex);

    const parsed: PedigreeAncestor = {
      generation,
      path,
      relationship,
      lineage,
      registered: registered && Boolean(animalId),
      animalId: registered ? animalId : null,
      folioInterno,
      registroUno: asNonEmptyString(
        row.registroUno ?? row.registro_uno ?? row.folioUno ?? row.folio_uno
      ),
      sex,
      breed: asNonEmptyString(row.breed ?? row.raza),
      color: asNonEmptyString(row.color),
      breeder: asNonEmptyString(
        row.breeder ?? row.criador ?? row.criadorName ?? row.criador_name
      ),
      birthDate: asNonEmptyString(
        row.birthDate ?? row.birth_date ?? row.fecha_nacimiento
      ),
      status:
        row.status !== undefined || row.estado !== undefined
          ? normalizeStatus(row.status ?? row.estado)
          : null,
    };

    const existing = ancestorByPath.get(path);
    // Prefer a registered ancestor entry over a duplicate external placeholder for the same path
    if (!existing || (!existing.registered && parsed.registered)) {
      ancestorByPath.set(path, parsed);
    }
  }

  // Defensively synthesize direct external sire/dam if backend omitted them from ancestors[]
  if (subject.externalSireFolio && !ancestorByPath.has('P')) {
    ancestorByPath.set('P', {
      generation: 1,
      path: 'P',
      relationship: 'Padre',
      lineage: 'PATERNAL',
      registered: false,
      animalId: null,
      folioInterno: subject.externalSireFolio,
      registroUno: null,
      sex: 'MALE',
      breed: null,
      color: null,
      breeder: null,
      birthDate: null,
      status: null,
    });
  }

  if (subject.externalDamFolio && !ancestorByPath.has('M')) {
    ancestorByPath.set('M', {
      generation: 1,
      path: 'M',
      relationship: 'Madre',
      lineage: 'MATERNAL',
      registered: false,
      animalId: null,
      folioInterno: subject.externalDamFolio,
      registroUno: null,
      sex: 'FEMALE',
      breed: null,
      color: null,
      breeder: null,
      birthDate: null,
      status: null,
    });
  }

  const ancestors = Array.from(ancestorByPath.values()).sort((a, b) => {
    if (a.generation !== b.generation) return a.generation - b.generation;
    return a.path.localeCompare(b.path);
  });

  const rawOffspring = Array.isArray(root.offspring)
    ? root.offspring
    : Array.isArray(root.crias)
      ? root.crias
      : Array.isArray(root.descendants)
        ? root.descendants
        : [];

  const offspringById = new Map<string, PedigreeOffspring>();
  for (const item of rawOffspring) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = asNonEmptyString(row.id ?? row.animalId ?? row.animal_id);
    if (!id) continue;
    offspringById.set(id, {
      id,
      folioInterno:
        asNonEmptyString(row.folioInterno ?? row.folio_interno) ?? 'Sin folio',
      registroUno: asNonEmptyString(row.registroUno ?? row.registro_uno),
      sex: normalizeSex(row.sex ?? row.sexo),
      birthDate: asNonEmptyString(
        row.birthDate ?? row.birth_date ?? row.fecha_nacimiento
      ),
      status: normalizeStatus(row.status ?? row.estado),
      deathDate: asNonEmptyString(
        row.deathDate ?? row.death_date ?? row.fecha_muerte ?? row.mortalityDate
      ),
    });
  }

  const offspring = Array.from(offspringById.values()).sort((a, b) => {
    const ta = parseDateMs(a.birthDate);
    const tb = parseDateMs(b.birthDate);
    const aValid = Number.isFinite(ta);
    const bValid = Number.isFinite(tb);
    if (aValid !== bValid) return aValid ? -1 : 1;
    if (aValid && bValid && ta !== tb) return tb - ta; // newest first
    return a.folioInterno.localeCompare(b.folioInterno);
  });

  return {
    subject,
    generations,
    ancestors,
    offspring,
  };
}

const COLUMN_SPACING_X = 320;
const LEAF_STEP_Y = 210;

function computeSlotY(path: string, maxDepth: number): number {
  const depth = path.length;
  let index = 0;
  for (let i = 0; i < depth; i += 1) {
    index = index * 2 + (path[i] === 'M' ? 1 : 0);
  }
  const span = Math.pow(2, Math.max(0, maxDepth - depth));
  const centerSlot = index * span + (span - 1) / 2;
  return Math.round(centerSlot * LEAF_STEP_Y);
}

/**
 * Construye el grafo determinista y sin traslapes para @xyflow/react.
 * Columna izquierda = ejemplar (Gen 0); columnas hacia la derecha = Gen 1..maxGenerations.
 * Rama superior = línea paterna (P), rama inferior = línea materna (M).
 */
export function buildPedigreeFlowGraph(
  pedigree: PedigreeData,
  maxGenerations: PedigreeGenerations = 3
): PedigreeFlowGraph {
  const visibleAncestors = pedigree.ancestors.filter(
    (a) => a.path.length >= 1 && a.path.length <= maxGenerations && a.generation <= maxGenerations
  );

  const ancestorMap = new Map<string, PedigreeAncestor>();
  for (const anc of visibleAncestors) {
    ancestorMap.set(anc.path, anc);
  }

  // Ensure every present ancestor has a connected parent chain up to the subject
  const missingPlaceholderPaths = new Set<string>();
  for (const path of ancestorMap.keys()) {
    for (let len = 1; len < path.length; len += 1) {
      const prefix = path.slice(0, len);
      if (!ancestorMap.has(prefix)) {
        missingPlaceholderPaths.add(prefix);
      }
    }
  }

  const maxDepth = Math.max(
    1,
    visibleAncestors.reduce((acc, item) => Math.max(acc, item.path.length), 0)
  );

  const nodes: PedigreeFlowNode[] = [];
  const edges: Edge[] = [];

  // Root subject node (Gen 0)
  nodes.push({
    id: 'subject',
    type: 'pedigreeNode',
    position: {
      x: 0,
      y: computeSlotY('', maxDepth),
    },
    data: {
      kind: 'subject',
      path: '',
      generation: 0,
      relationship: 'Ejemplar actual',
      lineage: null,
      registered: true,
      animalId: pedigree.subject.id || null,
      folioInterno: pedigree.subject.folioInterno,
      registroUno: pedigree.subject.registroUno,
      sex: pedigree.subject.sex,
      breed: pedigree.subject.breed,
      color: pedigree.subject.color,
      breeder: pedigree.subject.breeder,
      birthDate: pedigree.subject.birthDate,
      status: pedigree.subject.status,
      offspringCount: pedigree.offspring.length,
    },
  });

  const allPaths = Array.from(
    new Set([...ancestorMap.keys(), ...missingPlaceholderPaths])
  ).sort((a, b) => {
    if (a.length !== b.length) return a.length - b.length;
    return a.localeCompare(b);
  });

  let registeredAncestorCount = 0;
  let externalAncestorCount = 0;

  for (const path of allPaths) {
    const ancestor = ancestorMap.get(path);
    const generation = path.length;
    const nodeId = `anc-${path}`;
    const parentPath = path.slice(0, -1);
    const sourceId = parentPath.length === 0 ? 'subject' : `anc-${parentPath}`;
    const branchCode = path[path.length - 1] === 'M' ? 'M' : 'P';
    const isMaternalBranch = branchCode === 'M';

    if (ancestor) {
      const isExternal = !ancestor.registered;
      if (isExternal) {
        externalAncestorCount += 1;
      } else {
        registeredAncestorCount += 1;
      }

      nodes.push({
        id: nodeId,
        type: 'pedigreeNode',
        position: {
          x: generation * COLUMN_SPACING_X,
          y: computeSlotY(path, maxDepth),
        },
        data: {
          kind: isExternal ? 'external' : 'ancestor',
          path,
          generation,
          relationship: ancestor.relationship,
          lineage: ancestor.lineage,
          registered: ancestor.registered,
          animalId: ancestor.animalId,
          folioInterno: ancestor.folioInterno,
          registroUno: ancestor.registroUno,
          sex: ancestor.sex,
          breed: ancestor.breed,
          color: ancestor.color,
          breeder: ancestor.breeder,
          birthDate: ancestor.birthDate,
          status: ancestor.status,
        },
      });

      const strokeColor = isExternal
        ? '#B45309'
        : isMaternalBranch
          ? '#BE185D'
          : '#1D4ED8';

      edges.push({
        id: `edge-${sourceId}-${nodeId}`,
        source: sourceId,
        target: nodeId,
        type: 'smoothstep',
        label: isExternal ? `${branchCode} · Externo` : branchCode,
        style: {
          stroke: strokeColor,
          strokeWidth: isExternal ? 2 : 2.2,
          strokeDasharray: isExternal ? '6 4' : undefined,
        },
        labelStyle: {
          fill: strokeColor,
          fontSize: 11,
          fontWeight: 700,
        },
        labelBgStyle: {
          fill: isExternal ? '#FFFBEB' : '#FFFFFF',
          fillOpacity: 0.96,
        },
        labelBgPadding: [5, 2],
        labelBgBorderRadius: 4,
      });
    } else {
      const lineage: PedigreeLineage = path.startsWith('P') ? 'PATERNAL' : 'MATERNAL';
      const inferredSex: PedigreeSex = branchCode === 'M' ? 'FEMALE' : 'MALE';
      nodes.push({
        id: nodeId,
        type: 'pedigreeNode',
        position: {
          x: generation * COLUMN_SPACING_X,
          y: computeSlotY(path, maxDepth),
        },
        data: {
          kind: 'missing',
          path,
          generation,
          relationship: defaultRelationshipForPath(path, inferredSex),
          lineage,
          registered: false,
          animalId: null,
          folioInterno: 'Sin registro',
          registroUno: null,
          sex: inferredSex,
          breed: null,
          color: null,
          breeder: null,
          birthDate: null,
          status: null,
        },
      });

      edges.push({
        id: `edge-${sourceId}-${nodeId}`,
        source: sourceId,
        target: nodeId,
        type: 'smoothstep',
        label: branchCode,
        style: {
          stroke: '#94A3B8',
          strokeWidth: 1.5,
          strokeDasharray: '4 4',
        },
        labelStyle: {
          fill: '#64748B',
          fontSize: 11,
          fontWeight: 600,
        },
      });
    }
  }

  return {
    nodes,
    edges,
    maxDepth,
    registeredAncestorCount,
    externalAncestorCount,
  };
}

export function pedigreeQueryKey(
  username: string | null | undefined,
  ranchId: string | null | undefined,
  animalId: string,
  generations: PedigreeGenerations
) {
  return ['pedigree', username ?? null, ranchId ?? null, animalId, generations] as const;
}

export async function fetchAnimalPedigree(
  animalId: string,
  ranchId: string,
  generations: PedigreeGenerations,
  signal?: AbortSignal
): Promise<unknown> {
  const qs = new URLSearchParams({ generations: String(generations) });
  return apiFetch<unknown>(
    `/animals/${encodeURIComponent(animalId)}/pedigree?${qs.toString()}`,
    { ranchId, signal }
  );
}
