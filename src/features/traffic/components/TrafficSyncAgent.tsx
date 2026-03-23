import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { setTrafficSnapshot } from '../storage/trafficStorage';
import {
  TRAFFIC_SOURCE_URL,
  TrafficSnapshot,
  TrafficStopArrivalDraft,
  TrafficSyncResult,
  normalizeTrafficArrival,
  sortTrafficArrivals,
} from '../types';
import { buildTrafficExtractionScript } from '../sync/trafficScripts';

type TrafficSyncAgentProps = {
  enabled?: boolean;
  reloadKey?: number;
  onComplete?: (result: TrafficSyncResult) => void;
};

type Phase = 'idle' | 'load_downhill' | 'extract_downhill' | 'load_uphill' | 'extract_uphill' | 'done';

type PageConfig = {
  url: string;
  routeId: string;
  direction: 'downhill' | 'uphill';
  directionLabel: string;
  branchLabel: string;
};

const DOWNHILL_PAGE: PageConfig = {
  url: 'https://ebus.gov.taipei/Route/StopsOfRoute?routeid=0111000505',
  routeId: '0111000505',
  direction: 'downhill',
  directionLabel: '下山',
  branchLabel: '②往劍潭經文大',
};

const UPHILL_PAGE: PageConfig = {
  url: 'https://ebus.gov.taipei/Route/StopsOfRoute?routeid=0111000503',
  routeId: '0111000503',
  direction: 'uphill',
  directionLabel: '上山',
  branchLabel: '④往陽明山經文大',
};

const withTimestamp = (url: string) => `${url}${url.includes('?') ? '&' : '?'}ts=${Date.now()}`;

export default function TrafficSyncAgent({
  enabled = true,
  reloadKey = 0,
  onComplete,
}: TrafficSyncAgentProps) {
  const webViewRef = useRef<WebView>(null);
  const phaseRef = useRef<Phase>('idle');
  const completedRef = useRef(false);
  const startedReloadKeyRef = useRef<number | null>(null);
  const partialSnapshotRef = useRef<{ downhill: ReturnType<typeof normalizeTrafficArrival>[]; uphill: ReturnType<typeof normalizeTrafficArrival>[] }>({
    downhill: [],
    uphill: [],
  });
  const [currentUrl, setCurrentUrl] = useState(withTimestamp(DOWNHILL_PAGE.url));
  const userAgent = useMemo(() => (
    Platform.OS === 'ios'
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      : 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36'
  ), []);

  const finish = useCallback((result: TrafficSyncResult) => {
    phaseRef.current = 'done';

    if (!completedRef.current) {
      completedRef.current = true;
      onComplete?.(result);
    }
  }, [onComplete]);

  const persistSnapshot = useCallback(async () => {
    const snapshot: TrafficSnapshot = {
      downhill: sortTrafficArrivals('downhill', partialSnapshotRef.current.downhill),
      uphill: sortTrafficArrivals('uphill', partialSnapshotRef.current.uphill),
      updatedAt: Date.now(),
      sourceUrl: TRAFFIC_SOURCE_URL,
    };

    await setTrafficSnapshot(snapshot);
    finish({
      success: true,
      updatedAt: snapshot.updatedAt,
      counts: {
        downhill: snapshot.downhill.length,
        uphill: snapshot.uphill.length,
      },
    });
  }, [finish]);

  const injectPageScript = useCallback((config: PageConfig) => {
    webViewRef.current?.injectJavaScript(buildTrafficExtractionScript(config));
  }, []);

  const handleLoadEnd = useCallback((event: any) => {
    const url = event.nativeEvent.url || '';

    if (phaseRef.current === 'load_downhill' && url.includes(DOWNHILL_PAGE.routeId)) {
      phaseRef.current = 'extract_downhill';
      setTimeout(() => injectPageScript(DOWNHILL_PAGE), 500);
      return;
    }

    if (phaseRef.current === 'load_uphill' && url.includes(UPHILL_PAGE.routeId)) {
      phaseRef.current = 'extract_uphill';
      setTimeout(() => injectPageScript(UPHILL_PAGE), 500);
    }
  }, [injectPageScript]);

  const handleMessage = useCallback(async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.t !== 'traffic_rows') return;

      const drafts = Array.isArray(data.rows) ? (data.rows as TrafficStopArrivalDraft[]) : [];
      const normalized = drafts.map((draft) => normalizeTrafficArrival(draft));

      if (data.direction === 'downhill') {
        partialSnapshotRef.current.downhill = normalized;
        phaseRef.current = 'load_uphill';
        setCurrentUrl(withTimestamp(UPHILL_PAGE.url));
        return;
      }

      if (data.direction === 'uphill') {
        partialSnapshotRef.current.uphill = normalized;
        await persistSnapshot();
      }
    } catch (error) {
      finish({
        success: false,
        updatedAt: null,
        counts: { downhill: 0, uphill: 0 },
        message: '交通資訊解析失敗',
      });
    }
  }, [finish, persistSnapshot]);

  useEffect(() => {
    if (!enabled) return;
    if (startedReloadKeyRef.current === reloadKey) return;

    startedReloadKeyRef.current = reloadKey;
    completedRef.current = false;
    partialSnapshotRef.current = { downhill: [], uphill: [] };
    phaseRef.current = 'load_downhill';
    setCurrentUrl(withTimestamp(DOWNHILL_PAGE.url));
  }, [enabled, reloadKey]);

  if (!enabled) return null;

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        ref={webViewRef}
        style={styles.hiddenInner}
        source={{ uri: currentUrl }}
        originWhitelist={['*']}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        domStorageEnabled
        cacheEnabled={false}
        javaScriptEnabled
        userAgent={userAgent}
        onLoadEnd={handleLoadEnd}
        onMessage={handleMessage}
        onError={() => finish({
          success: false,
          updatedAt: null,
          counts: { downhill: 0, uphill: 0 },
          message: '交通資訊頁面載入失敗',
        })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    left: -1000,
    top: -1000,
  },
  hiddenInner: {
    width: 1,
    height: 1,
  },
});
