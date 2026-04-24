import { useCallback, useRef } from 'react';
import { PccuSyncEngine } from '../../pccu/engine/PccuSyncEngine';
import { useTutoringStore } from '../store/useTutoringStore';

interface UseTutoringSyncReturn {
  /** Trigger a full tutoring sync (courses + assignments + pending). */
  sync: (options?: { priority?: number; silent?: boolean }) => Promise<void>;
  /** Trigger a single-course detail sync. */
  syncCourseDetail: (courseCode: string, options?: { priority?: number }) => Promise<void>;
  /** Whether a sync is currently in progress. */
  syncInProgress: boolean;
}

/**
 * Thin wrapper around PccuSyncEngine for tutoring sync.
 *
 * All WebView scraping logic is handled by GlobalScraperWebView
 * (registered as the SyncExecutor). This hook only:
 * 1. Enqueues a sync request via PccuSyncEngine
 * 2. Updates the Zustand store on completion
 */
export function useTutoringSync(): UseTutoringSyncReturn {
  const setSyncStatus = useTutoringStore((s) => s.setSyncStatus);
  const setLastSyncedAt = useTutoringStore((s) => s.setLastSyncedAt);
  const setError = useTutoringStore((s) => s.setError);
  const syncInProgressRef = useRef(false);

  const sync = useCallback(
    async (options?: { priority?: number; silent?: boolean }) => {
      if (syncInProgressRef.current) return;
      const { priority = 5, silent = false } = options ?? {};

      try {
        syncInProgressRef.current = true;
        if (!silent) setSyncStatus('syncing');

        const engine = PccuSyncEngine.getInstance();
        await engine.waitForExecutorReady();
        const result = await engine.requestSync('tutoring', priority);

        if (result?.success) {
          setLastSyncedAt(Date.now());
          if (!silent) setSyncStatus('idle');
        } else {
          setError(result?.message ?? '課業同步失敗');
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : '課業同步失敗');
      } finally {
        syncInProgressRef.current = false;
      }
    },
    [setSyncStatus, setLastSyncedAt, setError],
  );

  const syncCourseDetail = useCallback(
    async (courseCode: string, options?: { priority?: number }) => {
      if (syncInProgressRef.current) return;
      const { priority = 5 } = options ?? {};

      try {
        syncInProgressRef.current = true;
        setSyncStatus('syncing');

        const engine = PccuSyncEngine.getInstance();
        await engine.waitForExecutorReady();
        const result = await engine.requestSync('tutoring-detail', priority, { courseCode });

        if (!result?.success) {
          setError(result?.message ?? '課程資料同步失敗');
        }
      } catch (error) {
        setError(error instanceof Error ? error.message : '課程資料同步失敗');
      } finally {
        syncInProgressRef.current = false;
      }
    },
    [setSyncStatus, setError],
  );

  return { sync, syncCourseDetail, syncInProgress: syncInProgressRef.current };
}
