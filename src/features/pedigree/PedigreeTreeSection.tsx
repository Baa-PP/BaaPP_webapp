import { useCallback, useMemo, useState, type MouseEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { ApiError } from '../../api/client';
import { formatDate, type AnimalDetail } from '../inventory/AnimalCertificate';
import { PedigreeNode } from './PedigreeNode';
import {
  buildPedigreeFlowGraph,
  fetchAnimalPedigree,
  generationLabel,
  normalizePedigreeResponse,
  pedigreeQueryKey,
  type PedigreeFlowNode,
  type PedigreeGenerations,
  type PedigreeStatus,
} from './pedigreeApi';

const NODE_TYPES: NodeTypes = {
  pedigreeNode: PedigreeNode,
};

interface PedigreeTreeSectionProps {
  animal: AnimalDetail;
  activeRanchId: string | null;
  username?: string | null;
}

function resolvePedigreeError(err: unknown): string {
  const apiErr = err as Partial<ApiError> | undefined;
  if (apiErr?.status === 403) {
    return (
      apiErr.message ||
      'No cuentas con permiso de lectura para consultar el árbol genealógico en el rancho activo.'
    );
  }
  if (apiErr?.status === 404) {
    return 'No se encontró la genealogía de este ejemplar en el rancho activo.';
  }
  if (err instanceof Error && err.message.trim().length > 0) {
    return err.message;
  }
  return 'No se pudo cargar el árbol genealógico del ejemplar.';
}

function offspringStatusMeta(status: PedigreeStatus): { label: string; className: string } {
  if (status === 'DECEASED') {
    return { label: 'Fallecido', className: 'pedigree-status-deceased' };
  }
  if (status === 'SOLD') {
    return { label: 'Vendido', className: 'pedigree-status-sold' };
  }
  if (status === 'ACTIVE') {
    return { label: 'Activo', className: 'pedigree-status-active' };
  }
  return { label: 'Registrado', className: 'pedigree-status-neutral' };
}

function miniMapNodeColor(node: PedigreeFlowNode): string {
  if (node.data.kind === 'external') return '#D97706';
  if (node.data.kind === 'missing') return '#CBD5E1';
  if (node.data.sex === 'FEMALE') return '#DB2777';
  if (node.data.sex === 'MALE') return '#2563EB';
  return '#1B4332';
}

export function PedigreeTreeSection({
  animal,
  activeRanchId,
  username,
}: PedigreeTreeSectionProps) {
  const [requestedGenerations, setRequestedGenerations] = useState<PedigreeGenerations>(3);

  const pedigreeQuery = useQuery({
    queryKey: pedigreeQueryKey(username, activeRanchId, animal.id, requestedGenerations),
    queryFn: ({ signal }) => {
      if (!activeRanchId) {
        throw new Error('Selecciona un rancho activo para consultar la genealogía.');
      }
      return fetchAnimalPedigree(animal.id, activeRanchId, requestedGenerations, signal);
    },
    enabled: Boolean(animal.id && activeRanchId),
    retry: (failureCount, error) => {
      const status = (error as Partial<ApiError>)?.status;
      if (status === 403 || status === 404) return false;
      return failureCount < 1;
    },
  });

  const pedigree = useMemo(() => {
    if (!pedigreeQuery.data) return null;
    return normalizePedigreeResponse(pedigreeQuery.data, {
      id: animal.id,
      folioInterno: animal.folioInterno,
      registroUno: animal.registroUno ?? null,
      sex: animal.sex,
      breed: animal.breed ?? null,
      color: animal.color ?? null,
      breeder: animal.criador ?? null,
      birthDate: animal.birthDate ?? null,
      status:
        animal.status === 'ACTIVE' ||
        animal.status === 'SOLD' ||
        animal.status === 'DECEASED'
          ? animal.status
          : 'UNKNOWN',
    });
  }, [pedigreeQuery.data, animal]);

  const graph = useMemo(() => {
    if (!pedigree) return null;
    return buildPedigreeFlowGraph(pedigree, requestedGenerations);
  }, [pedigree, requestedGenerations]);

  const handleNodeClick = useCallback(
    (_event: MouseEvent, node: PedigreeFlowNode) => {
      if (node.data.kind === 'ancestor' && node.data.registered && node.data.animalId) {
        const targetHash = `#/inventario/${encodeURIComponent(node.data.animalId)}`;
        if (typeof window !== 'undefined' && window.location.hash !== targetHash) {
          window.location.hash = targetHash;
        }
      }
    },
    []
  );

  const generationLevels = useMemo(() => {
    const levels: number[] = [];
    for (let g = 0; g <= requestedGenerations; g += 1) {
      levels.push(g);
    }
    return levels;
  }, [requestedGenerations]);

  const flowKey = `${activeRanchId ?? 'none'}-${animal.id}-${requestedGenerations}-${graph?.nodes.length ?? 0}`;

  return (
    <section
      className="cert-section pedigree-section"
      aria-labelledby="pedigree-tree-heading"
    >
      <div className="section-title pedigree-section-head">
        <div>
          <h2 id="pedigree-tree-heading">Árbol genealógico interactivo</h2>
          <small>
            Línea paterna (P) y materna (M) en 3 o 4 generaciones, ancestros externos y navegación a descendientes.
          </small>
        </div>

        <div
          className="pedigree-gen-toggle"
          role="group"
          aria-label="Profundidad de generaciones"
        >
          <button
            type="button"
            className={`pedigree-gen-btn${requestedGenerations === 3 ? ' active' : ''}`}
            aria-pressed={requestedGenerations === 3}
            onClick={() => setRequestedGenerations(3)}
          >
            3 generaciones
          </button>
          <button
            type="button"
            className={`pedigree-gen-btn${requestedGenerations === 4 ? ' active' : ''}`}
            aria-pressed={requestedGenerations === 4}
            onClick={() => setRequestedGenerations(4)}
          >
            4 generaciones
          </button>
        </div>
      </div>

      {!activeRanchId ? (
        <div className="pedigree-state-box">
          <p className="muted">Selecciona un rancho activo para consultar el árbol genealógico.</p>
        </div>
      ) : pedigreeQuery.isLoading ? (
        <div className="pedigree-state-box" role="status" aria-live="polite">
          <p className="muted">
            Cargando árbol genealógico ({requestedGenerations} generaciones)…
          </p>
        </div>
      ) : pedigreeQuery.isError ? (
        <div className="pedigree-error-box" role="alert">
          <div>
            <strong>No se pudo cargar el árbol genealógico</strong>
            <p>{resolvePedigreeError(pedigreeQuery.error)}</p>
          </div>
          <button
            type="button"
            className="secondary-button"
            disabled={pedigreeQuery.isFetching}
            onClick={() => {
              void pedigreeQuery.refetch();
            }}
          >
            {pedigreeQuery.isFetching ? 'Reintentando…' : 'Reintentar'}
          </button>
        </div>
      ) : pedigree && graph ? (
        <>
          <div className="pedigree-toolbar">
            <div className="pedigree-legend" aria-label="Leyenda del árbol genealógico">
              <span className="pedigree-legend-item">
                <span className="pedigree-swatch swatch-paternal" aria-hidden="true" />
                Línea paterna (P)
              </span>
              <span className="pedigree-legend-item">
                <span className="pedigree-swatch swatch-maternal" aria-hidden="true" />
                Línea materna (M)
              </span>
              <span className="pedigree-legend-item">
                <span className="pedigree-swatch swatch-external" aria-hidden="true" />
                Ancestro externo (solo folio)
              </span>
            </div>

            <div className="pedigree-summary-pills">
              <span className="pedigree-stat-pill">
                Ancestros: <b>{graph.registeredAncestorCount}</b>
              </span>
              <span
                className={`pedigree-stat-pill${
                  graph.externalAncestorCount > 0 ? ' stat-external' : ''
                }`}
              >
                Externos: <b>{graph.externalAncestorCount}</b>
              </span>
              <a
                className="pedigree-stat-pill stat-offspring"
                href="#pedigree-offspring-list"
                onClick={(e) => {
                  e.preventDefault();
                  const el = document.getElementById('pedigree-offspring-list');
                  if (el && typeof el.scrollIntoView === 'function') {
                    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }
                }}
              >
                Crías: <b>{pedigree.offspring.length}</b>
              </a>
              {pedigreeQuery.isFetching && (
                <span className="pedigree-stat-pill">Actualizando…</span>
              )}
            </div>
          </div>

          <div className="pedigree-generations-strip" aria-label="Niveles mostrados">
            {generationLevels.map((gen) => (
              <span key={gen} className="pedigree-gen-pill">
                {generationLabel(gen)}
              </span>
            ))}
          </div>

          {graph.registeredAncestorCount === 0 && graph.externalAncestorCount === 0 && (
            <p className="pedigree-empty-ancestors">
              Este ejemplar no tiene padres ni ancestros registrados todavía; únicamente se muestra su nodo raíz.
            </p>
          )}

          <div
            className={`pedigree-canvas-wrap${
              requestedGenerations === 4 ? ' pedigree-canvas-tall' : ''
            }`}
            aria-label={`Lienzo interactivo del árbol genealógico de ${pedigree.subject.folioInterno}`}
          >
            <ReactFlow
              key={flowKey}
              nodes={graph.nodes}
              edges={graph.edges}
              nodeTypes={NODE_TYPES}
              fitView
              fitViewOptions={{ padding: 0.16, minZoom: 0.35, maxZoom: 1.05 }}
              minZoom={0.25}
              maxZoom={1.6}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
              onNodeClick={handleNodeClick}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={20} size={1} color="#CBD5E1" />
              <Controls showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                nodeColor={miniMapNodeColor}
                maskColor="rgba(15, 23, 42, 0.08)"
              />
            </ReactFlow>
          </div>

          <p className="pedigree-canvas-hint">
            Arrastra para desplazarte, usa la rueda o los controles para acercar/alejar y haz clic en cualquier ancestro registrado para abrir su ficha.
          </p>

          <div
            id="pedigree-offspring-list"
            className="pedigree-offspring-block"
            aria-labelledby="pedigree-offspring-heading"
          >
            <div className="pedigree-offspring-head">
              <div>
                <h3 id="pedigree-offspring-heading">
                  Descendientes / Crías registradas ({pedigree.offspring.length})
                </h3>
                <p>
                  Selecciona una cría para navegar a su reseña individual y centrar el árbol genealógico en ella.
                </p>
              </div>
            </div>

            {pedigree.offspring.length === 0 ? (
              <p className="pedigree-offspring-empty">
                Este ejemplar aún no tiene crías registradas en el rancho activo.
              </p>
            ) : (
              <ul className="pedigree-offspring-grid">
                {pedigree.offspring.map((child) => {
                  const isFemale = child.sex === 'FEMALE';
                  const isMale = child.sex === 'MALE';
                  const sexSymbol = isFemale ? '♀' : isMale ? '♂' : '◎';
                  const sexText = isFemale
                    ? 'Hembra'
                    : isMale
                      ? 'Macho'
                      : 'Sin especificar';
                  const sexClass = isFemale
                    ? 'sex-female'
                    : isMale
                      ? 'sex-male'
                      : 'sex-unknown';
                  const statusInfo = offspringStatusMeta(child.status);

                  return (
                    <li key={child.id}>
                      <a
                        className={`pedigree-offspring-card ${sexClass}`}
                        href={`#/inventario/${encodeURIComponent(child.id)}`}
                      >
                        <div className="pedigree-offspring-card-top">
                          <strong className="pedigree-offspring-folio">
                            {child.folioInterno}
                          </strong>
                          <span className={`pedigree-sex-pill ${sexClass}`}>
                            <span aria-hidden="true">{sexSymbol}</span> {sexText}
                          </span>
                        </div>

                        <div className="pedigree-offspring-meta">
                          <span>
                            UNO: <b>{child.registroUno || '—'}</b>
                          </span>
                          <span>
                            Nacimiento: <b>{formatDate(child.birthDate)}</b>
                          </span>
                        </div>

                        <div className="pedigree-offspring-card-foot">
                          <span className={`pedigree-status-pill ${statusInfo.className}`}>
                            {statusInfo.label}
                            {child.status === 'DECEASED' && child.deathDate
                              ? ` · ${formatDate(child.deathDate)}`
                              : ''}
                          </span>
                          <span className="pedigree-offspring-cta">Ver cría →</span>
                        </div>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

export default PedigreeTreeSection;
