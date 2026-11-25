import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { PedigreeFlowNode, PedigreeSex, PedigreeStatus } from './pedigreeApi';

export interface PedigreeSexPresentation {
  symbol: string;
  label: string;
  themeLabel: 'Rosa' | 'Azul' | 'Neutro';
  themeKey: 'rosa' | 'azul' | 'neutro';
  toneClass: 'sex-female' | 'sex-male' | 'sex-unknown';
}

export function getPedigreeSexPresentation(sex: PedigreeSex): PedigreeSexPresentation {
  if (sex === 'FEMALE') {
    return {
      symbol: '♀',
      label: 'Hembra',
      themeLabel: 'Rosa',
      themeKey: 'rosa',
      toneClass: 'sex-female',
    };
  }
  if (sex === 'MALE') {
    return {
      symbol: '♂',
      label: 'Macho',
      themeLabel: 'Azul',
      themeKey: 'azul',
      toneClass: 'sex-male',
    };
  }
  return {
    symbol: '◎',
    label: 'Sin especificar',
    themeLabel: 'Neutro',
    themeKey: 'neutro',
    toneClass: 'sex-unknown',
  };
}

function statusLabel(status: PedigreeStatus | null): string | null {
  if (status === 'DECEASED') return 'Fallecido';
  if (status === 'SOLD') return 'Vendido';
  return null;
}

export function PedigreeNode({ data }: NodeProps<PedigreeFlowNode>) {
  const sex = getPedigreeSexPresentation(data.sex);
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

  const folioUnoValue = data.registroUno || 'Sin registro';
  const breedValue = data.breed || 'Sin especificar';
  const colorValue = data.color || 'Sin especificar';
  const breederValue = data.breeder || 'Sin especificar';

  const accessibleLabel = isMissing
    ? `${data.relationship}, sexo ${sex.label}, sin registro`
    : isExternal
      ? `${data.relationship}, ancestro externo, sexo ${sex.label}, folio interno ${data.folioInterno}`
      : `${data.relationship}, sexo ${sex.label} (nodo ${sex.themeLabel}), folio interno ${data.folioInterno}, folio UNO ${folioUnoValue}, raza ${breedValue}, color ${colorValue}, criador ${breederValue}`;

  return (
    <div
      className={rootClass}
      role="group"
      aria-label={accessibleLabel}
      data-node-kind={data.kind}
      data-pedigree-path={data.path || 'SUBJECT'}
      data-sex={data.sex}
      data-node-theme={isExternal ? 'externo' : sex.themeKey}
    >
      {data.generation > 0 && (
        <Handle
          type="target"
          position={Position.Left}
          className="pedigree-handle"
          isConnectable={false}
        />
      )}

      <div className={`pedigree-node-band ${sex.toneClass}`}>
        <span className="pedigree-node-rel">
          {data.relationship}
          {data.path ? ` (${data.path})` : ''}
        </span>
        <span
          className={`pedigree-sex-pill ${sex.toneClass}`}
          title={`Sexo: ${sex.label} (${sex.themeLabel})`}
        >
          <span className="pedigree-sex-icon" aria-hidden="true">
            {sex.symbol}
          </span>
          <span className="pedigree-sex-text">{sex.label}</span>
        </span>
      </div>

      <div className="pedigree-node-body">
        <div className="pedigree-folio-block" data-field="folioInterno">
          <div className="pedigree-folio-meta">
            <span className="pedigree-field-label">Folio interno</span>
            <div className="pedigree-node-badges">
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
          </div>
          <strong className="pedigree-node-folio" title={data.folioInterno}>
            {data.folioInterno}
          </strong>
        </div>

        {isMissing ? (
          <p className="pedigree-node-caption">
            Progenitor no registrado en el sistema
          </p>
        ) : isExternal ? (
          <p className="pedigree-node-caption">
            Solo folio externo · sin ficha en el rancho
          </p>
        ) : (
          <dl className="pedigree-node-fields">
            <div className="pedigree-field-item" data-field="registroUno">
              <dt>Folio UNO</dt>
              <dd title={folioUnoValue}>{folioUnoValue}</dd>
            </div>
            <div className="pedigree-field-item" data-field="breed">
              <dt>Raza</dt>
              <dd title={breedValue}>{breedValue}</dd>
            </div>
            <div className="pedigree-field-item" data-field="color">
              <dt>Color</dt>
              <dd title={colorValue}>{colorValue}</dd>
            </div>
            <div className="pedigree-field-item" data-field="breeder">
              <dt>Criador</dt>
              <dd title={breederValue}>{breederValue}</dd>
            </div>
          </dl>
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
