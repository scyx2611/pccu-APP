import { useCallback, useRef } from 'react';
import { PccuSyncEngine } from '../../pccu/engine/PccuSyncEngine';
import * as trafficStorage from '../storage/trafficStorage';

/**
 * Hook that triggers traffic synchronization via PccuSyncEngine.
 *
 * The actual WebView scraping is handled by GlobalScraperWebView,
 * which registers itself as the SyncExecutor. This hook only:
 * 1. Enqueues a sync request via PccuSyncEngine
 * 2. Re-hydrates snapshot from storage after sync completes
 */
export function useTrafficSync() {
  const syncInProgressRef = useRef(false);

  const sync = useCallback(
    async (options: { priority?: number; silent?: boolean } = {}) => {
      if (syncInProgressRef.current) return null;

      const { priority = 5 } = options;

      try {
        syncInProgressRef.current = true;

        const engine = PccuSyncEngine.getInstance();
        await engine.waitForExecutorReady();
        const result = await engine.requestSync('traffic', priority);

        if (result?.success) {
          // Re-hydrate snapshot from storage (GlobalScraperWebView already persisted it)
          const snapshot = await trafficStorage.getTrafficSnapshot();
          return { success: true as const, snapshot, updatedAt: result.updatedAt ?? Date.now() };
        }

        return { success: false as const, message: result?.message ?? '交通同步失敗' };
      } catch (error) {
        const message = error instanceof Error ? error.message : '交通同步失敗';
        return { success: false as const, message };
      } finally {
        syncInProgressRef.current = false;
      }
    },
    []
  );

  return { sync, syncInProgress: syncInProgressRef.current };
}
