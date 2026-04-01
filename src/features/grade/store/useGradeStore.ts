import { create } from 'zustand';
import { type SemesterGrade } from '../../pccu/parsers/pccuScraper';
import * as gradeStorage from '../storage/gradeStorage';

export type GradeSyncStatus = 'idle' | 'syncing' | 'error';

export interface GradeStoreState {
  grades: SemesterGrade[];
  lastSyncedAt: number | null;
  syncStatus: GradeSyncStatus;
  error: string | null;
}

export interface GradeStoreActions {
  setGrades: (grades: SemesterGrade[]) => void;
  setLastSyncedAt: (timestamp: number | null) => void;
  setSyncStatus: (status: GradeSyncStatus) => void;
  setError: (error: string | null) => void;
  resetSync: () => void;
  hydrate: () => Promise<void>;
}

export type UseGradeStore = GradeStoreState & GradeStoreActions;

export const useGradeStore = create<UseGradeStore>()((set) => ({
  // Initial state
  grades: [],
  lastSyncedAt: null,
  syncStatus: 'idle',
  error: null,

  // Actions
  setGrades: (grades) => set({ grades }),

  setLastSyncedAt: (timestamp) => set({ lastSyncedAt: timestamp }),

  setSyncStatus: (syncStatus) => set({ syncStatus }),

  setError: (error) => set({ error, syncStatus: 'error' }),

  resetSync: () => set({ syncStatus: 'idle', error: null }),

  hydrate: async () => {
    try {
      const cached = await gradeStorage.getGrades();
      set({
        grades: cached.grades ?? [],
        lastSyncedAt: cached.updatedAt,
      });
    } catch (error) {
      console.error('[GradeStore] Hydration failed:', error);
      set({ error: 'Failed to load cached grades' });
    }
  },
}));
