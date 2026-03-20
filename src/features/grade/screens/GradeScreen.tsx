import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Animated, Platform } from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import * as SecureStore from 'expo-secure-store';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AppSymbol from '../../../shared/components/AppSymbol';
import DebugStamp from '../../../shared/components/DebugStamp';
import { useTheme } from '../../../providers/theme/ThemeProvider';
import { getSavedPCCUCredentials } from '../../auth/services/authService';
import { getGrades, setGrades as saveGrades } from '../storage/gradeStorage';
import {
  buildLoginScript,
  buildRobustGradePageScript,
  buildServiceOpenScript,
  PCCUCredentials,
} from '../../pccu/sync/pccuSyncScripts';
import { SemesterGrade, parseGradesFromHtml } from '../../pccu/parsers/pccuScraper';

const DEFAULT_URL = 'https://ecampus.pccu.edu.tw/eCampus/default.aspx';
const INSIDE_URL = 'https://ecampus.pccu.edu.tw/eCampus/inside.aspx';

type GradeScreenProps = {
  showPreview?: boolean;
  onScrollY?: Animated.Value;
};

type Phase = 'idle' | 'load_ecampus' | 'logging_in' | 'open_grade' | 'syncing' | 'done';

const FAIL_TEXT = new Set(['不及格', '不通過', 'F']);

const isFailScore = (value: string) => {
  if (FAIL_TEXT.has(value)) return true;
  const num = Number(value);
  return Number.isFinite(num) && num < 60;
};

export default function GradeScreen({ showPreview = false, onScrollY }: GradeScreenProps) {
  const [loading, setLoading] = useState(false);
  const [grades, setGrades] = useState<SemesterGrade[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [statusText, setStatusText] = useState('');
  const [webReady, setWebReady] = useState(false);
  const [debugUrl, setDebugUrl] = useState(DEFAULT_URL);
  const [debugNote, setDebugNote] = useState('');
  const [debugHtmlPreview, setDebugHtmlPreview] = useState('');
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const scrollY = onScrollY || useRef(new Animated.Value(0)).current;
  const webViewRef = useRef<WebView>(null);
  const credRef = useRef<PCCUCredentials | null>(null);
  const phaseRef = useRef<Phase>('idle');
  const pendingSyncRef = useRef(false);
  const retryRef = useRef(0);
  const lastHandledUrlRef = useRef('');
  const gradesRef = useRef<SemesterGrade[]>([]);
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
  const keepWebViewVisibleForDebug = __DEV__ && showPreview;
  const formattedUpdatedAt = lastUpdatedAt
    ? `${String(new Date(lastUpdatedAt).getFullYear())}/${String(new Date(lastUpdatedAt).getMonth() + 1).padStart(2, '0')}/${String(new Date(lastUpdatedAt).getDate()).padStart(2, '0')} ${String(new Date(lastUpdatedAt).getHours()).padStart(2, '0')}:${String(new Date(lastUpdatedAt).getMinutes()).padStart(2, '0')}`
    : '';
  const updatedAtLineText = loading
    ? '正在更新...'
    : formattedUpdatedAt
      ? `最後更新 ${formattedUpdatedAt}`
      : '';

  useEffect(() => {
    console.log('[grade-sync][build]', '20260320C');
  }, []);

  useEffect(() => {
    gradesRef.current = grades;
  }, [grades]);

  const normalizeGradeUrl = (url: string) =>
    (url || '')
      .replace(/([?&])NoCache=[^&]+/gi, '$1')
      .replace(/[?&]$/, '');

  const isGradeQueryUrl = (url: string) =>
    /https?:\/\/ap\d\.pccu\.edu\.tw\/studentscore\/student\/(?:index|index_score|scoreListAll)\.asp/i.test(url || '');

  const injectGradeScript = useCallback((reason: string, rawUrl?: string, minIntervalMs = 1200) => {
    const key = normalizeGradeUrl(rawUrl || lastHandledUrlRef.current || '');
    const now = Date.now();

    if (key && lastInjectKeyRef.current === key && now - lastInjectAtRef.current < minIntervalMs) {
      console.log('[grade-sync][skip-inject]', reason, key);
      return;
    }

    lastInjectKeyRef.current = key;
    lastInjectAtRef.current = now;
    console.log('[grade-sync][inject]', reason, rawUrl || key);
    webViewRef.current?.injectJavaScript(buildRobustGradePageScript());
  }, []);

  const finish = useCallback((message = '成績同步完成') => {
    pendingSyncRef.current = false;
    retryRef.current = 0;
    lastHandledUrlRef.current = '';
    lastInjectKeyRef.current = '';
    lastInjectAtRef.current = 0;
    phaseRef.current = 'done';
    setLoading(false);
    setStatusText(message);
  }, []);

  const runLogin = useCallback(() => {
    if (!credRef.current) {
      finish('找不到登入憑證');
      return;
    }

    pendingSyncRef.current = false;
    phaseRef.current = 'logging_in';
    setStatusText('登入中...');
    webViewRef.current?.injectJavaScript(buildLoginScript(credRef.current));
  }, [finish]);

  const retrySync = useCallback((fallbackMessage: string) => {
    if (retryRef.current >= 2) {
      finish(gradesRef.current.length > 0 ? `${fallbackMessage}，已保留舊資料` : fallbackMessage);
      return;
    }

    retryRef.current += 1;
    lastHandledUrlRef.current = '';
    lastInjectKeyRef.current = '';
    lastInjectAtRef.current = 0;
    phaseRef.current = 'syncing';
    setStatusText(`重新嘗試同步成績 (${retryRef.current}/2)...`);
    setDebugNote(`retry ${retryRef.current}`);
    injectGradeScript('retry');
  }, [finish, injectGradeScript]);

  const persistGrades = useCallback(async (nextGrades: SemesterGrade[]) => {
    if (!nextGrades || nextGrades.length === 0) return false;
    const updatedAt = Date.now();
    setGrades(nextGrades);
    setLastUpdatedAt(updatedAt);
    await saveGrades(nextGrades, [], updatedAt);
    return true;
  }, []);

  const startSync = useCallback(async (options: { silent?: boolean; hasCachedGrades?: boolean } = {}) => {
    const savedCredentials = await getSavedPCCUCredentials();

    if (!savedCredentials) {
      setLoading(false);
      setStatusText('請先登入後再同步成績');
      return;
    }

    const hasCachedGrades = !!options.hasCachedGrades || gradesRef.current.length > 0;
    const silent = !!options.silent && hasCachedGrades;
    credRef.current = savedCredentials;
    retryRef.current = 0;
    lastHandledUrlRef.current = '';
    lastInjectKeyRef.current = '';
    lastInjectAtRef.current = 0;
    pendingSyncRef.current = true;
    phaseRef.current = 'load_ecampus';
    setDebugUrl(DEFAULT_URL);
    setDebugNote(silent ? 'background sync' : 'start sync');
    setDebugHtmlPreview('');
    setLoading(true);
    setStatusText(silent && hasCachedGrades ? '背景更新成績中...' : '開始同步成績...');

    if (!webReady) return;

    webViewRef.current?.injectJavaScript(`window.location.href=${JSON.stringify(`${DEFAULT_URL}?ts=`)} + Date.now();true;`);
  }, [webReady]);

  const handleNavChange = useCallback((nav: WebViewNavigation) => {
    if (nav.loading) return;

    const url = nav.url || '';
    setDebugUrl(url);
    setDebugNote(`nav ${phaseRef.current}`);
    console.log('[grade-sync][nav]', phaseRef.current, url);

    if (url.includes('inside.aspx')) {
      phaseRef.current = 'open_grade';
      setStatusText('開啟成績查詢...');
      setTimeout(() => {
        webViewRef.current?.injectJavaScript(buildServiceOpenScript('1220'));
      }, 1200);
      return;
    }

    if (phaseRef.current === 'load_ecampus' && url.includes('default.aspx')) {
      runLogin();
      return;
    }

    if (isGradeQueryUrl(url)) {
      lastHandledUrlRef.current = url;
      phaseRef.current = 'syncing';
      setStatusText('查詢成績中...');
      setTimeout(() => {
        injectGradeScript('nav', url);
      }, 1200);
    }
  }, [injectGradeScript, runLogin]);

  const handleMessage = useCallback(async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      setDebugNote(`${data.t}${data.m ? ` ${data.m}` : data.url ? ` ${data.url}` : ''}`);
      console.log('[grade-sync][message]', data.t, data.m || '', data.url || '');

      if (data.t === 'status') {
        setStatusText(data.m || '同步成績中...');
        return;
      }

      if (data.t === 'user_name' && data.n) {
        await SecureStore.setItemAsync('user_name', data.n);
        return;
      }

      if (data.t === 'login_ok') {
        phaseRef.current = 'open_grade';
        lastHandledUrlRef.current = '';
        setStatusText('登入成功，準備開啟成績...');
        webViewRef.current?.injectJavaScript(`window.location.href=${JSON.stringify(INSIDE_URL)};true;`);
        return;
      }

      if (data.t === 'popup') {
        lastHandledUrlRef.current = '';
        if (data.url) setDebugUrl(data.url);
        setStatusText('開啟成績頁面中...');
        webViewRef.current?.injectJavaScript(`window.location.href=${JSON.stringify(data.url)};true;`);
        return;
      }

      if (data.t === 'login_fail') {
        finish(data.m ? `登入失敗：${data.m}` : '登入失敗');
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
        console.log(
          '[grade-sync][html-meta]',
          JSON.stringify({
            len: rawHtml.length,
            hasSemester: /學年|學期|歷年成績/u.test(rawHtml),
            hasScore: /成績|平均|班排名|系排名/u.test(rawHtml),
            preview: htmlPreview,
          })
        );

        const parsed = parseGradesFromHtml(rawHtml);
        if (await persistGrades(parsed)) {
          finish();
        } else {
          retrySync(gradesRef.current.length > 0 ? '成績同步失敗' : '找不到成績資料');
        }
        return;
      }

      if (data.t === 'err') {
        const message = data.m ? `成績同步失敗：${data.m}` : '成績同步失敗';
        if (
          (phaseRef.current === 'open_grade' || phaseRef.current === 'syncing') &&
          typeof data.m === 'string' &&
          /Network request failed|Login request timed out|Login request aborted/i.test(data.m)
        ) {
          return;
        }
        if (phaseRef.current === 'syncing') retrySync(message);
        else finish(message);
      }
    } catch (error) {
      finish('成績同步失敗，解析訊息時發生錯誤');
    }
  }, [finish, persistGrades, retrySync]);

  const loadCachedGrades = useCallback(async () => {
    const cached = await getGrades();

    if (cached.grades) {
      setGrades(cached.grades);
      setLastUpdatedAt(cached.updatedAt);
      return { hasCachedGrades: cached.grades.length > 0 };
    }

    setGrades([]);
    setLastUpdatedAt(cached.updatedAt);
    return { hasCachedGrades: false };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const syncOnFocus = async () => {
        const { hasCachedGrades } = await loadCachedGrades();
        if (!active) return;
        await startSync({ silent: hasCachedGrades, hasCachedGrades });
      };

      void syncOnFocus();

      return () => {
        active = false;
      };
    }, [loadCachedGrades, startSync])
  );

  const renderSyncWebView = () => (
    <WebView
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
        console.log('[grade-sync][loadend]', phaseRef.current, currentUrl);
        if (!webReady) setWebReady(true);
        if (pendingSyncRef.current && phaseRef.current === 'load_ecampus') {
          runLogin();
          return;
        }
        if (phaseRef.current === 'syncing' && isGradeQueryUrl(currentUrl)) {
          setTimeout(() => {
            injectGradeScript('loadend', currentUrl, 1600);
          }, 400);
        }
      }}
      onError={() => finish(gradesRef.current.length > 0 ? '成績頁面載入失敗，已保留舊資料' : '成績頁面載入失敗')}
      javaScriptEnabled
    />
  );

  const renderStatChip = (label: string, value?: string) => {
    if (!value) return null;
    return (
      <View key={label} style={[styles.statChip, { backgroundColor: withAlpha(theme.primary, 0.08) }]}>
        <Text style={[styles.statChipLabel, { color: theme.textSub }]}>{label}</Text>
        <Text style={[styles.statChipValue, { color: theme.text }]}>{value}</Text>
      </View>
    );
  };

  return (
    <>
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        {(!keepWebViewVisibleForDebug) ? <View style={styles.hiddenWebView}>{renderSyncWebView()}</View> : null}

        <Animated.View
          style={[
            styles.topGradient,
            {
              height: topFadeHeight,
              opacity: scrollY.interpolate({
                inputRange: [0, 80],
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
              <Text style={[styles.pageTitle, { color: theme.text }]}>成績</Text>
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
                <Text style={[styles.debugMeta, { color: theme.textSub }]} numberOfLines={4}>
                  HTML: {debugHtmlPreview}
                </Text>
              ) : null}
            </View>
          ) : null}

          {keepWebViewVisibleForDebug ? (
            <View style={[styles.debugWebViewCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              {renderSyncWebView()}
            </View>
          ) : null}

          {grades.length === 0 ? (
            <View style={styles.empty}>
              <AppSymbol name="doc.text" size={60} tintColor={theme.textSub} />
              <Text style={{ color: theme.textSub, marginTop: 16 }}>目前沒有成績資料</Text>
            </View>
          ) : (
            grades.map((semester, index) => (
              <View
                key={`${semester.title}-${index}`}
                style={[styles.semesterCard, { backgroundColor: theme.card }]}
              >
                <View style={styles.semesterHeader}>
                  <Text style={[styles.title, { color: theme.text }]}>{semester.title}</Text>
                  <Text style={[styles.semesterMeta, { color: theme.textSub }]}>
                    {semester.courses.length} 門課 • 平均 {semester.stats.average || '--'}
                  </Text>
                </View>

                <View style={styles.statChipRow}>
                  {renderStatChip('班排', semester.stats.classRank)}
                  {renderStatChip('系排', semester.stats.deptRank)}
                  {renderStatChip('學分', semester.stats.earnedCredits)}
                </View>

                <View style={[styles.courseList, { borderTopColor: withAlpha(theme.border, 0.9) }]}>
                  {semester.courses.map((course, courseIndex) => (
                    <View key={`${semester.title}-${course.code}-${courseIndex}`}>
                      <View style={styles.courseRow}>
                        <View style={styles.courseMain}>
                          <Text style={[styles.courseName, { color: theme.text }]}>{course.name}</Text>
                          <Text style={[styles.courseMeta, { color: theme.textSub }]}>
                            {[
                              course.code || '',
                              course.type || '',
                              course.credits ? `${course.credits} 學分` : '',
                            ]
                              .filter(Boolean)
                              .join(' • ') || '未提供'}
                          </Text>
                        </View>
                        <View style={styles.scoreWrap}>
                          <Text
                            style={[
                              styles.scoreText,
                              { color: isFailScore(course.score) ? theme.danger : theme.text },
                            ]}
                          >
                            {course.score || '--'}
                          </Text>
                        </View>
                      </View>
                      {courseIndex < semester.courses.length - 1 ? (
                        <View style={[styles.courseDivider, { backgroundColor: withAlpha(theme.border, 0.9) }]} />
                      ) : null}
                    </View>
                  ))}
                </View>
              </View>
            ))
          )}
          {updatedAtLineText ? (
            <Text style={[styles.updatedAtText, { color: theme.textSub }]}>{updatedAtLineText}</Text>
          ) : null}
          <View style={{ height: 100 }} />
        </Animated.ScrollView>
      </View>
      {keepWebViewVisibleForDebug ? <DebugStamp label="DBG-GRADE-20260320C" /> : null}
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
  semesterCard: { borderRadius: 24, padding: 24, marginBottom: 16, elevation: 3 },
  semesterHeader: { marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '800' },
  semesterMeta: { marginTop: 8, fontSize: 15 },
  statChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  statChipLabel: { fontSize: 11, fontWeight: '600' },
  statChipValue: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  courseList: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8 },
  courseRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
  courseMain: { flex: 1, paddingRight: 16 },
  courseName: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  courseMeta: { fontSize: 13, marginTop: 6, lineHeight: 18 },
  scoreWrap: { minWidth: 54, alignItems: 'flex-end' },
  scoreText: { fontSize: 22, fontWeight: '800' },
  courseDivider: { height: StyleSheet.hairlineWidth },
  updatedAtText: { fontSize: 13, textAlign: 'center', marginTop: 12 },
});
