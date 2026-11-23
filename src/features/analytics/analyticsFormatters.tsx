export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatPct(value: number | null): string {
  return value !== null && Number.isFinite(value) ? `${value.toFixed(1)}%` : '—';
}

export function formatRatio(value: number | null): string {
  return value !== null && Number.isFinite(value) ? value.toFixed(2) : '—';
}

export function formatWeightKg(value: number | null): string {
  return value !== null && Number.isFinite(value)
    ? `${value.toFixed(2)} kg`
    : '—';
}

export function formatCount(value: number | null): string {
  return value !== null && Number.isFinite(value) ? String(value) : '—';
}

export function getDataIndex(params: unknown): number {
  const first = Array.isArray(params) ? params[0] : params;
  if (
    first &&
    typeof first === 'object' &&
    'dataIndex' in first &&
    typeof (first as { dataIndex: unknown }).dataIndex === 'number'
  ) {
    return (first as { dataIndex: number }).dataIndex;
  }
  return -1;
}

export function AlertTriangleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function CheckCircleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
