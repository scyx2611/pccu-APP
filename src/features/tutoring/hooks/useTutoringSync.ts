import { useCallback, useRef } from 'react';
import { PccuSyncEngine } from '../../pccu/engine/PccuSyncEngine';
import { useTutoringStore } from '../store/useTutoringStore';

interface UseTutoringSyncReturn {
  /** Trigger a full tutoring sync (courses + assignments + pending). */
  sync: (options?: { priority?: number; silent?: boolean; force?: boolean }) => Promise<void>;
  /** Trigger a single-course detail sync. */
  syncCourseDetail: (
    courseCode: string,
    options?: { priority?: number; force?: boolean; silent?: boolean },
  ) => Promise<void>;
  /** Whether a sync is currently in progress. */
  syncInProgress: boolean;
}

let overviewSyncPromise: Promise<void> | null = null;
const detailSyncPromises = new Map<string, Promise<void>>();

function hasLoadedSupplementalDetail(
  detail: { progress?: unknown; classmates?: unknown } | undefined,
) {
  if (!detail) return false;
  return (
    Object.prototype.hasOwnProperty.call(detail, 'progress') &&
    Object.prototype.hasOwnProperty.call(detail, 'classmates')
  );
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
  const setSyncPhase = useTutoringStore((s) => s.setSyncPhase);
  const setLastSyncedAt = useTutoringStore((s) => s.setLastSyncedAt);
  const setError = useTutoringStore((s) => s.setError);
  const syncInProgressRef = useRef(false);

  const sync = useCallback(
    async (options?: { priority?: number; silent?: boolean; force?: boolean }) => {
      if (overviewSyncPromise && !options?.force) return;
      const { priority = 5, silent = false } = options ?? {};

      const runSync = async () => {
        syncInProgressRef.current = true;
        if (!silent) {
          setSyncStatus('syncing');
          setSyncPhase('fetching_courses');
        }

        const engine = PccuSyncEngine.getInstance();
        await engine.waitForExecutorReady();
        const result = silent
          ? await engine.requestSync('tutoring', priority, { silent: true })
          : await engine.requestSync('tutoring', priority);

        if (result?.success) {
          setLastSyncedAt(Date.now());
          if (!silent) {
            setSyncStatus('idle');
            setSyncPhase('complete');
          }
        } else if (!silent) {
          setError(result?.message ?? 'Tutoring sync failed');
        }
      };

      overviewSyncPromise = runSync()
        .catch((error) => {
          if (!silent) {
            setError(error instanceof Error ? error.message : 'Tutoring sync failed');
          }
        })
        .finally(() => {
          syncInProgressRef.current = false;
          overviewSyncPromise = null;
        });

      await overviewSyncPromise;
    },
    [setSyncStatus, setSyncPhase, setLastSyncedAt, setError],
  );

  const syncCourseDetail = useCallback(
    async (
      courseCode: string,
      options?: { priority?: number; force?: boolean; silent?: boolean },
    ) => {
      const normalizedCourseCode = String(courseCode || '').trim();
      if (!normalizedCourseCode) return;

      const { priority = 5, force = false, silent = false } = options ?? {};
      const existingDetail = useTutoringStore.getState().courseDetails.get(normalizedCourseCode);

      if (existingDetail?.courseInfo && hasLoadedSupplementalDetail(existingDetail) && !force)
        return;
      if (detailSyncPromises.has(normalizedCourseCode) && !force) return;

      const runSync = async () => {
        syncInProgressRef.current = true;
        if (!silent) {
          setSyncStatus('syncing');
          setSyncPhase('fetching_details');
        }

        const engine = PccuSyncEngine.getInstance();
        await engine.waitForExecutorReady();
        const result = await engine.requestSync(
          'tutoring-detail',
          priority,
          silent
            ? { courseCode: normalizedCourseCode, silent: true }
            : { courseCode: normalizedCourseCode },
        );

        if (result?.success) {
          if (!silent) {
            setSyncStatus('idle');
            setSyncPhase('complete');
          }
        } else if (!silent) {
          setError(result?.message ?? 'Tutoring course detail sync failed');
        }
      };

      const promise = runSync()
        .catch((error) => {
          if (!silent) {
            setError(error instanceof Error ? error.message : 'Tutoring course detail sync failed');
          }
        })
        .finally(() => {
          syncInProgressRef.current = false;
          detailSyncPromises.delete(normalizedCourseCode);
        });

      detailSyncPromises.set(normalizedCourseCode, promise);
      await promise;
    },
    [setSyncStatus, setSyncPhase, setError],
  );

  return { sync, syncCourseDetail, syncInProgress: syncInProgressRef.current };
}
