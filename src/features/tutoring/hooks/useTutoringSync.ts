import { useCallback, useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { type WebViewNavigation } from 'react-native-webview';
import type WebView from 'react-native-webview';

import { getSavedPCCUCredentials } from '../../auth/services/authService';
import {
  buildLoginScript,
  buildOpenLinkScript,
  type PCCUCredentials,
} from '../../pccu/sync/pccuSyncScripts';
import {
  pccuBrowserSessionGate,
  type PccuBrowserSessionLease,
} from '../../pccu/engine/pccuBrowserSessionGate';
import {
  buildTutoringOverviewScript,
  buildTutoringAllAssignmentsScript,
  buildTutoringPendingAssignmentsScript,
  buildTutoringSingleCourseScript,
  buildWaitForCourseFpScript,
} from '../sync/tutoringScripts';
import {
  setCourses as storageSetCourses,
  setPendingAssignments,
  setAllAssignments,
} from '../storage/tutoringStorage';
import { useTutoringStore } from '../store/useTutoringStore';
import type { SyncPhase } from '../types';

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_URL = 'https://ecampus.pccu.edu.tw/eCampus/default.aspx';
const INSIDE_URL = 'https://ecampus.pccu.edu.tw/eCampus/inside.aspx';
const TUTORING_DIRECT_URL = 'https://icas.pccu.edu.tw/cfp/';

const DEBOUNCE_MS = 2000;
const SESSION_ACTIVITY_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

// ─── Types ───────────────────────────────────────────────────────────────────

interface UseTutoringSyncOptions {
  /** Reference to the WebView instance for injecting JavaScript. */
  webViewRef: React.RefObject<WebView>;
}

interface UseTutoringSyncReturn {
  /** Current human-readable status message. */
  statusText: string;
  /** Initiate a sync session. */
  startSync: (options?: { silent?: boolean; manual?: boolean; courseCode?: string }) => Promise<void>;
  /** WebView onMessage handler. */
  handleMessage: (event: { nativeEvent: { data: string } }) => Promise<void>;
  /** WebView onNavigationStateChange handler. */
  handleNavChange: (nav: WebViewNavigation) => void;
  /** Mutable ref tracking the current sync phase (for external checks). */
  phaseRef: React.MutableRefObject<SyncPhase>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Custom hook that manages the WebView-based tutoring sync lifecycle.
 *
 * Encapsulates:
 * - 5-phase state machine: idle → logging_in → fetching_courses → fetching_details → complete
 * - WebView message routing (handleMessage)
 * - Navigation state handling (handleNavChange)
 * - Debounce to prevent duplicate syncs (2 s)
 * - 30-second timeout for the logging_in phase
 * - Zustand store integration (syncPhase, syncStatus, courses, etc.)
 */
export function useTutoringSync({
  webViewRef,
}: UseTutoringSyncOptions): UseTutoringSyncReturn {
  const [statusText, setStatusText] = useState('');

  // Phase tracking — kept in a ref so handlers always read the latest value
  // without needing to be recreated.
  const phaseRef = useRef<SyncPhase>('idle');

  // Stable refs for sync session state
  const credRef = useRef<PCCUCredentials | null>(null);
  const sessionWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef = useRef(0);
  const silentSyncRef = useRef(false);
  const lastSyncRef = useRef<number>(0);
  const courseCodeRef = useRef<string | null>(null);
  const sessionLeaseRef = useRef<PccuBrowserSessionLease | null>(null);
  const unmountedRef = useRef(false);
  const syncRunRef = useRef(0);

  // Zustand store selectors
  const courses = useTutoringStore((s) => s.courses);
  const setSyncPhase = useTutoringStore((s) => s.setSyncPhase);
  const setSyncStatus = useTutoringStore((s) => s.setSyncStatus);
  const syncStatus = useTutoringStore((s) => s.syncStatus);
  const setError = useTutoringStore((s) => s.setError);
  const resetSync = useTutoringStore((s) => s.resetSync);
  const storeSetCourses = useTutoringStore((s) => s.setCourses);
  const storeSetPendingAssignments = useTutoringStore((s) => s.setPendingAssignments);
  const storeSetSemester = useTutoringStore((s) => s.setSemester);
  const storeSetWelcomeText = useTutoringStore((s) => s.setWelcomeText);
  const storeSetLastSyncedAt = useTutoringStore((s) => s.setLastSyncedAt);

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const clearSessionWatchdog = useCallback(() => {
    if (sessionWatchdogRef.current) {
      clearTimeout(sessionWatchdogRef.current);
      sessionWatchdogRef.current = null;
    }
  }, []);

  const releaseSessionLease = useCallback(() => {
    sessionLeaseRef.current?.release();
    sessionLeaseRef.current = null;
  }, []);

  /** Transition to a new phase and update the store. */
  const setPhase = useCallback((phase: SyncPhase) => {
    phaseRef.current = phase;
    setSyncPhase(phase);
  }, [setSyncPhase]);

  /** Mark sync as complete. */
  const finish = useCallback(
    (message?: string) => {
      const finalMessage =
        message || (silentSyncRef.current ? '課業資料已更新' : '課業資料同步完成');
      clearSessionWatchdog();
      releaseSessionLease();
      setPhase('complete');
      retryRef.current = 0;
      silentSyncRef.current = false;
      setSyncStatus('idle');
      setStatusText(finalMessage);
    },
    [clearSessionWatchdog, releaseSessionLease, setPhase, setSyncStatus],
  );

  const armSessionWatchdog = useCallback(
    (syncRunId: number) => {
      if (!sessionLeaseRef.current || unmountedRef.current || syncRunRef.current !== syncRunId) {
        return;
      }

      clearSessionWatchdog();
      sessionWatchdogRef.current = setTimeout(() => {
        if (!sessionLeaseRef.current || unmountedRef.current || syncRunRef.current !== syncRunId) {
          return;
        }

        const timedOutDuringLogin = phaseRef.current === 'logging_in';
        finish(
          courses.length > 0
            ? timedOutDuringLogin
              ? '登入逾時，已保留舊資料'
              : '同步逾時，已保留舊資料'
            : timedOutDuringLogin
              ? '登入逾時'
              : '同步逾時'
        );
      }, SESSION_ACTIVITY_TIMEOUT_MS);
    },
    [clearSessionWatchdog, courses.length, finish]
  );

  /** Retry the sync from the overview script. */
  const retrySync = useCallback(() => {
    if (retryRef.current >= MAX_RETRIES) {
      finish(courses.length > 0 ? '同步失敗，已保留舊資料' : '同步失敗');
      return;
    }
    retryRef.current += 1;
    setPhase('fetching_courses');
    setStatusText(`重新嘗試同步 (${retryRef.current}/${MAX_RETRIES})...`);
    webViewRef.current?.injectJavaScript(buildTutoringOverviewScript());
  }, [courses.length, finish, setPhase, webViewRef]);

  // ─── startSync ───────────────────────────────────────────────────────────

  const startSync = useCallback(
    async (options: { silent?: boolean; manual?: boolean; courseCode?: string } = {}) => {
      // Debounce: prevent duplicate syncs within DEBOUNCE_MS
      const now = Date.now();
      if (now - lastSyncRef.current < DEBOUNCE_MS) {
        if (options.manual) {
          setStatusText('同步進行中，請稍後...');
        }
        return;
      }

      // Block if already in a non-terminal phase
      const currentPhase = phaseRef.current;
      if (
        syncStatus === 'syncing' ||
        (currentPhase !== 'idle' && currentPhase !== 'complete' && currentPhase !== 'error')
      ) {
        if (options.manual) {
          setStatusText('正在更新課業資料...');
        }
        return;
      }

      const savedCredentials = await getSavedPCCUCredentials();
      if (!savedCredentials) {
        setStatusText('請先登入後再同步課業資料');
        setError('未找到登入憑證');
        return;
      }

      const silent = !!options.silent && courses.length > 0;
      credRef.current = savedCredentials;
      retryRef.current = 0;
      silentSyncRef.current = silent;
      lastSyncRef.current = now;
      courseCodeRef.current = options.courseCode || null;
      const syncRunId = ++syncRunRef.current;
      setSyncStatus('syncing');

      if (pccuBrowserSessionGate.isLocked()) {
        setStatusText('等待其他 PCCU 同步完成...');
      } else {
        setStatusText(silent ? '背景更新課業資料中...' : '開始同步課業資料...');
      }

      const lease = await pccuBrowserSessionGate.acquire(
        `tutoring:${options.courseCode || 'all'}:${syncRunId}`
      );

      if (unmountedRef.current || syncRunRef.current !== syncRunId) {
        lease.release();
        return;
      }

      sessionLeaseRef.current = lease;
      setPhase('logging_in');
      setStatusText(silent ? '背景更新課業資料中...' : '開始同步課業資料...');

      armSessionWatchdog(syncRunId);

      // Signal the WebView to reload (the screen manages the WebView key/lifecycle)
      // The hook does NOT directly manipulate WebView visibility — that stays in the screen.
      // Instead, we inject the login script once the WebView reports it's ready via nav change.
    },
    [
      courses.length,
      armSessionWatchdog,
      finish,
      setError,
      setPhase,
      syncStatus,
      setSyncStatus,
    ],
  );

  useEffect(() => {
    unmountedRef.current = false;

    return () => {
      unmountedRef.current = true;
      clearSessionWatchdog();
      releaseSessionLease();
    };
  }, [clearSessionWatchdog, releaseSessionLease]);

  // ─── handleNavChange ─────────────────────────────────────────────────────

  const handleNavChange = useCallback(
    (nav: WebViewNavigation) => {
      if (nav.loading) return;

      if (sessionLeaseRef.current) {
        armSessionWatchdog(syncRunRef.current);
      }

      const url = nav.url || '';
      const title = nav.title || '';

      console.log(
        `[TutoringSync] NavChange: phase=${phaseRef.current}, url=${url}, title=${title}`,
      );

      // inside.aspx loaded → tutoring system is opening
      if (url.includes('inside.aspx')) {
        setStatusText('登入成功，等待課輔系統載入...');
        setTimeout(() => {
          webViewRef.current?.injectJavaScript(buildOpenLinkScript('1202'));
        }, 3000);
        return;
      }

      // default.aspx loaded → inject login script
      if (phaseRef.current === 'logging_in' && url.includes('default.aspx')) {
        if (!credRef.current) {
          finish('找不到登入憑證');
          return;
        }
        setStatusText('登入中...');
        webViewRef.current?.injectJavaScript(buildLoginScript(credRef.current));
        return;
      }

      // icas.pccu.edu.tw loaded → tutoring system ready, start data fetch
      if (url.includes('icas.pccu.edu.tw')) {
        const singleCourseCode = courseCodeRef.current;
        if (singleCourseCode) {
          // Single-course mode: skip overview, fetch detail directly
          setPhase('fetching_details');
          setStatusText('課輔頁面已載入，等待系統初始化...');
          setTimeout(() => {
            webViewRef.current?.injectJavaScript(
              buildWaitForCourseFpScript(buildTutoringSingleCourseScript(singleCourseCode)),
            );
          }, 3000);
        } else {
          // Full sync mode
          setPhase('fetching_courses');
          setStatusText('課輔頁面已載入，等待系統初始化...');
          setTimeout(() => {
            webViewRef.current?.injectJavaScript(
              buildWaitForCourseFpScript(buildTutoringOverviewScript()),
            );
          }, 3000);
        }
      }
    },
    [armSessionWatchdog, finish, setPhase, webViewRef],
  );

  // ─── handleMessage ───────────────────────────────────────────────────────

  const handleMessage = useCallback(
    async (event: { nativeEvent: { data: string } }) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);

        if (sessionLeaseRef.current) {
          armSessionWatchdog(syncRunRef.current);
        }

        // ── Diagnostic / status messages (no phase change) ──

        if (data.t === 'waiting') {
          setStatusText(
            `等待課輔系統初始化... (${data.attempt}/60) CourseFP: ${data.hasCourseFP ? '✓' : '✗'}`,
          );
          return;
        }

        if (data.t === 'coursefp_ready') {
          setStatusText(`課輔系統已就緒！開始同步... (等待 ${data.attempt} 次)`);
          return;
        }

        if (data.t === 'final_diagnostic') {
          const info = data.info || {};
          console.log('Tutoring Final Diagnostic:', JSON.stringify(info));
          return;
        }

        if (data.t === 'diagnostic') {
          const info = data.info || {};
          console.log('Tutoring Diagnostic:', JSON.stringify(info));
          return;
        }

        if (data.t === 'status') {
          setStatusText(data.m || '同步中...');
          return;
        }

        // ── Side-effect messages ──

        if (data.t === 'user_name' && data.n) {
          await SecureStore.setItemAsync('user_name', data.n);
          return;
        }

        // ── Login flow ──

        if (data.t === 'login_ok') {
          setStatusText('登入成功，準備開啟課業輔導...');
          setTimeout(() => {
            webViewRef.current?.injectJavaScript(
              `window.location.href=${JSON.stringify(TUTORING_DIRECT_URL)};true;`,
            );
          }, 500);
          return;
        }

        if (data.t === 'popup' && data.url) {
          console.log('[TutoringSync] Popup URL:', data.url);
          setStatusText('開啟課業輔導頁面中...');
          webViewRef.current?.injectJavaScript(
            `window.location.href=${JSON.stringify(data.url)};true;`,
          );
          return;
        }

        if (data.t === 'login_fail') {
          finish(data.m ? `登入失敗：${data.m}` : '登入失敗');
          return;
        }

        // ── Data fetching phases ──

        if (data.t === 'courses') {
          const parsedCourses = Array.isArray(data.courses) ? data.courses : [];
          await storageSetCourses(parsedCourses);
          storeSetCourses(parsedCourses);
          if (data.semester) {
            storeSetSemester(data.semester);
          }
          if (data.welcome) {
            storeSetWelcomeText(data.welcome);
          }

          setPhase('fetching_details');
          setStatusText('同步全部作業狀態中...');
          webViewRef.current?.injectJavaScript(buildTutoringAllAssignmentsScript());
          return;
        }

        if (data.t === 'all_assignments') {
          const allItems = Array.isArray(data.items) ? data.items : [];
          await setAllAssignments(allItems);

          setStatusText('篩選待辦作業中...');
          webViewRef.current?.injectJavaScript(buildTutoringPendingAssignmentsScript());
          return;
        }

        if (data.t === 'pending') {
          const pendingItems = Array.isArray(data.items) ? data.items : [];
          await setPendingAssignments(pendingItems);
          storeSetPendingAssignments(pendingItems);

          // Sync complete — update timestamp
          storeSetLastSyncedAt(Date.now());
          finish();
          return;
        }

        // ── Single-course detail sync ──

        if (data.t === 'single_course') {
          const courseCode = data.courseCode as string;
          const detail = {
            announcements: Array.isArray(data.announcements) ? data.announcements : [],
            materials: Array.isArray(data.materials) ? data.materials : [],
            assignments: Array.isArray(data.assignments) ? data.assignments : [],
          };
          useTutoringStore.getState().updateCourseDetail(courseCode, detail);
          finish('課程資料已更新');
          return;
        }

        // ── Error handling ──

        if (data.t === 'err') {
          const message = data.m ? `同步失敗：${data.m}` : '同步失敗';
          if (phaseRef.current === 'fetching_courses' || phaseRef.current === 'fetching_details') {
            retrySync();
          } else {
            finish(message);
          }
          return;
        }

        // ── Fallback ──

        if (data.t === 'html') {
          // Fallback HTML parsing — intentionally no-op for now
          return;
        }
      } catch {
        finish('同步失敗，解析訊息時發生錯誤');
      }
    },
    [armSessionWatchdog, finish, retrySync, setPhase, storeSetCourses, storeSetPendingAssignments, storeSetSemester, storeSetWelcomeText, storeSetLastSyncedAt, webViewRef],
  );

  // ─── Return ──────────────────────────────────────────────────────────────

  return {
    statusText,
    startSync,
    handleMessage,
    handleNavChange,
    phaseRef,
  };
}
