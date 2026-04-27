import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Animated,
  AppState,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AppSymbol from '../../../shared/components/AppSymbol';
import DebugStamp from '../../../shared/components/DebugStamp';
import { useTheme } from '../../../providers/theme/ThemeProvider';
import { buildUpdatedAtText } from '../../../utils/updatedAt';
import { getDeveloperDebugEnabled } from '../../settings/storage/developerSettings';
import {
  clearScraperDebugPreviewFrame,
  getScraperDebugRuntimeState,
  subscribeScraperDebugRuntimeState,
  type ScraperDebugRuntimeState,
} from '../../pccu/engine/scraperDebugPreview';
import { CourseData } from '../../pccu/parsers/pccuScraper';
import { useScheduleSync } from '../hooks/useScheduleSync';
import { useScheduleStore } from '../store/useScheduleStore';
import {
  buildCourseWindowForDate,
  buildScheduleDateChips,
  formatCourseTimeRange,
  formatScheduleFullDate,
  getCoursesForScheduleDay,
  getDateForDayOfWeek,
  getTimelineCourseStatus,
  toJsDay,
  type TimelineCourseStatus,
} from '../utils/scheduleTimeline';

type ScheduleScreenProps = {
  animationTestTick?: number;
  manualRefreshTick?: number;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const STATUS_META: Record<
  TimelineCourseStatus,
  {
    label: string;
    icon: string;
    pillTextColor: string;
    pillBackgroundColor: string;
    nodeTint: string;
    nodeBackgroundColor: string;
    cardBorderColor: string;
  }
> = {
  completed: {
    label: '已結束',
    icon: 'checkmark',
    pillTextColor: '#8E8E93',
    pillBackgroundColor: '#F2F2F7',
    nodeTint: '#8E8E93',
    nodeBackgroundColor: '#F2F2F7',
    cardBorderColor: '#E5E5EA',
  },
  active: {
    label: '進行中',
    icon: 'hourglass',
    pillTextColor: '#0A6CFF',
    pillBackgroundColor: '#EAF3FF',
    nodeTint: '#0A6CFF',
    nodeBackgroundColor: '#EAF3FF',
    cardBorderColor: '#0A6CFF',
  },
  upcoming: {
    label: '待開始',
    icon: 'arrow.right',
    pillTextColor: '#6B7280',
    pillBackgroundColor: '#F4F4F7',
    nodeTint: '#6B7280',
    nodeBackgroundColor: '#F4F4F7',
    cardBorderColor: '#E5E5EA',
  },
};

const normalizeCourseType = (course: CourseData) => {
  if (course.required) return '必修';
  if (course.type?.trim()) return course.type.trim();
  return '選修';
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
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState(toJsDay(new Date().getDay()));
  const [debugRuntime, setDebugRuntime] = useState<ScraperDebugRuntimeState>(() => getScraperDebugRuntimeState());
  const highlightAnim = useRef(new Animated.Value(1)).current;
  const manualRefreshMountedRef = useRef(false);
  const animationTestMountedRef = useRef(false);

  const isLoading = courses.length === 0 && (syncStatus === 'syncing' || syncStatus === 'idle');
  const isSyncing = syncStatus === 'syncing';
  const todayDayOfWeek = toJsDay(now.getDay());

  const dateChips = useMemo(
    () => buildScheduleDateChips(courses, now, selectedDayOfWeek),
    [courses, now, selectedDayOfWeek]
  );

  useEffect(() => {
    if (!dateChips.some((chip) => chip.dayOfWeek === selectedDayOfWeek)) {
      setSelectedDayOfWeek(dateChips[0]?.dayOfWeek ?? todayDayOfWeek);
    }
  }, [dateChips, selectedDayOfWeek, todayDayOfWeek]);

  const selectedDate = useMemo(
    () => getDateForDayOfWeek(now, selectedDayOfWeek),
    [now, selectedDayOfWeek]
  );
  const selectedCourses = useMemo(
    () => getCoursesForScheduleDay(courses, selectedDayOfWeek),
    [courses, selectedDayOfWeek]
  );
  const selectedDateText = useMemo(() => formatScheduleFullDate(selectedDate), [selectedDate]);
  const isViewingToday = selectedDayOfWeek === todayDayOfWeek;

  const updatedAtLineText = buildUpdatedAtText({
    updatedAt: lastSyncedAt,
    isUpdating: pullRefreshing || menuRefreshing,
    updatingLabel: '正在更新課表...',
    emptyLabel: '尚未同步課表',
  });

  useEffect(() => {
    if (!animationTestMountedRef.current) {
      animationTestMountedRef.current = true;
      return;
    }

    highlightAnim.setValue(0.98);
    Animated.sequence([
      Animated.timing(highlightAnim, {
        toValue: 1.02,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.spring(highlightAnim, {
        toValue: 1,
        friction: 7,
        tension: 80,
        useNativeDriver: true,
      }),
    ]).start();
  }, [animationTestTick, highlightAnim]);

  useEffect(() => {
    const refreshNow = () => setNow(new Date());
    const timer = setInterval(refreshNow, 15 * 1000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshNow();
    });

    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

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

  useEffect(() => {
    clearScraperDebugPreviewFrame();
  }, [developerDebugEnabled]);

  useEffect(() => subscribeScraperDebugRuntimeState(setDebugRuntime), []);

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

        resetSync();
        const hydrated = await hydrate();
        if (!active) return;

        if ((hydrated.courses?.length ?? 0) === 0) {
          void sync({ silent: true, priority: 5 });
        }
      };

      void init();

      return () => {
        active = false;
      };
    }, [hydrate, resetSync, sync])
  );

  const renderTimelineCard = (course: CourseData, index: number) => {
    const status = getTimelineCourseStatus(course, selectedDate, now);
    const statusMeta = STATUS_META[status];
    const courseWindow = buildCourseWindowForDate(course, selectedDate);
    const iconColor = status === 'active' ? theme.primary : statusMeta.nodeTint;
    const cardOpacity = status === 'completed' ? 0.7 : 1;
    const showActivePulse = status === 'active';

    return (
      <View style={styles.timelineRow} key={`${course.name}-${course.dayOfWeek}-${course.startPeriod}-${index}`}>
        <View style={styles.timelineColumn}>
          <View
            style={[
              styles.timelineLine,
              styles.timelineLineTop,
              {
                backgroundColor: theme.border,
                opacity: index === 0 ? 0 : 1,
              },
            ]}
          />
          <View
            style={[
              styles.timelineNodeWrap,
              { backgroundColor: status === 'active' ? '#DCEBFF' : 'transparent' },
            ]}
          >
            <View
              style={[
                styles.timelineNode,
                {
                  backgroundColor: statusMeta.nodeBackgroundColor,
                  borderColor: status === 'active' ? '#B8D4FF' : theme.border,
                },
              ]}
            >
              <AppSymbol
                name={statusMeta.icon}
                size={16}
                tintColor={iconColor}
                fallback={<Text style={{ color: iconColor }}>{status === 'active' ? '●' : '•'}</Text>}
              />
            </View>
          </View>
          <View
            style={[
              styles.timelineLine,
              styles.timelineLineBottom,
              {
                backgroundColor: theme.border,
                opacity: index === selectedCourses.length - 1 ? 0 : 1,
              },
            ]}
          />
        </View>

        <AnimatedPressable
          disabled
          style={[
            styles.courseCard,
            {
              backgroundColor: theme.card,
              borderColor: status === 'active' ? theme.primary : statusMeta.cardBorderColor,
              opacity: cardOpacity,
              transform: showActivePulse ? [{ scale: highlightAnim }] : [{ scale: 1 }],
            },
          ]}
        >
          <View style={styles.courseCardTopRow}>
            <View
              style={[
                styles.statusPill,
                { backgroundColor: status === 'active' ? '#EAF3FF' : statusMeta.pillBackgroundColor },
              ]}
            >
              <AppSymbol
                name={status === 'active' ? 'sparkles' : statusMeta.icon}
                size={12}
                tintColor={status === 'active' ? theme.primary : statusMeta.pillTextColor}
                fallback={<Text style={{ color: status === 'active' ? theme.primary : statusMeta.pillTextColor }}>•</Text>}
              />
              <Text
                style={[
                  styles.statusPillText,
                  { color: status === 'active' ? theme.primary : statusMeta.pillTextColor },
                ]}
              >
                {statusMeta.label}
              </Text>
            </View>

            <View
              style={[
                styles.typePill,
                {
                  backgroundColor: course.required ? '#FFECEE' : '#F2F2F7',
                },
              ]}
            >
              <Text
                style={[
                  styles.typePillText,
                  { color: course.required ? '#FF3B30' : theme.textSub },
                ]}
              >
                {normalizeCourseType(course)}
              </Text>
            </View>
          </View>

          <Text style={[styles.courseTitle, { color: theme.text }]}>{course.name}</Text>

          <View style={styles.courseInfoStack}>
            <View style={styles.courseInfoRow}>
              <AppSymbol
                name="clock.fill"
                size={15}
                tintColor={theme.textSub}
                fallback={<Text style={{ color: theme.textSub }}>時</Text>}
              />
              <Text style={[styles.courseInfoText, { color: theme.textSub }]}>
                {formatCourseTimeRange(course)}
              </Text>
            </View>

            <View style={styles.courseInfoRow}>
              <AppSymbol
                name="location.fill"
                size={15}
                tintColor={theme.textSub}
                fallback={<Text style={{ color: theme.textSub }}>地</Text>}
              />
              <Text style={[styles.courseInfoText, { color: theme.textSub }]}>
                {course.location || '教室待確認'}
              </Text>
            </View>

            {course.teacher ? (
              <View style={styles.courseInfoRow}>
                <AppSymbol
                  name="person.fill"
                  size={15}
                  tintColor={theme.textSub}
                  fallback={<Text style={{ color: theme.textSub }}>師</Text>}
                />
                <Text style={[styles.courseInfoText, { color: theme.textSub }]}>{course.teacher}</Text>
              </View>
            ) : null}
          </View>

          {status === 'active' && courseWindow ? (
            <View style={[styles.activeFooter, { backgroundColor: theme.syncBtnBg }]}>
              <Text style={[styles.activeFooterText, { color: theme.primary }]}>
                正在上課中
              </Text>
              <Text style={[styles.activeFooterMeta, { color: theme.textSub }]}>
                {courseWindow.start.getHours().toString().padStart(2, '0')}:
                {courseWindow.start.getMinutes().toString().padStart(2, '0')}
                {' - '}
                {courseWindow.end.getHours().toString().padStart(2, '0')}:
                {courseWindow.end.getMinutes().toString().padStart(2, '0')}
              </Text>
            </View>
          ) : null}
        </AnimatedPressable>
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
      >
        <View style={styles.headerBlock}>
          <View style={styles.headerRow}>
            <View style={styles.headerTextBlock}>
              <Text style={[styles.headerDate, { color: theme.textSub }]}>{selectedDateText}</Text>
            </View>

            <Pressable
              onPress={() => setSelectedDayOfWeek(todayDayOfWeek)}
              style={({ pressed }) => [
                styles.calendarButton,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  opacity: pressed ? 0.82 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel="回到今天"
            >
              <AppSymbol
                name="calendar"
                size={18}
                tintColor={theme.text}
                fallback={<Text style={{ color: theme.text }}>今</Text>}
              />
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dateStripContent}
          >
            {dateChips.map((chip) => (
              <Pressable
                key={`${chip.dayOfWeek}-${chip.dayNumber}`}
                onPress={() => setSelectedDayOfWeek(chip.dayOfWeek)}
                style={({ pressed }) => [
                  styles.dateChip,
                  {
                    backgroundColor: chip.isSelected ? theme.primary : theme.card,
                    borderColor: chip.isSelected ? theme.primary : theme.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.dateChipWeekday,
                    { color: chip.isSelected ? '#FFFFFF' : theme.textSub },
                  ]}
                >
                  {chip.weekdayLabel}
                </Text>
                <Text
                  style={[
                    styles.dateChipDay,
                    { color: chip.isSelected ? '#FFFFFF' : theme.text },
                  ]}
                >
                  {chip.dayNumber}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        {developerDebugEnabled ? (
          <View style={[styles.noticeCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.noticeTitle, { color: theme.text }]}>Debug 狀態</Text>
            <Text style={[styles.debugText, { color: theme.textSub }]}>
              Status: {syncStatus} | Error: {error ?? '-'}
            </Text>
            <View style={[styles.debugPreviewSlot, { backgroundColor: theme.bg, borderColor: theme.border }]}>
              <View style={styles.debugRuntimeStack}>
                <View style={styles.debugRuntimeRow}>
                  <Text style={[styles.debugRuntimeLabel, { color: theme.textSub }]}>Mode</Text>
                  <Text style={[styles.debugRuntimeValue, { color: theme.text }]} numberOfLines={1}>
                    {debugRuntime.status || 'idle'}
                  </Text>
                </View>
                <View style={styles.debugRuntimeRow}>
                  <Text style={[styles.debugRuntimeLabel, { color: theme.textSub }]}>Message</Text>
                  <Text style={[styles.debugRuntimeValue, { color: theme.text }]} numberOfLines={2}>
                    {debugRuntime.message || 'idle'}
                  </Text>
                </View>
                <View style={[styles.debugRuntimeRow, styles.debugRuntimeRowLast]}>
                  <Text style={[styles.debugRuntimeLabel, { color: theme.textSub }]}>URL</Text>
                  <Text style={[styles.debugRuntimeValue, { color: theme.text }]} numberOfLines={3}>
                    {debugRuntime.url || 'waiting'}
                  </Text>
                </View>
              </View>
              <Text style={[styles.debugPreviewHint, { color: theme.textSub }]}>
                Live preview disabled to avoid shared-session timeout.
              </Text>
            </View>
          </View>
        ) : null}

        {isLoading ? (
          <View style={[styles.statusCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={[styles.statusText, { color: theme.textSub }]}>正在讀取課表資料...</Text>
          </View>
        ) : null}

        {!isLoading && error ? (
          <View style={[styles.noticeCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.noticeTitle, { color: theme.text }]}>同步失敗</Text>
            <Text style={[styles.noticeText, { color: theme.textSub }]}>{error}</Text>
          </View>
        ) : null}

        {!isLoading && !error && selectedCourses.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <AppSymbol
              name="calendar"
              size={30}
              tintColor={theme.textSub}
              fallback={<Text style={{ color: theme.textSub }}>休</Text>}
            />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              {isViewingToday ? '今天沒有課程' : '這天沒有課程'}
            </Text>
            <Text style={[styles.emptyText, { color: theme.textSub }]}>
              可下拉重新同步，或切換其他日期查看課表。
            </Text>
          </View>
        ) : null}

        {!isLoading && !error && selectedCourses.length > 0 ? (
          <View style={styles.timelineList}>{selectedCourses.map(renderTimelineCard)}</View>
        ) : null}

        <View style={styles.footerRow}>
          <Text style={[styles.updatedText, { color: theme.textSub }]}>{updatedAtLineText}</Text>
          {isSyncing ? (
            <Pressable
              onPress={triggerMenuRefresh}
              disabled
              style={[styles.syncBadge, { backgroundColor: theme.card, borderColor: theme.border }]}
            >
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={[styles.syncBadgeText, { color: theme.primary }]}>同步中</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      {developerDebugEnabled ? <DebugStamp label="DBG-SCHEDULE-TIMELINE" /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12 },
  headerBlock: { marginBottom: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  headerTextBlock: { flex: 1, paddingRight: 12 },
  headerDate: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  calendarButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  dateStripContent: { paddingRight: 6, gap: 10 },
  dateChip: {
    width: 56,
    height: 62,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateChipWeekday: { fontSize: 13, fontWeight: '700', lineHeight: 16 },
  dateChipDay: { marginTop: 6, fontSize: 20, fontWeight: '800', lineHeight: 24 },
  statusCard: {
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 24,
    paddingHorizontal: 18,
    marginBottom: 16,
    alignItems: 'center',
    gap: 10,
  },
  statusText: { fontSize: 14, lineHeight: 20 },
  noticeCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    marginBottom: 16,
  },
  noticeTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  noticeText: { fontSize: 14, lineHeight: 21 },
  debugText: { fontSize: 12, lineHeight: 18 },
  debugPreviewSlot: {
    minHeight: 164,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  debugRuntimeStack: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  debugRuntimeRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DADDE4',
    gap: 4,
  },
  debugRuntimeRowLast: {
    borderBottomWidth: 0,
  },
  debugRuntimeLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  debugRuntimeValue: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  debugPreviewHint: { marginTop: 10, fontSize: 11, lineHeight: 16, fontWeight: '600' },
  emptyCard: {
    borderRadius: 26,
    borderWidth: 1,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
    marginTop: 18,
    marginBottom: 10,
  },
  emptyTitle: { marginTop: 14, fontSize: 19, fontWeight: '700' },
  emptyText: { marginTop: 6, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  timelineList: { paddingTop: 4 },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 16,
  },
  timelineColumn: {
    width: 52,
    alignItems: 'center',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    borderRadius: 999,
  },
  timelineLineTop: { minHeight: 12 },
  timelineLineBottom: { minHeight: 20 },
  timelineNodeWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineNode: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  courseCard: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
    elevation: 2,
  },
  courseCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusPillText: { fontSize: 12, fontWeight: '800', lineHeight: 14 },
  typePill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  typePillText: { fontSize: 12, fontWeight: '800', lineHeight: 14 },
  courseTitle: { fontSize: 23, fontWeight: '800', lineHeight: 30 },
  courseInfoStack: { marginTop: 14, gap: 10 },
  courseInfoRow: { flexDirection: 'row', alignItems: 'center' },
  courseInfoText: { marginLeft: 10, fontSize: 15, fontWeight: '600', lineHeight: 20 },
  activeFooter: {
    marginTop: 18,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  activeFooterText: { fontSize: 14, fontWeight: '700' },
  activeFooterMeta: { fontSize: 13, fontWeight: '600' },
  footerRow: {
    marginTop: 4,
    marginBottom: 8,
    alignItems: 'center',
  },
  updatedText: { fontSize: 13, textAlign: 'center' },
  syncBadge: {
    marginTop: 10,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  syncBadgeText: { fontSize: 13, fontWeight: '700' },
  bottomSpacer: { height: Platform.OS === 'ios' ? 92 : 84 },
});
