import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import AppSymbol from '../../../shared/components/AppSymbol';
import { useTheme } from '../../../providers/theme/ThemeProvider';
import { CourseData } from '../../pccu/parsers/pccuScraper';
import { getCourses } from '../../schedule/storage/scheduleStorage';
import { useTrafficData } from '../../traffic/hooks/useTrafficData';
import {
  pickBestTrafficArrival,
} from '../../traffic/types';
import { SemesterGrade } from '../../pccu/parsers/pccuScraper';
import { getGrades } from '../../grade/storage/gradeStorage';
import { getHideHomeGradeDetails } from '../../settings/storage/privacySettings';
import {
  getHomeCourseCardTestEnabled,
  subscribeHomeCourseCardTestEnabled,
} from '../../settings/storage/developerSettings';
import { usePendingCount } from '../../tutoring/hooks/useTutoringData';
import {
  formatYangmingshanWeather,
  getTimeGreeting,
  YangmingshanWeather,
} from '../utils/homeHeader';

type NextClassInfo = {
  course: CourseData;
  start: Date;
  end: Date;
  startLabel: string;
  endLabel: string;
  dayLabel: string;
  status: 'now' | 'next';
};

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

const DAY_LABELS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const pad2 = (n: number) => String(n).padStart(2, '0');
const formatTime = (h: number, m: number) => `${pad2(h)}:${pad2(m)}`;
const toJsDay = (dayOfWeek: number) => ((dayOfWeek % 7) + 7) % 7;
const normalizeText = (value?: string) => (value || '').replace(/\s+/g, ' ').trim();

const startOfDay = (date: Date) => {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
};

const formatDateTime = (date: Date) => `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

const makeCourse = (name: string, location: string): CourseData => ({
  name,
  teacher: '測試教師',
  location,
  required: true,
  type: '測試',
  dayOfWeek: 0,
  periodRange: '',
  startPeriod: 1,
  endPeriod: 1,
});

const makeDeveloperTestClasses = (now: Date): { current: NextClassInfo; next: NextClassInfo } => {
  const currentStart = new Date(now);
  currentStart.setMinutes(now.getMinutes() - 40, 0, 0);
  const currentEnd = new Date(now);
  currentEnd.setMinutes(now.getMinutes() + 50, 0, 0);

  const nextStart = new Date(now);
  nextStart.setMinutes(now.getMinutes() + 55, 0, 0);
  const nextEnd = new Date(now);
  nextEnd.setMinutes(now.getMinutes() + 145, 0, 0);

  const currentCourse = makeCourse('計算機概論', '大恩館 305');
  const nextCourse = makeCourse('程式設計', '大義 402');

  return {
    current: {
      course: currentCourse,
      start: currentStart,
      end: currentEnd,
      startLabel: formatDateTime(currentStart),
      endLabel: formatDateTime(currentEnd),
      dayLabel: '今天',
      status: 'now',
    },
    next: {
      course: nextCourse,
      start: nextStart,
      end: nextEnd,
      startLabel: formatDateTime(nextStart),
      endLabel: formatDateTime(nextEnd),
      dayLabel: '今天',
      status: 'next',
    },
  };
};

const HIDDEN_AVERAGE_VALUE = '•••';
const HIDDEN_RANK_VALUE = '••/••';
const maskAverageValue = (value?: string | null) => (value ? HIDDEN_AVERAGE_VALUE : '--');
const maskRankValue = (value?: string | null) => (value ? HIDDEN_RANK_VALUE : '--');

const findFeaturedClass = (courses: CourseData[], now: Date): NextClassInfo | null => {
  if (!courses || courses.length === 0) return null;

  const todayStart = startOfDay(now);
  let best: NextClassInfo | null = null;

  for (const course of courses) {
    const day = toJsDay(course.dayOfWeek);
    const slot = PERIOD_TIMES[course.startPeriod - 1];
    const endSlot = PERIOD_TIMES[course.endPeriod - 1] || slot;
    if (day < 0 || day > 6 || !slot || !endSlot) continue;

    const dayOffset = (day - now.getDay() + 7) % 7;
    const start = new Date(now);
    start.setDate(now.getDate() + dayOffset);
    start.setHours(slot.start[0], slot.start[1], 0, 0);

    const end = new Date(now);
    end.setDate(now.getDate() + dayOffset);
    end.setHours(endSlot.end[0], endSlot.end[1], 0, 0);

    const startLabel = formatTime(slot.start[0], slot.start[1]);
    const endLabel = formatTime(endSlot.end[0], endSlot.end[1]);
    const isOngoing = dayOffset === 0 && start.getTime() <= now.getTime() && end.getTime() > now.getTime();

    if (isOngoing) {
      return {
        course,
        start,
        end,
        startLabel,
        endLabel,
        dayLabel: '今天',
        status: 'now',
      };
    }

    if (dayOffset === 0 && start.getTime() <= now.getTime()) {
      start.setDate(start.getDate() + 7);
      end.setDate(end.getDate() + 7);
    }

    const futureDayOffset = Math.round((startOfDay(start).getTime() - todayStart.getTime()) / (24 * 60 * 60 * 1000));
    const dayLabel = futureDayOffset === 0 ? '今天' : DAY_LABELS[start.getDay()];
    const candidate: NextClassInfo = {
      course,
      start,
      end,
      startLabel,
      endLabel,
      dayLabel,
      status: 'next',
    };

    if (!best || candidate.start.getTime() < best.start.getTime()) {
      best = candidate;
    }
  }

  return best;
};

const findUpcomingClass = (courses: CourseData[], now: Date): NextClassInfo | null => {
  if (!courses || courses.length === 0) return null;

  const todayStart = startOfDay(now);
  let best: NextClassInfo | null = null;

  for (const course of courses) {
    const day = toJsDay(course.dayOfWeek);
    const slot = PERIOD_TIMES[course.startPeriod - 1];
    const endSlot = PERIOD_TIMES[course.endPeriod - 1] || slot;
    if (day < 0 || day > 6 || !slot || !endSlot) continue;

    const dayOffset = (day - now.getDay() + 7) % 7;
    const start = new Date(now);
    start.setDate(now.getDate() + dayOffset);
    start.setHours(slot.start[0], slot.start[1], 0, 0);

    const end = new Date(now);
    end.setDate(now.getDate() + dayOffset);
    end.setHours(endSlot.end[0], endSlot.end[1], 0, 0);

    if (start.getTime() <= now.getTime()) {
      start.setDate(start.getDate() + 7);
      end.setDate(end.getDate() + 7);
    }

    const futureDayOffset = Math.round((startOfDay(start).getTime() - todayStart.getTime()) / (24 * 60 * 60 * 1000));
    const dayLabel = futureDayOffset === 0 ? '今天' : DAY_LABELS[start.getDay()];
    const candidate: NextClassInfo = {
      course,
      start,
      end,
      startLabel: formatTime(slot.start[0], slot.start[1]),
      endLabel: formatTime(endSlot.end[0], endSlot.end[1]),
      dayLabel,
      status: 'next',
    };

    if (!best || candidate.start.getTime() < best.start.getTime()) {
      best = candidate;
    }
  }

  return best;
};

export default function HomeScreen() {
  const { theme } = useTheme();
  const isFocused = useIsFocused();
  const traffic = useTrafficData({ active: isFocused });
  const [courses, setCourses] = useState<CourseData[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [grades, setGrades] = useState<SemesterGrade[]>([]);
  const [gradeLoading, setGradeLoading] = useState(true);
  const [hideHomeGradeDetails, setHideHomeGradeDetails] = useState(false);
  const [weather, setWeather] = useState<YangmingshanWeather | null>(null);
  const [userName, setUserName] = useState('同學');
  const [homeCourseCardTestEnabled, setHomeCourseCardTestEnabledState] = useState(false);
  const [now, setNow] = useState(new Date());
  const trafficPressAnim = useRef(new Animated.Value(0)).current;
  const pressAnim = useRef(new Animated.Value(0)).current;
  const nextClassPressAnim = useRef(new Animated.Value(0)).current;
  const gradePressAnim = useRef(new Animated.Value(0)).current;

  const refreshCourses = useCallback(async () => {
    const cached = await getCourses();
    if (cached.courses && !cached.mock && cached.courses.length > 0) {
      setCourses(cached.courses);
    } else {
      setCourses([]);
    }
    setScheduleLoading(false);
  }, []);

  const refreshGrades = useCallback(async () => {
    const cached = await getGrades();
    if (cached.grades) {
      setGrades(cached.grades);
    }
    setGradeLoading(false);
  }, []);

  const refreshUser = useCallback(async () => {
    const name = await SecureStore.getItemAsync('user_name');
    setUserName(name || '同學');
  }, []);

  const refreshPrivacy = useCallback(async () => {
    const hide = await getHideHomeGradeDetails();
    setHideHomeGradeDetails(hide);
  }, []);

  const refreshDeveloperTestSettings = useCallback(async () => {
    const enabled = await getHomeCourseCardTestEnabled();
    setHomeCourseCardTestEnabledState(enabled);
  }, []);

  useEffect(() => {
    void refreshCourses();
    void refreshGrades();
    void refreshUser();
    void refreshPrivacy();
    void refreshDeveloperTestSettings();
  }, [refreshCourses, refreshDeveloperTestSettings, refreshGrades, refreshPrivacy, refreshUser]);

  useFocusEffect(
    useCallback(() => {
      void refreshCourses();
      void refreshGrades();
      void refreshUser();
      void refreshPrivacy();
      void refreshDeveloperTestSettings();
    }, [refreshCourses, refreshDeveloperTestSettings, refreshGrades, refreshPrivacy, refreshUser])
  );

  useEffect(() => subscribeHomeCourseCardTestEnabled(setHomeCourseCardTestEnabledState), []);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=25.137&longitude=121.539&current_weather=true&timezone=Asia%2FTaipei');
        const data = await res.json();
        if (data?.current_weather) {
          setWeather({
            temp: Math.round(data.current_weather.temperature),
            code: data.current_weather.weathercode,
            windspeed: Math.round(data.current_weather.windspeed),
          });
        }
      } catch (error) {
        console.warn('Weather fetch failed', error);
      }
    };

    void fetchWeather();
    const weatherTick = setInterval(fetchWeather, 30 * 60 * 1000);
    return () => clearInterval(weatherTick);
  }, []);

  const developerTestClasses = useMemo(() => makeDeveloperTestClasses(now), [now]);
  const featuredClass = useMemo(
    () => homeCourseCardTestEnabled ? developerTestClasses.current : findFeaturedClass(courses, now),
    [courses, developerTestClasses, homeCourseCardTestEnabled, now]
  );
  const upcomingClass = useMemo(
    () => homeCourseCardTestEnabled ? developerTestClasses.next : findUpcomingClass(courses, now),
    [courses, developerTestClasses, homeCourseCardTestEnabled, now]
  );

  const latestGrade = useMemo(() => {
    if (!grades || grades.length === 0) return null;
    return grades.find((grade) => grade.stats && (grade.stats.average || grade.stats.classRank || grade.stats.deptRank)) || grades[0];
  }, [grades]);

  const gradeSummary = useMemo(() => {
    if (!latestGrade) return null;
    return {
      avg: hideHomeGradeDetails ? maskAverageValue(latestGrade.stats?.average) : latestGrade.stats?.average,
      classRank: hideHomeGradeDetails ? maskRankValue(latestGrade.stats?.classRank) : latestGrade.stats?.classRank,
      deptRank: hideHomeGradeDetails ? maskRankValue(latestGrade.stats?.deptRank) : latestGrade.stats?.deptRank,
    };
  }, [hideHomeGradeDetails, latestGrade]);

  const downhillSummary = useMemo(
    () => pickBestTrafficArrival(traffic.snapshot?.downhill || []),
    [traffic.snapshot]
  );
  const uphillSummary = useMemo(
    () => pickBestTrafficArrival(traffic.snapshot?.uphill || []),
    [traffic.snapshot]
  );

  const openTraffic = () => {
    router.push('/(tabs)/home/traffic');
  };

  const openSchedule = () => {
    router.push('/(tabs)/home/schedule');
  };

  const openGrades = () => {
    router.push('/(tabs)/home/grade');
  };

  const openTutoring = () => {
    router.push('/(tabs)/tutoring');
  };

  const trafficPressStyle: any = {
    transform: [{ scale: trafficPressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] }) }],
  };

  const pressStyle: any = {
    transform: [{ scale: pressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] }) }],
  };

  const nextClassPressStyle: any = {
    transform: [
      { translateY: nextClassPressAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 2] }) },
      { scale: nextClassPressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] }) },
    ],
  };

  const gradePressStyle: any = {
    transform: [{ scale: gradePressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] }) }],
  };
  const { count: pendingTutoringCount } = usePendingCount();

  const greeting = getTimeGreeting(now);
  const weatherText = formatYangmingshanWeather(weather);
  const courseCardBackground = theme.syncBtnBg;
  const weatherValueText = weather?.temp !== undefined ? `${weather.temp}°C` : '--';
  const weatherCaptionText = weather?.code !== undefined && weather.code >= 51 ? '山區有雨' : '陽明山天氣';
  const gradeValueText = gradeSummary?.avg || '--';
  const gradeCaptionText = gradeSummary ? '平均分數' : gradeLoading ? '讀取成績中' : '尚未同步';
  const tutoringValueText = pendingTutoringCount > 0 ? String(pendingTutoringCount) : '0';
  const tutoringCaptionText = pendingTutoringCount > 0 ? '份作業待繳交' : '尚無待繳交';

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.homeHeader}>
          <Text style={[styles.greetingTitle, { color: theme.text }]} numberOfLines={1}>
            {greeting}，{userName}
          </Text>
          <Text style={[styles.headerWeather, { color: theme.textSub }]} numberOfLines={2}>
            {weatherText}
          </Text>
        </View>

        <View style={styles.cardsContainer}>
          <View style={styles.courseStack}>
            <AnimatedPressable
              onPress={openSchedule}
              onPressIn={() => Animated.spring(pressAnim, { toValue: 1, useNativeDriver: true }).start()}
              onPressOut={() => Animated.spring(pressAnim, { toValue: 0, useNativeDriver: true }).start()}
              style={[styles.featureCard, { backgroundColor: courseCardBackground, borderColor: '#FFFFFF', shadowColor: theme.text }, pressStyle]}
            >
              <View style={styles.featureMainRow}>
                <AppSymbol name="clock.fill" size={40} tintColor={theme.primary} style={styles.featureIcon} fallback={<Text>課表</Text>} />
                <View style={styles.featureContent}>
                  <View style={[styles.statusPill, { backgroundColor: featuredClass?.status === 'now' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(73, 84, 188, 0.10)' }]}>
                    {featuredClass?.status === 'now' ? <View style={[styles.statusDot, { backgroundColor: theme.danger }]} /> : null}
                    <Text style={[styles.statusPillText, { color: featuredClass?.status === 'now' ? theme.danger : theme.primary }]}>
                      {featuredClass?.status === 'now' ? '正在進行' : '下一堂課'}
                    </Text>
                  </View>
                  {featuredClass ? (
                    <>
                      <Text style={[styles.featureTitle, { color: theme.text }]} numberOfLines={1}>{normalizeText(featuredClass.course.name)}</Text>
                      <Text style={[styles.featureMeta, { color: theme.textSub }]} numberOfLines={1}>
                        {`${normalizeText(featuredClass.course.location) || '未知地點'} · ${featuredClass.startLabel} - ${featuredClass.endLabel}`}
                      </Text>
                    </>
                  ) : scheduleLoading ? (
                    <View style={styles.gridLoadingRow}>
                      <ActivityIndicator size="small" color={theme.primary} />
                      <Text style={[styles.featureMeta, { color: theme.textSub, marginLeft: 6 }]}>讀取課表中...</Text>
                    </View>
                  ) : (
                    <>
                      <Text style={[styles.featureTitle, { color: theme.text }]} numberOfLines={1}>尚未同步課表</Text>
                      <Text style={[styles.featureMeta, { color: theme.textSub }]} numberOfLines={1}>點此同步完整課表</Text>
                    </>
                  )}
                </View>
              </View>
            </AnimatedPressable>
            {featuredClass?.status === 'now' && upcomingClass ? (
              <AnimatedPressable
                onPress={openSchedule}
                onPressIn={() => Animated.spring(nextClassPressAnim, { toValue: 1, useNativeDriver: true }).start()}
                onPressOut={() => Animated.spring(nextClassPressAnim, { toValue: 0, useNativeDriver: true }).start()}
                style={[styles.nextClassCard, { backgroundColor: courseCardBackground, borderColor: 'rgba(255,255,255,0.65)', shadowColor: theme.text }, nextClassPressStyle]}
              >
                <View style={styles.nextStripLeft}>
                  <View style={styles.nextBadgeRow}>
                    <Text style={[styles.miniLabel, { color: theme.textSub }]}>下一堂課</Text>
                    <View style={styles.timePill}>
                      <Text style={[styles.timePillText, { color: theme.primary }]}>稍後</Text>
                    </View>
                  </View>
                  <Text style={[styles.nextCourseText, { color: theme.text }]} numberOfLines={1}>
                    {normalizeText(upcomingClass.course.name)}
                  </Text>
                </View>
                <View style={styles.nextStripRight}>
                  <Text style={[styles.miniLabel, { color: theme.textSub }]} numberOfLines={1}>{normalizeText(upcomingClass.course.location) || '未知地點'}</Text>
                  <Text style={[styles.nextTimeText, { color: theme.text }]}>{upcomingClass.startLabel}</Text>
                </View>
              </AnimatedPressable>
            ) : null}
          </View>

          <View style={styles.smallCardsGrid}>
            <AnimatedPressable
              onPress={openTraffic}
              onPressIn={() => Animated.spring(trafficPressAnim, { toValue: 1, useNativeDriver: true }).start()}
              onPressOut={() => Animated.spring(trafficPressAnim, { toValue: 0, useNativeDriver: true }).start()}
              style={[styles.smallCard, { backgroundColor: courseCardBackground, borderColor: '#FFFFFF', shadowColor: theme.text }, trafficPressStyle]}
          >
              <View style={styles.smallCardHeader}>
                <AppSymbol name="bus.fill" size={24} tintColor={theme.primary} style={styles.smallIcon} fallback={<Text>Bus</Text>} />
                <Text style={[styles.smallCardLabel, { color: theme.textSub }]} numberOfLines={1}>公車動態</Text>
              </View>
              <View style={styles.smallCardBody}>
                <View style={styles.busValueRow}>
                  <Text style={[styles.busCardValueChinese, { color: theme.text }]} numberOfLines={1}>G</Text>
                  <Text style={[styles.busCardValueNumber, { color: theme.text }]} numberOfLines={1}>5</Text>
                </View>
              </View>
              <Text style={[styles.smallCardCaption, { color: theme.primary }]} numberOfLines={1}>將到站</Text>
            </AnimatedPressable>

            <View style={[styles.smallCard, { backgroundColor: courseCardBackground, borderColor: '#FFFFFF', shadowColor: theme.text }]}>
              <View style={styles.smallCardHeader}>
                <AppSymbol name="sun.max.fill" size={22} tintColor={theme.warning} style={styles.smallIcon} fallback={<Text>天氣</Text>} />
                <Text style={[styles.smallCardLabel, { color: theme.textSub }]} numberOfLines={1}>天氣狀況</Text>
              </View>
              <View style={styles.smallCardBody}>
                <Text style={[styles.smallCardValue, { color: theme.text }]} numberOfLines={1}>{weatherValueText}</Text>
              </View>
              <Text style={[styles.smallCardCaption, { color: theme.textSub }]} numberOfLines={1}>{weatherCaptionText}</Text>
            </View>

            <AnimatedPressable
              onPress={openGrades}
              onPressIn={() => Animated.spring(gradePressAnim, { toValue: 1, useNativeDriver: true }).start()}
              onPressOut={() => Animated.spring(gradePressAnim, { toValue: 0, useNativeDriver: true }).start()}
              style={[styles.smallCard, { backgroundColor: courseCardBackground, borderColor: '#FFFFFF', shadowColor: theme.text }, gradePressStyle]}
          >
              <View style={styles.smallCardHeader}>
                <AppSymbol name="medal.fill" size={22} tintColor={theme.warning} style={styles.smallIcon} fallback={<Text>成績</Text>} />
                <Text style={[styles.smallCardLabel, { color: theme.textSub }]} numberOfLines={1}>成績蓋覽</Text>
              </View>
              <View style={styles.smallCardBody}>
                <Text style={[styles.smallCardValue, { color: theme.text }]} numberOfLines={1}>{gradeValueText}</Text>
              </View>
              <Text style={[styles.smallCardCaption, { color: theme.textSub }]} numberOfLines={1}>{gradeCaptionText}</Text>
            </AnimatedPressable>

            <AnimatedPressable
              onPress={openTutoring}
              style={[styles.smallCard, { backgroundColor: courseCardBackground, borderColor: '#FFFFFF', shadowColor: theme.text }]}
          >
              <View style={styles.smallCardHeader}>
                <AppSymbol name="book.fill" size={22} tintColor={theme.success} style={styles.smallIcon} fallback={<Text>課輔</Text>} />
                <Text style={[styles.smallCardLabel, { color: theme.textSub }]} numberOfLines={1}>待交作業</Text>
              </View>
              <View style={styles.smallCardBody}>
                <Text style={[styles.smallCardValue, { color: theme.text }]} numberOfLines={1}>{tutoringValueText}</Text>
              </View>
              <Text style={[styles.smallCardCaption, { color: theme.textSub }]} numberOfLines={1}>{tutoringCaptionText}</Text>
            </AnimatedPressable>
          </View>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {},
  bottomSpacer: { height: 120 },
  homeHeader: {
    marginTop: -44,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  greetingTitle: {
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '900',
  },
  headerWeather: {
    fontSize: 18,
    lineHeight: 29,
    marginTop: 8,
  },
  cardsContainer: { paddingHorizontal: 16 },
  courseStack: { marginBottom: 16 },
  featureCard: {
    position: 'relative',
    width: '100%',
    minHeight: 126,
    padding: 25,
    borderRadius: 34,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 3,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.10,
    shadowRadius: 26,
    elevation: 12,
  },
  featureMainRow: { flexDirection: 'row', alignItems: 'center' },
  featureIcon: { marginRight: 20 },
  featureContent: { flex: 1, minWidth: 0 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 3,
    marginBottom: 5,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  statusPillText: { fontSize: 10, lineHeight: 15, fontWeight: '800' },
  featureTitle: { fontSize: 24, lineHeight: 32, fontWeight: '900' },
  featureMeta: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  nextClassCard: {
    position: 'relative',
    minHeight: 81,
    marginHorizontal: 9,
    marginTop: -34,
    paddingLeft: 21,
    paddingRight: 21,
    paddingTop: 47,
    paddingBottom: 17,
    borderRadius: 34,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    zIndex: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  nextStripLeft: { flex: 1, minWidth: 0, paddingRight: 12 },
  nextStripRight: { alignItems: 'flex-end' },
  nextBadgeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  miniLabel: { fontSize: 10, lineHeight: 15, fontWeight: '800' },
  timePill: { marginLeft: 8, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(73,84,188,0.10)' },
  timePillText: { fontSize: 10, lineHeight: 15, fontWeight: '900' },
  nextCourseText: { fontSize: 16, lineHeight: 24, fontWeight: '900' },
  nextTimeText: { fontSize: 14, lineHeight: 20, fontWeight: '900' },
  smallCardsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  smallCard: {
    width: '47.5%',
    aspectRatio: 1,
    marginBottom: 6,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 20,
    alignItems: 'flex-start',
    borderRadius: 34,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'flex-start',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.08,
    shadowRadius: 28,
    elevation: 6,
  },
  smallCardHeader: { flexDirection: 'row', alignItems: 'center', width: '100%', minHeight: 24 },
  smallIcon: { marginRight: 8 },
  smallCardLabel: { fontSize: 14, lineHeight: 20, fontWeight: '800' },
  smallCardBody: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    paddingTop: 4,
    paddingBottom: 8,
  },
  smallCardValue: { fontSize: 34, lineHeight: 40, fontWeight: '900' },
  smallCardCaption: { fontSize: 14, lineHeight: 20, fontWeight: '700' },
  busValueRow: { flexDirection: 'row', alignItems: 'baseline' },
  busCardValueChinese: { fontSize: 34, lineHeight: 40, fontWeight: '900', marginRight: 3 },
  busCardValueNumber: { fontSize: 34, lineHeight: 40, fontWeight: '900' },
  gridLoadingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
});
