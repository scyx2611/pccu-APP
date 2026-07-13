import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getTrafficSnapshot } from '../storage/trafficStorage';
import { TrafficSnapshot } from '../types';
import { useTrafficSync } from './useTrafficSync';

type UseTrafficDataOptions = {
  active?: boolean;
  refreshIntervalMs?: number;
  staleAfterMs?: number;
};

export function useTrafficData({
  active = true,
  refreshIntervalMs = 60_000,
  staleAfterMs = 60_000,
}: UseTrafficDataOptions = {}) {
  const [snapshot, setSnapshot] = useState<TrafficSnapshot | null>(null);
  const [cacheLoaded, setCacheLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshingRef = useRef(false);
  const { sync: trafficSync } = useTrafficSync();

  const loadSnapshot = useCallback(async () => {
    const cached = await getTrafficSnapshot();
    setSnapshot(cached);
    setCacheLoaded(true);
    return cached;
  }, []);

  const refresh = useCallback(
    async (mode: 'manual' | 'auto' = 'manual') => {
      if (refreshingRef.current) return;

      refreshingRef.current = true;
      setError(null);
      setRefreshing(true);
      setPullRefreshing(mode === 'manual');

      const result = await trafficSync();

      refreshingRef.current = false;
      setRefreshing(false);
      setPullRefreshing(false);

      if (result?.success) {
        // Re-hydrate from storage (PccuSyncEngine executor already persisted)
        const updated = await loadSnapshot();
        if (!updated) {
          setError('交通資訊更新失敗');
        }
      } else {
        setError(result?.message ?? '交通資訊更新失敗');
      }
    },
    [trafficSync, loadSnapshot],
  );

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    if (!active || !cacheLoaded) return;

    const hasFreshSnapshot = snapshot && Date.now() - snapshot.updatedAt <= staleAfterMs;
    if (!hasFreshSnapshot) {
      void refresh('auto');
    }

    const intervalId = setInterval(() => {
      void refresh('auto');
    }, refreshIntervalMs);

    return () => clearInterval(intervalId);
  }, [active, cacheLoaded, refresh, refreshIntervalMs, snapshot, staleAfterMs]);

  const isStale = useMemo(() => {
    if (!snapshot) return true;
    return Date.now() - snapshot.updatedAt > staleAfterMs;
  }, [snapshot, staleAfterMs]);

  return {
    snapshot,
    loading: !cacheLoaded || (!snapshot && refreshing),
    refreshing,
    pullRefreshing,
    backgroundRefreshing: refreshing && !pullRefreshing,
    error,
    isStale,
    refresh,
  };
}
