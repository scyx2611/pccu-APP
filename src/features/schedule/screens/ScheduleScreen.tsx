import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Animated, Platform, InteractionManager } from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import * as SecureStore from 'expo-secure-store';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AppSymbol from '../../../shared/components/AppSymbol';
import DebugStamp from '../../../shared/components/DebugStamp';
import { useTheme } from '../../../providers/theme/ThemeProvider';
import { getSavedPCCUCredentials } from '../../auth/services/authService';
import { getCourses, setCourses as saveCourses } from '../storage/scheduleStorage';
import { getDeveloperDebugEnabled } from '../../settings/storage/developerSettings';
import {
  buildLoginScript,
  buildAdaptiveSchedulePageScript,
  buildServiceOpenScript,
  PCCUCredentials,
} from '../../pccu/sync/pccuSyncScripts';
import { CourseData, hasSuspiciousCourseNames, parseScheduleFromHtml, sanitizeCourseList } from '../../pccu/parsers/pccuScraper';

const DEFAULT_URL = 'https://ecampus.pccu.edu.tw/eCampus/default.aspx';
const INSIDE_URL = 'https://ecampus.pccu.edu.tw/eCampus/inside.aspx';

type Phase = 'idle' | 'load_ecampus' | 'logging_in' | 'open_schedule' | 'syncing' | 'done';

export default function ScheduleScreen() {
  const [loading, setLoading] = useState(false);
  const [courses, setCoursesState] = useState<CourseData[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [statusText, setStatusText] = useState('');
  const [showWebView, setShowWebView] = useState(false);
  const [webViewKey, setWebViewKey] = useState(0);
  const [developerDebugEnabled, setDeveloperDebugEnabled] = useState(false);
  const [debugUrl, setDebugUrl] = useState(DEFAULT_URL);
  const [debugNote, setDebugNote] = useState('');
  const [debugHtmlPreview, setDebugHtmlPreview] = useState('');
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
  const webViewRef = useRef<WebView>(null);
  const phaseRef = useRef<Phase>('idle');
  const credRef = useRef<PCCUCredentials | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef = useRef(0);
  const lastHandledUrlRef = useRef('');
  const coursesRef = useRef<CourseData[]>([]);
  const silentSyncRef = useRef(false);
  const lastInjectKeyRef = useRef('');
  const lastInjectAtRef = useRef(0);
  const userAgent = Platform.OS === 'ios'
    ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    : 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36';

  const withAlpha = (hex: string, alpha: number) => {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const topFadeHeight = insets.top + 84;
  const keepWebViewVisibleForDebug = __DEV__ && developerDebugEnabled;
  const formattedUpdatedAt = lastUpdatedAt
    ? `${String(new Date(lastUpdatedAt).getFullYear())}/${String(new Date(lastUpdatedAt).getMonth() + 1).padStart(2, '0')}/${String(new Date(lastUpdatedAt).getDate()).padStart(2, '0')} ${String(new Date(lastUpdatedAt).getHours()).padStart(2, '0')}:${String(new Date(lastUpdatedAt).getMinutes()).padStart(2, '0')}`
    : '';
  const updatedAtLineText = loading
    ? '正在更新...'
    : formattedUpdatedAt
      ? `最後更新 ${formattedUpdatedAt}`
      : '';

  useEffect(() => {
    console.log('[schedule-sync][build]', '20260320B');
  }, []);

  useEffect(() => {
    coursesRef.current = courses;
  }, [courses]);

  const clearPendingTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const persistCourses = useCallback(async (nextCourses: CourseData[]) => {
    const normalizedCourses = sanitizeCourseList(nextCourses);
    if (normalizedCourses.length === 0) return false;

    const updatedAt = Date.now();
    setCoursesState(normalizedCourses);
    setLastUpdatedAt(updatedAt);
    await saveCourses(normalizedCourses, false, updatedAt);
    return true;
  }, []);

  const normalizeScheduleUrl = (url: string) =>
    (url || '')
      .replace(/([?&])NoCache=[^&]+/gi, '$1')
      .replace(/([?&])lvMainMenuIndex=[^&]+/gi, '$1')
      .replace(/[?&]$/, '');

  const isScheduleQueryUrl = (url: string) => /\/queryCourse\/(?:index|queryByCourse|queryByStudent)\.asp/i.test(url || '');

  const injectScheduleScript = useCallback((reason: string, rawUrl?: string, minIntervalMs = 1200) => {
    const key = normalizeScheduleUrl(rawUrl || lastHandledUrlRef.current || '');
    const now = Date.now();

    if (key && lastInjectKeyRef.current === key && now - lastInjectAtRef.current < minIntervalMs) {
      console.log('[schedule-sync][skip-inject]', reason, key);
      return;
    }

    lastInjectKeyRef.current = key;
    lastInjectAtRef.current = now;
    console.log('[schedule-sync][inject]', reason, rawUrl || key);
    webViewRef.current?.injectJavaScript(buildAdaptiveSchedulePageScript());
  }, []);

  const finish = useCallback((message?: string) => {
    const finalMessage = message || (silentSyncRef.current ? '課表已更新' : '課表同步完成');
    clearPendingTimeout();
    phaseRef.current = 'done';
    retryRef.current = 0;
    lastHandledUrlRef.current = '';
    lastInjectKeyRef.current = '';
    lastInjectAtRef.current = 0;
    silentSyncRef.current = false;
    setShowWebView(keepWebViewVisibleForDebug);
    setLoading(false);
    setStatusText(finalMessage);
  }, [keepWebViewVisibleForDebug]);

  const retrySync = useCallback((fallbackMessage: string) => {
    if (retryRef.current >= 2) {
      finish(coursesRef.current.length > 0 ? `${fallbackMessage}，已保留舊課表` : fallbackMessage);
      return;
    }

    retryRef.current += 1;
    lastHandledUrlRef.current = '';
    lastInjectKeyRef.current = '';
    lastInjectAtRef.current = 0;
    phaseRef.current = 'syncing';
    setStatusText(`重新嘗試同步課表 (${retryRef.current}/2)...`);
    setDebugNote(`retry ${retryRef.current}`);
    injectScheduleScript('retry');
  }, [finish, injectScheduleScript]);

  const startFetch = useCallback(async (options: { silent?: boolean } = {}) => {
    if (phaseRef.current !== 'idle' && phaseRef.current !== 'done') {
      return;
    }

    const savedCredentials = await getSavedPCCUCredentials();

    if (!savedCredentials) {
      setLoading(false);
      setStatusText('請先登入後再同步課表');
      return;
    }

    const silent = !!options.silent && coursesRef.current.length > 0;
    credRef.current = savedCredentials;
    retryRef.current = 0;
    lastHandledUrlRef.current = '';
    lastInjectKeyRef.current = '';
    lastInjectAtRef.current = 0;
    silentSyncRef.current = silent;
    phaseRef.current = 'load_ecampus';
    setWebViewKey((value) => value + 1);
    setDebugUrl(DEFAULT_URL);
    setDebugNote(silent ? 'background refresh' : 'start fetch');
    setDebugHtmlPreview('');
    setLoading(true);
    setShowWebView(true);
    setStatusText(silent ? '背景更新課表中...' : '開始同步課表...');
    clearPendingTimeout();
    timeoutRef.current = setTimeout(() => {
      finish(coursesRef.current.length > 0 ? '背景更新逾時，已保留既有課表' : '課表同步逾時');
    }, 90000);
  }, [finish]);

  const handleNavChange = useCallback((nav: WebViewNavigation) => {
    if (nav.loading) return;

    const url = nav.url || '';
    setDebugUrl(url);
    setDebugNote(`nav ${phaseRef.current}`);
    console.log('[schedule-sync][nav]', phaseRef.current, url);

    if (url.includes('inside.aspx')) {
      phaseRef.current = 'open_schedule';
      setStatusText('開啟課表查詢...');
      setTimeout(() => {
        webViewRef.current?.injectJavaScript(buildServiceOpenScript('1208'));
      }, 1200);
      return;
    }

    if (phaseRef.current === 'load_ecampus' && url.includes('default.aspx')) {
      if (!credRef.current) {
        finish('找不到登入憑證');
        return;
      }

      phaseRef.current = 'logging_in';
      setStatusText('登入中...');
      webViewRef.current?.injectJavaScript(buildLoginScript(credRef.current));
      return;
    }
    if (isScheduleQueryUrl(url)) {
      lastHandledUrlRef.current = url;
      phaseRef.current = 'syncing';
      setStatusText('查詢課表中...');
      setTimeout(() => {
        injectScheduleScript('nav', url);
      }, 1200);
    }
  }, [finish, injectScheduleScript]);

  const handleMessage = useCallback(async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      setDebugNote(`${data.t}${data.m ? ` ${data.m}` : data.url ? ` ${data.url}` : ''}`);
      console.log('[schedule-sync][message]', data.t, data.m || '', data.url || '');

      if (data.t === 'status') {
        setStatusText(data.m || '同步課表中...');
        return;
      }

      if (data.t === 'user_name' && data.n) {
        await SecureStore.setItemAsync('user_name', data.n);
        return;
      }

      if (data.t === 'login_ok') {
        phaseRef.current = 'open_schedule';
        lastHandledUrlRef.current = '';
        setStatusText('登入成功，準備開啟課表...');
        webViewRef.current?.injectJavaScript(`window.location.href=${JSON.stringify(INSIDE_URL)};true;`);
        return;
      }

      if (data.t === 'popup') {
        lastHandledUrlRef.current = '';
        if (data.url) setDebugUrl(data.url);
        setStatusText('開啟課表頁面中...');
        webViewRef.current?.injectJavaScript(`window.location.href=${JSON.stringify(data.url)};true;`);
        return;
      }

      if (data.t === 'login_fail') {
        finish(data.m ? `登入失敗：${data.m}` : '登入失敗');
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

        if (parsed !== parsedFromCourses) {
          console.log('[schedule-sync][courses-source]', 'html-fallback');
        }

        if (await persistCourses(parsed)) {
          finish();
        } else {
          retrySync(coursesRef.current.length > 0 ? '課表同步失敗，已保留舊資料' : '找不到課表資料');
        }
        return;
      }

      if (data.t === 'html') {
        const rawHtml = typeof data.h === 'string' ? data.h : '';
        const htmlPreview = rawHtml
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 180);
        console.log(
          '[schedule-sync][html-meta]',
          JSON.stringify({
            len: rawHtml.length,
            hasPubContent: /pubContent|pubTdItem_Period/i.test(rawHtml),
            hasSearchButton: /(?:id|name|value)=["'][^"']*Search|查詢/u.test(rawHtml),
            hasWeekday: /(?:星期|週)[日天一二三四五六]/u.test(rawHtml),
            preview: htmlPreview,
          })
        );
        setDebugHtmlPreview(htmlPreview);
        const parsed = sanitizeCourseList(parseScheduleFromHtml(rawHtml));
        if (await persistCourses(parsed)) {
          finish();
        } else {
          retrySync(coursesRef.current.length > 0 ? '課表同步失敗，已保留舊資料' : '找不到課表資料');
        }
        return;
      }

      if (data.t === 'err') {
        if (
          (phaseRef.current === 'open_schedule' || phaseRef.current === 'syncing') &&
          typeof data.m === 'string' &&
          /Network request failed|Login request timed out|Login request aborted/i.test(data.m)
        ) {
          return;
        }
        const message = data.m ? `課表同步失敗：${data.m}` : '課表同步失敗';
        if (phaseRef.current === 'syncing') retrySync(message);
        else finish(message);
      }
    } catch (error) {
      finish('課表同步失敗，解析訊息時發生錯誤');
    }
  }, [finish, persistCourses, retrySync]);

  const loadCachedCourses = useCallback(async () => {
    const cached = await getCourses();

    if (cached.courses && !cached.mock) {
      setCoursesState(cached.courses);
      setLastUpdatedAt(cached.updatedAt);
      return { hasCachedCourses: cached.courses.length > 0 };
    }

    if (cached.mock) {
      setCoursesState([]);
      setLastUpdatedAt(cached.updatedAt);
      setStatusText('目前使用的是模擬課表資料');
      setLoading(false);
      return { hasCachedCourses: false };
    }

    setCoursesState([]);
    setLastUpdatedAt(null);
    return { hasCachedCourses: false };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let interactionTask: { cancel?: () => void } | null = null;

      const syncOnFocus = async () => {
        const debugEnabled = await getDeveloperDebugEnabled();
        if (!active) return;

        const { hasCachedCourses } = await loadCachedCourses();
        if (!active) return;

        setDeveloperDebugEnabled(debugEnabled);

        const launchSync = () => {
          if (!active) return;
          void startFetch({ silent: hasCachedCourses });
        };

        if (hasCachedCourses) {
          interactionTask = InteractionManager.runAfterInteractions(launchSync);
          return;
        }

        launchSync();
      };

      void syncOnFocus();

      return () => {
        active = false;
        if (interactionTask?.cancel) {
          interactionTask.cancel();
          interactionTask = null;
        }
        clearPendingTimeout();
      };
    }, [loadCachedCourses, startFetch])
  );

  useEffect(() => {
    if (!__DEV__) return;
    if (developerDebugEnabled) {
      setShowWebView(true);
      return;
    }
    if (!loading && phaseRef.current === 'done') {
      setShowWebView(false);
    }
  }, [developerDebugEnabled, loading]);

  const renderSyncWebView = () => (
    <WebView
      key={webViewKey}
      ref={webViewRef}
      style={keepWebViewVisibleForDebug ? styles.debugWebViewInner : styles.hiddenWebViewInner}
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
        setDebugUrl(currentUrl);
        console.log('[schedule-sync][loadend]', phaseRef.current);
        if (phaseRef.current === 'load_ecampus') {
          setStatusText('載入登入頁面中...');
          return;
        }
        if (phaseRef.current === 'syncing' && isScheduleQueryUrl(currentUrl)) {
          setTimeout(() => {
            injectScheduleScript('loadend', currentUrl, 1600);
          }, 400);
        }
      }}
      onError={() => finish(coursesRef.current.length > 0 ? '課表頁面載入失敗，已保留舊資料' : '課表頁面載入失敗')}
      javaScriptEnabled
    />
  );

  return (
    <>
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        {showWebView && !keepWebViewVisibleForDebug ? <View style={styles.hiddenWebView}>{renderSyncWebView()}</View> : null}

        <Animated.View
          style={[
            styles.topGradient,
            {
              height: topFadeHeight,
              opacity: scrollY.interpolate({
                inputRange: [0, 60],
                outputRange: [1, 0],
                extrapolate: 'clamp',
              }),
            },
          ]}
          pointerEvents="none"
        >
          <LinearGradient
            colors={[
              theme.ambient1 || theme.bg,
              withAlpha(theme.bg, 0.75),
              withAlpha(theme.bg, 0),
            ]}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <Animated.ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 28 }]}
          contentInsetAdjustmentBehavior="never"
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
          scrollEventThrottle={16}
        >
          <View style={styles.headerRow}>
            <View>
              <Text style={[styles.pageTitle, { color: theme.text }]}>課表</Text>
            </View>
          </View>

          {keepWebViewVisibleForDebug ? (
            <View style={[styles.debugControls, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.debugMeta, { color: theme.textSub }]} numberOfLines={2}>
                URL: {debugUrl || DEFAULT_URL}
              </Text>
              <Text style={[styles.debugMeta, { color: theme.textSub }]} numberOfLines={2}>
                Event: {debugNote || '-'}
              </Text>
              {debugHtmlPreview ? (
                <Text style={[styles.debugMeta, { color: theme.textSub }]} numberOfLines={3}>
                  HTML: {debugHtmlPreview}
                </Text>
              ) : null}
            </View>
          ) : null}

          {showWebView && keepWebViewVisibleForDebug ? (
            <View style={[styles.debugWebViewCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {renderSyncWebView()}
            </View>
          ) : null}

          {courses.length === 0 ? (
            <View style={styles.empty}>
              <AppSymbol name="clock.fill" size={60} tintColor={theme.textSub} />
              <Text style={{ color: theme.textSub, marginTop: 16 }}>目前沒有課表資料</Text>
            </View>
          ) : (
            courses.map((course, index) => (
              <View key={`${course.name}-${course.dayOfWeek}-${course.startPeriod}-${index}`} style={[styles.card, { backgroundColor: theme.card }]}> 
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: course.required ? 'rgba(255,59,48,0.1)' : 'rgba(52,199,89,0.1)',
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '800',
                      color: course.required ? theme.danger : theme.success,
                    }}
                  >
                    {course.required ? '必修' : '選修'}
                  </Text>
                </View>
                <Text style={[styles.name, { color: theme.text }]}>{course.name}</Text>
                <Text style={[styles.info, { color: theme.textSub }]}>{course.periodRange}</Text>
                <Text style={[styles.info, { color: theme.textSub, marginTop: 4 }]}> 
                  {[course.location || '未知', course.teacher].filter(Boolean).join(' / ')}
                </Text>
              </View>
            ))
          )}
          {updatedAtLineText ? (
            <Text style={[styles.updatedAtText, { color: theme.textSub }]}>{updatedAtLineText}</Text>
          ) : null}
          <View style={{ height: 100 }} />
        </Animated.ScrollView>
      </View>
      {keepWebViewVisibleForDebug ? <DebugStamp label="DBG-SCHEDULE-20260320B" /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 20 },
  topGradient: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  hiddenWebView: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -1000, top: -1000 },
  hiddenWebViewInner: { width: 1, height: 1 },
  debugControls: { borderRadius: 20, borderWidth: 1, padding: 16, marginBottom: 16 },
  debugMeta: { fontSize: 12, lineHeight: 18 },
  debugWebViewCard: { borderRadius: 24, borderWidth: 1, overflow: 'hidden', minHeight: 420, marginBottom: 16 },
  debugWebViewInner: { width: '100%', height: 420 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  pageTitle: { fontSize: 32, fontWeight: '800' },
  pageSubtitle: { fontSize: 13, marginTop: 4 },
  empty: { alignItems: 'center', marginTop: 100 },
  card: { borderRadius: 24, padding: 24, marginBottom: 16, elevation: 3 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginBottom: 12 },
  name: { fontSize: 20, fontWeight: '800', marginBottom: 12 },
  info: { fontSize: 14, fontWeight: '600' },
  updatedAtText: { fontSize: 13, textAlign: 'center', marginTop: 12 },
});

