import { create } from 'zustand';

interface SyncState {
  isSyncing: boolean;
  rerunRequested: boolean;
  lastSyncAt: string | null;
  setSyncing: (status: boolean) => void;
  requestSync: () => void;
  clearRerunRequested: () => void;
  setLastSyncAt: (date: string) => void;
}

export const useGlobalSyncStore = create<SyncState>((set) => ({
  isSyncing: false,
  rerunRequested: false,
  lastSyncAt: null,
  setSyncing: (status) => set({ isSyncing: status }),
  requestSync: () => set({ rerunRequested: true }),
  clearRerunRequested: () => set({ rerunRequested: false }),
  setLastSyncAt: (date) => set({ lastSyncAt: date })
}));
