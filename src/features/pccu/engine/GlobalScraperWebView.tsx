import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import * as SecureStore from 'expo-secure-store';
import {
  PccuSyncEngine,
  type SyncRequest,
  type SyncType,
} from '../../pccu/engine/PccuSyncEngine';
import {
  pccuBrowserSessionGate,
  type PccuBrowserSessionLease,
} from './pccuBrowserSessionGate';
import { getSavedPCCUCredentials } from '../../auth/services/authService';
import {
  buildLoginScript,
  buildRobustGradePageScript,
  buildAdaptiveSchedulePageScript,
  buildServiceOpenScript,
  type PCCUCredentials,
} from '../../pccu/sync/pccuSyncScripts';
import { buildTrafficExtractionScript } from '../../traffic/sync/trafficScripts';
import {
  parseGradesFromHtml,
  parseScheduleFromHtml,
  hasSuspiciousCourseNames,
  sanitizeCourseList,
  type SemesterGrade,
  type CourseData,
} from '../../pccu/parsers/pccuScraper';
import { setGrades as saveGrades } from '../../grade/storage/gradeStorage';
import { setCourses as saveCourses } from '../../schedule/storage/scheduleStorage';
import { setTrafficSnapshot } from '../../traffic/storage/trafficStorage';
import {
  TRAFFIC_SOURCE_URL,
  type TrafficSnapshot,
  type TrafficStopArrivalDraft,
  normalizeTrafficArrival,
  sortTrafficArrivals,
} from '../../traffic/types';
import { refreshScheduledCourseReminders } from '../../notifications/services/courseReminderService';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PCCU_DEFAULT_URL = 'https://ecampus.pccu.edu.tw/eCampus/default.aspx';
const PCCU_INSIDE_URL = 'https://ecampus.pccu.edu.tw/eCampus/inside.aspx';

const TRAFFIC_DOWNHILL_URL = 'https://ebus.gov.taipei/Route/StopsOfRoute?routeid=0111000505';
const TRAFFIC_UPHILL_URL = 'https://ebus.gov.taipei/Route/StopsOfRoute?routeid=0111000503';

const withTimestamp = (url: string) => `${url}${url.includes('?') ? '&' : '?'}ts=${Date.now()}`;

const USER_AGENT =
  Platform.OS === 'ios'
    ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    : 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type PccuPhase =
  | 'idle'
  | 'load_ecampus'
  | 'logging_in'
  | 'open_target'
  | 'syncing'
  | 'done';

type TrafficPhase =
  | 'idle'
  | 'load_downhill'
  | 'extract_downhill'
  | 'load_uphill'
  | 'extract_uphill'
  | 'done';

type ActiveMode = 'pccu' | 'traffic' | 'none';

type PendingRequest = {
  request: SyncRequest;
  retries: number;
  phase: PccuPhase | TrafficPhase;
  lastHandledUrl: string;
  lastInjectKey: string;
  lastInjectAt: number;
  completed: boolean;
};

type TrafficPartial = {
  downhill: ReturnType<typeof normalizeTrafficArrival>[];
  uphill: ReturnType<typeof normalizeTrafficArrival>[];
};

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

const normalizeGradeUrl = (url: string) =>
  (url || '').replace(/([?&])NoCache=[^&]+/gi, '$1').replace(/[?&]$/, '');

const normalizeScheduleUrl = (url: string) =>
  (url || '')
    .replace(/([?&])NoCache=[^&]+/gi, '$1')
    .replace(/([?&])lvMainMenuIndex=[^&]+/gi, '$1')
    .replace(/[?&]$/, '');

const isGradeQueryUrl = (url: string) =>
  /https?:\/\/ap\d\.pccu\.edu\.tw\/studentscore\/student\/(?:index|index_score|scoreListAll)\.asp/i.test(url || '');

const isScheduleQueryUrl = (url: string) =>
  /\/queryCourse\/(?:index|queryByCourse|queryByStudent)\.asp/i.test(url || '');

const isTransUrlForType = (url: string, type: SyncType) => {
  const code = type === 'schedule' ? '1208' : '1220';
  return new RegExp(`TransUrl\\.aspx\\?PrjNo=${code}`, 'i').test(url || '');
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GlobalScraperWebView() {
  const webViewRef = useRef<WebView>(null);
  const credRef = useRef<PCCUCredentials | null>(null);
  const pendingRef = useRef<PendingRequest | null>(null);
  const trafficPartialRef = useRef<TrafficPartial>({ downhill: [], uphill: [] });
  const activeModeRef = useRef<ActiveMode>('none');
  const pccuPhaseRef = useRef<PccuPhase>('idle');
  const trafficPhaseRef = useRef<TrafficPhase>('idle');
  const pccuSessionLeaseRef = useRef<PccuBrowserSessionLease | null>(null);
  const unmountedRef = useRef(false);
  const [trafficUrl, setTrafficUrl] = useState(withTimestamp(TRAFFIC_DOWNHILL_URL));
  const [sourceUri, setSourceUri] = useState(PCCU_DEFAULT_URL);

  const releasePccuSessionLease = useCallback(() => {
    pccuSessionLeaseRef.current?.release();
    pccuSessionLeaseRef.current = null;
  }, []);

  // -----------------------------------------------------------------------
  // Executor registration
  // -----------------------------------------------------------------------

  const executeRequest = useCallback(
    async (request: SyncRequest): Promise<any> => {
      return new Promise(async (resolve, reject) => {
        const type = request.type;

        let settled = false;

        const resolveOnce = (data: any) => {
          if (settled) return;
          settled = true;
          request.setAbortHandler?.(null);
          resolve(data);
        };

        const rejectOnce = (error: Error) => {
          if (settled) return;
          settled = true;
          request.setAbortHandler?.(null);
          reject(error);
        };

        if (type === 'traffic') {
          activeModeRef.current = 'traffic';
          trafficPhaseRef.current = 'load_downhill';
          trafficPartialRef.current = { downhill: [], uphill: [] };
          setTrafficUrl(withTimestamp(TRAFFIC_DOWNHILL_URL));
          pendingRef.current = {
            request: { ...request, resolve: resolveOnce, reject: rejectOnce },
            retries: 0,
            phase: 'load_downhill',
            lastHandledUrl: '',
            lastInjectKey: '',
            lastInjectAt: 0,
            completed: false,
          };

          // Traffic uses its own URL — sourceUri stays PCCU, we navigate via trafficUrl
          return;
        }

        let abortError: Error | null = null;
        request.setAbortHandler?.((_, error) => {
          abortError = error;
          const activePending = pendingRef.current;

          if (activePending?.request.id === request.id && !activePending.completed) {
            activePending.completed = true;
            releasePccuSessionLease();
            activePending.request.reject(error);
            pendingRef.current = null;
            activeModeRef.current = 'none';
            pccuPhaseRef.current = 'done';
            return;
          }

          releasePccuSessionLease();
          rejectOnce(error);
        });

        try {
          const lease = await pccuBrowserSessionGate.acquire(`shared-scraper:${type}:${request.id}`);

          if (abortError || unmountedRef.current) {
            lease.release();
            rejectOnce(
              abortError ?? new Error('Sync executor became unavailable. Shared scraper was unmounted.')
            );
            return;
          }

          pccuSessionLeaseRef.current = lease;
          request.refreshTimeout?.();
        } catch (error) {
          rejectOnce(error instanceof Error ? error : new Error(String(error)));
          return;
        }

        activeModeRef.current = 'pccu';
        pccuPhaseRef.current = 'idle';
        pendingRef.current = {
          request: { ...request, resolve: resolveOnce, reject: rejectOnce },
          retries: 0,
          phase: 'idle',
          lastHandledUrl: '',
          lastInjectKey: '',
          lastInjectAt: 0,
          completed: false,
        };

        // For PCCU types, load the default page then start the flow
        setSourceUri(`${PCCU_DEFAULT_URL}?ts=${Date.now()}`);
      });
    },
    [releasePccuSessionLease]
  );

  useEffect(() => {
    const engine = PccuSyncEngine.getInstance();
    const executorId = engine.setExecutor(executeRequest);

    return () => {
      if (executorId !== null) {
        engine.clearExecutor(executorId);
      }
    };
  }, [executeRequest]);

  // -----------------------------------------------------------------------
  // PCCU login flow
  // -----------------------------------------------------------------------

  const finishPccu = useCallback(
    (result: { success: boolean; data?: any; message?: string }) => {
      const pending = pendingRef.current;
      if (!pending || pending.completed) return;
      pending.completed = true;

      if (result.success) {
        pending.request.resolve(result.data);
      } else {
        pending.request.reject(new Error(result.message || 'Sync failed'));
      }
      releasePccuSessionLease();
      pendingRef.current = null;
      activeModeRef.current = 'none';
      pccuPhaseRef.current = 'done';
    },
    [releasePccuSessionLease]
  );

  useEffect(() => {
    unmountedRef.current = false;

    return () => {
      unmountedRef.current = true;
      releasePccuSessionLease();
    };
  }, [releasePccuSessionLease]);

  const runLogin = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    const cred = credRef.current;
    if (!cred) {
      finishPccu({ success: false, message: '找不到登入憑證' });
      return;
    }
    pccuPhaseRef.current = 'logging_in';
    webViewRef.current?.injectJavaScript(buildLoginScript(cred));
  }, [finishPccu]);

  const injectPccuScript = useCallback(
    (type: SyncType, reason: string, rawUrl?: string, minIntervalMs = 1200) => {
      const pending = pendingRef.current;
      if (!pending) return;

      const normalize =
        type === 'grade' ? normalizeGradeUrl : normalizeScheduleUrl;
      const key = normalize(rawUrl || pending.lastHandledUrl || '');
      const now = Date.now();

      if (key && pending.lastInjectKey === key && now - pending.lastInjectAt < minIntervalMs) {
        return;
      }

      pending.lastInjectKey = key;
      pending.lastInjectAt = now;
      console.log('[global-scraper][inject]', type, reason, rawUrl || key);

      const script =
        type === 'grade'
          ? buildRobustGradePageScript()
          : buildAdaptiveSchedulePageScript();
      webViewRef.current?.injectJavaScript(script);
    },
    []
  );

  const persistGrades = useCallback(
    async (incomingGrades: SemesterGrade[]): Promise<boolean> => {
      if (!incomingGrades || incomingGrades.length === 0) return false;
      const updatedAt = Date.now();
      await saveGrades(incomingGrades, [], updatedAt);
      return true;
    },
    []
  );

  const persistCourses = useCallback(
    async (incomingCourses: CourseData[]): Promise<boolean> => {
      const parsed = sanitizeCourseList(incomingCourses);
      if (parsed.length === 0) return false;
      const updatedAt = Date.now();
      await saveCourses(parsed, false, updatedAt);
      await refreshScheduledCourseReminders(parsed);
      return true;
    },
    []
  );

  const retryPccu = useCallback(
    (type: SyncType, message: string) => {
      const pending = pendingRef.current;
      if (!pending) return;
      if (pending.retries >= 2) {
        finishPccu({ success: false, message });
        return;
      }
      pending.retries += 1;
      pending.lastHandledUrl = '';
      pending.lastInjectKey = '';
      pending.lastInjectAt = 0;
      pccuPhaseRef.current = 'syncing';
      injectPccuScript(type, 'retry');
    },
    [finishPccu, injectPccuScript]
  );

  // -----------------------------------------------------------------------
  // Traffic helpers
  // -----------------------------------------------------------------------

  const finishTraffic = useCallback(
    async (result: { success: boolean; message?: string }) => {
      const pending = pendingRef.current;
      if (!pending || pending.completed) return;
      pending.completed = true;

      if (result.success) {
        const snapshot: TrafficSnapshot = {
          downhill: sortTrafficArrivals('downhill', trafficPartialRef.current.downhill),
          uphill: sortTrafficArrivals('uphill', trafficPartialRef.current.uphill),
          updatedAt: Date.now(),
          sourceUrl: TRAFFIC_SOURCE_URL,
        };
        await setTrafficSnapshot(snapshot);
        pending.request.resolve({
          success: true,
          updatedAt: snapshot.updatedAt,
          counts: {
            downhill: snapshot.downhill.length,
            uphill: snapshot.uphill.length,
          },
        });
      } else {
        pending.request.reject(new Error(result.message || 'Traffic sync failed'));
      }
      pendingRef.current = null;
      activeModeRef.current = 'none';
      trafficPhaseRef.current = 'done';
    },
    []
  );

  const injectTrafficScript = useCallback(
    (direction: 'downhill' | 'uphill', routeId: string) => {
      const config = {
        direction,
        directionLabel: direction === 'downhill' ? '下山' : '上山',
        branchLabel: direction === 'downhill' ? '②往劍潭經文大' : '④往陽明山經文大',
        routeId,
      };
      webViewRef.current?.injectJavaScript(buildTrafficExtractionScript(config));
    },
    []
  );

  // -----------------------------------------------------------------------
  // Navigation handler
  // -----------------------------------------------------------------------

  const handleNavChange = useCallback(
    (nav: WebViewNavigation) => {
      if (nav.loading) return;
      const url = nav.url || '';
      const pending = pendingRef.current;
      if (!pending) return;

      const mode = activeModeRef.current;

      if (mode === 'pccu') {
        const type = pending.request.type as SyncType;
        pending.request.refreshTimeout?.();
        console.log('[global-scraper][nav][pccu]', pccuPhaseRef.current, url);

        if (url.includes('inside.aspx')) {
          pccuPhaseRef.current = 'open_target';
          const serviceCode = type === 'schedule' ? '1208' : '1220';
          setTimeout(() => {
            webViewRef.current?.injectJavaScript(buildServiceOpenScript(serviceCode as '1208' | '1220'));
          }, 1200);
          return;
        }

        if (pccuPhaseRef.current === 'open_target' && isTransUrlForType(url, type)) {
          pending.lastHandledUrl = url;
          if (type === 'schedule') {
            pccuPhaseRef.current = 'syncing';
            setTimeout(() => injectPccuScript('schedule', 'transurl', url, 0), 400);
          } else {
            setTimeout(() => {
              webViewRef.current?.injectJavaScript(buildServiceOpenScript('1220'));
            }, 400);
          }
          return;
        }

        if (pccuPhaseRef.current === 'load_ecampus' && url.includes('default.aspx')) {
          runLogin();
          return;
        }

        if (type === 'grade' && isGradeQueryUrl(url)) {
          pending.lastHandledUrl = url;
          pccuPhaseRef.current = 'syncing';
          setTimeout(() => injectPccuScript('grade', 'nav', url), 1200);
        } else if (type === 'schedule' && isScheduleQueryUrl(url)) {
          pending.lastHandledUrl = url;
          pccuPhaseRef.current = 'syncing';
          setTimeout(() => injectPccuScript('schedule', 'nav', url), 1200);
        }
      } else if (mode === 'traffic') {
        console.log('[global-scraper][nav][traffic]', trafficPhaseRef.current, url);

        if (trafficPhaseRef.current === 'load_downhill' && url.includes('0111000505')) {
          trafficPhaseRef.current = 'extract_downhill';
          setTimeout(() => injectTrafficScript('downhill', '0111000505'), 500);
        } else if (trafficPhaseRef.current === 'load_uphill' && url.includes('0111000503')) {
          trafficPhaseRef.current = 'extract_uphill';
          setTimeout(() => injectTrafficScript('uphill', '0111000503'), 500);
        }
      }
    },
    [runLogin, injectPccuScript, injectTrafficScript]
  );

  // -----------------------------------------------------------------------
  // Message handler
  // -----------------------------------------------------------------------

  const handleMessage = useCallback(
    async (event: any) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        const pending = pendingRef.current;
        if (!pending) return;

        const mode = activeModeRef.current;

        if (mode === 'pccu') {
          const type = pending.request.type as SyncType;
          pending.request.refreshTimeout?.();
          console.log('[global-scraper][msg][pccu]', data.t, data.m || '');

          if (data.t === 'user_name' && data.n) {
            await SecureStore.setItemAsync('user_name', data.n);
            return;
          }

          if (data.t === 'login_ok') {
            pccuPhaseRef.current = 'open_target';
            pending.lastHandledUrl = '';
            webViewRef.current?.injectJavaScript(`window.location.href=${JSON.stringify(PCCU_INSIDE_URL)};true;`);
            return;
          }

          if (data.t === 'popup') {
            pending.lastHandledUrl = '';
            webViewRef.current?.injectJavaScript(`window.location.href=${JSON.stringify(data.url)};true;`);
            return;
          }

          if (data.t === 'html' && type === 'grade') {
            const parsed = parseGradesFromHtml(typeof data.h === 'string' ? data.h : '');
            if (await persistGrades(parsed)) {
              finishPccu({
                success: true,
                data: { success: true, updatedAt: Date.now(), semestersCount: parsed.length },
              });
            } else {
              retryPccu('grade', '成績同步失敗');
            }
            return;
          }

          if ((data.t === 'courses' || data.t === 'html') && type === 'schedule') {
            let parsed: CourseData[] = [];
            if (data.t === 'courses') {
              const fromCourses = sanitizeCourseList(Array.isArray(data.c) ? (data.c as CourseData[]) : []);
              const fromHtml =
                typeof data.h === 'string' && data.h
                  ? sanitizeCourseList(parseScheduleFromHtml(data.h))
                  : [];
              parsed =
                fromHtml.length > 0 &&
                (fromHtml.length >= fromCourses.length || hasSuspiciousCourseNames(fromCourses))
                  ? fromHtml
                  : fromCourses;
            } else {
              parsed = sanitizeCourseList(
                parseScheduleFromHtml(typeof data.h === 'string' ? data.h : '')
              );
            }

            if (await persistCourses(parsed)) {
              finishPccu({
                success: true,
                data: { success: true, updatedAt: Date.now(), coursesCount: parsed.length },
              });
            } else {
              retryPccu('schedule', '課表同步失敗');
            }
            return;
          }

          if (data.t === 'err') {
            const message = data.m
              ? `${type === 'grade' ? '成績' : '課表'}同步失敗：${data.m}`
              : `${type === 'grade' ? '成績' : '課表'}同步失敗`;
            if (
              (pccuPhaseRef.current === 'open_target' || pccuPhaseRef.current === 'syncing') &&
              typeof data.m === 'string' &&
              /Network request failed|Login request timed out|Login request aborted/i.test(data.m)
            ) {
              return;
            }
            if (pccuPhaseRef.current === 'syncing') {
              retryPccu(type, message);
            } else {
              finishPccu({ success: false, message });
            }
          }
        } else if (mode === 'traffic') {
          console.log('[global-scraper][msg][traffic]', data.t);

          if (data.t === 'traffic_rows') {
            const drafts = Array.isArray(data.rows) ? (data.rows as TrafficStopArrivalDraft[]) : [];
            const normalized = drafts.map((d) => normalizeTrafficArrival(d));

            if (data.direction === 'downhill') {
              trafficPartialRef.current.downhill = normalized;
              trafficPhaseRef.current = 'load_uphill';
              setTrafficUrl(withTimestamp(TRAFFIC_UPHILL_URL));
            } else if (data.direction === 'uphill') {
              trafficPartialRef.current.uphill = normalized;
              await finishTraffic({ success: true });
            }
          }
        }
      } catch (error) {
        const pending = pendingRef.current;
        if (pending && !pending.completed) {
          const mode = activeModeRef.current;
          if (mode === 'pccu') {
            const type = pending.request.type as SyncType;
            finishPccu({
              success: false,
              message: type === 'grade' ? '成績同步失敗' : '課表同步失敗',
            });
          } else if (mode === 'traffic') {
            finishTraffic({ success: false, message: '交通資訊解析失敗' });
          }
        }
      }
    },
    [finishPccu, finishTraffic, persistGrades, persistCourses, retryPccu]
  );

  // -----------------------------------------------------------------------
  // Load end handler (PCCU only)
  // -----------------------------------------------------------------------

  const handleLoadEnd = useCallback(
    (event: any) => {
      const currentUrl = event.nativeEvent.url || '';
      const pending = pendingRef.current;
      if (!pending || activeModeRef.current !== 'pccu') return;

      const type = pending.request.type as SyncType;

      if (pccuPhaseRef.current === 'load_ecampus' && currentUrl.includes('default.aspx')) {
        runLogin();
        return;
      }

      if (pccuPhaseRef.current === 'syncing') {
        const isTarget =
          type === 'grade' ? isGradeQueryUrl(currentUrl) : isScheduleQueryUrl(currentUrl);
        if (isTarget) {
          setTimeout(() => {
            injectPccuScript(type, 'loadend', currentUrl, 1600);
          }, 400);
        }
        return;
      }

      if (pccuPhaseRef.current === 'open_target' && isTransUrlForType(currentUrl, type)) {
        if (type === 'schedule') {
          pccuPhaseRef.current = 'syncing';
          setTimeout(() => {
            injectPccuScript('schedule', 'loadend-transurl', currentUrl, 0);
          }, 400);
        } else {
          setTimeout(() => {
            webViewRef.current?.injectJavaScript(buildServiceOpenScript('1220'));
          }, 400);
        }
      }
    },
    [runLogin, injectPccuScript]
  );

  // -----------------------------------------------------------------------
  // Traffic URL effect — when trafficUrl changes, navigate the WebView
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (activeModeRef.current === 'traffic') {
      setSourceUri(trafficUrl);
    }
  }, [trafficUrl]);

  // -----------------------------------------------------------------------
  // Kick off PCCU flow when sourceUri changes and we have a pending request
  // -----------------------------------------------------------------------

  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending || activeModeRef.current !== 'pccu') return;

    // Credentials are fetched once and cached
    const init = async () => {
      if (!credRef.current) {
        const saved = await getSavedPCCUCredentials();
        if (!saved) {
          finishPccu({ success: false, message: '請先登入' });
          return;
        }
        credRef.current = saved;
      }

      pending.retries = 0;
      pending.lastHandledUrl = '';
      pending.lastInjectKey = '';
      pending.lastInjectAt = 0;
      pccuPhaseRef.current = 'load_ecampus';
    };
    void init();
  }, [sourceUri, finishPccu]);

  // -----------------------------------------------------------------------
  // Error handler
  // -----------------------------------------------------------------------

  const handleError = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending || pending.completed) return;
    const mode = activeModeRef.current;
    if (mode === 'pccu') {
      const type = pending.request.type as SyncType;
      finishPccu({
        success: false,
        message: type === 'grade' ? '成績頁面載入失敗' : '課表頁面載入失敗',
      });
    } else if (mode === 'traffic') {
      finishTraffic({ success: false, message: '交通資訊頁面載入失敗' });
    }
  }, [finishPccu, finishTraffic]);

  // -----------------------------------------------------------------------
  // Determine which URL the WebView should show
  // -----------------------------------------------------------------------

  const activeUri = useMemo(() => {
    if (activeModeRef.current === 'traffic') {
      return trafficUrl;
    }
    return sourceUri;
  }, [trafficUrl, sourceUri]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        ref={webViewRef}
        style={styles.hiddenInner}
        source={{ uri: activeUri }}
        originWhitelist={['*']}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        domStorageEnabled
        cacheEnabled={false}
        userAgent={USER_AGENT}
        onNavigationStateChange={handleNavChange}
        onMessage={handleMessage}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        javaScriptEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    width: 375,
    height: 667,
    opacity: 0,
    left: -1000,
    top: -1000,
  },
  hiddenInner: {
    width: 375,
    height: 667,
  },
});
