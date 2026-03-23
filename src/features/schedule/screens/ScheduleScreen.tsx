import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  AppState,
  Platform,
  RefreshControl,
  InteractionManager,
  ScrollView,
} from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import * as SecureStore from 'expo-secure-store';
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
import {
  CourseData,
  hasSuspiciousCourseNames,
  parseScheduleFromHtml,
  sanitizeCourseList,
} from '../../pccu/parsers/pccuScraper';
import { refreshScheduledCourseReminders } from '../../notifications/services/courseReminderService';
import { buildUpdatedAtText } from '../../../utils/updatedAt';

const DEFAULT_URL = 'https://ecampus.pccu.edu.tw/eCampus/default.aspx';
const INSIDE_URL = 'https://ecampus.pccu.edu.tw/eCampus/inside.aspx';
const WEEKDAY_LABELS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
const PERIOD_TIMES: Array<{ start: [number, number]; end: [number, number] }> = [
  { start: [8, 10], end: [9, 0] },
  { start: [9, 10], end: [10, 0] },
  { start: [10, 10], end: [11, 0] },
  { start: [11, 10], end: [12, 0] },
  { start: [12, 10], end: [13, 0] },
  { start: [13, 10], end: [14, 0] },
  { start: [14, 10], end: [15, 0] },
  { start: [15, 10], end: [16, 0] },
  { start: [16, 10], end: [17, 0] },
  { start: [17, 10], end: [18, 0] },
  { start: [18, 10], end: [19, 0] },
  { start: [19, 10], end: [20, 0] },
  { start: [20, 10], end: [21, 0] },
  { start: [21, 10], end: [22, 0] },
  { start: [22, 10], end: [23, 0] },
  { start: [23, 10], end: [23, 59] },
];

type Phase = 'idle' | 'load_ecampus' | 'logging_in' | 'open_schedule' | 'syncing' | 'done';

type CourseSummary = {
  course: CourseData;
  start: Date;
  end: Date;
};

const pad2 = (value: number) => String(value).padStart(2, '0');
const formatTime = (hours: number, minutes: number) => `${pad2(hours)}:${pad2(minutes)}`;
const toJsDay = (dayOfWeek: number) => ((dayOfWeek % 7) + 7) % 7;

const buildCourseWindow = (course: CourseData, now: Date) => {
  const slot = PERIOD_TIMES[course.startPeriod - 1];
  const endSlot = PERIOD_TIMES[course.endPeriod - 1] || slot;
  const day = toJsDay(course.dayOfWeek);

  if (!slot || !endSlot || day < 0 || day > 6) return null;

  const start = new Date(now);
  start.setDate(now.getDate() + ((day - now.getDay() + 7) % 7));
  start.setHours(slot.start[0], slot.start[1], 0, 0);

  const end = new Date(now);
  end.setDate(now.getDate() + ((day - now.getDay() + 7) % 7));
  end.setHours(endSlot.end[0], endSlot.end[1], 0, 0);

  return { start, end };
};

const getCourseSummaries = (courses: CourseData[], now: Date) => {
  let current: CourseSummary | null = null;
  let next: CourseSummary | null = null;
  let previousToday: CourseSummary | null = null;

  courses.forEach((course) => {
    const window = buildCourseWindow(course, now);
    if (!window) return;

    if (window.start <= now && now < window.end) {
      if (!current || window.end.getTime() < current.end.getTime()) {
        current = { course, start: window.start, end: window.end };
      }
      return;
    }

    if (isSameDay(window.start, now) && window.end <= now) {
      if (!previousToday || window.end.getTime() > previousToday.end.getTime()) {
        previousToday = { course, start: window.start, end: window.end };
      }
    }

    if (window.start <= now) {
      window.start.setDate(window.start.getDate() + 7);
      window.end.setDate(window.end.getDate() + 7);
    }

    if (!next || window.start.getTime() < next.start.getTime()) {
      next = { course, start: window.start, end: window.end };
    }
  });

  return { current, next, previousToday };
};

const formatSummaryMeta = (summary: CourseSummary | null) => {
  if (!summary) return '';
  const dayLabel = WEEKDAY_LABELS[summary.start.getDay()] || '';
  const location = summary.course.location || '地點未提供';
  return `${dayLabel} ${formatTime(summary.start.getHours(), summary.start.getMinutes())}-${formatTime(summary.end.getHours(), summary.end.getMinutes())} · ${location}`;
};

const isSameDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const formatPeriodLabel = (course: CourseData) =>
  course.startPeriod === course.endPeriod ? `第 ${course.startPeriod} 節` : `第 ${course.startPeriod}-${course.endPeriod} 節`;

const formatCourseStartTime = (course: CourseData) => {
  const slot = PERIOD_TIMES[course.startPeriod - 1];
  if (!slot) return '';
  return formatTime(slot.start[0], slot.start[1]);
};

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
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [now, setNow] = useState(new Date());
  const { theme } = useTheme();

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

  const keepWebViewVisibleForDebug = __DEV__ && developerDebugEnabled;
  const updatedAtLineText = buildUpdatedAtText({
    updatedAt: lastUpdatedAt,
    isUpdating: loading,
    updatingLabel: '正在更新課表...',
    emptyLabel: '尚未同步課表',
  });
  const {
    current: currentCourse,
    next: nextCourse,
    previousToday,
  } = useMemo(() => getCourseSummaries(courses, now), [courses, now]);
  const isBreakTime = !currentCourse && !!previousToday;

  useEffect(() => {
    coursesRef.current = courses;
  }, [courses]);

  useEffect(() => {
    const refreshNow = () => setNow(new Date());
    const timer = setInterval(refreshNow, 15 * 1000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshNow();
      }
    });

    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

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
    await refreshScheduledCourseReminders(normalizedCourses);
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
    const nowAt = Date.now();

    if (key && lastInjectKeyRef.current === key && nowAt - lastInjectAtRef.current < minIntervalMs) {
      return;
    }

    lastInjectKeyRef.current = key;
    lastInjectAtRef.current = nowAt;
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
    setPullRefreshing(false);
    setShowWebView(keepWebViewVisibleForDebug);
    setLoading(false);
    setStatusText(finalMessage);
  }, [keepWebViewVisibleForDebug]);

  const retrySync = useCallback((fallbackMessage: string) => {
    if (retryRef.current >= 2) {
      finish(coursesRef.current.length > 0 ? `${fallbackMessage}，已保留舊資料` : fallbackMessage);
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

  const startFetch = useCallback(async (options: { silent?: boolean; manual?: boolean } = {}) => {
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
    const manual = !!options.manual;
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
    setPullRefreshing(manual);
    setLoading(true);
    setShowWebView(true);
    setStatusText(silent ? '背景更新課表中...' : '開始同步課表...');
    clearPendingTimeout();
    timeoutRef.current = setTimeout(() => {
      finish(coursesRef.current.length > 0 ? '課表更新逾時，已保留舊資料' : '課表同步逾時');
    }, 90000);
  }, [finish]);

  const handleNavChange = useCallback((nav: WebViewNavigation) => {
    if (nav.loading) return;

    const url = nav.url || '';
    setDebugUrl(url);
    setDebugNote(`nav ${phaseRef.current}`);

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
        const parsedFromHtml = typeof data.h === 'string' && data.h
          ? sanitizeCourseList(parseScheduleFromHtml(data.h))
          : [];
        const parsed =
          parsedFromHtml.length > 0 &&
          (parsedFromHtml.length >= parsedFromCourses.length || hasSuspiciousCourseNames(parsedFromCourses))
            ? parsedFromHtml
            : parsedFromCourses;

        if (await persistCourses(parsed)) {
          finish();
        } else {
          retrySync(coursesRef.current.length > 0 ? '課表同步失敗' : '找不到課表資料');
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
        setDebugHtmlPreview(htmlPreview);
        const parsed = sanitizeCourseList(parseScheduleFromHtml(rawHtml));
        if (await persistCourses(parsed)) {
          finish();
        } else {
          retrySync(coursesRef.current.length > 0 ? '課表同步失敗' : '找不到課表資料');
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
    } catch {
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
      setStatusText('目前只有示範資料，請重新同步課表');
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
        if (phaseRef.current === 'load_ecampus') {
          setStatusText('頁面已載入，準備登入中...');
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

  const renderSection = (dayIndex: number, title: string) => {
    const coursesOfDay = courses
      .filter((course) => toJsDay(course.dayOfWeek) === dayIndex)
      .sort((a, b) => a.startPeriod - b.startPeriod);

    if (coursesOfDay.length === 0) return null;

    return (
      <View style={[styles.sectionCard, { backgroundColor: theme.card, shadowColor: theme.text }]} key={dayIndex}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
        {coursesOfDay.map((course, index) => (
          <View style={styles.arrivalRow} key={`${course.name}-${course.startPeriod}-${index}`}>
            <View style={styles.arrivalTextBlock}>
              <View style={styles.courseTitleRow}>
                <Text style={[styles.arrivalStop, { color: theme.text, marginBottom: 0 }]} numberOfLines={1}>
                  {course.name}
                </Text>
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: course.required ? 'rgba(255,59,48,0.1)' : 'rgba(52,199,89,0.1)',
                      marginLeft: 8,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '800',
                      color: course.required ? theme.danger : theme.success,
                    }}
                  >
                    {course.required ? '必修' : '選修'}
                  </Text>
                </View>
              </View>
              <Text style={[styles.arrivalMeta, { color: theme.textSub }]} numberOfLines={1}>
                {[course.location || '地點未提供', course.teacher].filter(Boolean).join(' / ')}
              </Text>
            </View>
            <View style={styles.arrivalEtaBlock}>
              <Text style={[styles.arrivalEta, { color: theme.primary }]}>{formatPeriodLabel(course)}</Text>
              <Text style={[styles.arrivalEtaTime, { color: theme.textSub }]}>
                {formatCourseStartTime(course)}
              </Text>
            </View>
          </View>
        ))}
      </View>
    );
  };

  const handlePullRefresh = () => {
    void startFetch({ manual: true, silent: false });
  };

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: theme.bg }]}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl
            refreshing={pullRefreshing}
            onRefresh={handlePullRefresh}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        )}
      >
        {showWebView && !keepWebViewVisibleForDebug ? <View style={styles.hiddenWebView}>{renderSyncWebView()}</View> : null}

        <View style={[styles.heroCard, { backgroundColor: theme.card, shadowColor: theme.text }]}> 
          <View style={styles.heroHeader}>
            <AppSymbol name="clock.fill" size={28} tintColor={theme.primary} fallback={<Text>課表</Text>} />
            <Text style={[styles.heroTitle, { color: theme.text }]}>課程</Text>
          </View>

          <View style={styles.summaryStack}>
            {!isBreakTime ? (
              <View style={[styles.summaryItem, { backgroundColor: theme.syncBtnBg, borderColor: theme.border }]}> 
                <View style={[styles.summaryPill, styles.summaryPillActive, { backgroundColor: theme.primary }]}>
                  <Text style={styles.summaryPillActiveText}>上課中</Text>
                </View>
                <Text style={[styles.summaryCourse, { color: theme.text }]}> 
                  {currentCourse ? currentCourse.course.name : '目前沒有上課中的課程'}
                </Text>
                <Text style={[styles.summaryMeta, { color: theme.textSub }]}> 
                  {currentCourse ? formatSummaryMeta(currentCourse) : '現在沒有進行中的課程'}
                </Text>
              </View>
            ) : null}

            <View style={[styles.summaryItem, { backgroundColor: theme.syncBtnBg, borderColor: theme.border }]}> 
              <View style={[styles.summaryPill, styles.summaryPillUpcoming, { backgroundColor: 'rgba(10, 102, 255, 0.16)' }]}>
                <Text style={[styles.summaryPillUpcomingText, { color: theme.primary }]}>下節課</Text>
              </View>
              <Text style={[styles.summaryCourse, { color: theme.text }]}> 
                {nextCourse ? nextCourse.course.name : '目前沒有下一節課'}
              </Text>
              <Text style={[styles.summaryMeta, { color: theme.textSub }]}> 
                {nextCourse ? formatSummaryMeta(nextCourse) : '目前沒有可顯示的後續課程'}
              </Text>
            </View>
          </View>

        </View>

        {keepWebViewVisibleForDebug ? (
          <View style={[styles.noticeCard, { backgroundColor: theme.card, shadowColor: theme.text }]}> 
            <Text style={[styles.noticeTitle, { color: theme.text }]}>Debug 資訊</Text>
            <Text style={[styles.debugText, { color: theme.textSub }]} numberOfLines={2}>
              URL: {debugUrl || DEFAULT_URL}
            </Text>
            <Text style={[styles.debugText, { color: theme.textSub }]} numberOfLines={2}>
              Event: {debugNote || '-'}
            </Text>
            {debugHtmlPreview ? (
              <Text style={[styles.debugText, { color: theme.textSub }]} numberOfLines={4}>
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

        {loading && courses.length === 0 ? (
          <View style={[styles.statusCard, { backgroundColor: theme.card, shadowColor: theme.text }]}> 
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={[styles.statusText, { color: theme.textSub, marginTop: 10 }]}>{statusText || '正在讀取課表資料...'}</Text>
          </View>
        ) : null}

        {!loading && statusText && (statusText.includes('失敗') || statusText.includes('請先登入')) ? (
          <View style={[styles.noticeCard, { backgroundColor: theme.card, shadowColor: theme.text }]}> 
            <Text style={[styles.noticeTitle, { color: theme.text }]}>同步狀態</Text>
            <Text style={[styles.noticeText, { color: theme.textSub }]}>{statusText}</Text>
          </View>
        ) : null}

        {courses.length === 0 && !loading && !statusText && phaseRef.current === 'idle' ? (
          <View style={styles.emptyState}>
            <AppSymbol name="clock.fill" size={60} tintColor={theme.textSub} fallback={<Text>課表</Text>} />
            <Text style={[styles.emptyText, { color: theme.textSub }]}>目前沒有課表資料</Text>
          </View>
        ) : null}

        {[1, 2, 3, 4, 5, 6, 0].map((dayIndex) => renderSection(dayIndex, WEEKDAY_LABELS[dayIndex]))}

        <Text style={[styles.updatedText, { color: theme.textSub }]}>{updatedAtLineText}</Text>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {keepWebViewVisibleForDebug ? <DebugStamp label="DBG-SCHEDULE-CLEAN" /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16 },
  hiddenWebView: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -1000, top: -1000 },
  hiddenWebViewInner: { width: 1, height: 1 },
  debugText: { fontSize: 12, lineHeight: 18 },
  debugWebViewCard: { borderRadius: 24, borderWidth: 1, overflow: 'hidden', minHeight: 420, marginBottom: 16 },
  debugWebViewInner: { width: '100%', height: 420 },
  heroCard: {
    borderRadius: 28,
    padding: 22,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  heroHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  heroTitle: { fontSize: 22, fontWeight: '700', marginLeft: 8 },
  summaryStack: { gap: 10 },
  summaryItem: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  summaryPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  summaryPillActive: {
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  summaryPillActiveText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  summaryPillUpcoming: {},
  summaryPillUpcomingText: {
    fontSize: 12,
    fontWeight: '700',
  },
  summaryCourse: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  summaryMeta: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  updatedText: { marginTop: 4, marginBottom: 8, fontSize: 13, textAlign: 'center' },
  statusCard: {
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  statusText: { fontSize: 14 },
  noticeCard: {
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  noticeTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  noticeText: { fontSize: 14, lineHeight: 21 },
  sectionCard: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 14 },
  arrivalRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  arrivalTextBlock: { flex: 1, marginRight: 12 },
  arrivalEtaBlock: { alignItems: 'flex-end' },
  courseTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  arrivalStop: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  arrivalMeta: { fontSize: 13 },
  arrivalEta: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  arrivalEtaTime: { fontSize: 13, marginTop: 4 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  emptyState: { alignItems: 'center', marginTop: 40, marginBottom: 40 },
  emptyText: { marginTop: 16, fontSize: 14 },
  bottomSpacer: { height: 80 },
});
