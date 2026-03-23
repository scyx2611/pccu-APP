import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { getSavedPCCUCredentials } from '../../auth/services/authService';
import { setCourses as saveCourses } from '../storage/scheduleStorage';
import {
  buildAdaptiveSchedulePageScript,
  buildLoginScript,
  buildServiceOpenScript,
  PCCUCredentials,
} from '../../pccu/sync/pccuSyncScripts';
import {
  CourseData,
  hasSuspiciousCourseNames,
  parseScheduleFromHtml,
  sanitizeCourseList,
} from '../../pccu/parsers/pccuScraper';
import { refreshScheduledCourseReminders } from '../../notifications/services/courseReminderService';

const DEFAULT_URL = 'https://ecampus.pccu.edu.tw/eCampus/default.aspx';
const INSIDE_URL = 'https://ecampus.pccu.edu.tw/eCampus/inside.aspx';

type Phase = 'idle' | 'load_ecampus' | 'logging_in' | 'open_schedule' | 'syncing' | 'done';

type ScheduleSyncResult = {
  success: boolean;
  updatedAt: number | null;
  coursesCount: number;
  message?: string;
};

type ScheduleSyncAgentProps = {
  enabled?: boolean;
  reloadKey?: number;
  onComplete?: (result: ScheduleSyncResult) => void;
};

const normalizeScheduleUrl = (url: string) =>
  (url || '')
    .replace(/([?&])NoCache=[^&]+/gi, '$1')
    .replace(/([?&])lvMainMenuIndex=[^&]+/gi, '$1')
    .replace(/[?&]$/, '');

const isScheduleQueryUrl = (url: string) => /\/queryCourse\/(?:index|queryByCourse|queryByStudent)\.asp/i.test(url || '');

export default function ScheduleSyncAgent({
  enabled = true,
  reloadKey = 0,
  onComplete,
}: ScheduleSyncAgentProps) {
  const [webReady, setWebReady] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const credRef = useRef<PCCUCredentials | null>(null);
  const phaseRef = useRef<Phase>('idle');
  const pendingSyncRef = useRef(false);
  const retryRef = useRef(0);
  const lastHandledUrlRef = useRef('');
  const lastInjectKeyRef = useRef('');
  const lastInjectAtRef = useRef(0);
  const completedRef = useRef(false);
  const startedReloadKeyRef = useRef<number | null>(null);
  const userAgent = Platform.OS === 'ios'
    ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    : 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36';

  const finish = useCallback((result: ScheduleSyncResult) => {
    pendingSyncRef.current = false;
    retryRef.current = 0;
    lastHandledUrlRef.current = '';
    lastInjectKeyRef.current = '';
    lastInjectAtRef.current = 0;
    phaseRef.current = 'done';

    if (!completedRef.current) {
      completedRef.current = true;
      onComplete?.(result);
    }
  }, [onComplete]);

  const injectScheduleScript = useCallback((reason: string, rawUrl?: string, minIntervalMs = 1200) => {
    const key = normalizeScheduleUrl(rawUrl || lastHandledUrlRef.current || '');
    const now = Date.now();

    if (key && lastInjectKeyRef.current === key && now - lastInjectAtRef.current < minIntervalMs) {
      return;
    }

    lastInjectKeyRef.current = key;
    lastInjectAtRef.current = now;
    console.log('[schedule-agent][inject]', reason, rawUrl || key);
    webViewRef.current?.injectJavaScript(buildAdaptiveSchedulePageScript());
  }, []);

  const runLogin = useCallback(() => {
    if (!credRef.current) {
      finish({ success: false, updatedAt: null, coursesCount: 0, message: '找不到登入憑證' });
      return;
    }

    pendingSyncRef.current = false;
    phaseRef.current = 'logging_in';
    webViewRef.current?.injectJavaScript(buildLoginScript(credRef.current));
  }, [finish]);

  const persistCourses = useCallback(async (incomingCourses: CourseData[]) => {
    const parsed = sanitizeCourseList(incomingCourses);
    if (parsed.length === 0) return false;

    const updatedAt = Date.now();
    await saveCourses(parsed, false, updatedAt);
    await refreshScheduledCourseReminders(parsed);
    finish({
      success: true,
      updatedAt,
      coursesCount: parsed.length,
    });
    return true;
  }, [finish]);

  const retrySync = useCallback((message = '找不到課表資料') => {
    if (retryRef.current >= 2) {
      finish({ success: false, updatedAt: null, coursesCount: 0, message });
      return;
    }

    retryRef.current += 1;
    lastHandledUrlRef.current = '';
    lastInjectKeyRef.current = '';
    lastInjectAtRef.current = 0;
    phaseRef.current = 'syncing';
    injectScheduleScript('retry');
  }, [finish, injectScheduleScript]);

  const startSync = useCallback(async () => {
    if (!enabled) return;

    const savedCredentials = await getSavedPCCUCredentials();

    if (!savedCredentials) {
      finish({ success: false, updatedAt: null, coursesCount: 0, message: '請先登入後再同步課表' });
      return;
    }

    credRef.current = savedCredentials;
    retryRef.current = 0;
    lastHandledUrlRef.current = '';
    lastInjectKeyRef.current = '';
    lastInjectAtRef.current = 0;
    pendingSyncRef.current = true;
    phaseRef.current = 'load_ecampus';

    if (!webReady) return;

    webViewRef.current?.injectJavaScript(`window.location.href=${JSON.stringify(`${DEFAULT_URL}?ts=`)} + Date.now();true;`);
  }, [enabled, finish, webReady]);

  const handleNavChange = useCallback((nav: WebViewNavigation) => {
    if (nav.loading) return;

    const url = nav.url || '';
    console.log('[schedule-agent][nav]', phaseRef.current, url);

    if (url.includes('inside.aspx')) {
      phaseRef.current = 'open_schedule';
      setTimeout(() => {
        webViewRef.current?.injectJavaScript(buildServiceOpenScript('1208'));
      }, 1200);
      return;
    }

    if (phaseRef.current === 'load_ecampus' && url.includes('default.aspx')) {
      runLogin();
      return;
    }

    if (isScheduleQueryUrl(url)) {
      lastHandledUrlRef.current = url;
      phaseRef.current = 'syncing';
      setTimeout(() => {
        injectScheduleScript('nav', url);
      }, 1200);
    }
  }, [injectScheduleScript, runLogin]);

  const handleMessage = useCallback(async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('[schedule-agent][message]', data.t, data.m || '', data.url || '');

      if (data.t === 'user_name' && data.n) {
        await SecureStore.setItemAsync('user_name', data.n);
        return;
      }

      if (data.t === 'login_ok') {
        phaseRef.current = 'open_schedule';
        lastHandledUrlRef.current = '';
        webViewRef.current?.injectJavaScript(`window.location.href=${JSON.stringify(INSIDE_URL)};true;`);
        return;
      }

      if (data.t === 'popup') {
        lastHandledUrlRef.current = '';
        webViewRef.current?.injectJavaScript(`window.location.href=${JSON.stringify(data.url)};true;`);
        return;
      }

      if (data.t === 'courses') {
        const parsedFromCourses = sanitizeCourseList(Array.isArray(data.c) ? (data.c as CourseData[]) : []);
        const parsedFromHtml =
          typeof data.h === 'string' && data.h
            ? sanitizeCourseList(parseScheduleFromHtml(data.h))
            : [];
        const parsed =
          parsedFromHtml.length > 0 &&
          (parsedFromHtml.length >= parsedFromCourses.length || hasSuspiciousCourseNames(parsedFromCourses))
            ? parsedFromHtml
            : parsedFromCourses;

        if (!(await persistCourses(parsed))) {
          retrySync();
        }
        return;
      }

      if (data.t === 'html') {
        const parsed = sanitizeCourseList(parseScheduleFromHtml(typeof data.h === 'string' ? data.h : ''));
        if (!(await persistCourses(parsed))) {
          retrySync();
        }
        return;
      }

      if (data.t === 'err') {
        const message = data.m ? `課表同步失敗：${data.m}` : '課表同步失敗';
        if (
          (phaseRef.current === 'open_schedule' || phaseRef.current === 'syncing') &&
          typeof data.m === 'string' &&
          /Network request failed|Login request timed out|Login request aborted/i.test(data.m)
        ) {
          return;
        }
        if (phaseRef.current === 'syncing') retrySync(message);
        else finish({ success: false, updatedAt: null, coursesCount: 0, message });
      }
    } catch (error) {
      finish({ success: false, updatedAt: null, coursesCount: 0, message: '課表同步失敗' });
    }
  }, [finish, persistCourses, retrySync]);

  useEffect(() => {
    if (!enabled) return;
    if (startedReloadKeyRef.current === reloadKey) return;

    startedReloadKeyRef.current = reloadKey;
    completedRef.current = false;
    void startSync();
  }, [enabled, reloadKey, startSync]);

  if (!enabled) return null;

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        ref={webViewRef}
        style={styles.hiddenInner}
        source={{ uri: DEFAULT_URL }}
        originWhitelist={['*']}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        domStorageEnabled
        cacheEnabled={false}
        userAgent={userAgent}
        onNavigationStateChange={handleNavChange}
        onMessage={handleMessage}
        onLoadEnd={(event) => {
          const currentUrl = event.nativeEvent.url || '';
          if (!webReady) setWebReady(true);

          if (pendingSyncRef.current && phaseRef.current === 'load_ecampus') {
            runLogin();
            return;
          }

          if (phaseRef.current === 'syncing' && isScheduleQueryUrl(currentUrl)) {
            setTimeout(() => {
              injectScheduleScript('loadend', currentUrl, 1600);
            }, 400);
          }
        }}
        onError={() => finish({ success: false, updatedAt: null, coursesCount: 0, message: '課表頁面載入失敗' })}
        javaScriptEnabled
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
