import { useQuery } from '@tanstack/react-query';
import { apiFetch, type ApiError } from '../../api/client';
import { normalizeReproductiveOverview } from './analyticsOverview';

export function useAnalyticsOverview(
  username: string,
  activeRanchId: string | null,
  errorFallbackLabel: string
) {
  const query = useQuery({
    queryKey: ['analytics', 'overview', username, activeRanchId] as const,
    queryFn: async ({ queryKey }) => {
      const ranchId = queryKey[3];
      const res = await apiFetch<unknown>('/analytics/overview', {
        ranchId: ranchId ?? undefined,
      });
      return normalizeReproductiveOverview(res);
    },
    enabled: Boolean(activeRanchId),
  });

  const rawError = query.error;
  const errorStatus = (rawError as Partial<ApiError> | null)?.status;
  const errorMessage =
    rawError instanceof Error
      ? errorStatus === 403 && rawError.message === 'HTTP 403'
        ? `Tu cuenta no tiene permisos para consultar ${errorFallbackLabel} de este rancho.`
        : rawError.message
      : query.isError
        ? `No se pudieron cargar ${errorFallbackLabel} del rancho activo.`
        : '';

  return {
    query,
    overview: query.data,
    loading: query.isFetching,
    errorMessage,
  };
}
