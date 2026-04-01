import { useCallback, useRef } from 'react';
import { PccuSyncEngine } from '../../pccu/engine/PccuSyncEngine';
import { useGradeStore } from '../store/useGradeStore';
import * as gradeStorage from '../storage/gradeStorage';

/**
 * Hook that triggers grade synchronization via PccuSyncEngine.
 *
 * The actual WebView scraping is handled by GlobalScraperWebView,
 * which registers itself as the SyncExecutor. This hook only:
 * 1. Enqueues a sync request
 * 2. Updates the Zustand store with results
 */
export function useGradeSync() {
  const setSyncStatus = useGradeStore((state) => state.setSyncStatus);
  const setLastSyncedAt = useGradeStore((state) => state.setLastSyncedAt);
  const setError = useGradeStore((state) => state.setError);
  const setGrades = useGradeStore((state) => state.setGrades);
  const syncInProgressRef = useRef(false);

  const sync = useCallback(
    async (options: { priority?: number; silent?: boolean } = {}) => {
      if (syncInProgressRef.current) return;

      const { priority = 5, silent = false } = options;

      try {
        syncInProgressRef.current = true;
        if (!silent) setSyncStatus('syncing');

        const result = await PccuSyncEngine.getInstance().requestSync('grade', priority);

        if (result?.success) {
          const updatedAt = result.updatedAt ?? Date.now();
          setLastSyncedAt(updatedAt);

          // Re-hydrate grades from storage (GlobalScraperWebView already persisted them)
          const cached = await gradeStorage.getGrades();
          setGrades(cached.grades ?? []);

          if (!silent) setSyncStatus('idle');
        } else {
          setError(result?.message ?? '成績同步失敗');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '成績同步失敗';
        setError(message);
      } finally {
        syncInProgressRef.current = false;
      }
    },
    [setSyncStatus, setLastSyncedAt, setError, setGrades]
  );

  return { sync, syncInProgress: syncInProgressRef.current };
}
