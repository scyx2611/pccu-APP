import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import {
  ALLOWED_WEBVIEW_ORIGINS,
  isAllowedWebViewUrl,
} from '../../../core/sync/webview/hostPolicy';
import {
  buildLegacyProtocolPrelude,
  decodeWebViewEnvelope,
  type WebViewProtocolIdentity,
} from '../../../core/sync/webview/protocol';
import {
  registerWebViewSessionControl,
  type WebViewSessionClearReason,
} from '../../../core/sync/webview/webViewSessionControl';
import { registerWebViewHostAcceptanceProbe } from '../../../core/sync/webview/webViewAcceptanceProbe';
import { PccuSyncEngine, type SyncRequest, type SyncType } from '../../pccu/engine/PccuSyncEngine';
import { pccuBrowserSessionGate, type PccuBrowserSessionLease } from './pccuBrowserSessionGate';
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
import {
  buildTutoringOverviewScript,
  buildTutoringAllAssignmentsScript,
  buildTutoringPendingAssignmentsScript,
  buildTutoringSingleCourseScript,
  buildTutoringFileDownloadScript,
  buildTutoringFileUploadScript,
  buildWaitForCourseFpScript,
} from '../../tutoring/sync/tutoringScripts';
import {
  setCourses as storageSetCourses,
  setPendingAssignments,
  setAllAssignments,
  setCourseDetail as persistCourseDetail,
  setCourseInfo as persistCourseInfo,
} from '../../tutoring/storage/tutoringStorage';
import { useTutoringStore } from '../../tutoring/store/useTutoringStore';
import {
  getDeveloperDebugEnabled,
  subscribeDeveloperDebugEnabled,
} from '../../settings/storage/developerSettings';
import {
  getScraperDebugPreviewFrame,
  setScraperDebugRuntimeState,
  subscribeScraperDebugPreviewFrame,
  type ScraperDebugPreviewFrame,
} from './scraperDebugPreview';
import { createLogger } from '../../../shared/utils/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PCCU_DEFAULT_URL = 'https://ecampus.pccu.edu.tw/eCampus/default.aspx';
const PCCU_INSIDE_URL = 'https://ecampus.pccu.edu.tw/eCampus/inside.aspx';
const TUTORING_HOME_URL = 'https://icas.pccu.edu.tw/cfp/';

const TRAFFIC_DOWNHILL_URL = 'https://ebus.gov.taipei/Route/StopsOfRoute?routeid=0111000505';
const TRAFFIC_UPHILL_URL = 'https://ebus.gov.taipei/Route/StopsOfRoute?routeid=0111000503';
const SESSION_RESET_TIMEOUT_MS = 8_000;

const withTimestamp = (url: string) => `${url}${url.includes('?') ? '&' : '?'}ts=${Date.now()}`;

const isTutoringTransUrl = (url: string) => /TransUrl\.aspx\?PrjNo=1202/i.test(url || '');
const isInternalBlankPage = (url: string) => url.startsWith('about:blank');
const logger = createLogger('global-scraper');

const USER_AGENT =
  Platform.OS === 'ios'
    ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    : 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type PccuPhase = 'idle' | 'load_ecampus' | 'logging_in' | 'open_target' | 'syncing' | 'done';

type TrafficPhase =
  | 'idle'
  | 'load_downhill'
  | 'extract_downhill'
  | 'load_uphill'
  | 'extract_uphill'
  | 'done';

type TutoringPhase =
  | 'idle'
  | 'load_ecampus'
  | 'logging_in'
  | 'open_target'
  | 'waiting_coursefp'
  | 'fetching_courses'
  | 'fetching_details'
  | 'fetching_single_course'
  | 'done';

type ActiveMode = 'pccu' | 'pccu-tutoring' | 'traffic' | 'none';

type PendingRequest = {
  request: SyncRequest;
  protocolIdentity: WebViewProtocolIdentity;
  retries: number;
  phase: PccuPhase | TrafficPhase;
  lastHandledUrl: string;
  lastInjectKey: string;
  lastInjectAt: number;
  targetOpenRequested: boolean;
  completed: boolean;
};

type TrafficPartial = {
  downhill: ReturnType<typeof normalizeTrafficArrival>[];
  uphill: ReturnType<typeof normalizeTrafficArrival>[];
};

type PendingSessionReset = {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
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
  /https?:\/\/ap\d\.pccu\.edu\.tw\/studentscore\/student\/(?:index|index_score|scoreListAll)\.asp/i.test(
    url || '',
  );

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
  const protocolGenerationRef = useRef(0);
  const messageSessionGenerationRef = useRef(0);
  const inFlightMessageHandlersRef = useRef<Set<Promise<void>>>(new Set());
  const sessionResetRef = useRef<PendingSessionReset | null>(null);
  const trafficPartialRef = useRef<TrafficPartial>({ downhill: [], uphill: [] });
  const activeModeRef = useRef<ActiveMode>('none');
  const pccuPhaseRef = useRef<PccuPhase>('idle');
  const trafficPhaseRef = useRef<TrafficPhase>('idle');
  const tutoringPhaseRef = useRef<TutoringPhase>('idle');
  const tutoringCourseCodeRef = useRef<string | null>(null);
  const pccuSessionLeaseRef = useRef<PccuBrowserSessionLease | null>(null);
  const unmountedRef = useRef(false);
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const [trafficUrl, setTrafficUrl] = useState(withTimestamp(TRAFFIC_DOWNHILL_URL));
  const [sourceUri, setSourceUri] = useState(PCCU_DEFAULT_URL);
  const [debugVisible, setDebugVisible] = useState(false);
  const [debugFrame, setDebugFrame] = useState<ScraperDebugPreviewFrame | null>(() =>
    getScraperDebugPreviewFrame(),
  );
  const [debugUrl, setDebugUrl] = useState(PCCU_DEFAULT_URL);
  const [debugMessage, setDebugMessage] = useState('idle');

  const releasePccuSessionLease = useCallback(() => {
    pccuSessionLeaseRef.current?.release();
    pccuSessionLeaseRef.current = null;
  }, []);

  const clearWebViewSession = useCallback(
    (reason: WebViewSessionClearReason): Promise<void> => {
      if (sessionResetRef.current) return sessionResetRef.current.promise;

      messageSessionGenerationRef.current += 1;
      let resolve!: () => void;
      let reject!: (error: Error) => void;
      const blankPagePromise = new Promise<void>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      const timeout = setTimeout(() => {
        reject(new Error('webview_session_reset_timeout'));
      }, SESSION_RESET_TIMEOUT_MS);
      const inFlightHandlers = [...inFlightMessageHandlersRef.current];
      const promise = Promise.allSettled([blankPagePromise, ...inFlightHandlers]).then(
        (results) => {
          const blankPageResult = results[0];
          if (blankPageResult.status === 'rejected') {
            throw blankPageResult.reason;
          }
        },
      );
      sessionResetRef.current = { promise, resolve, reject, timeout };
      const releaseReset = () => {
        if (sessionResetRef.current?.promise !== promise) return;
        clearTimeout(timeout);
        sessionResetRef.current = null;
      };
      void promise.then(releaseReset, releaseReset);

      webViewRef.current?.stopLoading();
      const pending = pendingRef.current;
      if (pending && !pending.completed) {
        pending.completed = true;
        pending.request.setAbortHandler?.(null);
        pending.request.reject(new Error(`webview_session_cleared_${reason}`));
      }

      releasePccuSessionLease();
      pendingRef.current = null;
      credRef.current = null;
      activeModeRef.current = 'none';
      pccuPhaseRef.current = 'idle';
      trafficPhaseRef.current = 'idle';
      tutoringPhaseRef.current = 'idle';
      tutoringCourseCodeRef.current = null;
      trafficPartialRef.current = { downhill: [], uphill: [] };

      webViewRef.current?.injectJavaScript(`
(function() {
  try { localStorage.clear(); } catch (error) {}
  try { sessionStorage.clear(); } catch (error) {}
  true;
})();
`);
      webViewRef.current?.clearCache?.(true);
      webViewRef.current?.clearHistory?.();
      setSourceUri('about:blank');
      setDebugUrl('about:blank');
      setSessionEpoch((current) => current + 1);

      return promise;
    },
    [releasePccuSessionLease],
  );

  const completeWebViewSessionReset = useCallback((url: string): boolean => {
    const reset = sessionResetRef.current;
    if (!reset || !url.startsWith('about:blank')) return false;

    clearTimeout(reset.timeout);
    reset.resolve();
    return true;
  }, []);

  useEffect(() => {
    const unregister = registerWebViewSessionControl({ clearSession: clearWebViewSession });
    return () => {
      unregister();
      const reset = sessionResetRef.current;
      if (reset) {
        clearTimeout(reset.timeout);
        sessionResetRef.current = null;
        reset.reject(new Error('webview_session_control_unmounted'));
      }
    };
  }, [clearWebViewSession]);

  const updateDebugMessage = useCallback((message: string) => {
    setDebugMessage(message);
  }, []);

  useEffect(() => {
    let active = true;

    const applyDebugVisibility = (enabled: boolean) => {
      if (!active) return;
      setDebugVisible(__DEV__ && enabled);
    };

    void getDeveloperDebugEnabled().then(applyDebugVisibility);
    const unsubscribe = subscribeDeveloperDebugEnabled(applyDebugVisibility);

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    setDebugFrame(getScraperDebugPreviewFrame());
    return subscribeScraperDebugPreviewFrame(setDebugFrame);
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
          updateDebugMessage(`traffic:start:${request.id}`);
          setTrafficUrl(withTimestamp(TRAFFIC_DOWNHILL_URL));
          pendingRef.current = {
            request: { ...request, resolve: resolveOnce, reject: rejectOnce },
            protocolIdentity: {
              requestId: request.id,
              generation: ++protocolGenerationRef.current,
              nonce: Crypto.randomUUID(),
              syncKind: request.type,
            },
            retries: 0,
            phase: 'load_downhill',
            lastHandledUrl: '',
            lastInjectKey: '',
            lastInjectAt: 0,
            targetOpenRequested: false,
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
            tutoringPhaseRef.current = 'done';
            return;
          }

          releasePccuSessionLease();
          rejectOnce(error);
        });

        try {
          const lease = await pccuBrowserSessionGate.acquire(
            `shared-scraper:${type}:${request.id}`,
          );

          if (abortError || unmountedRef.current) {
            lease.release();
            rejectOnce(
              abortError ??
                new Error('Sync executor became unavailable. Shared scraper was unmounted.'),
            );
            return;
          }

          pccuSessionLeaseRef.current = lease;
          request.refreshTimeout?.();
        } catch (error) {
          rejectOnce(error instanceof Error ? error : new Error(String(error)));
          return;
        }

        // Tutoring types use the same PCCU login flow but diverge after inside.aspx
        const isTutoring =
          type === 'tutoring' ||
          type === 'tutoring-detail' ||
          type === 'tutoring-download' ||
          type === 'tutoring-upload';
        activeModeRef.current = isTutoring ? 'pccu-tutoring' : 'pccu';
        pccuPhaseRef.current = 'idle';
        if (isTutoring) {
          tutoringPhaseRef.current = 'load_ecampus';
          tutoringCourseCodeRef.current =
            (request.options?.courseCode as string | undefined) ?? null;
        }
        updateDebugMessage(`${isTutoring ? 'pccu-tutoring' : 'pccu'}:start:${type}:${request.id}`);
        pendingRef.current = {
          request: { ...request, resolve: resolveOnce, reject: rejectOnce },
          protocolIdentity: {
            requestId: request.id,
            generation: ++protocolGenerationRef.current,
            nonce: Crypto.randomUUID(),
            syncKind: request.type,
          },
          retries: 0,
          phase: 'idle',
          lastHandledUrl: '',
          lastInjectKey: '',
          lastInjectAt: 0,
          targetOpenRequested: false,
          completed: false,
        };

        // For PCCU types, load the default page then start the flow
        setSourceUri(`${PCCU_DEFAULT_URL}?ts=${Date.now()}`);
      });
    },
    [releasePccuSessionLease, updateDebugMessage],
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

      updateDebugMessage(
        result.success
          ? `pccu:done:${pending.request.type}`
          : `pccu:error:${result.message || 'failed'}`,
      );

      if (result.success) {
        pending.request.resolve(result.data);
      } else {
        pending.request.reject(new Error(result.message || 'Sync failed'));
      }
      releasePccuSessionLease();
      pendingRef.current = null;
      activeModeRef.current = 'none';
      pccuPhaseRef.current = 'done';
      tutoringPhaseRef.current = 'done';
    },
    [releasePccuSessionLease],
  );

  useEffect(() => {
    unmountedRef.current = false;

    return () => {
      unmountedRef.current = true;
      messageSessionGenerationRef.current += 1;
      releasePccuSessionLease();
    };
  }, [releasePccuSessionLease]);

  const injectLegacyJavaScript = useCallback((script: string): boolean => {
    const identity = pendingRef.current?.protocolIdentity;
    if (!identity) return false;
    webViewRef.current?.injectJavaScript(`${buildLegacyProtocolPrelude(identity)}\n${script}`);
    return true;
  }, []);

  const runLogin = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    const cred = credRef.current;
    if (!cred) {
      finishPccu({ success: false, message: '找不到登入憑證' });
      return;
    }
    if (activeModeRef.current === 'pccu-tutoring') {
      tutoringPhaseRef.current = 'logging_in';
    } else {
      pccuPhaseRef.current = 'logging_in';
    }
    updateDebugMessage(`pccu:login:${pending.request.type}`);
    injectLegacyJavaScript(buildLoginScript(cred));
  }, [finishPccu, injectLegacyJavaScript, updateDebugMessage]);

  const injectPccuScript = useCallback(
    (type: SyncType, reason: string, rawUrl?: string, minIntervalMs = 1200) => {
      const pending = pendingRef.current;
      if (!pending) return;

      const normalize = type === 'grade' ? normalizeGradeUrl : normalizeScheduleUrl;
      const key = normalize(rawUrl || pending.lastHandledUrl || '');
      const now = Date.now();

      if (key && pending.lastInjectKey === key && now - pending.lastInjectAt < minIntervalMs) {
        return;
      }

      pending.lastInjectKey = key;
      pending.lastInjectAt = now;
      updateDebugMessage(`inject:${type}:${reason}:${rawUrl || key || 'no-url'}`);
      logger.debug('webview_script_injected', {
        syncKind: type,
        reason,
        url: rawUrl || key,
      });

      const scheduleScriptPrefix = `
(function() {
  try {
    if (window.__PCCU_ADAPTIVE_SCHEDULE_SYNC__) {
      window.__PCCU_ADAPTIVE_SCHEDULE_SYNC__.active = false;
      window.__PCCU_ADAPTIVE_SCHEDULE_SYNC__.clickedEntry = false;
      window.__PCCU_ADAPTIVE_SCHEDULE_SYNC__.clickedSearch = false;
    }
  } catch (error) {}
  try {
    sessionStorage.removeItem('__PCCU_SCHEDULE_SEARCH_TS__');
  } catch (error) {}
})();
`;

      const script =
        type === 'grade'
          ? buildRobustGradePageScript()
          : `${scheduleScriptPrefix}${buildAdaptiveSchedulePageScript()}`;
      injectLegacyJavaScript(script);
    },
    [injectLegacyJavaScript],
  );

  const openPccuTarget = useCallback(
    (type: SyncType, reason: string, delayMs = 400) => {
      const pending = pendingRef.current;
      if (!pending || pending.targetOpenRequested || pccuPhaseRef.current !== 'open_target') return;

      pending.targetOpenRequested = true;

      setTimeout(() => {
        const activePending = pendingRef.current;
        if (
          !activePending ||
          activePending.completed ||
          activePending.request.id !== pending.request.id ||
          pccuPhaseRef.current !== 'open_target'
        ) {
          return;
        }

        if (type === 'schedule') {
          updateDebugMessage(`open-target:${type}:${reason}:1208`);
          injectLegacyJavaScript(buildServiceOpenScript('1208'));
          return;
        }

        updateDebugMessage(`open-target:${type}:${reason}:1220`);
        injectLegacyJavaScript(buildServiceOpenScript('1220'));
      }, delayMs);
    },
    [injectLegacyJavaScript, updateDebugMessage],
  );

  const persistGrades = useCallback(async (incomingGrades: SemesterGrade[]): Promise<boolean> => {
    if (!incomingGrades || incomingGrades.length === 0) return false;
    const updatedAt = Date.now();
    await saveGrades(incomingGrades, [], updatedAt);
    return true;
  }, []);

  const persistCourses = useCallback(async (incomingCourses: CourseData[]): Promise<boolean> => {
    const parsed = sanitizeCourseList(incomingCourses);
    if (parsed.length === 0 || hasSuspiciousCourseNames(parsed)) return false;
    const updatedAt = Date.now();
    await saveCourses(parsed, false, updatedAt);
    await refreshScheduledCourseReminders(parsed);
    return true;
  }, []);

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
      pending.targetOpenRequested = false;
      pccuPhaseRef.current = 'syncing';
      updateDebugMessage(`retry:${type}:${pending.retries}`);
      injectPccuScript(type, 'retry');
    },
    [finishPccu, injectPccuScript, updateDebugMessage],
  );

  const restartPccuLogin = useCallback(
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
      pending.targetOpenRequested = false;
      pccuPhaseRef.current = 'load_ecampus';
      updateDebugMessage(`relogin:${type}:${pending.retries}`);
      setSourceUri(`${PCCU_DEFAULT_URL}?ts=${Date.now()}`);
    },
    [finishPccu, updateDebugMessage],
  );

  // -----------------------------------------------------------------------
  // Traffic helpers
  // -----------------------------------------------------------------------

  const finishTraffic = useCallback(
    async (
      result: { success: boolean; message?: string },
      expected?: { pending: PendingRequest; messageSessionGeneration: number },
    ) => {
      const pending = pendingRef.current;
      if (!pending || pending.completed) return;
      if (
        expected &&
        (expected.pending !== pending ||
          expected.messageSessionGeneration !== messageSessionGenerationRef.current)
      ) {
        return;
      }

      if (result.success) {
        const snapshot: TrafficSnapshot = {
          downhill: sortTrafficArrivals('downhill', trafficPartialRef.current.downhill),
          uphill: sortTrafficArrivals('uphill', trafficPartialRef.current.uphill),
          updatedAt: Date.now(),
          sourceUrl: TRAFFIC_SOURCE_URL,
        };
        await setTrafficSnapshot(snapshot);
        if (
          pendingRef.current !== pending ||
          pending.completed ||
          (expected && expected.messageSessionGeneration !== messageSessionGenerationRef.current)
        ) {
          return;
        }
        pending.completed = true;
        pending.request.resolve({
          success: true,
          updatedAt: snapshot.updatedAt,
          counts: {
            downhill: snapshot.downhill.length,
            uphill: snapshot.uphill.length,
          },
        });
      } else {
        pending.completed = true;
        pending.request.reject(new Error(result.message || 'Traffic sync failed'));
      }
      pendingRef.current = null;
      activeModeRef.current = 'none';
      trafficPhaseRef.current = 'done';
    },
    [],
  );

  const rejectActiveWebViewRequest = useCallback(
    (reason = 'webview_host_rejected') => {
      webViewRef.current?.stopLoading();
      const pending = pendingRef.current;
      if (!pending || pending.completed) return;

      logger.warn(reason, { syncKind: pending.request.type });
      updateDebugMessage(`${reason}:${pending.request.type}`);

      if (activeModeRef.current === 'traffic') {
        void finishTraffic({ success: false, message: reason });
        return;
      }
      finishPccu({ success: false, message: reason });
    },
    [finishPccu, finishTraffic, updateDebugMessage],
  );

  const navigateToAllowedUrl = useCallback(
    (rawUrl: unknown): boolean => {
      const targetUrl = typeof rawUrl === 'string' ? rawUrl : '';
      if (!isAllowedWebViewUrl(targetUrl)) {
        rejectActiveWebViewRequest();
        return false;
      }

      injectLegacyJavaScript(`window.location.href=${JSON.stringify(targetUrl)};true;`);
      return true;
    },
    [injectLegacyJavaScript, rejectActiveWebViewRequest],
  );

  const handleShouldStartLoadWithRequest = useCallback(
    (request: WebViewNavigation): boolean => {
      if (isInternalBlankPage(request.url || '') && !pendingRef.current) return true;
      if (isAllowedWebViewUrl(request.url || '')) return true;
      rejectActiveWebViewRequest();
      return false;
    },
    [rejectActiveWebViewRequest],
  );

  useEffect(
    () =>
      registerWebViewHostAcceptanceProbe((url) =>
        handleShouldStartLoadWithRequest({ url } as WebViewNavigation),
      ),
    [handleShouldStartLoadWithRequest],
  );

  const injectTrafficScript = useCallback(
    (direction: 'downhill' | 'uphill', routeId: string) => {
      const config = {
        direction,
        directionLabel: direction === 'downhill' ? '下山' : '上山',
        branchLabel: direction === 'downhill' ? '②往劍潭經文大' : '④往陽明山經文大',
        routeId,
      };
      injectLegacyJavaScript(buildTrafficExtractionScript(config));
    },
    [injectLegacyJavaScript],
  );

  // -----------------------------------------------------------------------
  // Navigation handler
  // -----------------------------------------------------------------------

  const handleNavChange = useCallback(
    (nav: WebViewNavigation) => {
      if (nav.loading) return;
      const url = nav.url || '';
      if (isInternalBlankPage(url) && !pendingRef.current) {
        setDebugUrl('about:blank');
        return;
      }
      if (!isAllowedWebViewUrl(url)) {
        rejectActiveWebViewRequest();
        return;
      }
      setDebugUrl(url);
      const pending = pendingRef.current;
      if (!pending) return;

      const mode = activeModeRef.current;

      if (mode === 'pccu') {
        const type = pending.request.type as SyncType;
        pending.request.refreshTimeout?.();
        updateDebugMessage(`nav:${pccuPhaseRef.current}:${type}:${url}`);
        logger.debug('webview_navigation', {
          mode: 'pccu',
          phase: pccuPhaseRef.current,
          url,
        });

        if (url.includes('inside.aspx')) {
          pending.lastHandledUrl = url;
          if (pccuPhaseRef.current === 'open_target') {
            openPccuTarget(type, 'inside', 1200);
            return;
          }
          if (pccuPhaseRef.current === 'logging_in') {
            setTimeout(runLogin, 600);
          }
          return;
        }

        if (pccuPhaseRef.current === 'open_target' && isTransUrlForType(url, type)) {
          pending.lastHandledUrl = url;
          if (type === 'schedule') {
            pccuPhaseRef.current = 'syncing';
            setTimeout(() => {
              const activePending = pendingRef.current;
              if (
                !activePending ||
                activePending.completed ||
                activePending.request.id !== pending.request.id ||
                activePending.lastHandledUrl !== url
              ) {
                return;
              }
              injectPccuScript('schedule', 'transurl', url);
            }, 1200);
            return;
          }
          openPccuTarget(type, 'transurl', 400);
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
        logger.debug('webview_navigation', {
          mode: 'traffic',
          phase: trafficPhaseRef.current,
          url,
        });
        updateDebugMessage(`nav:${trafficPhaseRef.current}:traffic:${url}`);

        if (trafficPhaseRef.current === 'load_downhill' && url.includes('0111000505')) {
          trafficPhaseRef.current = 'extract_downhill';
          setTimeout(() => injectTrafficScript('downhill', '0111000505'), 500);
        } else if (trafficPhaseRef.current === 'load_uphill' && url.includes('0111000503')) {
          trafficPhaseRef.current = 'extract_uphill';
          setTimeout(() => injectTrafficScript('uphill', '0111000503'), 500);
        }
      } else if (mode === 'pccu-tutoring') {
        pending.request.refreshTimeout?.();
        const isSilentTutoring = pending.request.options?.silent === true;
        updateDebugMessage(`nav:${tutoringPhaseRef.current}:${pending.request.type}:${url}`);
        logger.debug('webview_navigation', {
          mode: 'pccu-tutoring',
          phase: tutoringPhaseRef.current,
          url,
        });

        if (url.includes('inside.aspx')) {
          if (tutoringPhaseRef.current === 'open_target') {
            if (!isSilentTutoring) {
              useTutoringStore.getState().setSyncPhase('logging_in');
            }
            setTimeout(() => {
              injectLegacyJavaScript(buildServiceOpenScript('1202'));
            }, 1200);
            return;
          }
          if (tutoringPhaseRef.current === 'logging_in') {
            setTimeout(runLogin, 600);
          }
          return;
        }

        if (isTutoringTransUrl(url)) {
          pending.lastHandledUrl = url;
          tutoringPhaseRef.current = 'open_target';
          setTimeout(() => {
            const activePending = pendingRef.current;
            if (
              !activePending ||
              activePending.completed ||
              activeModeRef.current !== 'pccu-tutoring' ||
              tutoringPhaseRef.current !== 'open_target'
            ) {
              return;
            }
            updateDebugMessage(`fallback:tutoring:icas:${url}`);
            injectLegacyJavaScript(
              `window.location.href=${JSON.stringify(TUTORING_HOME_URL)};true;`,
            );
          }, 2500);
          return;
        }

        if (url.includes('icas.pccu.edu.tw')) {
          const isDetail = pending.request.type === 'tutoring-detail';
          const isDownload = pending.request.type === 'tutoring-download';
          const isUpload = pending.request.type === 'tutoring-upload';
          const courseCode = tutoringCourseCodeRef.current;

          if (isDownload) {
            tutoringPhaseRef.current = 'fetching_single_course';
            if (!isSilentTutoring) {
              useTutoringStore.getState().setSyncPhase('fetching_details');
            }
            setTimeout(() => {
              injectLegacyJavaScript(
                buildWaitForCourseFpScript(
                  buildTutoringFileDownloadScript(pending.request.options as any),
                ),
              );
            }, 3000);
          } else if (isUpload) {
            tutoringPhaseRef.current = 'fetching_single_course';
            if (!isSilentTutoring) {
              useTutoringStore.getState().setSyncPhase('fetching_details');
            }
            setTimeout(() => {
              injectLegacyJavaScript(
                buildWaitForCourseFpScript(
                  buildTutoringFileUploadScript(pending.request.options as any),
                ),
              );
            }, 3000);
          } else if (isDetail && courseCode) {
            tutoringPhaseRef.current = 'fetching_single_course';
            if (!isSilentTutoring) {
              useTutoringStore.getState().setSyncPhase('fetching_details');
            }
            setTimeout(() => {
              injectLegacyJavaScript(
                buildWaitForCourseFpScript(buildTutoringSingleCourseScript(courseCode)),
              );
            }, 3000);
          } else {
            tutoringPhaseRef.current = 'fetching_courses';
            if (!isSilentTutoring) {
              useTutoringStore.getState().setSyncPhase('fetching_courses');
            }
            setTimeout(() => {
              injectLegacyJavaScript(buildWaitForCourseFpScript(buildTutoringOverviewScript()));
            }, 3000);
          }
          return;
        }

        if (tutoringPhaseRef.current === 'logging_in' && url.includes('default.aspx')) {
          runLogin();
          return;
        }
      }
    },
    [
      runLogin,
      injectLegacyJavaScript,
      injectPccuScript,
      injectTrafficScript,
      openPccuTarget,
      rejectActiveWebViewRequest,
      updateDebugMessage,
    ],
  );

  // -----------------------------------------------------------------------
  // Message handler
  // -----------------------------------------------------------------------

  const processMessage = useCallback(
    async (event: any, messageSessionGeneration: number) => {
      const messagePending = pendingRef.current;
      if (!messagePending) return;
      try {
        const pending = messagePending;
        const isCurrentMessageSession = () =>
          messageSessionGenerationRef.current === messageSessionGeneration &&
          pendingRef.current === pending &&
          !pending.completed;

        const currentUrl = String(event?.nativeEvent?.url || '');
        if (!isAllowedWebViewUrl(currentUrl)) {
          logger.warn('webview_message_rejected', {
            reason: 'disallowed_url',
            syncKind: pending.request.type,
          });
          return;
        }

        const decoded = decodeWebViewEnvelope(
          String(event?.nativeEvent?.data || ''),
          pending.protocolIdentity,
        );
        if (!decoded.ok) {
          logger.warn('webview_message_rejected', {
            reason: decoded.reason,
            syncKind: pending.request.type,
          });
          return;
        }
        if (decoded.value.event !== 'legacy-message') {
          logger.warn('webview_message_rejected', {
            reason: 'malformed',
            syncKind: pending.request.type,
          });
          return;
        }

        const payload = decoded.value.payload;
        if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
          logger.warn('webview_message_rejected', {
            reason: 'malformed',
            syncKind: pending.request.type,
          });
          return;
        }
        const data = payload as Record<string, any>;

        const mode = activeModeRef.current;

        if (mode === 'pccu') {
          const type = pending.request.type as SyncType;
          pending.request.refreshTimeout?.();
          updateDebugMessage(
            `msg:${pccuPhaseRef.current}:${type}:${data.t}${data.m ? `:${String(data.m)}` : ''}`,
          );
          logger.debug('webview_message_received', {
            mode: 'pccu',
            messageType: String(data.t || 'unknown'),
          });

          if (data.t === 'user_name' && data.n) {
            await SecureStore.setItemAsync('user_name', data.n);
            return;
          }

          if (data.t === 'login_ok') {
            pccuPhaseRef.current = 'open_target';
            pending.lastHandledUrl = '';
            pending.targetOpenRequested = false;
            injectLegacyJavaScript(`window.location.href=${JSON.stringify(PCCU_INSIDE_URL)};true;`);
            return;
          }

          if (data.t === 'login_fail') {
            finishPccu({ success: false, message: '登入失敗，請確認帳號密碼' });
            return;
          }

          if (data.t === 'popup') {
            pending.lastHandledUrl = '';
            navigateToAllowedUrl(data.url);
            return;
          }

          if (data.t === 'html' && type === 'grade') {
            const parsed = parseGradesFromHtml(typeof data.h === 'string' ? data.h : '');
            const persisted = await persistGrades(parsed);
            if (!isCurrentMessageSession()) return;
            if (persisted) {
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
              const fromCourses = sanitizeCourseList(
                Array.isArray(data.c) ? (data.c as CourseData[]) : [],
              );
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
                parseScheduleFromHtml(typeof data.h === 'string' ? data.h : ''),
              );
            }

            const persisted = await persistCourses(parsed);
            if (!isCurrentMessageSession()) return;
            if (persisted) {
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
              typeof data.m === 'string' &&
              /requires relogin|session expired|please login again|請重新登入|請先登入|逾時過期/i.test(
                data.m,
              )
            ) {
              restartPccuLogin(type, message);
              return;
            }
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
        } else if (mode === 'pccu-tutoring') {
          pending.request.refreshTimeout?.();
          const isSilentTutoring = pending.request.options?.silent === true;
          updateDebugMessage(
            `msg:${tutoringPhaseRef.current}:${pending.request.type}:${data.t}${data.m ? `:${String(data.m)}` : ''}`,
          );
          logger.debug('webview_message_received', {
            mode: 'pccu-tutoring',
            messageType: String(data.t || 'unknown'),
          });

          if (
            pending.request.type === 'tutoring-detail' ||
            pending.request.type === 'tutoring-download' ||
            pending.request.type === 'tutoring-upload'
          ) {
            const allowedDetailMessages = new Set([
              'status',
              'user_name',
              'popup',
              'login_ok',
              'login_fail',
              'waiting',
              'coursefp_ready',
              'diagnostic',
              'final_diagnostic',
              'single_course',
              'file_downloaded',
              'file_uploaded',
            ]);

            if (data.t === 'err' && tutoringPhaseRef.current !== 'fetching_single_course') {
              return;
            }

            if (data.t !== 'err' && !allowedDetailMessages.has(data.t)) {
              return;
            }
          } else if (
            data.t === 'single_course' ||
            data.t === 'file_downloaded' ||
            data.t === 'file_uploaded'
          ) {
            return;
          }

          if (data.t === 'user_name' && data.n) {
            await SecureStore.setItemAsync('user_name', data.n);
            return;
          }

          if (data.t === 'login_ok') {
            tutoringPhaseRef.current = 'open_target';
            if (!isSilentTutoring) {
              useTutoringStore.getState().setSyncPhase('logging_in');
            }
            injectLegacyJavaScript(`window.location.href=${JSON.stringify(PCCU_INSIDE_URL)};true;`);
            return;
          }

          if (data.t === 'login_fail') {
            if (!isSilentTutoring) {
              useTutoringStore.getState().setSyncPhase('error');
              useTutoringStore.getState().setSyncStatus('error');
            }
            finishPccu({ success: false, message: '登入失敗' });
            return;
          }

          if (data.t === 'popup' && data.url) {
            navigateToAllowedUrl(data.url);
            return;
          }

          if (data.t === 'courses') {
            const parsedCourses = Array.isArray(data.courses) ? data.courses : [];
            await storageSetCourses(parsedCourses);
            if (!isCurrentMessageSession()) return;
            useTutoringStore.getState().setCourses(parsedCourses);
            if (data.semester) {
              useTutoringStore.getState().setSemester(data.semester);
            }
            if (data.welcome) {
              useTutoringStore.getState().setWelcomeText(data.welcome);
            }
            tutoringPhaseRef.current = 'fetching_details';
            if (!isSilentTutoring) {
              useTutoringStore.getState().setSyncPhase('fetching_details');
            }
            injectLegacyJavaScript(buildTutoringAllAssignmentsScript());
            return;
          }

          if (data.t === 'all_assignments') {
            const allItems = Array.isArray(data.items) ? data.items : [];
            await setAllAssignments(allItems);
            if (!isCurrentMessageSession()) return;
            injectLegacyJavaScript(buildTutoringPendingAssignmentsScript());
            return;
          }

          if (data.t === 'pending') {
            const pendingItems = Array.isArray(data.items) ? data.items : [];
            await setPendingAssignments(pendingItems);
            if (!isCurrentMessageSession()) return;
            useTutoringStore.getState().setPendingAssignments(pendingItems);
            useTutoringStore.getState().setLastSyncedAt(Date.now());
            if (!isSilentTutoring) {
              useTutoringStore.getState().setSyncPhase('complete');
              useTutoringStore.getState().setSyncStatus('idle');
            }
            finishPccu({ success: true, data: { success: true, updatedAt: Date.now() } });
            return;
          }

          if (data.t === 'single_course') {
            const courseCode = data.courseCode as string;
            const detail = {
              announcements: Array.isArray(data.announcements) ? data.announcements : [],
              materials: Array.isArray(data.materials) ? data.materials : [],
              assignments: Array.isArray(data.assignments) ? data.assignments : [],
              progress: Array.isArray(data.progress) ? data.progress : [],
              classmates: Array.isArray(data.classmates) ? data.classmates : [],
              courseInfo:
                data.courseInfo && typeof data.courseInfo === 'object'
                  ? data.courseInfo
                  : undefined,
            };
            logger.debug('tutoring_detail_progress', {
              count: detail.progress.length,
              source: String(data.progressSource || 'unknown'),
              methodCount: Array.isArray(data.progressMethodCandidates)
                ? data.progressMethodCandidates.length
                : 0,
            });
            const persistJobs = [
              persistCourseDetail(courseCode, 'announcements', detail.announcements),
              persistCourseDetail(courseCode, 'materials', detail.materials),
              persistCourseDetail(courseCode, 'assignments', detail.assignments),
              persistCourseDetail(courseCode, 'progress', detail.progress),
              persistCourseDetail(courseCode, 'classmates', detail.classmates),
            ];
            if (detail.courseInfo) {
              persistJobs.push(persistCourseInfo(courseCode, detail.courseInfo));
            }
            await Promise.all(persistJobs);
            if (!isCurrentMessageSession()) return;
            useTutoringStore.getState().updateCourseDetail(courseCode, detail);
            if (!isSilentTutoring) {
              useTutoringStore.getState().setSyncPhase('complete');
              useTutoringStore.getState().setSyncStatus('idle');
            }
            finishPccu({ success: true, data: { success: true, updatedAt: Date.now() } });
            return;
          }

          if (data.t === 'file_downloaded') {
            finishPccu({
              success: true,
              data: {
                success: true,
                fileName: data.fileName || 'tutoring-file',
                mimeType: data.mimeType || 'application/octet-stream',
                base64: data.base64 || '',
              },
            });
            return;
          }

          if (data.t === 'file_uploaded') {
            finishPccu({
              success: true,
              data: {
                success: true,
                message: data.message || '作業已上傳',
                updatedAt: Date.now(),
              },
            });
            return;
          }

          if (data.t === 'err') {
            if (
              pending.request.type === 'tutoring-download' ||
              pending.request.type === 'tutoring-upload'
            ) {
              if (!isSilentTutoring) {
                useTutoringStore.getState().setSyncPhase('error');
                useTutoringStore.getState().setSyncStatus('error');
              }
              finishPccu({
                success: false,
                message: data.m ? `同步失敗：${data.m}` : '同步失敗',
              });
              return;
            }

            const phase = tutoringPhaseRef.current;
            if (
              phase === 'fetching_courses' ||
              phase === 'fetching_details' ||
              phase === 'fetching_single_course'
            ) {
              if (pending.retries < 2) {
                pending.retries += 1;
                tutoringPhaseRef.current = 'fetching_courses';
                if (!isSilentTutoring) {
                  useTutoringStore.getState().setSyncPhase('fetching_courses');
                }
                updateDebugMessage(`retry:tutoring:${pending.retries}`);
                if (pending.request.type === 'tutoring-detail' && tutoringCourseCodeRef.current) {
                  injectLegacyJavaScript(
                    buildWaitForCourseFpScript(
                      buildTutoringSingleCourseScript(tutoringCourseCodeRef.current),
                    ),
                  );
                } else {
                  injectLegacyJavaScript(buildWaitForCourseFpScript(buildTutoringOverviewScript()));
                }
              } else {
                if (!isSilentTutoring) {
                  useTutoringStore.getState().setSyncPhase('error');
                  useTutoringStore.getState().setSyncStatus('error');
                }
                const failMessage =
                  pending.request.type === 'tutoring-detail' ? '課程資料同步失敗' : '同步失敗';
                finishPccu({ success: false, message: failMessage });
              }
            } else {
              if (!isSilentTutoring) {
                useTutoringStore.getState().setSyncPhase('error');
                useTutoringStore.getState().setSyncStatus('error');
              }
              finishPccu({
                success: false,
                message: data.m ? `同步失敗：${data.m}` : '同步失敗',
              });
            }
            return;
          }

          // Diagnostic / waiting / status messages — log only, no phase change
          if (
            data.t === 'waiting' ||
            data.t === 'coursefp_ready' ||
            data.t === 'diagnostic' ||
            data.t === 'final_diagnostic' ||
            data.t === 'status'
          ) {
            logger.debug('tutoring_status_received', {
              messageType: String(data.t || 'unknown'),
            });
            return;
          }
        } else if (mode === 'traffic') {
          logger.debug('webview_message_received', {
            mode: 'traffic',
            messageType: String(data.t || 'unknown'),
          });
          updateDebugMessage(`msg:${trafficPhaseRef.current}:traffic:${data.t}`);

          if (data.t === 'traffic_rows') {
            const drafts = Array.isArray(data.rows) ? (data.rows as TrafficStopArrivalDraft[]) : [];
            const normalized = drafts.map((d) => normalizeTrafficArrival(d));

            if (data.direction === 'downhill') {
              trafficPartialRef.current.downhill = normalized;
              trafficPhaseRef.current = 'load_uphill';
              setTrafficUrl(withTimestamp(TRAFFIC_UPHILL_URL));
            } else if (data.direction === 'uphill') {
              trafficPartialRef.current.uphill = normalized;
              await finishTraffic({ success: true }, { pending, messageSessionGeneration });
            }
          }
        }
      } catch (error) {
        const pending = messagePending;
        if (
          !pending.completed &&
          messageSessionGenerationRef.current === messageSessionGeneration &&
          pendingRef.current === pending
        ) {
          const mode = activeModeRef.current;
          if (mode === 'pccu') {
            const type = pending.request.type as SyncType;
            finishPccu({
              success: false,
              message: type === 'grade' ? '成績同步失敗' : '課表同步失敗',
            });
          } else if (mode === 'pccu-tutoring') {
            if (pending.request.options?.silent !== true) {
              useTutoringStore.getState().setSyncPhase('error');
              useTutoringStore.getState().setSyncStatus('error');
            }
            finishPccu({ success: false, message: '課業同步失敗' });
          } else if (mode === 'traffic') {
            finishTraffic({ success: false, message: '交通資訊解析失敗' });
          }
        }
      }
    },
    [
      finishPccu,
      finishTraffic,
      injectLegacyJavaScript,
      persistGrades,
      persistCourses,
      restartPccuLogin,
      retryPccu,
      navigateToAllowedUrl,
      updateDebugMessage,
    ],
  );

  const handleMessage = useCallback(
    (event: any): Promise<void> => {
      const messageSessionGeneration = messageSessionGenerationRef.current;
      const promise = processMessage(event, messageSessionGeneration);
      inFlightMessageHandlersRef.current.add(promise);
      const remove = () => inFlightMessageHandlersRef.current.delete(promise);
      void promise.then(remove, remove);
      return promise;
    },
    [processMessage],
  );

  // -----------------------------------------------------------------------
  // Load end handler (PCCU only)
  // -----------------------------------------------------------------------

  const handleLoadEnd = useCallback(
    (event: any) => {
      const currentUrl = event.nativeEvent.url || '';
      if (completeWebViewSessionReset(currentUrl)) {
        setDebugUrl('about:blank');
        return;
      }
      if (!isAllowedWebViewUrl(currentUrl)) {
        rejectActiveWebViewRequest();
        return;
      }
      setDebugUrl(currentUrl);
      const pending = pendingRef.current;
      if (!pending) return;

      const mode = activeModeRef.current;

      if (mode === 'pccu') {
        const type = pending.request.type as SyncType;

        if (pccuPhaseRef.current === 'load_ecampus' && currentUrl.includes('default.aspx')) {
          updateDebugMessage(`loadend:${pccuPhaseRef.current}:${type}:${currentUrl}`);
          runLogin();
          return;
        }

        if (pccuPhaseRef.current === 'syncing') {
          updateDebugMessage(`loadend:${pccuPhaseRef.current}:${type}:${currentUrl}`);
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
          updateDebugMessage(`loadend:${pccuPhaseRef.current}:${type}:${currentUrl}`);
          pending.lastHandledUrl = currentUrl;
          if (type === 'schedule') {
            pccuPhaseRef.current = 'syncing';
            setTimeout(() => {
              const activePending = pendingRef.current;
              if (
                !activePending ||
                activePending.completed ||
                activePending.request.id !== pending.request.id ||
                activePending.lastHandledUrl !== currentUrl
              ) {
                return;
              }
              injectPccuScript('schedule', 'loadend-transurl', currentUrl, 1600);
            }, 400);
            return;
          }
          openPccuTarget(type, 'loadend-transurl', 400);
        }
      } else if (mode === 'pccu-tutoring') {
        if (tutoringPhaseRef.current === 'load_ecampus' && currentUrl.includes('default.aspx')) {
          updateDebugMessage(`loadend:${tutoringPhaseRef.current}:tutoring:${currentUrl}`);
          runLogin();
          return;
        }
      }
    },
    [
      runLogin,
      completeWebViewSessionReset,
      injectPccuScript,
      openPccuTarget,
      rejectActiveWebViewRequest,
      updateDebugMessage,
    ],
  );

  const handleOpenWindow = useCallback(
    (event: any) => {
      const targetUrl = String(event?.nativeEvent?.targetUrl || '');
      if (!targetUrl) return;

      if (!isAllowedWebViewUrl(targetUrl)) {
        rejectActiveWebViewRequest();
        return;
      }

      const pending = pendingRef.current;
      if (!pending) return;

      pending.request.refreshTimeout?.();

      const mode = activeModeRef.current;
      const phase =
        mode === 'pccu-tutoring'
          ? tutoringPhaseRef.current
          : mode === 'traffic'
            ? trafficPhaseRef.current
            : pccuPhaseRef.current;

      updateDebugMessage(`openwindow:${phase}:${pending.request.type}:${targetUrl}`);
      logger.debug('webview_open_window', {
        mode,
        syncKind: pending.request.type,
        url: targetUrl,
      });

      pending.lastHandledUrl = '';
      navigateToAllowedUrl(targetUrl);
    },
    [navigateToAllowedUrl, rejectActiveWebViewRequest, updateDebugMessage],
  );

  const handleDebugRefresh = useCallback(() => {
    const pending = pendingRef.current;
    const mode = activeModeRef.current;
    const phase =
      mode === 'pccu-tutoring'
        ? tutoringPhaseRef.current
        : mode === 'traffic'
          ? trafficPhaseRef.current
          : pccuPhaseRef.current;

    pending?.request.refreshTimeout?.();
    updateDebugMessage(`manual-refresh:${phase}:${pending?.request.type ?? 'none'}`);
    webViewRef.current?.reload?.();
  }, [updateDebugMessage]);

  // -----------------------------------------------------------------------
  // Traffic URL effect — when trafficUrl changes, navigate the WebView
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (activeModeRef.current === 'traffic') {
      if (isAllowedWebViewUrl(trafficUrl)) {
        setSourceUri(trafficUrl);
      } else {
        rejectActiveWebViewRequest();
      }
    }
  }, [trafficUrl, rejectActiveWebViewRequest]);

  // -----------------------------------------------------------------------
  // Kick off PCCU flow when sourceUri changes and we have a pending request
  // -----------------------------------------------------------------------

  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    const mode = activeModeRef.current;
    if (mode !== 'pccu' && mode !== 'pccu-tutoring') return;

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
      pending.targetOpenRequested = false;
      const isSilentTutoring = pending.request.options?.silent === true;
      pccuPhaseRef.current = 'load_ecampus';
      if (mode === 'pccu-tutoring') {
        tutoringPhaseRef.current = 'load_ecampus';
        if (!isSilentTutoring) {
          useTutoringStore.getState().setSyncPhase('logging_in');
          useTutoringStore.getState().setSyncStatus('syncing');
        }
      }
    };
    void init();
  }, [sourceUri, finishPccu]);

  // -----------------------------------------------------------------------
  // Error handler
  // -----------------------------------------------------------------------

  const handleError = useCallback(
    (event?: any) => {
      const pending = pendingRef.current;
      if (!pending || pending.completed) return;
      const mode = activeModeRef.current;
      const failingUrl = String(event?.nativeEvent?.url || '');
      updateDebugMessage(`error:${mode}`);
      if (mode === 'pccu') {
        const type = pending.request.type as SyncType;
        finishPccu({
          success: false,
          message: type === 'grade' ? '成績頁面載入失敗' : '課表頁面載入失敗',
        });
      } else if (mode === 'pccu-tutoring') {
        if (isTutoringTransUrl(failingUrl)) {
          tutoringPhaseRef.current = 'open_target';
          updateDebugMessage(`fallback:tutoring:http-error:${failingUrl}`);
          injectLegacyJavaScript(`window.location.href=${JSON.stringify(TUTORING_HOME_URL)};true;`);
          return;
        }
        if (pending.request.options?.silent !== true) {
          useTutoringStore.getState().setSyncPhase('error');
          useTutoringStore.getState().setSyncStatus('error');
        }
        finishPccu({ success: false, message: '課業頁面載入失敗' });
      } else if (mode === 'traffic') {
        finishTraffic({ success: false, message: '交通資訊頁面載入失敗' });
      }
    },
    [finishPccu, finishTraffic, injectLegacyJavaScript, updateDebugMessage],
  );

  const handleHttpError = useCallback(
    (event: any) => {
      const pending = pendingRef.current;
      if (!pending || pending.completed || activeModeRef.current !== 'pccu-tutoring') return;
      const failingUrl = String(event?.nativeEvent?.url || '');
      if (!isTutoringTransUrl(failingUrl)) return;

      pending.request.refreshTimeout?.();
      tutoringPhaseRef.current = 'open_target';
      updateDebugMessage(
        `fallback:tutoring:http-${event?.nativeEvent?.statusCode ?? 'unknown'}:${failingUrl}`,
      );
      injectLegacyJavaScript(`window.location.href=${JSON.stringify(TUTORING_HOME_URL)};true;`);
    },
    [injectLegacyJavaScript, updateDebugMessage],
  );

  // -----------------------------------------------------------------------
  // Determine which URL the WebView should show
  // -----------------------------------------------------------------------

  const activeUri = useMemo(() => {
    if (isInternalBlankPage(sourceUri)) return 'about:blank';
    const candidate = activeModeRef.current === 'traffic' ? trafficUrl : sourceUri;
    return isAllowedWebViewUrl(candidate) ? candidate : PCCU_DEFAULT_URL;
  }, [trafficUrl, sourceUri]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const debugPhase =
    activeModeRef.current === 'traffic'
      ? trafficPhaseRef.current
      : activeModeRef.current === 'pccu-tutoring'
        ? tutoringPhaseRef.current
        : pccuPhaseRef.current;
  const debugType = pendingRef.current?.request.type ?? 'none';
  const showDebugPreview = debugVisible && !!debugFrame;
  const debugPreviewStyle = showDebugPreview ? styles.debugWebView : styles.hiddenInner;

  useEffect(() => {
    setScraperDebugRuntimeState({
      status: `${activeModeRef.current} / ${debugType} / ${debugPhase}`,
      message: debugMessage,
      url: debugUrl,
    });
  }, [debugMessage, debugPhase, debugType, debugUrl]);

  return (
    <View
      testID="scraper-debug-panel"
      style={
        showDebugPreview
          ? [
              styles.debugContainer,
              {
                left: debugFrame?.x ?? 0,
                top: debugFrame?.y ?? 0,
                width: debugFrame?.width ?? 0,
                height: debugFrame?.height ?? 0,
              },
            ]
          : styles.hidden
      }
      pointerEvents={showDebugPreview ? 'box-none' : 'none'}
    >
      {showDebugPreview ? (
        <View style={styles.debugHeader} pointerEvents="box-none">
          <Text style={styles.debugTitle}>LIVE SCRAPER PREVIEW</Text>
          <TouchableOpacity
            testID="scraper-debug-refresh-button"
            style={styles.debugRefreshButton}
            onPress={handleDebugRefresh}
          >
            <Text style={styles.debugRefreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <WebView
        key={`scraper-session-${sessionEpoch}`}
        ref={webViewRef}
        style={debugPreviewStyle}
        pointerEvents={showDebugPreview ? 'auto' : 'none'}
        source={{ uri: activeUri }}
        containerStyle={showDebugPreview ? styles.debugWebViewContainer : styles.hiddenInner}
        originWhitelist={ALLOWED_WEBVIEW_ORIGINS}
        incognito
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        domStorageEnabled
        cacheEnabled={false}
        userAgent={USER_AGENT}
        onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
        onNavigationStateChange={handleNavChange}
        onMessage={handleMessage}
        onOpenWindow={handleOpenWindow}
        onLoadEnd={handleLoadEnd}
        onError={handleError}
        onHttpError={handleHttpError}
        javaScriptCanOpenWindowsAutomatically
        javaScriptEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  debugContainer: {
    position: 'absolute',
    zIndex: 10000,
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
  },
  debugHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.68)',
  },
  debugTitle: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  debugRefreshButton: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#fff',
  },
  debugRefreshText: {
    color: '#111',
    fontSize: 11,
    fontWeight: '800',
  },
  debugWebView: {
    width: '100%',
    height: '100%',
    backgroundColor: '#fff',
  },
  debugWebViewContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
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
