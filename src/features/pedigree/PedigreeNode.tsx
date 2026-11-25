import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { PedigreeFlowNode, PedigreeSex, PedigreeStatus } from './pedigreeApi';

function sexMeta(sex: PedigreeSex): { symbol: string; label: string; toneClass: string } {
  if (sex === 'FEMALE') {
    return { symbol: '♀', label: 'Hembra', toneClass: 'sex-female' };
  }
  if (sex === 'MALE') {
    return { symbol: '♂', label: 'Macho', toneClass: 'sex-male' };
  }
  return { symbol: '◎', label: 'Sin especificar', toneClass: 'sex-unknown' };
}

function statusLabel(status: PedigreeStatus | null): string | null {
  if (status === 'DECEASED') return 'Fallecido';
  if (status === 'SOLD') return 'Vendido';
  return null;
}

export function PedigreeNode({ data }: NodeProps<PedigreeFlowNode>) {
  const sex = sexMeta(data.sex);
  const exitStatus = statusLabel(data.status);
  const isSubject = data.kind === 'subject';
  const isExternal = data.kind === 'external';
  const isMissing = data.kind === 'missing';
  const canNavigate = data.kind === 'ancestor' && data.registered && Boolean(data.animalId);

  const rootClass = [
    'pedigree-node',
    `pedigree-node-${data.kind}`,
    sex.toneClass,
    canNavigate ? 'pedigree-node-clickable' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const lineageTag =
    data.lineage === 'PATERNAL'
      ? 'Línea P'
      : data.lineage === 'MATERNAL'
        ? 'Línea M'
        : null;

  return (
    <div
      className={rootClass}
      data-node-kind={data.kind}
      data-pedigree-path={data.path || 'SUBJECT'}
    >
      {data.generation > 0 && (
        <Handle
          type="target"
          position={Position.Left}
          className="pedigree-handle"
          isConnectable={false}
        />
      )}

      <div className="pedigree-node-top">
        <span className="pedigree-node-rel">
          {data.relationship}
          {data.path ? ` (${data.path})` : ''}
        </span>
        <span className={`pedigree-sex-pill ${sex.toneClass}`}>
          <span aria-hidden="true">{sex.symbol}</span> {sex.label}
        </span>
      </div>

      <div className="pedigree-node-title-row">
        <strong className="pedigree-node-folio" title={data.folioInterno}>
          {data.folioInterno}
        </strong>
        {isExternal && (
          <span className="pedigree-external-badge">Ancestro externo</span>
        )}
        {isSubject && (
          <span className="pedigree-subject-badge">Actual</span>
        )}
        {exitStatus && (
          <span className="pedigree-exit-badge">{exitStatus}</span>
        )}
      </div>

      {isMissing ? (
        <p className="pedigree-node-caption">Progenitor no registrado en el sistema</p>
      ) : isExternal ? (
        <p className="pedigree-node-caption">
          Solo folio externo · sin ficha en el rancho
        </p>
      ) : (
        <div className="pedigree-node-details">
          <div className="pedigree-node-detail-line">
            <span>UNO:</span>{' '}
            <b>{data.registroUno || '—'}</b>
          </div>
          <div className="pedigree-node-detail-line">
            <span>Raza / Color:</span>{' '}
            <b>
              {data.breed || 'Sin raza'}
              {data.color ? ` · ${data.color}` : ''}
            </b>
          </div>
          {data.breeder && (
            <div className="pedigree-node-detail-line">
              <span>Criador:</span> <b>{data.breeder}</b>
            </div>
          )}
        </div>
      )}

      <div className="pedigree-node-foot">
        {lineageTag ? (
          <span
            className={`pedigree-lineage-chip ${
              data.lineage === 'MATERNAL' ? 'lineage-maternal' : 'lineage-paternal'
            }`}
          >
            {lineageTag}
          </span>
        ) : (
          <span className="pedigree-lineage-chip lineage-subject">
            {typeof data.offspringCount === 'number' && data.offspringCount > 0
              ? `${data.offspringCount} ${data.offspringCount === 1 ? 'cría' : 'crías'}`
              : 'Gen 0'}
          </span>
        )}

        {canNavigate && data.animalId ? (
          <a
            className="pedigree-node-link nodrag"
            href={`#/inventario/${encodeURIComponent(data.animalId)}`}
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            Ver ficha →
          </a>
        ) : isExternal ? (
          <span className="pedigree-node-muted-tag">Externo</span>
        ) : null}
      </div>

      {!isExternal && !isMissing && data.generation < 4 && (
        <Handle
          type="source"
          position={Position.Right}
          className="pedigree-handle"
          isConnectable={false}
        />
      )}
    </div>
  );
}
