import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import * as SecureStore from 'expo-secure-store';
import AppSymbol from '../../../shared/components/AppSymbol';
import DebugStamp from '../../../shared/components/DebugStamp';
import { useTheme } from '../../../providers/theme/ThemeProvider';
import { getDeveloperDebugEnabled } from '../../settings/storage/developerSettings';
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

const formatUpdatedAt = (updatedAt: number | null) => {
  if (!updatedAt) return '';
  const date = new Date(updatedAt);
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const normalizeRank = (value?: string) => (value ? value.replace(/\s+/g, '') : '');

export default function GradeScreenV2({ showPreview }: GradeScreenProps) {
  const [loading, setLoading] = useState(false);
  const [grades, setGrades] = useState<SemesterGrade[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [statusText, setStatusText] = useState('');
  const [webReady, setWebReady] = useState(false);
  const [debugUrl, setDebugUrl] = useState(DEFAULT_URL);
  const [debugNote, setDebugNote] = useState('');
  const [debugHtmlPreview, setDebugHtmlPreview] = useState('');
  const [resolvedShowPreview, setResolvedShowPreview] = useState(showPreview ?? false);
  const { theme } = useTheme();
  const webViewRef = useRef<WebView>(null);
  const credRef = useRef<PCCUCredentials | null>(null);
  const phaseRef = useRef<Phase>('idle');
  const pendingSyncRef = useRef(false);
  const retryRef = useRef(0);
  const lastHandledUrlRef = useRef('');
  const gradesRef = useRef<SemesterGrade[]>([]);
  const lastInjectKeyRef = useRef('');
  const lastInjectAtRef = useRef(0);
  const keepWebViewVisibleForDebug = __DEV__ && resolvedShowPreview;
  const userAgent = Platform.OS === 'ios'
    ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    : 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36';

  useEffect(() => {
    gradesRef.current = grades;
  }, [grades]);

  useEffect(() => {
    if (typeof showPreview === 'boolean') {
      setResolvedShowPreview(showPreview);
    }
  }, [showPreview]);

  const latestSemester = grades[0] || null;
  const formattedUpdatedAt = formatUpdatedAt(lastUpdatedAt);
  const updatedAtText = loading
    ? '正在更新成績...'
    : formattedUpdatedAt
      ? `最後更新 ${formattedUpdatedAt}`
      : '尚未同步成績';
  const shouldShowNotice = !loading && !!statusText && (grades.length === 0 || statusText.includes('失敗') || statusText.includes('保留舊資料'));

  const summaryItems = useMemo(() => {
    if (!latestSemester) return [];
    return [
      { label: '平均', value: latestSemester.stats.average || '--' },
      { label: '班排', value: normalizeRank(latestSemester.stats.classRank) || '--' },
      { label: '系排', value: normalizeRank(latestSemester.stats.deptRank) || '--' },
      { label: '學分', value: latestSemester.stats.earnedCredits || '--' },
    ];
  }, [latestSemester]);

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
      return;
    }

    lastInjectKeyRef.current = key;
    lastInjectAtRef.current = now;
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
    } catch {
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
      if (typeof showPreview === 'boolean') {
        return undefined;
      }

      let active = true;

      const loadDeveloperSetting = async () => {
        const enabled = await getDeveloperDebugEnabled();
        if (active) {
          setResolvedShowPreview(enabled);
        }
      };

      void loadDeveloperSetting();

      return () => {
        active = false;
      };
    }, [showPreview])
  );

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

  const openSource = () => {
    void Linking.openURL(DEFAULT_URL);
  };

  const renderSummaryCard = () => {
    if (!latestSemester) return null;

    return (
      <View style={[styles.summaryCard, { backgroundColor: theme.card, shadowColor: theme.text }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>整體摘要</Text>
        <Text style={[styles.summaryTerm, { color: theme.textSub }]}>{latestSemester.title}</Text>
        <View style={styles.summaryGrid}>
          {summaryItems.map((item) => (
            <View
              key={item.label}
              style={[styles.summaryChip, { backgroundColor: theme.syncBtnBg, borderColor: theme.border }]}
            >
              <Text style={[styles.summaryChipLabel, { color: theme.textSub }]}>{item.label}</Text>
              <Text style={[styles.summaryChipValue, { color: theme.text }]}>{item.value}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: theme.bg }]}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        {!keepWebViewVisibleForDebug ? <View style={styles.hiddenWebView}>{renderSyncWebView()}</View> : null}

        <View style={[styles.heroCard, { backgroundColor: theme.card, shadowColor: theme.text }]}>
          <View style={styles.heroHeader}>
            <AppSymbol name="graduationcap.fill" size={28} tintColor={theme.primary} />
            <Text style={[styles.heroTitle, { color: theme.text }]}>歷年成績</Text>
          </View>
          <Text style={[styles.heroText, { color: theme.textSub }]}>
            顯示目前已同步的學期成績摘要，進頁後會優先讀取快取，再於背景更新最新資料。
          </Text>
          <View style={styles.actionRow}>
            <Pressable style={[styles.actionButton, { backgroundColor: theme.syncBtnBg }]} onPress={() => void startSync()}>
              <AppSymbol name="arrow.clockwise" size={16} tintColor={theme.primary} />
              <Text style={[styles.actionText, { color: theme.primary }]}>
                {loading ? '更新中...' : '重新整理'}
              </Text>
            </Pressable>
            <Pressable style={[styles.actionButton, { backgroundColor: theme.syncBtnBg }]} onPress={openSource}>
              <AppSymbol name="doc.text.magnifyingglass" size={16} tintColor={theme.text} />
              <Text style={[styles.actionText, { color: theme.text }]}>官方頁面</Text>
            </Pressable>
          </View>
          <Text style={[styles.updatedText, { color: theme.textSub }]}>{updatedAtText}</Text>
        </View>

        {loading && grades.length === 0 ? (
          <View style={[styles.statusCard, { backgroundColor: theme.card, shadowColor: theme.text }]}>
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={[styles.statusText, { color: theme.textSub }]}>正在同步成績資料...</Text>
          </View>
        ) : null}

        {shouldShowNotice ? (
          <View style={[styles.noticeCard, { backgroundColor: theme.card, shadowColor: theme.text }]}>
            <Text style={[styles.noticeTitle, { color: theme.text }]}>同步狀態</Text>
            <Text style={[styles.noticeText, { color: theme.textSub }]}>{statusText}</Text>
          </View>
        ) : null}

        {keepWebViewVisibleForDebug ? (
          <View style={[styles.noticeCard, { backgroundColor: theme.card, shadowColor: theme.text }]}>
            <Text style={[styles.noticeTitle, { color: theme.text }]}>Debug 資訊</Text>
            <Text style={[styles.debugText, { color: theme.textSub }]}>URL: {debugUrl || DEFAULT_URL}</Text>
            <Text style={[styles.debugText, { color: theme.textSub }]}>Event: {debugNote || '-'}</Text>
            {debugHtmlPreview ? (
              <Text style={[styles.debugText, { color: theme.textSub }]} numberOfLines={4}>
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

        {renderSummaryCard()}

        {grades.length === 0 && !loading ? (
          <View style={[styles.sectionCard, { backgroundColor: theme.card, shadowColor: theme.text }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>暫無成績資料</Text>
            <Text style={[styles.emptyText, { color: theme.textSub }]}>目前沒有可顯示的成績，請確認已登入並嘗試重新整理。</Text>
          </View>
        ) : null}

        {grades.map((semester, index) => (
          <View
            key={`${semester.title}-${index}`}
            style={[styles.sectionCard, { backgroundColor: theme.card, shadowColor: theme.text }]}
          >
            <View style={styles.sectionHeader}>
              <View style={styles.sectionHeading}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>{semester.title}</Text>
                <Text style={[styles.sectionMeta, { color: theme.textSub }]}>{semester.courses.length} 門課</Text>
              </View>
              <Text style={[styles.sectionAverage, { color: theme.primary }]}>平均 {semester.stats.average || '--'}</Text>
            </View>

            <View style={styles.metaRow}>
              {semester.stats.classRank ? (
                <Text style={[styles.metaPill, { color: theme.textSub, backgroundColor: theme.syncBtnBg }]}>
                  班排 {normalizeRank(semester.stats.classRank)}
                </Text>
              ) : null}
              {semester.stats.deptRank ? (
                <Text style={[styles.metaPill, { color: theme.textSub, backgroundColor: theme.syncBtnBg }]}>
                  系排 {normalizeRank(semester.stats.deptRank)}
                </Text>
              ) : null}
              {semester.stats.earnedCredits ? (
                <Text style={[styles.metaPill, { color: theme.textSub, backgroundColor: theme.syncBtnBg }]}>
                  學分 {semester.stats.earnedCredits}
                </Text>
              ) : null}
            </View>

            <View style={styles.courseStack}>
              {semester.courses.map((course, courseIndex) => (
                <View
                  key={`${semester.title}-${course.code}-${courseIndex}`}
                  style={[styles.courseCard, { backgroundColor: theme.syncBtnBg, borderColor: theme.border }]}
                >
                  <View style={styles.courseHeader}>
                    <View style={styles.courseMain}>
                      <Text style={[styles.courseName, { color: theme.text }]}>{course.name}</Text>
                      <Text style={[styles.courseMeta, { color: theme.textSub }]}>
                        {[
                          course.code || '',
                          course.type || '',
                          course.credits ? `${course.credits} 學分` : '',
                        ]
                          .filter(Boolean)
                          .join(' • ') || '未提供課程資訊'}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.courseScore,
                        { color: isFailScore(course.score) ? theme.danger : theme.text },
                      ]}
                    >
                      {course.score || '--'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.bottomSpacer} />
      </ScrollView>
      {keepWebViewVisibleForDebug ? <DebugStamp label="DBG-GRADE-V2" /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 80 },
  hiddenWebView: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -1000, top: -1000 },
  hiddenWebViewInner: { width: 1, height: 1 },
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
  heroTitle: { fontSize: 24, fontWeight: '700', marginLeft: 8 },
  heroText: { fontSize: 15, lineHeight: 22 },
  actionRow: { flexDirection: 'row', marginTop: 16 },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginRight: 10,
  },
  actionText: { fontSize: 14, fontWeight: '600', marginLeft: 6 },
  updatedText: { marginTop: 14, fontSize: 13 },
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
  statusText: { marginTop: 10, fontSize: 14 },
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
  debugText: { fontSize: 12, lineHeight: 18 },
  debugWebViewCard: { borderRadius: 24, borderWidth: 1, overflow: 'hidden', minHeight: 420, marginBottom: 16 },
  debugWebViewInner: { width: '100%', height: 420 },
  summaryCard: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  cardTitle: { fontSize: 18, fontWeight: '700' },
  summaryTerm: { fontSize: 14, marginTop: 8, marginBottom: 14 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryChip: {
    width: '47%',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  summaryChipLabel: { fontSize: 12, fontWeight: '600' },
  summaryChipValue: { fontSize: 18, fontWeight: '700', marginTop: 4 },
  sectionCard: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
  sectionHeading: { flex: 1, paddingRight: 12 },
  sectionMeta: { marginTop: 6, fontSize: 13 },
  sectionAverage: { fontSize: 15, fontWeight: '700' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  metaPill: {
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: '600',
  },
  courseStack: { gap: 10 },
  courseCard: { borderRadius: 20, borderWidth: 1, padding: 16 },
  courseHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  courseMain: { flex: 1, paddingRight: 16 },
  courseName: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  courseMeta: { fontSize: 13, marginTop: 6, lineHeight: 18 },
  courseScore: { fontSize: 24, fontWeight: '800', minWidth: 56, textAlign: 'right' },
  emptyText: { marginTop: 10, fontSize: 14, lineHeight: 21 },
  bottomSpacer: { height: 20 },
});
