import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnPinningState,
  type SortingState,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { RanchContextNotice } from "../../components/RanchContextNotice";
import {
  getTodayIsoDate,
  parseIsoCalendarDateUtcMs,
  sabanaColumns,
  type SabanaColumnMeta,
  type SabanaRow,
} from "./SabanaColumns";
import {
  applyCutoffDateToRows,
  EMPTY_SABANA_FILTERS,
  fetchSabanaReport,
  type SabanaFilters,
} from "./sabanaApi";

interface SabanaViewProps {
  username: string;
  multiRanch: boolean;
  activeRanchId: string | null;
  ranchName?: string;
  ranchesLoading: boolean;
  ranchesError?: string;
  onRetryRanches: () => void;
}

type PinPreset = "folio" | "identificadores" | "none";

const PIN_PRESETS: Record<PinPreset, string[]> = {
  folio: ["folio"],
  identificadores: ["folio", "adn", "chipSiniiga"],
  none: [],
};

const ROW_HEIGHT_PX = 40;
const VIRTUAL_OVERSCAN = 12;

export function SabanaView({
  username,
  multiRanch,
  activeRanchId,
  ranchName,
  ranchesLoading,
  ranchesError,
  onRetryRanches,
}: SabanaViewProps) {
  const [draftFilters, setDraftFilters] = useState<SabanaFilters>(EMPTY_SABANA_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<SabanaFilters>(EMPTY_SABANA_FILTERS);
  const [quickFilter, setQuickFilter] = useState("");
  const [cutoffDateOverride, setCutoffDateOverride] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "folio", desc: false }]);
  const [pinPreset, setPinPreset] = useState<PinPreset>("folio");

  const tableContainerRef = useRef<HTMLDivElement | null>(null);

  // Reset scroll position when ranch, filters, or sorting change
  useEffect(() => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTop = 0;
    }
  }, [activeRanchId, appliedFilters, quickFilter, sorting]);

  const sabanaQuery = useQuery({
    queryKey: ["sabana", username, activeRanchId, appliedFilters] as const,
    queryFn: async ({ queryKey, signal }) => {
      const ranchId = queryKey[2];
      if (!ranchId) {
        return {
          rows: [] as SabanaRow[],
          totalElements: 0,
          serverCutoffIso: getTodayIsoDate(),
          truncated: false,
        };
      }
      return fetchSabanaReport(queryKey[3], ranchId, signal);
    },
    enabled: Boolean(activeRanchId),
    placeholderData: (prev, prevQuery) =>
      prevQuery?.queryKey?.[2] === activeRanchId ? prev : undefined,
  });

  const serverCutoffIso = sabanaQuery.data?.serverCutoffIso ?? getTodayIsoDate();
  const hasValidCustomCutoff =
    cutoffDateOverride.length > 0 &&
    parseIsoCalendarDateUtcMs(cutoffDateOverride) !== null;
  const effectiveCutoffIso = hasValidCustomCutoff
    ? cutoffDateOverride
    : serverCutoffIso;

  const computedRows = useMemo(() => {
    const baseRows = sabanaQuery.data?.rows ?? [];
    if (!hasValidCustomCutoff || cutoffDateOverride === serverCutoffIso) {
      return baseRows;
    }
    return applyCutoffDateToRows(baseRows, cutoffDateOverride);
  }, [sabanaQuery.data?.rows, hasValidCustomCutoff, cutoffDateOverride, serverCutoffIso]);

  const columnPinning = useMemo<ColumnPinningState>(
    () => ({ left: PIN_PRESETS[pinPreset], right: [] }),
    [pinPreset]
  );

  const table = useReactTable({
    data: computedRows,
    columns: sabanaColumns,
    state: {
      sorting,
      globalFilter: quickFilter,
      columnPinning,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setQuickFilter,
    getColumnCanGlobalFilter: (column) => column.id === "folio",
    globalFilterFn: (row, _columnId, filterValue) => {
      const needle = String(filterValue ?? "").trim().toLowerCase();
      if (!needle) return true;
      const r = row.original;
      return (
        r.folio.toLowerCase().includes(needle) ||
        (r.adn?.toLowerCase().includes(needle) ?? false) ||
        (r.chipSiniiga?.toLowerCase().includes(needle) ?? false) ||
        r.raza.toLowerCase().includes(needle) ||
        r.color.toLowerCase().includes(needle) ||
        (r.padreFolioInterno?.toLowerCase().includes(needle) ?? false) ||
        (r.madreFolioInterno?.toLowerCase().includes(needle) ?? false)
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const { rows } = table.getRowModel();

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: VIRTUAL_OVERSCAN,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalVirtualHeight = rowVirtualizer.getTotalSize();

  const visibleLeafColumns = table.getVisibleLeafColumns();
  const totalTableWidth = useMemo(
    () => visibleLeafColumns.reduce((sum, col) => sum + col.getSize(), 0),
    [visibleLeafColumns]
  );

  const pinnedLeftOffsets = useMemo(() => {
    const offsets = new Map<string, number>();
    let acc = 0;
    for (const col of visibleLeafColumns) {
      if (col.getIsPinned() === "left") {
        offsets.set(col.id, acc);
        acc += col.getSize();
      }
    }
    return offsets;
  }, [visibleLeafColumns, columnPinning]);

  const lastPinnedLeftId = useMemo(() => {
    const pinned = PIN_PRESETS[pinPreset];
    return pinned.length > 0 ? pinned[pinned.length - 1] : null;
  }, [pinPreset]);

  const hasActiveServerFilters = Boolean(
    appliedFilters.q.trim() ||
      appliedFilters.sexo ||
      appliedFilters.raza.trim() ||
      appliedFilters.estado
  );

  function handleFilterSubmit(e: FormEvent) {
    e.preventDefault();
    setAppliedFilters({
      q: draftFilters.q.trim(),
      sexo: draftFilters.sexo,
      raza: draftFilters.raza.trim(),
      estado: draftFilters.estado,
    });
  }

  function handleClearFilters() {
    setDraftFilters(EMPTY_SABANA_FILTERS);
    setAppliedFilters(EMPTY_SABANA_FILTERS);
    setQuickFilter("");
  }

  if (!activeRanchId) {
    return (
      <RanchContextNotice
        eyebrow="Sábana oficial (A–X)"
        multiRanch={multiRanch}
        loading={ranchesLoading}
        error={ranchesError}
        onRetry={onRetryRanches}
        contextLabel="la sábana oficial"
      />
    );
  }

  const totalElements = sabanaQuery.data?.totalElements ?? 0;
  const loadedCount = computedRows.length;
  const displayedCount = rows.length;
  const isInitialLoading = sabanaQuery.isLoading && !sabanaQuery.data;
  const errorMessage =
    sabanaQuery.isError && sabanaQuery.error instanceof Error
      ? sabanaQuery.error.message
      : sabanaQuery.isError
        ? "No se pudo cargar la sábana del rancho."
        : "";

  return (
    <section className="sabana-section">
      <div className="page-head">
        <div>
          <p className="eyebrow">
            RF-WEB-05 · Sábana oficial (24 columnas A–X)
          </p>
          <h1>{ranchName ? `Sábana · ${ranchName}` : "Sábana oficial del rebaño"}</h1>
          <p className="intro">
            Vista tabular virtualizada compatible con{" "}
            <code>SABANA OCT 2026 DORPER.xlsx</code>. Edades calculadas contra
            fecha de corte (<code>meses = días / 30.0</code>).
          </p>
        </div>
        <div className="sabana-head-badges">
          <span className="sabana-metric-pill">
            <strong>{displayedCount.toLocaleString("es-MX")}</strong>{" "}
            {displayedCount === 1 ? "ejemplar" : "ejemplares"}
            {displayedCount !== totalElements && totalElements > 0
              ? ` de ${totalElements.toLocaleString("es-MX")}`
              : ""}
          </span>
          <span className="sabana-metric-pill">
            Corte: <strong>{effectiveCutoffIso}</strong>
          </span>
          <span className="sabana-metric-pill">
            <strong>{visibleLeafColumns.length}</strong> cols (A–X)
          </span>
        </div>
      </div>

      <form className="filters-card sabana-filters-card" onSubmit={handleFilterSubmit}>
        <div className="sabana-filter-grid">
          <label className="filter-field">
            <span>Buscar en servidor (folio, ADN, CHIP, padre/madre)</span>
            <input
              type="search"
              placeholder="Ej. 79, 484000123456, Dorper…"
              value={draftFilters.q}
              onChange={(e) =>
                setDraftFilters((prev) => ({ ...prev, q: e.target.value }))
              }
            />
          </label>

          <label className="filter-field">
            <span>Sexo</span>
            <select
              value={draftFilters.sexo}
              onChange={(e) =>
                setDraftFilters((prev) => ({
                  ...prev,
                  sexo: e.target.value as SabanaFilters["sexo"],
                }))
              }
            >
              <option value="">Todos</option>
              <option value="FEMALE">Hembra</option>
              <option value="MALE">Macho</option>
            </select>
          </label>

          <label className="filter-field">
            <span>Raza</span>
            <input
              type="text"
              placeholder="Ej. DORPER, KATAHDIN…"
              value={draftFilters.raza}
              onChange={(e) =>
                setDraftFilters((prev) => ({ ...prev, raza: e.target.value }))
              }
            />
          </label>

          <label className="filter-field">
            <span>Estado</span>
            <select
              value={draftFilters.estado}
              onChange={(e) =>
                setDraftFilters((prev) => ({
                  ...prev,
                  estado: e.target.value as SabanaFilters["estado"],
                }))
              }
            >
              <option value="">Todos</option>
              <option value="ACTIVE">Activo</option>
              <option value="SOLD">Vendido</option>
              <option value="DECEASED">Fallecido</option>
            </select>
          </label>
        </div>

        <div className="sabana-toolbar-row">
          <div className="sabana-toolbar-controls">
            <label className="sabana-inline-control">
              <span>Filtro rápido local</span>
              <input
                type="search"
                placeholder="Filtrar filas cargadas al instante…"
                value={quickFilter}
                onChange={(e) => setQuickFilter(e.target.value)}
              />
            </label>

            <label className="sabana-inline-control">
              <span>Fecha de corte (edad)</span>
              <input
                type="date"
                aria-label="Fecha de corte para cálculo de edad"
                value={cutoffDateOverride || serverCutoffIso}
                onChange={(e) => setCutoffDateOverride(e.target.value)}
              />
            </label>

            {hasValidCustomCutoff && cutoffDateOverride !== serverCutoffIso && (
              <button
                type="button"
                className="link-button"
                onClick={() => setCutoffDateOverride("")}
              >
                Usar fecha servidor ({serverCutoffIso})
              </button>
            )}

            <label className="sabana-inline-control">
              <span>Columnas fijas</span>
              <select
                aria-label="Columnas fijas a la izquierda"
                value={pinPreset}
                onChange={(e) => setPinPreset(e.target.value as PinPreset)}
              >
                <option value="folio">Fijar A (Folio)</option>
                <option value="identificadores">Fijar A–C (Folio, ADN, CHIP)</option>
                <option value="none">Sin columnas fijas</option>
              </select>
            </label>
          </div>

          <div className="sabana-toolbar-actions">
            {(hasActiveServerFilters || quickFilter) && (
              <button
                type="button"
                className="secondary-button"
                onClick={handleClearFilters}
              >
                Limpiar filtros
              </button>
            )}
            <button
              type="submit"
              className="primary sabana-submit-btn"
              disabled={sabanaQuery.isFetching}
            >
              {sabanaQuery.isFetching ? "Consultando…" : "Aplicar filtros"}
            </button>
          </div>
        </div>
      </form>

      {sabanaQuery.data?.truncated && (
        <div className="sabana-notice" role="status">
          Se cargaron los primeros {loadedCount.toLocaleString("es-MX")} de{" "}
          {totalElements.toLocaleString("es-MX")} ejemplares. Usa los filtros
          superiores para acotar la consulta.
        </div>
      )}

      {isInitialLoading ? (
        <section className="empty-panel" role="status" aria-live="polite">
          <p className="muted">Cargando sábana oficial de 24 columnas…</p>
        </section>
      ) : errorMessage ? (
        <section className="empty-panel">
          <p className="eyebrow">Error al consultar sábana</p>
          <h2>No se pudo cargar el reporte</h2>
          <p className="error" role="alert">
            {errorMessage}
          </p>
          <button
            type="button"
            className="secondary-button"
            disabled={sabanaQuery.isFetching}
            onClick={() => {
              void sabanaQuery.refetch();
            }}
          >
            {sabanaQuery.isFetching ? "Reintentando…" : "Reintentar"}
          </button>
        </section>
      ) : displayedCount === 0 ? (
        <section className="empty-panel">
          <p className="eyebrow">Sin resultados</p>
          <h2>No hay ejemplares para mostrar en la sábana</h2>
          <p className="intro">
            {hasActiveServerFilters || quickFilter
              ? "Prueba ajustando o limpiando los filtros activos."
              : "Este rancho aún no tiene ejemplares registrados en v_sabana."}
          </p>
          {(hasActiveServerFilters || quickFilter) && (
            <button
              type="button"
              className="secondary-button"
              onClick={handleClearFilters}
            >
              Limpiar filtros
            </button>
          )}
        </section>
      ) : (
        <div className="sabana-card">
          <div className="sabana-status-bar">
            <span>
              Mostrando{" "}
              <strong>{displayedCount.toLocaleString("es-MX")}</strong>{" "}
              {displayedCount === 1 ? "fila" : "filas"} ·{" "}
              <span>
                Renderizadas en DOM:{" "}
                <strong>{virtualRows.length}</strong> (virtualización activa)
              </span>
            </span>
            {sabanaQuery.isFetching && (
              <span className="muted" role="status" aria-live="polite">
                Actualizando datos…
              </span>
            )}
          </div>

          <div
            ref={tableContainerRef}
            className="sabana-scroll-container"
            tabIndex={0}
            aria-label="Tabla virtualizada de la sábana oficial de 24 columnas A a X"
          >
            <table
              className="sabana-table"
              aria-rowcount={displayedCount + 1}
              style={{ width: `${totalTableWidth}px` }}
            >
              <thead className="sabana-thead">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className="sabana-tr sabana-header-row">
                    {headerGroup.headers.map((header) => {
                      const colId = header.column.id;
                      const isPinnedLeft = header.column.getIsPinned() === "left";
                      const leftOffset = pinnedLeftOffsets.get(colId);
                      const isLastPinned = colId === lastPinnedLeftId;
                      const meta = header.column.columnDef.meta as
                        | SabanaColumnMeta
                        | undefined;
                      const sortDir = header.column.getIsSorted();
                      const ariaSort =
                        sortDir === "asc"
                          ? "ascending"
                          : sortDir === "desc"
                            ? "descending"
                            : "none";

                      return (
                        <th
                          key={header.id}
                          scope="col"
                          aria-sort={ariaSort}
                          title={
                            meta
                              ? `Columna ${meta.letter} · ${meta.srsHeader}`
                              : undefined
                          }
                          className={[
                            "sabana-th",
                            meta?.align === "right" ? "is-numeric" : "",
                            isPinnedLeft ? "is-pinned" : "",
                            isLastPinned ? "is-last-pinned" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          style={{
                            width: `${header.getSize()}px`,
                            left: isPinnedLeft ? `${leftOffset ?? 0}px` : undefined,
                          }}
                        >
                          <button
                            type="button"
                            className="sabana-sort-button"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            <span className="sabana-header-label">
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                            </span>
                            <span className="sabana-sort-indicator" aria-hidden="true">
                              {sortDir === "asc"
                                ? "▲"
                                : sortDir === "desc"
                                  ? "▼"
                                  : "↕"}
                            </span>
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>

              <tbody
                className="sabana-tbody"
                style={{ height: `${totalVirtualHeight}px` }}
              >
                {virtualRows.map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  const isEven = virtualRow.index % 2 === 1;
                  return (
                    <tr
                      key={row.id}
                      aria-rowindex={virtualRow.index + 2}
                      className={
                        isEven
                          ? "sabana-tr sabana-body-row is-striped"
                          : "sabana-tr sabana-body-row"
                      }
                      style={{
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      {row.getVisibleCells().map((cell) => {
                        const colId = cell.column.id;
                        const isPinnedLeft = cell.column.getIsPinned() === "left";
                        const leftOffset = pinnedLeftOffsets.get(colId);
                        const isLastPinned = colId === lastPinnedLeftId;
                        const meta = cell.column.columnDef.meta as
                          | SabanaColumnMeta
                          | undefined;
                        const isSexCol = colId === "sexo";
                        const sexValue = isSexCol ? cell.row.original.sexo : "";

                        return (
                          <td
                            key={cell.id}
                            className={[
                              "sabana-td",
                              meta?.align === "right" ? "is-numeric" : "",
                              colId === "folio" ? "is-folio" : "",
                              isPinnedLeft ? "is-pinned" : "",
                              isLastPinned ? "is-last-pinned" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            style={{
                              width: `${cell.column.getSize()}px`,
                              left: isPinnedLeft
                                ? `${leftOffset ?? 0}px`
                                : undefined,
                            }}
                          >
                            {isSexCol ? (
                              <span
                                className={
                                  sexValue === "MACHO"
                                    ? "sabana-sex-pill is-male"
                                    : "sabana-sex-pill is-female"
                                }
                              >
                                {sexValue}
                              </span>
                            ) : (
                              flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
