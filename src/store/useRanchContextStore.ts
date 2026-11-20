import { create } from "zustand";

interface Ranch {
  id: string;
  name: string;
  owner_name?: string;
  weaning_days_target?: number;
  last_sync_at?: string;
}

interface RanchContextState {
  activeRanchId: string | null;
  availableRanches: Ranch[];
  setActiveRanchId: (ranchId: string | null) => void;
  setAvailableRanches: (ranches: Ranch[]) => void;
}

export const useRanchContextStore = create<RanchContextState>((set) => ({
  activeRanchId: null,
  availableRanches: [],
  setActiveRanchId: (ranchId) => set({ activeRanchId: ranchId }),
  setAvailableRanches: (ranches) =>
    set((state) => ({
      availableRanches: ranches,
      // Preservar el rancho activo si sigue en la lista, si no tomar el primero
      activeRanchId:
        ranches.find((r) => r.id === state.activeRanchId)?.id ??
        (ranches[0]?.id || null),
    })),
}));
