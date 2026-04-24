import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Animated,
  AppState,
  LayoutAnimation,
  Platform,
  RefreshControl,
  ScrollView,
  UIManager,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AppSymbol from '../../../shared/components/AppSymbol';
import DebugStamp from '../../../shared/components/DebugStamp';
import { useTheme } from '../../../providers/theme/ThemeProvider';
import { getDeveloperDebugEnabled } from '../../settings/storage/developerSettings';
import {
  clearScraperDebugPreviewFrame,
  setScraperDebugPreviewFrame,
} from '../../pccu/engine/scraperDebugPreview';
import { CourseData } from '../../pccu/parsers/pccuScraper';
import { buildUpdatedAtText } from '../../../utils/updatedAt';
import { useScheduleStore } from '../store/useScheduleStore';
import { useScheduleSync } from '../hooks/useScheduleSync';

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

type CourseSummary = {
  course: CourseData;
  start: Date;
  end: Date;
};

type ScheduleScreenProps = {
  animationTestTick?: number;
  manualRefreshTick?: number;
};

type RefreshSource = 'auto' | 'pull' | 'menu';

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

  courses.forEach((course) => {
    const window = buildCourseWindow(course, now);
    if (!window) return;

    if (window.start <= now && now < window.end) {
      if (!current || window.end.getTime() < current.end.getTime()) {
        current = { course, start: window.start, end: window.end };
      }
      return;
    }

    if (window.start <= now) {
      window.start.setDate(window.start.getDate() + 7);
      window.end.setDate(window.end.getDate() + 7);
    }

    if (!next || window.start.getTime() < next.start.getTime()) {
      next = { course, start: window.start, end: window.end };
    }
  });

  return { current, next };
};

const formatSummaryMeta = (summary: CourseSummary | null) => {
  if (!summary) return '';
  const dayLabel = WEEKDAY_LABELS[summary.start.getDay()] || '';
  const location = summary.course.location || '地點未提供';
  return `${dayLabel} ${formatTime(summary.start.getHours(), summary.start.getMinutes())}-${formatTime(summary.end.getHours(), summary.end.getMinutes())} · ${location}`;
};

const formatPeriodLabel = (course: CourseData) =>
  course.startPeriod === course.endPeriod ? `第 ${course.startPeriod} 節` : `第 ${course.startPeriod}-${course.endPeriod} 節`;

const formatCourseStartTime = (course: CourseData) => {
  const slot = PERIOD_TIMES[course.startPeriod - 1];
  if (!slot) return '';
  return formatTime(slot.start[0], slot.start[1]);
};

export default function ScheduleScreen({ animationTestTick = 0, manualRefreshTick = 0 }: ScheduleScreenProps) {
  const { theme } = useTheme();
  const courses = useScheduleStore((state) => state.courses);
  const lastSyncedAt = useScheduleStore((state) => state.lastSyncedAt);
  const syncStatus = useScheduleStore((state) => state.syncStatus);
  const error = useScheduleStore((state) => state.error);
  const hydrate = useScheduleStore((state) => state.hydrate);
  const resetSync = useScheduleStore((state) => state.resetSync);
  const { sync } = useScheduleSync();

  const [developerDebugEnabled, setDeveloperDebugEnabled] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [menuRefreshing, setMenuRefreshing] = useState(false);
  const [now, setNow] = useState(new Date());
  const summaryPulseAnim = useRef(new Animated.Value(1)).current;
  const animationTestMountedRef = useRef(false);
  const manualRefreshMountedRef = useRef(false);
  const debugPreviewRef = useRef<React.ElementRef<typeof View> | null>(null);

  const isSyncing = syncStatus === 'syncing';
  const isLoading = courses.length === 0 && (syncStatus === 'syncing' || syncStatus === 'idle');

  const animateSummaryTransition = useCallback(() => {
    LayoutAnimation.configureNext({
      duration: 260,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
      },
      delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
    });
  }, []);

  const updatedAtLineText = buildUpdatedAtText({
    updatedAt: lastSyncedAt,
    isUpdating: pullRefreshing || menuRefreshing,
    updatingLabel: '正在更新課表...',
    emptyLabel: '尚未同步課表',
  });

  const { current: currentCourse, next: nextCourse } = useMemo(
    () => getCourseSummaries(courses, now),
    [courses, now]
  );
  const hasCurrentCourse = !!currentCourse;

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    if (!animationTestMountedRef.current) {
      animationTestMountedRef.current = true;
      return;
    }

    summaryPulseAnim.setValue(0.96);
    Animated.sequence([
      Animated.timing(summaryPulseAnim, {
        toValue: 1.03,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.spring(summaryPulseAnim, {
        toValue: 1,
        friction: 7,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, [animationTestTick, summaryPulseAnim]);

  useEffect(() => {
    const refreshNow = () => {
      animateSummaryTransition();
      setNow(new Date());
    };
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
  }, [animateSummaryTransition]);

  const handlePullRefresh = useCallback(() => {
    setPullRefreshing(true);
    void sync({ silent: false, priority: 5 }).finally(() => {
      setPullRefreshing(false);
    });
  }, [sync]);

  const triggerMenuRefresh = useCallback(() => {
    setMenuRefreshing(true);
    void sync({ silent: false, priority: 5 }).finally(() => {
      setMenuRefreshing(false);
    });
  }, [sync]);

  const updateDebugPreviewFrame = useCallback(() => {
    if (!developerDebugEnabled) return;

    debugPreviewRef.current?.measureInWindow((x, y, width, height) => {
      if (width <= 0 || height <= 0) return;
      setScraperDebugPreviewFrame({ x, y, width, height });
    });
  }, [developerDebugEnabled]);

  useEffect(() => {
    if (!developerDebugEnabled) {
      clearScraperDebugPreviewFrame();
      return;
    }

    const timer = setTimeout(updateDebugPreviewFrame, 0);
    return () => {
      clearTimeout(timer);
      clearScraperDebugPreviewFrame();
    };
  }, [developerDebugEnabled, updateDebugPreviewFrame]);

  useEffect(() => {
    if (!manualRefreshMountedRef.current) {
      manualRefreshMountedRef.current = true;
      return;
    }
    triggerMenuRefresh();
  }, [manualRefreshTick, triggerMenuRefresh]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const init = async () => {
        const debugEnabled = await getDeveloperDebugEnabled();
        if (!active) return;
        setDeveloperDebugEnabled(debugEnabled);

        await hydrate();
        if (!active) return;

        // Auto-sync if no courses cached
        if (courses.length === 0) {
          void sync({ silent: true, priority: 5 });
        }
      };

      void init();

      return () => {
        active = false;
      };
    }, [hydrate, sync, courses.length])
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
        onScroll={developerDebugEnabled ? updateDebugPreviewFrame : undefined}
        scrollEventThrottle={developerDebugEnabled ? 16 : undefined}
      >
        <View style={[styles.heroCard, { backgroundColor: theme.card, shadowColor: theme.text }]}>
          <View style={styles.heroHeader}>
            <AppSymbol name="clock.fill" size={28} tintColor={theme.primary} fallback={<Text>課表</Text>} />
            <Text style={[styles.heroTitle, { color: theme.text }]}>課程</Text>
          </View>

          <Animated.View
            style={[
              styles.summaryStack,
              {
                transform: [{ scale: summaryPulseAnim }],
                opacity: summaryPulseAnim.interpolate({
                  inputRange: [0.96, 1, 1.03],
                  outputRange: [0.82, 1, 1],
                }),
              },
            ]}
          >
            {hasCurrentCourse ? (
              <View style={[styles.summaryItem, { backgroundColor: theme.syncBtnBg, borderColor: theme.border }]}>
                <View style={[styles.summaryPill, styles.summaryPillActive, { backgroundColor: theme.primary }]}>
                  <Text style={styles.summaryPillActiveText}>上課中</Text>
                </View>
                <Text style={[styles.summaryCourse, { color: theme.text }]}>
                  {currentCourse.course.name}
                </Text>
                <Text style={[styles.summaryMeta, { color: theme.textSub }]}>
                  {formatSummaryMeta(currentCourse)}
                </Text>
              </View>
            ) : null}

            <View style={[styles.summaryItem, { backgroundColor: theme.syncBtnBg, borderColor: theme.border }]}>
              <View
                style={[
                  styles.summaryPill,
                  hasCurrentCourse
                    ? [styles.summaryPillUpcoming, { backgroundColor: 'rgba(10, 102, 255, 0.16)' }]
                    : [styles.summaryPillActive, { backgroundColor: theme.primary }],
                ]}
              >
                <Text
                  style={
                    hasCurrentCourse
                      ? [styles.summaryPillUpcomingText, { color: theme.primary }]
                      : styles.summaryPillActiveText
                  }
                >
                  下節課
                </Text>
              </View>
              <Text style={[styles.summaryCourse, { color: theme.text }]}>
                {nextCourse ? nextCourse.course.name : '目前沒有下一節課'}
              </Text>
              <Text style={[styles.summaryMeta, { color: theme.textSub }]}>
                {nextCourse ? formatSummaryMeta(nextCourse) : '目前沒有可顯示的後續課程'}
              </Text>
            </View>
          </Animated.View>
        </View>

        {developerDebugEnabled ? (
          <View style={[styles.noticeCard, { backgroundColor: theme.card, shadowColor: theme.text }]}>
            <Text style={[styles.noticeTitle, { color: theme.text }]}>Debug 資訊</Text>
            <Text style={[styles.debugText, { color: theme.textSub }]}>
              Status: {syncStatus} | Error: {error ?? '-'}
            </Text>
            <View
              ref={debugPreviewRef}
              style={[styles.debugPreviewSlot, { backgroundColor: theme.bg, borderColor: theme.border }]}
              onLayout={updateDebugPreviewFrame}
            >
              <Text style={[styles.debugPreviewHint, { color: theme.textSub }]}>
                Live WebView preview
              </Text>
            </View>
          </View>
        ) : null}

        {isLoading ? (
          <View style={[styles.statusCard, { backgroundColor: theme.card, shadowColor: theme.text }]}>
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={[styles.statusText, { color: theme.textSub, marginTop: 10 }]}>正在讀取課表資料...</Text>
          </View>
        ) : null}

        {!isLoading && error ? (
          <View style={[styles.noticeCard, { backgroundColor: theme.card, shadowColor: theme.text }]}>
            <Text style={[styles.noticeTitle, { color: theme.text }]}>同步狀態</Text>
            <Text style={[styles.noticeText, { color: theme.textSub }]}>{error}</Text>
          </View>
        ) : null}

        {courses.length === 0 && !isLoading && !error ? (
          <View style={styles.emptyState}>
            <AppSymbol name="clock.fill" size={60} tintColor={theme.textSub} fallback={<Text>課表</Text>} />
            <Text style={[styles.emptyText, { color: theme.textSub }]}>目前沒有課表資料</Text>
          </View>
        ) : null}

        {[1, 2, 3, 4, 5, 6, 0].map((dayIndex) => renderSection(dayIndex, WEEKDAY_LABELS[dayIndex]))}

        <Text style={[styles.updatedText, { color: theme.textSub }]}>{updatedAtLineText}</Text>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {developerDebugEnabled ? <DebugStamp label="DBG-SCHEDULE-CLEAN" /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16 },
  debugText: { fontSize: 12, lineHeight: 18 },
  debugPreviewSlot: {
    height: 360,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  debugPreviewHint: {
    fontSize: 12,
    fontWeight: '600',
  },
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
