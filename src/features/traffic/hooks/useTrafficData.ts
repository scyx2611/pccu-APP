import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getTrafficSnapshot } from '../storage/trafficStorage';
import { TrafficSnapshot, TrafficSyncResult } from '../types';

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
  const [reloadKey, setReloadKey] = useState(0);
  const refreshingRef = useRef(false);
  const refreshModeRef = useRef<'manual' | 'auto'>('auto');

  const loadSnapshot = useCallback(async () => {
    const cached = await getTrafficSnapshot();
    setSnapshot(cached);
    setCacheLoaded(true);
    return cached;
  }, []);

  const refresh = useCallback((mode: 'manual' | 'auto' = 'manual') => {
    if (refreshingRef.current) return;

    refreshingRef.current = true;
    refreshModeRef.current = mode;
    setError(null);
    setRefreshing(true);
    setPullRefreshing(mode === 'manual');
    setReloadKey((value) => value + 1);
  }, []);

  const handleSyncComplete = useCallback(async (result: TrafficSyncResult) => {
    refreshingRef.current = false;
    setRefreshing(false);
    setPullRefreshing(false);
    await loadSnapshot();

    if (result.success) {
      setError(null);
      return;
    }

    setError(result.message || '交通資訊更新失敗');
  }, [loadSnapshot]);

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    if (!active || !cacheLoaded) return;

    const hasFreshSnapshot = snapshot && Date.now() - snapshot.updatedAt <= staleAfterMs;
    if (!hasFreshSnapshot) {
      refresh('auto');
    }

    const intervalId = setInterval(() => {
      refresh('auto');
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
    sync: {
      enabled: active && refreshing,
      reloadKey,
      onComplete: handleSyncComplete,
    },
  };
}
