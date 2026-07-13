import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Animated,
  AppState,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
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

const CALENDAR_WEEKDAYS = [
  '\u65e5',
  '\u4e00',
  '\u4e8c',
  '\u4e09',
  '\u56db',
  '\u4e94',
  '\u516d',
] as const;

const getDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const buildCalendarMonthCells = (monthDate: Date) => {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: firstDay.getDay() }, () => null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
  }

  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

const formatCalendarMonthTitle = (date: Date) =>
  `${date.getFullYear()}\u5e74 ${date.getMonth() + 1}\u6708`;

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
    label: '\u5df2\u7d50\u675f',
    icon: 'checkmark',
    pillTextColor: '#8E8E93',
    pillBackgroundColor: '#F2F2F7',
    nodeTint: '#8E8E93',
    nodeBackgroundColor: '#F2F2F7',
    cardBorderColor: '#E5E5EA',
  },
  active: {
    label: '\u9032\u884c\u4e2d',
    icon: 'hourglass',
    pillTextColor: '#0A6CFF',
    pillBackgroundColor: '#EAF3FF',
    nodeTint: '#0A6CFF',
    nodeBackgroundColor: '#EAF3FF',
    cardBorderColor: '#0A6CFF',
  },
  upcoming: {
    label: '\u5c1a\u672a\u958b\u59cb',
    icon: 'arrow.right',
    pillTextColor: '#6B7280',
    pillBackgroundColor: '#F4F4F7',
    nodeTint: '#6B7280',
    nodeBackgroundColor: '#F4F4F7',
    cardBorderColor: '#E5E5EA',
  },
};

const normalizeCourseType = (course: CourseData) => {
  if (course.required) return '\u5fc5\u4fee';
  if (course.type?.trim()) return course.type.trim();
  return '\u9078\u4fee';
};

export default function ScheduleScreen({
  animationTestTick = 0,
  manualRefreshTick = 0,
}: ScheduleScreenProps) {
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
  const [scheduleAnchorDate, setScheduleAnchorDate] = useState(() => new Date());
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarMonthDate, setCalendarMonthDate] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState(toJsDay(new Date().getDay()));
  const [debugRuntime, setDebugRuntime] = useState<ScraperDebugRuntimeState>(() =>
    getScraperDebugRuntimeState(),
  );
  const highlightAnim = useRef(new Animated.Value(1)).current;
  const manualRefreshMountedRef = useRef(false);
  const animationTestMountedRef = useRef(false);

  const isLoading = courses.length === 0 && (syncStatus === 'syncing' || syncStatus === 'idle');
  const isSyncing = syncStatus === 'syncing';
  const todayDayOfWeek = toJsDay(now.getDay());

  const dateChips = useMemo(
    () => buildScheduleDateChips(courses, scheduleAnchorDate, selectedDayOfWeek),
    [courses, scheduleAnchorDate, selectedDayOfWeek],
  );

  useEffect(() => {
    if (!dateChips.some((chip) => chip.dayOfWeek === selectedDayOfWeek)) {
      setSelectedDayOfWeek(dateChips[0]?.dayOfWeek ?? todayDayOfWeek);
    }
  }, [dateChips, selectedDayOfWeek, todayDayOfWeek]);

  const selectedDate = useMemo(
    () => getDateForDayOfWeek(scheduleAnchorDate, selectedDayOfWeek),
    [scheduleAnchorDate, selectedDayOfWeek],
  );
  const selectedCourses = useMemo(
    () => getCoursesForScheduleDay(courses, selectedDayOfWeek),
    [courses, selectedDayOfWeek],
  );
  const selectedDateText = useMemo(() => formatScheduleFullDate(selectedDate), [selectedDate]);
  const selectedDateKey = useMemo(() => getDateKey(selectedDate), [selectedDate]);
  const todayDateKey = useMemo(() => getDateKey(now), [now]);
  const isViewingToday = selectedDateKey === todayDateKey;
  const calendarMonthCells = useMemo(
    () => buildCalendarMonthCells(calendarMonthDate),
    [calendarMonthDate],
  );

  const updatedAtLineText = buildUpdatedAtText({
    updatedAt: lastSyncedAt,
    isUpdating: pullRefreshing || menuRefreshing,
    updatingLabel: '\u6b63\u5728\u66f4\u65b0\u8ab2\u8868...',
    emptyLabel: '\u5c1a\u672a\u540c\u6b65\u8ab2\u8868',
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

  const openCalendar = useCallback(() => {
    setCalendarMonthDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    setCalendarVisible(true);
  }, [selectedDate]);

  const moveCalendarMonth = useCallback((offset: number) => {
    setCalendarMonthDate(
      (current) => new Date(current.getFullYear(), current.getMonth() + offset, 1),
    );
  }, []);

  const selectCalendarDate = useCallback((date: Date) => {
    setScheduleAnchorDate(date);
    setSelectedDayOfWeek(toJsDay(date.getDay()));
    setCalendarVisible(false);
  }, []);

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
    }, [hydrate, resetSync, sync]),
  );

  const renderTimelineCard = (course: CourseData, index: number) => {
    const status = getTimelineCourseStatus(course, selectedDate, now);
    const statusMeta = STATUS_META[status];
    const courseWindow = buildCourseWindowForDate(course, selectedDate);
    const iconColor = status === 'active' ? theme.primary : statusMeta.nodeTint;
    const cardOpacity = status === 'completed' ? 0.7 : 1;
    const showActivePulse = status === 'active';

    return (
      <View
        style={styles.timelineRow}
        key={`${course.name}-${course.dayOfWeek}-${course.startPeriod}-${index}`}
      >
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
                fallback={
                  <Text style={{ color: iconColor }}>{status === 'active' ? 'Now' : 'Ok'}</Text>
                }
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
                {
                  backgroundColor: status === 'active' ? '#EAF3FF' : statusMeta.pillBackgroundColor,
                },
              ]}
            >
              <AppSymbol
                name={status === 'active' ? 'sparkles' : statusMeta.icon}
                size={12}
                tintColor={status === 'active' ? theme.primary : statusMeta.pillTextColor}
                fallback={
                  <Text
                    style={{
                      color: status === 'active' ? theme.primary : statusMeta.pillTextColor,
                    }}
                  >
                    i
                  </Text>
                }
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
                fallback={<Text style={{ color: theme.textSub }}>T</Text>}
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
                fallback={<Text style={{ color: theme.textSub }}>L</Text>}
              />
              <Text style={[styles.courseInfoText, { color: theme.textSub }]}>
                {course.location || '\u672a\u8a2d\u5b9a\u5730\u9ede'}
              </Text>
            </View>

            {course.teacher ? (
              <View style={styles.courseInfoRow}>
                <AppSymbol
                  name="person.fill"
                  size={15}
                  tintColor={theme.textSub}
                  fallback={<Text style={{ color: theme.textSub }}>P</Text>}
                />
                <Text style={[styles.courseInfoText, { color: theme.textSub }]}>
                  {course.teacher}
                </Text>
              </View>
            ) : null}
          </View>

          {status === 'active' && courseWindow ? (
            <View style={[styles.activeFooter, { backgroundColor: theme.syncBtnBg }]}>
              <Text style={[styles.activeFooterText, { color: theme.primary }]}>
                {'\u6b63\u5728\u4e0a\u8ab2\u4e2d'}
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
        refreshControl={
          <RefreshControl
            refreshing={pullRefreshing}
            onRefresh={handlePullRefresh}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <View style={styles.headerBlock}>
          <View style={styles.headerRow}>
            <View style={styles.headerTextBlock}>
              <Text style={[styles.headerDate, { color: theme.textSub }]}>{selectedDateText}</Text>
            </View>
          </View>

          <View style={styles.dateStripWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dateStripContent}
            >
              {dateChips.map((chip) => (
                <Pressable
                  key={`${chip.dayOfWeek}-${chip.dayNumber}`}
                  onPress={() => {
                    setScheduleAnchorDate(chip.date);
                    setSelectedDayOfWeek(chip.dayOfWeek);
                  }}
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
              <Pressable
                onPress={openCalendar}
                style={({ pressed }) => [
                  styles.moreDateChip,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    opacity: pressed ? 0.85 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel="\u66f4\u591a\u65e5\u671f"
              >
                <AppSymbol
                  name="ellipsis"
                  size={20}
                  tintColor={theme.text}
                  fallback={
                    <Text style={[styles.moreDateChipText, { color: theme.text }]}>...</Text>
                  }
                />
                <Text style={[styles.moreDateChipText, { color: theme.textSub }]}>
                  {'\u66f4\u591a'}
                </Text>
              </Pressable>
            </ScrollView>
            <LinearGradient
              pointerEvents="none"
              colors={[theme.bg, `${theme.bg}00`]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.dateStripFade, styles.dateStripFadeLeft]}
            />
            <LinearGradient
              pointerEvents="none"
              colors={[`${theme.bg}00`, theme.bg]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.dateStripFade, styles.dateStripFadeRight]}
            />
          </View>
        </View>

        {developerDebugEnabled ? (
          <View
            style={[styles.noticeCard, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            <Text style={[styles.noticeTitle, { color: theme.text }]}>Debug</Text>
            <Text style={[styles.debugText, { color: theme.textSub }]}>
              Status: {syncStatus} | Error: {error ?? '-'}
            </Text>
            <View
              style={[
                styles.debugPreviewSlot,
                { backgroundColor: theme.bg, borderColor: theme.border },
              ]}
            >
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
          <View
            style={[styles.statusCard, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={[styles.statusText, { color: theme.textSub }]}>
              {'\u8ab2\u8868\u8f09\u5165\u4e2d...'}
            </Text>
          </View>
        ) : null}

        {!isLoading && error ? (
          <View
            style={[styles.noticeCard, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            <Text style={[styles.noticeTitle, { color: theme.text }]}>
              {'\u540c\u6b65\u5931\u6557'}
            </Text>
            <Text style={[styles.noticeText, { color: theme.textSub }]}>{error}</Text>
          </View>
        ) : null}

        {!isLoading && !error && selectedCourses.length === 0 ? (
          <View
            style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            <AppSymbol
              name="calendar"
              size={30}
              tintColor={theme.textSub}
              fallback={<Text style={{ color: theme.textSub }}>Cal</Text>}
            />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              {isViewingToday ? '\u4eca\u5929\u6c92\u6709\u8ab2' : '\u7576\u5929\u6c92\u6709\u8ab2'}
            </Text>
            <Text style={[styles.emptyText, { color: theme.textSub }]}>
              {
                '\u53ef\u4ee5\u5207\u63db\u4e0a\u65b9\u65e5\u671f\u67e5\u770b\u5176\u4ed6\u8ab2\u8868\u3002'
              }
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
              <Text style={[styles.syncBadgeText, { color: theme.primary }]}>
                {'\u66f4\u65b0\u4e2d'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <Modal
        visible={calendarVisible}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
        onRequestClose={() => setCalendarVisible(false)}
      >
        <View style={[styles.calendarNativePage, { backgroundColor: theme.bg }]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={styles.calendarNativeContent}
          >
            <View style={styles.calendarHeader}>
              <View style={styles.calendarTitleBlock}>
                <Text style={[styles.calendarTitle, { color: theme.text }]}>
                  {'\u884c\u4e8b\u66c6'}
                </Text>
                <Text style={[styles.calendarSubtitle, { color: theme.textSub }]}>
                  {'\u9078\u64c7\u8981\u67e5\u770b\u7684\u65e5\u671f'}
                </Text>
              </View>
              <Pressable
                onPress={() => setCalendarVisible(false)}
                style={({ pressed }) => [
                  styles.calendarCloseButton,
                  { backgroundColor: theme.syncBtnBg, opacity: pressed ? 0.72 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="\u95dc\u9589"
              >
                <AppSymbol
                  name="xmark"
                  size={16}
                  tintColor={theme.primary}
                  fallback={
                    <Text style={[styles.calendarCloseText, { color: theme.primary }]}>X</Text>
                  }
                />
              </Pressable>
            </View>

            <View
              style={[
                styles.calendarMonthCard,
                { backgroundColor: theme.syncBtnBg, borderColor: '#FFFFFF' },
              ]}
            >
              <Pressable
                onPress={() => moveCalendarMonth(-1)}
                style={({ pressed }) => [
                  styles.calendarMonthButton,
                  { opacity: pressed ? 0.55 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="\u4e0a\u4e00\u500b\u6708"
              >
                <AppSymbol name="chevron.left" size={21} tintColor={theme.text} fallback="<" />
              </Pressable>
              <Text style={[styles.calendarMonthTitle, { color: theme.text }]}>
                {formatCalendarMonthTitle(calendarMonthDate)}
              </Text>
              <Pressable
                onPress={() => moveCalendarMonth(1)}
                style={({ pressed }) => [
                  styles.calendarMonthButton,
                  { opacity: pressed ? 0.55 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="\u4e0b\u4e00\u500b\u6708"
              >
                <AppSymbol name="chevron.right" size={21} tintColor={theme.text} fallback=">" />
              </Pressable>
            </View>

            <View
              style={[
                styles.calendarGridCard,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}
            >
              <View style={styles.calendarWeekdayRow}>
                {CALENDAR_WEEKDAYS.map((weekday) => (
                  <Text
                    key={weekday}
                    style={[styles.calendarWeekdayText, { color: theme.textSub }]}
                  >
                    {weekday}
                  </Text>
                ))}
              </View>
              <View style={styles.calendarMonthGrid}>
                {calendarMonthCells.map((date, index) => {
                  if (!date) return <View key={`blank-${index}`} style={styles.calendarDayCell} />;

                  const dateKey = getDateKey(date);
                  const isSelected = dateKey === selectedDateKey;
                  const isToday = dateKey === todayDateKey;
                  const dayCourseCount = getCoursesForScheduleDay(
                    courses,
                    toJsDay(date.getDay()),
                  ).length;

                  return (
                    <Pressable
                      key={dateKey}
                      onPress={() => selectCalendarDate(date)}
                      style={({ pressed }) => [
                        styles.calendarDayCell,
                        {
                          backgroundColor: isSelected
                            ? theme.primary
                            : isToday
                              ? theme.syncBtnBg
                              : 'transparent',
                          opacity: pressed ? 0.72 : 1,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={dateKey}
                    >
                      <Text
                        style={[
                          styles.calendarDayText,
                          { color: isSelected ? '#FFFFFF' : isToday ? theme.primary : theme.text },
                        ]}
                      >
                        {date.getDate()}
                      </Text>
                      {dayCourseCount > 0 ? (
                        <View
                          style={[
                            styles.calendarDayDot,
                            { backgroundColor: isSelected ? '#FFFFFF' : theme.primary },
                          ]}
                        />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {developerDebugEnabled ? <DebugStamp label="DBG-SCHEDULE-TIMELINE" /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 0 },
  headerBlock: { marginTop: -8, marginBottom: 18 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerTextBlock: { flex: 1, paddingRight: 0 },
  headerDate: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  dateStripWrap: { position: 'relative' },
  dateStripContent: { paddingRight: 6, gap: 10 },
  dateStripFade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 18,
  },
  dateStripFadeLeft: { left: 0 },
  dateStripFadeRight: { right: 0 },
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
  moreDateChip: {
    width: 56,
    height: 62,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  moreDateChipText: { fontSize: 12, fontWeight: '800', lineHeight: 14 },
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
  courseInfoStack: { marginTop: 0, gap: 10 },
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
  calendarNativePage: {
    flex: 1,
    paddingHorizontal: 20,
  },
  calendarNativeContent: {
    paddingTop: 18,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  calendarTitleBlock: { flex: 1, minWidth: 0, paddingRight: 14 },
  calendarTitle: { fontSize: 28, lineHeight: 34, fontWeight: '900' },
  calendarSubtitle: { marginTop: 3, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  calendarCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarCloseText: { fontSize: 16, lineHeight: 20, fontWeight: '900' },
  calendarMonthCard: {
    minHeight: 58,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarMonthButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarMonthTitle: { fontSize: 21, lineHeight: 28, fontWeight: '900' },
  calendarGridCard: {
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 12,
  },
  calendarWeekdayRow: { flexDirection: 'row', marginBottom: 8 },
  calendarWeekdayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
  },
  calendarMonthGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarDayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDayText: { fontSize: 16, lineHeight: 22, fontWeight: '900' },
  calendarDayDot: {
    position: 'absolute',
    bottom: 7,
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  bottomSpacer: { height: Platform.OS === 'ios' ? 92 : 84 },
});
