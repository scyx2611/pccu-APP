import { create } from 'zustand';
import { type CourseData } from '../../pccu/parsers/pccuScraper';
import * as scheduleStorage from '../storage/scheduleStorage';

export type ScheduleSyncStatus = 'idle' | 'syncing' | 'error';

export interface ScheduleStoreState {
  courses: CourseData[];
  lastSyncedAt: number | null;
  syncStatus: ScheduleSyncStatus;
  error: string | null;
}

export interface ScheduleStoreActions {
  setCourses: (courses: CourseData[]) => void;
  setLastSyncedAt: (timestamp: number | null) => void;
  setSyncStatus: (status: ScheduleSyncStatus) => void;
  setError: (error: string | null) => void;
  resetSync: () => void;
  hydrate: () => Promise<void>;
}

export type UseScheduleStore = ScheduleStoreState & ScheduleStoreActions;

export const useScheduleStore = create<UseScheduleStore>()((set) => ({
  // Initial state
  courses: [],
  lastSyncedAt: null,
  syncStatus: 'idle',
  error: null,

  // Actions
  setCourses: (courses) => set({ courses }),

  setLastSyncedAt: (timestamp) => set({ lastSyncedAt: timestamp }),

  setSyncStatus: (syncStatus) => set({ syncStatus }),

  setError: (error) => set({ error, syncStatus: 'error' }),

  resetSync: () => set({ syncStatus: 'idle', error: null }),

  hydrate: async () => {
    try {
      const cached = await scheduleStorage.getCourses();
      set({
        courses: cached.courses ?? [],
        lastSyncedAt: cached.updatedAt,
      });
    } catch (error) {
      console.error('[ScheduleStore] Hydration failed:', error);
      set({ error: 'Failed to load cached schedule' });
    }
  },
}));
