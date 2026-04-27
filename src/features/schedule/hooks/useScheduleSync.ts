import { useCallback, useRef } from 'react';
import { PccuSyncEngine } from '../../pccu/engine/PccuSyncEngine';
import { useScheduleStore } from '../store/useScheduleStore';
import * as scheduleStorage from '../storage/scheduleStorage';

/**
 * Hook that triggers schedule synchronization via PccuSyncEngine.
 *
 * The actual WebView scraping is handled by GlobalScraperWebView,
 * which registers itself as the SyncExecutor. This hook only:
 * 1. Enqueues a sync request
 * 2. Updates the Zustand store with results
 */
export function useScheduleSync() {
  const setSyncStatus = useScheduleStore((state) => state.setSyncStatus);
  const setLastSyncedAt = useScheduleStore((state) => state.setLastSyncedAt);
  const setError = useScheduleStore((state) => state.setError);
  const setCourses = useScheduleStore((state) => state.setCourses);
  const syncInProgressRef = useRef(false);

  const sync = useCallback(
    async (options: { priority?: number; silent?: boolean } = {}) => {
      if (syncInProgressRef.current) return;

      const { priority = 5, silent = false } = options;

      try {
        syncInProgressRef.current = true;
        setError(null);
        if (!silent) setSyncStatus('syncing');

        const engine = PccuSyncEngine.getInstance();
        await engine.waitForExecutorReady();
        const result = await engine.requestSync('schedule', priority);

        if (result?.success) {
          const updatedAt = result.updatedAt ?? Date.now();
          setLastSyncedAt(updatedAt);

          // Re-hydrate courses from storage (GlobalScraperWebView already persisted them)
          const cached = await scheduleStorage.getCourses();
          setCourses(cached.courses ?? []);
          setError(null);

          setSyncStatus('idle');
        } else {
          setError(result?.message ?? '課表同步失敗');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '課表同步失敗';
        setError(message);
      } finally {
        syncInProgressRef.current = false;
      }
    },
    [setSyncStatus, setLastSyncedAt, setError, setCourses]
  );

  return { sync, syncInProgress: syncInProgressRef.current };
}
