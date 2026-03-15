import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Animated, Dimensions, TouchableOpacity, Easing, Modal, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../contexts/ThemeContext';
import ScheduleScreen from './ScheduleScreen';
import { CourseData, SemesterGrade } from '../services/scraper';
import { getCourses } from '../services/ScheduleStore';
import { getGrades } from '../services/GradeStore';
import GradeScreen from './GradeScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type NextClassInfo = {
  course: CourseData;
  start: Date;
  end: Date;
  startLabel: string;
  endLabel: string;
  dayLabel: string;
  isOngoing: boolean;
};

const PERIOD_TIMES: Array<{ start: [number, number]; end: [number, number] }> = [
  { start: [8, 10], end: [9, 0] },
  { start: [9, 10], end: [10, 0] },
  { start: [10, 10], end: [11, 0] },
  { start: [11, 10], end: [12, 0] },
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
];

const DAY_LABELS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
const SCHEDULE_DAY_LABELS = ['週一', '週二', '週三', '週四', '週五', '週六', '週日'];
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const pad2 = (n: number) => String(n).padStart(2, '0');
const formatTime = (h: number, m: number) => `${pad2(h)}:${pad2(m)}`;
const toJsDay = (dayOfWeek: number) => ((dayOfWeek % 7) + 7) % 7;
const normalizeText = (value?: string) => (value || '').replace(/\s+/g, ' ').trim();
const toScheduleIndex = (dayOfWeek: number) => {
  if (dayOfWeek === 7) return 6;
  if (dayOfWeek === 0) return 6;
  return Math.max(0, Math.min(6, dayOfWeek - 1));
};
const getCourseTimeLabel = (course: CourseData) => {
  const startSlot = PERIOD_TIMES[course.startPeriod - 1];
  const endSlot = PERIOD_TIMES[course.endPeriod - 1] || startSlot;
  if (!startSlot || !endSlot) return course.periodRange || '';
  return `${formatTime(startSlot.start[0], startSlot.start[1])}–${formatTime(endSlot.end[0], endSlot.end[1])}`;
};

const findNextClass = (courses: CourseData[], now: Date): NextClassInfo | null => {
  if (!courses || courses.length === 0) return null;
  let best: NextClassInfo | null = null;

  for (const course of courses) {
    const day = toJsDay(course.dayOfWeek);
    if (day < 0 || day > 6) continue;
    const slot = PERIOD_TIMES[course.startPeriod - 1];
    const endSlot = PERIOD_TIMES[course.endPeriod - 1] || slot;
    if (!slot || !endSlot) continue;

    const dayOffset = (day - now.getDay() + 7) % 7;
    const start = new Date(now);
    start.setDate(now.getDate() + dayOffset);
    start.setHours(slot.start[0], slot.start[1], 0, 0);

    const end = new Date(now);
    end.setDate(now.getDate() + dayOffset);
    end.setHours(endSlot.end[0], endSlot.end[1], 0, 0);

    if (dayOffset === 0 && end.getTime() <= now.getTime()) {
      start.setDate(start.getDate() + 7);
      end.setDate(end.getDate() + 7);
    }

    const isOngoing = now.getTime() >= start.getTime() && now.getTime() < end.getTime();
    const dayLabel = dayOffset === 0 ? '今天' : DAY_LABELS[day];
    const startLabel = formatTime(slot.start[0], slot.start[1]);
    const endLabel = formatTime(endSlot.end[0], endSlot.end[1]);

    const candidate: NextClassInfo = { course, start, end, startLabel, endLabel, dayLabel, isOngoing };
    if (!best || candidate.start.getTime() < best.start.getTime()) best = candidate;
  }

  return best;
};

export default function HomeScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [courses, setCourses] = useState<CourseData[]>([]);
  const [now, setNow] = useState<Date>(new Date());
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleRefreshing, setScheduleRefreshing] = useState(false);
  const [scheduleReloadKey, setScheduleReloadKey] = useState(0);
  const [grades, setGrades] = useState<SemesterGrade[]>([]);
  const [gradeLoading, setGradeLoading] = useState(true);
  const [showGradeDetails, setShowGradeDetails] = useState(true);
  const [updatedAtText, setUpdatedAtText] = useState('');
  const nextCardRef = useRef<View>(null);
  const gradeCardRef = useRef<View>(null);
  const [cardLayout, setCardLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const expandAnim = useRef(new Animated.Value(0)).current;
  const closeTriggeredRef = useRef(false);
  const pressAnim = useRef(new Animated.Value(0)).current;

  const [gradeLayout, setGradeLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [showGrades, setShowGrades] = useState(false);
  const gradeAnim = useRef(new Animated.Value(0)).current;
  const gradeCloseTriggeredRef = useRef(false);
  const gradePressAnim = useRef(new Animated.Value(0)).current;
  const scheduleScrollY = useRef(new Animated.Value(0)).current;
  const gradeScrollY = useRef(new Animated.Value(0)).current;

  const refreshCourses = useCallback(async () => {
    const cached = await getCourses();
    if (cached.courses) {
      setCourses(cached.courses);
      if (cached.courses.length > 0) setScheduleRefreshing(false);
    }
    const stored = await AsyncStorage.getItem('cached_schedule_last');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.updatedAt) {
          const d = new Date(parsed.updatedAt);
          const t = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
          setUpdatedAtText(t);
        }
      } catch (e) {}
    }
  }, []);

  const refreshGrades = useCallback(async () => {
    const cached = await getGrades();
    if (cached.grades) {
      setGrades(cached.grades);
    }
    setGradeLoading(false);
  }, []);

  useEffect(() => {
    refreshCourses();
    const refresh = setInterval(refreshCourses, 5 * 60 * 1000);
    return () => clearInterval(refresh);
  }, [refreshCourses]);

  useEffect(() => {
    refreshGrades();
    const refresh = setInterval(refreshGrades, 5 * 60 * 1000);
    return () => clearInterval(refresh);
  }, [refreshGrades]);

  useEffect(() => {
    if (!scheduleLoading) return;
    const fast = setInterval(refreshCourses, 2000);
    return () => clearInterval(fast);
  }, [scheduleLoading, refreshCourses]);

  useEffect(() => {
    if (courses.length > 0) setScheduleLoading(false);
  }, [courses.length]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setScheduleLoading(false);
      setScheduleRefreshing(false);
    }, 20000);
    return () => clearTimeout(timeout);
  }, [scheduleReloadKey]);

  const triggerScheduleReload = () => {
    if (courses.length === 0) setScheduleLoading(true);
    else setScheduleRefreshing(true);
    setScheduleReloadKey((k) => k + 1);
  };

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(tick);
  }, []);

  const nextClass = useMemo(() => findNextClass(courses, now), [courses, now]);
  const scheduleDays = useMemo(() => {
    const buckets = SCHEDULE_DAY_LABELS.map((label, idx) => ({ label, idx, courses: [] as CourseData[] }));
    courses.forEach((course) => {
      const idx = toScheduleIndex(course.dayOfWeek);
      if (!buckets[idx]) return;
      buckets[idx].courses.push(course);
    });
    buckets.forEach((bucket) => {
      bucket.courses.sort((a, b) => {
        if (a.startPeriod !== b.startPeriod) return a.startPeriod - b.startPeriod;
        return a.endPeriod - b.endPeriod;
      });
    });
    return buckets;
  }, [courses]);
  const todayScheduleIndex = (now.getDay() + 6) % 7;
  const highlightIndex = nextClass ? toScheduleIndex(nextClass.course.dayOfWeek) : todayScheduleIndex;

  const latestGrade = useMemo(() => {
    if (!grades || grades.length === 0) return null;
    const withStats = grades.find((g) => g.stats && (g.stats.average || g.stats.classRank || g.stats.deptRank));
    return withStats || grades[0];
  }, [grades]);

  const gradeSummary = useMemo(() => {
    if (!latestGrade) return null;
    const avg = latestGrade.stats?.average;
    const classRank = latestGrade.stats?.classRank;
    const deptRank = latestGrade.stats?.deptRank;
    return { avg, classRank, deptRank };
  }, [latestGrade]);

  const openSchedule = () => {
    if (!nextCardRef.current) return;
    pressAnim.setValue(0);
    nextCardRef.current.measureInWindow((x, y, width, height) => {
      setCardLayout({ x, y, width, height });
      setShowSchedule(true);
      closeTriggeredRef.current = false;
      expandAnim.setValue(0);
      Animated.timing(expandAnim, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
  };

  const closeSchedule = () => {
    if (closeTriggeredRef.current) return;
    closeTriggeredRef.current = true;
    Animated.timing(expandAnim, {
      toValue: 0,
      duration: 320,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setShowSchedule(false);
      closeTriggeredRef.current = false;
    });
  };

  const handleNextPressIn = () => {
    Animated.timing(pressAnim, {
      toValue: 1,
      duration: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const handleNextPressOut = () => {
    Animated.timing(pressAnim, {
      toValue: 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const openGrades = () => {
    if (!gradeCardRef.current) return;
    gradePressAnim.setValue(0);
    gradeCardRef.current.measureInWindow((x, y, width, height) => {
      setGradeLayout({ x, y, width, height });
      setShowGrades(true);
      gradeCloseTriggeredRef.current = false;
      gradeAnim.setValue(0);
      Animated.timing(gradeAnim, {
        toValue: 1,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
  };

  const closeGrades = () => {
    if (gradeCloseTriggeredRef.current) return;
    gradeCloseTriggeredRef.current = true;
    Animated.timing(gradeAnim, {
      toValue: 0,
      duration: 320,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      setShowGrades(false);
      gradeCloseTriggeredRef.current = false;
    });
  };

  const handleGradePressIn = () => {
    Animated.timing(gradePressAnim, {
      toValue: 1,
      duration: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  };

  const handleGradePressOut = () => {
    Animated.timing(gradePressAnim, {
      toValue: 0,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const toggleGradeDetails = () => {
    setShowGradeDetails((v) => !v);
  };

  const handleScheduleScroll = (event: any) => {
    const y = event?.nativeEvent?.contentOffset?.y ?? 0;
    if (y < -120 && !closeTriggeredRef.current) {
      closeSchedule();
    }
  };

  const buildOverlayStyle = (layout: { x: number; y: number; width: number; height: number } | null, anim: Animated.Value) => {
    const startTranslateX = layout
      ? layout.x - (SCREEN_WIDTH / 2 - layout.width / 2)
      : 0;
    const startTranslateY = layout
      ? layout.y - (SCREEN_HEIGHT / 2 - layout.height / 2)
      : 0;
    const startScaleX = layout ? layout.width / SCREEN_WIDTH : 1;
    const startScaleY = layout ? layout.height / SCREEN_HEIGHT : 1;

    return {
      transform: [
        { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [startTranslateX, 0] }) },
        { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [startTranslateY, 0] }) },
        { scaleX: anim.interpolate({ inputRange: [0, 1], outputRange: [startScaleX, 1] }) },
        { scaleY: anim.interpolate({ inputRange: [0, 1], outputRange: [startScaleY, 1] }) },
      ],
    } as any;
  };

  const overlayStyle: any = buildOverlayStyle(cardLayout, expandAnim);
  const gradeOverlayStyle: any = buildOverlayStyle(gradeLayout, gradeAnim);

  const pressStyle: any = {
    transform: [
      { translateY: pressAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 4] }) },
      { scale: pressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.98] }) },
    ],
  };

  const gradePressStyle: any = {
    transform: [
      { translateY: gradePressAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 4] }) },
      { scale: gradePressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.98] }) },
    ],
  };

  const contentOpacity = expandAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0, 1] });

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}> 
    <ScrollView style={[styles.container, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>
      <View style={styles.headerSpacer} />
      
      {/* 歡迎橫幅：VisionOS 懸浮風格 */}
      <View style={[styles.card, { backgroundColor: theme.card, shadowColor: theme.text }]}>
        <View style={styles.cardHeader}>
          <Ionicons name="sparkles" size={24} color={theme.primary} />
          <Text style={[styles.cardTitle, { color: theme.text }]}>早安，同學</Text>
        </View>
        <Text style={[styles.cardText, { color: theme.textSub }]}>今天有一點微風，陽明山氣溫 18°C。別忘了帶件外套！</Text>
      </View>

      {/* 小卡片：兩兩並排 (Grid) */}
      <View style={styles.gridContainer}>
        <View style={[styles.card, styles.gridCard, { backgroundColor: theme.card, shadowColor: theme.text }]}> 
          <Ionicons name="bus" size={32} color="#FF9500" style={styles.gridIcon} />
          <Text style={[styles.gridTitle, { color: theme.text }]}>紅 5 動態</Text>
          <Text style={[styles.gridSub, { color: theme.textSub }]}>即將進站</Text>
        </View>
        
        <View style={[styles.card, styles.gridCard, { backgroundColor: theme.card, shadowColor: theme.text }]}> 
          <Ionicons name="library" size={32} color="#AF52DE" style={styles.gridIcon} />
          <Text style={[styles.gridTitle, { color: theme.text }]}>圖書館</Text>
          <Text style={[styles.gridSub, { color: theme.textSub }]}>預約座位</Text>
        </View>

        <AnimatedPressable
          ref={nextCardRef}
          onPress={openSchedule}
          onPressIn={handleNextPressIn}
          onPressOut={handleNextPressOut}
          style={[styles.card, styles.gridCard, { backgroundColor: theme.card, shadowColor: theme.text }, pressStyle]}
        >
          <Ionicons name="time" size={32} color={theme.primary} style={styles.gridIcon} />
          <Text style={[styles.gridTitle, { color: theme.text }]}>下節課</Text>
          {nextClass ? (
            <>
              <Text style={[styles.gridSub, { color: theme.textSub }]} numberOfLines={1}>{normalizeText(nextClass.course.name)}</Text>
              <Text style={[styles.gridMeta, { color: theme.textSub }]} numberOfLines={1}>
                {nextClass.isOngoing ? `進行中 · ${nextClass.endLabel}` : `${nextClass.dayLabel} ${nextClass.startLabel}–${nextClass.endLabel}`}
              </Text>
              {nextClass.course.location ? (
                <Text style={[styles.gridMeta, { color: theme.textSub }]} numberOfLines={1}>{normalizeText(nextClass.course.location)}</Text>
              ) : null}
            </>
          ) : scheduleLoading ? (
            <View style={styles.gridLoadingRow}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={[styles.gridMeta, { color: theme.textSub }]}>載入課表中...</Text>
            </View>
          ) : (
            <Text style={[styles.gridSub, { color: theme.textSub }]}>尚未同步課表</Text>
          )}
        </AnimatedPressable>

        <AnimatedPressable
          ref={gradeCardRef}
          onPress={openGrades}
          onPressIn={handleGradePressIn}
          onPressOut={handleGradePressOut}
          style={[styles.card, styles.gridCard, { backgroundColor: theme.card, shadowColor: theme.text }, gradePressStyle]}
        >
          <Ionicons name="ribbon" size={32} color="#FFCC00" style={styles.gridIcon} />
          <Text style={[styles.gridTitle, { color: theme.text }]}>成績</Text>
          {gradeSummary ? (
            <>
              <Text style={[styles.gridSub, { color: theme.textSub }]} numberOfLines={1}>
                平均 {showGradeDetails ? (gradeSummary.avg || '--') : '•••'}
              </Text>
              <Text style={[styles.gridMeta, { color: theme.textSub }]} numberOfLines={1}>
                班排 {showGradeDetails ? (gradeSummary.classRank || '--') : '••/••'}
              </Text>
              <Text style={[styles.gridMeta, { color: theme.textSub }]} numberOfLines={1}>
                系排 {showGradeDetails ? (gradeSummary.deptRank || '--') : '••/••'}
              </Text>
            </>
          ) : gradeLoading ? (
            <View style={styles.gridLoadingRow}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={[styles.gridMeta, { color: theme.textSub }]}>載入成績中...</Text>
            </View>
          ) : (
            <Text style={[styles.gridSub, { color: theme.textSub }]}>尚未同步成績</Text>
          )}
        </AnimatedPressable>
      </View>

      {/* 佔位卡片：模擬捲動時的毛玻璃效果 */}
      <View style={[styles.largeCard, { backgroundColor: theme.card, shadowColor: theme.text }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>校園公告</Text>
        <Text style={[styles.cardText, { color: theme.textSub }]}>這裡是未來的校園最新動態，當您往上捲動時，這個區塊會流暢地滑過頂部與底部的玻璃導航列。</Text>
        <View style={[styles.skeletonRow, { backgroundColor: theme.border }]} />
        <View style={[styles.skeletonRowShort, { backgroundColor: theme.border }]} />
      </View>
      <View style={[styles.largeCard, { backgroundColor: theme.card, shadowColor: theme.text }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>校園公告</Text>
        <Text style={[styles.cardText, { color: theme.textSub }]}>這裡是未來的校園最新動態，當您往上捲動時，這個區塊會流暢地滑過頂部與底部的玻璃導航列。</Text>
        <View style={[styles.skeletonRow, { backgroundColor: theme.border }]} />
        <View style={[styles.skeletonRowShort, { backgroundColor: theme.border }]} />
      </View>
      <View style={[styles.largeCard, { backgroundColor: theme.card, shadowColor: theme.text }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>校園公告</Text>
        <Text style={[styles.cardText, { color: theme.textSub }]}>這裡是未來的校園最新動態，當您往上捲動時，這個區塊會流暢地滑過頂部與底部的玻璃導航列。</Text>
        <View style={[styles.skeletonRow, { backgroundColor: theme.border }]} />
        <View style={[styles.skeletonRowShort, { backgroundColor: theme.border }]} />
      </View>

      {/* 底部留白，避免內容被懸浮 Tab 蓋住 */}
      <View style={styles.bottomSpacer} />
    </ScrollView>

    {/* 自動載入課表（隱藏） */}
    <View style={styles.hiddenFetcher} pointerEvents="none">
      <ScheduleScreen key={`schedule-fetch-${scheduleReloadKey}`} />
    </View>

    {showSchedule && (
      <Modal
        visible={showSchedule}
        transparent
        animationType="none"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={closeSchedule}
      >
        <View style={styles.overlayRoot} pointerEvents="auto">
          <Animated.View
            style={[
              styles.expandCard,
              { backgroundColor: theme.bg, width: SCREEN_WIDTH, height: SCREEN_HEIGHT },
              overlayStyle,
            ]}
          >
            <Animated.View style={[styles.expandContent, { opacity: contentOpacity }]}> 
              <ScrollView
                contentContainerStyle={[styles.expandScroll, { paddingTop: insets.top + 80 }]}
                showsVerticalScrollIndicator={false}
                onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scheduleScrollY } } }], { useNativeDriver: false, listener: handleScheduleScroll })}
                scrollEventThrottle={16}
                bounces
                overScrollMode="always"
              >
                <View style={styles.scheduleHeader}>
                  <Text style={[styles.scheduleTitle, { color: theme.text }]}>完整課表</Text>
                </View>
                <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.border }]}> 
                  <View style={styles.summaryRow}>
                    <View style={styles.summaryTitleRow}>
                      <Ionicons name="time" size={14} color={theme.primary} style={styles.summaryTitleIcon} />
                      <Text style={[styles.summaryTitle, { color: theme.text }]}>下節課</Text>
                    </View>
                    <Text style={[styles.summaryCount, { color: theme.textSub }]}>
                      {nextClass ? (nextClass.isOngoing ? `進行中 · ${nextClass.endLabel}` : `${nextClass.dayLabel} ${nextClass.startLabel}–${nextClass.endLabel}`) : ''}
                    </Text>
                  </View>
                  {nextClass ? (
                    <View style={styles.summaryNextRow}>
                      <Text style={[styles.nextClassName, { color: theme.text }]} numberOfLines={1}>{normalizeText(nextClass.course.name)}</Text>
                      <View style={styles.summaryMetaRow}>
                        <View style={styles.summaryMetaItem}>
                          <Ionicons name="location" size={14} color={theme.textSub} style={styles.summaryMetaIcon} />
                          <Text style={[styles.summaryMetaText, { color: theme.textSub }]} numberOfLines={1}>
                            {normalizeText(nextClass.course.location) || '未設定教室'}
                          </Text>
                        </View>
                        <View style={styles.summaryMetaItem}>
                          <Ionicons name="person" size={14} color={theme.textSub} style={styles.summaryMetaIcon} />
                          <Text style={[styles.summaryMetaText, { color: theme.textSub }]} numberOfLines={1}>
                            {normalizeText(nextClass.course.teacher) || '未設定老師'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ) : scheduleLoading ? (
                    <View style={styles.summaryLoadingRow}>
                      <ActivityIndicator size="small" color={theme.primary} />
                      <Text style={[styles.summaryEmpty, { color: theme.textSub }]}>載入課表中...</Text>
                    </View>
                  ) : (
                    <Text style={[styles.summaryEmpty, { color: theme.textSub }]}>尚未同步課表，請點右上角同步</Text>
                  )}
                </View>

                {scheduleDays.map((day) => (
                  <View key={day.label} style={styles.daySection}>
                    <View style={styles.dayHeader}>
                    <Text style={[styles.dayTitle, { color: day.idx === highlightIndex ? theme.primary : theme.text }]}>{day.label}</Text>
                      <Text style={[styles.dayCount, { color: theme.textSub }]}>{day.courses.length} 門</Text>
                    </View>
                    {day.courses.length === 0 ? (
                      <Text style={[styles.dayEmpty, { color: theme.textSub }]}>無課程</Text>
                    ) : (
                      day.courses.map((course, idx) => (
                        <View key={`${course.name}-${idx}`} style={[styles.courseRowCard, { backgroundColor: theme.card, borderColor: theme.border }]}> 
                          <View style={styles.courseTimeBlock}>
                            <Text style={[styles.courseTime, { color: theme.text }]}>{getCourseTimeLabel(course)}</Text>
                            <Text style={[styles.coursePeriod, { color: theme.textSub }]}>{course.periodRange}</Text>
                          </View>
                          <View style={styles.courseMain}>
                          <Text style={[styles.courseTitle, { color: theme.text }]} numberOfLines={1}>{normalizeText(course.name)}</Text>
                          <Text style={[styles.courseMeta, { color: theme.textSub }]} numberOfLines={1}>
                            {[normalizeText(course.location), normalizeText(course.teacher)].filter(Boolean).join(' · ')}
                          </Text>
                          </View>
                          <View style={[styles.courseTypePill, { backgroundColor: course.required ? 'rgba(255,59,48,0.12)' : 'rgba(52,199,89,0.12)' }]}> 
                            <Text style={[styles.courseTypeText, { color: course.required ? theme.danger : theme.success }]}> 
                              {course.required ? '必修' : '選修'}
                            </Text>
                          </View>
                        </View>
                      ))
                    )}
                  </View>
                ))}
                <Text style={[styles.updatedAtText, { color: theme.textSub }]}>最後更新：{updatedAtText || '尚未更新'}</Text>
                <View style={{ height: 24 }} />
              </ScrollView>
              
              <Animated.View style={{ opacity: scheduleScrollY.interpolate({ inputRange: [60, 100], outputRange: [0, 1], extrapolate: 'clamp' }), position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 80, zIndex: 10 }} pointerEvents="none">
                <LinearGradient
                  colors={[theme.bg, theme.bg + '00']}
                  style={StyleSheet.absoluteFill}
                />
              </Animated.View>
              
              <Animated.View style={[styles.stickyHeader, { top: insets.top + 8, zIndex: 15, opacity: scheduleScrollY.interpolate({ inputRange: [60, 100], outputRange: [0, 1], extrapolate: 'clamp' }) }]}>
                <Text style={[styles.stickyTitle, { color: theme.text }]}>完整課表</Text>
              </Animated.View>
            </Animated.View>
            
            <TouchableOpacity
              onPress={closeSchedule}
              style={[styles.overlayCloseButton, { backgroundColor: theme.card, borderColor: theme.border, top: insets.top + 8, zIndex: 20 }]}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={20} color={theme.text} />
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    )}

    {showGrades && (
      <Modal
        visible={showGrades}
        transparent
        animationType="none"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={closeGrades}
      >
        <View style={styles.overlayRoot} pointerEvents="auto">
          <Animated.View
            style={[
              styles.expandCard,
              { backgroundColor: theme.bg, width: SCREEN_WIDTH, height: SCREEN_HEIGHT },
              gradeOverlayStyle,
            ]}
          >
            <GradeScreen showDetails={showGradeDetails} onToggleDetails={toggleGradeDetails} onScrollY={gradeScrollY} />
            
            {/* 漸變遮罩：固定顯示，讓內容往上滑動時自然被覆蓋 */}
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top + 80, zIndex: 10 }} pointerEvents="none">
              <LinearGradient
                colors={[theme.bg, theme.bg + '00']}
                style={StyleSheet.absoluteFill}
              />
            </View>
            
            {/* 常駐頂部的成績標題（不含眼睛）：只有往下滑動時才浮現 */}
            <Animated.View style={[styles.stickyHeader, { top: insets.top + 8, zIndex: 15, opacity: gradeScrollY.interpolate({ inputRange: [60, 100], outputRange: [0, 1], extrapolate: 'clamp' }) }]}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[styles.stickyTitle, { color: theme.text }]}>歷年成績</Text>
              </View>
            </Animated.View>

            <TouchableOpacity
              onPress={closeGrades}
              style={[styles.overlayCloseButton, { backgroundColor: theme.card, borderColor: theme.border, top: insets.top + 8, zIndex: 20 }]}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={20} color={theme.text} />
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20 },
  headerSpacer: { height: 120 },
  bottomSpacer: { height: 140 },
  
  card: {
    borderRadius: 28,
    padding: 24,
    marginBottom: 20,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 20, fontWeight: '700', marginLeft: 8 },
  cardText: { fontSize: 16, lineHeight: 24, marginTop: 4 },
  
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },
  gridCard: { width: '47%', marginBottom: 16, padding: 20, alignItems: 'flex-start' },
  gridIcon: { marginBottom: 16 },
  gridTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  gridSub: { fontSize: 14 },
  gridMeta: { fontSize: 12, marginTop: 4 },
  gridLoadingRow: { flexDirection: 'row', alignItems: 'center' },

  hiddenFetcher: {
    position: 'absolute',
    width: 375,
    height: 667,
    opacity: 0,
    left: 0,
    top: 0,
  },

  overlayRoot: { ...StyleSheet.absoluteFillObject, zIndex: 2000, elevation: 20 },
  expandCard: {
    position: 'absolute',
    overflow: 'hidden',
    left: 0,
    top: 0,
    borderRadius: 24,
  },
  overlayCloseButton: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 20,
  },
  stickyHeader: {
    position: 'absolute',
    left: 44, // 配合右邊的關閉按鈕寬度，保持視覺置中
    right: 44,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickyTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  eyeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    marginLeft: 10,
  },
  expandContent: { flex: 1 },
  scheduleHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, width: '100%' },
  scheduleTitle: { fontSize: 34, fontWeight: '800', lineHeight: 36, includeFontPadding: false },
  scheduleCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    marginLeft: 10,
  },
  expandScroll: { paddingHorizontal: 20 },
  summaryCard: { borderRadius: 20, padding: 16, borderWidth: 1, marginBottom: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  summaryTitleRow: { flexDirection: 'row', alignItems: 'center' },
  summaryTitleIcon: { marginRight: 6 },
  summaryTitle: { fontSize: 16, fontWeight: '700' },
  summaryCount: { fontSize: 13, fontWeight: '600' },
  summaryNextRow: { marginTop: 4 },
  nextBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, marginBottom: 8 },
  nextBadgeText: { fontSize: 12, fontWeight: '600', marginLeft: 4 },
  nextClassName: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  nextClassTime: { fontSize: 13, fontWeight: '500' },
  summaryEmpty: { fontSize: 13, fontWeight: '500' },
  summaryLoadingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  summaryMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 6 },
  summaryMetaItem: { flexDirection: 'row', alignItems: 'center', marginRight: 14, marginBottom: 4 },
  summaryMetaIcon: { marginRight: 6 },
  summaryMetaText: { fontSize: 12, fontWeight: '500' },
  updatedAtText: { fontSize: 12, textAlign: 'center', marginTop: 8 },
  daySection: { marginBottom: 18 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  dayTitle: { fontSize: 15, fontWeight: '700' },
  dayCount: { fontSize: 12, fontWeight: '600' },
  dayEmpty: { fontSize: 13, fontWeight: '500' },
  courseRowCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 12, borderWidth: 1, marginBottom: 10 },
  courseTimeBlock: { width: 92, marginRight: 10 },
  courseTime: { fontSize: 13, fontWeight: '700' },
  coursePeriod: { fontSize: 11, marginTop: 2 },
  courseMain: { flex: 1 },
  courseTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  courseMeta: { fontSize: 12, fontWeight: '500' },
  courseTypePill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  courseTypeText: { fontSize: 11, fontWeight: '700' },

  largeCard: {
    borderRadius: 28, padding: 24, marginBottom: 20,
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.04, shadowRadius: 16,
  },
  skeletonRow: { height: 12, borderRadius: 6, width: '100%', marginTop: 24, marginBottom: 12 },
  skeletonRowShort: { height: 12, borderRadius: 6, width: '60%' },

  nextClassTitle: { fontSize: 18, fontWeight: '700', marginTop: 4, marginBottom: 12 },
  nextClassMetaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  nextClassMetaItem: { flexDirection: 'row', alignItems: 'center', marginRight: 18 },
  metaIcon: { marginRight: 6 },
  metaText: { fontSize: 14, fontWeight: '500' },
});
