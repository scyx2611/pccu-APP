import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import AppSymbol from '../../../components/AppSymbol';
import { useTheme } from '../../../contexts/ThemeContext';
import { CourseData } from '../../pccu/parsers/pccuScraper';
import { getCourses } from '../../schedule/storage/scheduleStorage';
import GlobalScraperWebView from '../../pccu/engine/GlobalScraperWebView';
import { useTrafficData } from '../../traffic/hooks/useTrafficData';
import {
  TrafficStopArrival,
  formatTrafficUpdatedAt,
  pickBestTrafficArrival,
} from '../../traffic/types';
import { SemesterGrade } from '../../../services/scraper';
import { getGrades } from '../../../services/GradeStore';
import { getHideHomeGradeDetails } from '../../settings/storage/privacySettings';
import { usePendingCount } from '../../tutoring/hooks/useTutoringData';
import TutoringPendingBadge from '../../tutoring/components/TutoringPendingBadge';

type NextClassInfo = {
  course: CourseData;
  start: Date;
  end: Date;
  startLabel: string;
  endLabel: string;
  dayLabel: string;
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

const formatTrafficSummaryLine = (prefix: string, arrival: TrafficStopArrival | null) => {
  if (!arrival) return `${prefix} 暫無資料`;
  return `${prefix} ${arrival.stopName} ${arrival.etaText}`;
};

const HIDDEN_AVERAGE_VALUE = '•••';
const HIDDEN_RANK_VALUE = '••/••';
const maskAverageValue = (value?: string | null) => (value ? HIDDEN_AVERAGE_VALUE : '--');
const maskRankValue = (value?: string | null) => (value ? HIDDEN_RANK_VALUE : '--');

const findNextClass = (courses: CourseData[], now: Date): NextClassInfo | null => {
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
      startLabel: formatTime(slot.start[0], slot.start[1]),
      endLabel: formatTime(endSlot.end[0], endSlot.end[1]),
      dayLabel,
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
  const [weather, setWeather] = useState<{ temp?: number; code?: number } | null>(null);
  const [userName, setUserName] = useState('');
  const [now, setNow] = useState(new Date());
  const trafficPressAnim = useRef(new Animated.Value(0)).current;
  const pressAnim = useRef(new Animated.Value(0)).current;
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

  useEffect(() => {
    void refreshCourses();
    void refreshGrades();
    void refreshUser();
    void refreshPrivacy();
  }, [refreshCourses, refreshGrades, refreshPrivacy, refreshUser]);

  useFocusEffect(
    useCallback(() => {
      void refreshCourses();
      void refreshGrades();
      void refreshUser();
      void refreshPrivacy();
    }, [refreshCourses, refreshGrades, refreshPrivacy, refreshUser])
  );

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

  const nextClass = useMemo(() => findNextClass(courses, now), [courses, now]);

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

  const gradePressStyle: any = {
    transform: [{ scale: gradePressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] }) }],
  };
  const { count: pendingTutoringCount } = usePendingCount();

  const currentHour = now.getHours();
  const greeting = currentHour >= 18 || currentHour < 5 ? '晚上好' : currentHour >= 12 ? '下午好' : '早安';
  const greetingIcon = currentHour >= 18 || currentHour < 5 ? 'moon.stars.fill' : 'sun.max.fill';
  const greetingColor = currentHour >= 18 || currentHour < 5 ? theme.primary : theme.warning;
  const weatherText = weather?.temp !== undefined
    ? `台北約 ${weather.temp}°C，出門前記得留意天氣變化。`
    : '今天也一起把校園資訊整理好。';
  const trafficFooterText = traffic.snapshot
    ? `${traffic.error ? '較早資料' : '更新'} ${formatTrafficUpdatedAt(traffic.snapshot.updatedAt)}`
    : '紅 5 即時資訊';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <GlobalScraperWebView />
      <View style={[styles.heroCard, { backgroundColor: theme.card, shadowColor: theme.text }]}>
        <View style={styles.cardHeader}>
          <AppSymbol name={greetingIcon} size={28} tintColor={greetingColor} fallback={<Text>Hi</Text>} />
          <Text style={[styles.cardTitle, { color: theme.text }]} numberOfLines={1}>{greeting}，{userName}</Text>
        </View>
        <Text style={[styles.cardText, { color: theme.textSub }]}>{weatherText}</Text>
      </View>

      <View style={styles.gridContainer}>
        <AnimatedPressable
          onPress={openTraffic}
          onPressIn={() => Animated.spring(trafficPressAnim, { toValue: 1, useNativeDriver: true }).start()}
          onPressOut={() => Animated.spring(trafficPressAnim, { toValue: 0, useNativeDriver: true }).start()}
          style={[styles.gridCard, { backgroundColor: theme.card, shadowColor: theme.text }, trafficPressStyle]}
        >
          <AppSymbol name="bus.fill" size={32} tintColor={theme.warning} style={styles.gridIcon} fallback={<Text>Bus</Text>} />
          <Text style={[styles.gridTitle, { color: theme.text }]} numberOfLines={1}>交通動態</Text>
          {traffic.loading && !traffic.snapshot ? (
            <View style={styles.gridLoadingRow}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={[styles.gridMeta, { color: theme.textSub, marginLeft: 6 }]}>載入紅 5 中...</Text>
            </View>
          ) : traffic.snapshot ? (
            <>
              <Text style={[styles.gridSub, { color: theme.textSub }]} numberOfLines={1}>
                {formatTrafficSummaryLine('下山', downhillSummary)}
              </Text>
              <Text style={[styles.gridMeta, { color: theme.textSub }]} numberOfLines={1}>
                {formatTrafficSummaryLine('上山', uphillSummary)}
              </Text>
              <Text style={[styles.gridMeta, { color: theme.textSub }]} numberOfLines={1}>{trafficFooterText}</Text>
            </>
          ) : (
            <>
              <Text style={[styles.gridSub, { color: theme.textSub }]} numberOfLines={1}>暫時讀不到紅 5</Text>
              <Text style={[styles.gridMeta, { color: theme.textSub }]} numberOfLines={1}>點開查看官方頁面與詳情</Text>
            </>
          )}
        </AnimatedPressable>

        <View style={[styles.gridCard, { backgroundColor: theme.card, shadowColor: theme.text }]}>
          <AppSymbol name="books.vertical.fill" size={32} tintColor={theme.purple} style={styles.gridIcon} fallback={<Text>Book</Text>} />
          <Text style={[styles.gridTitle, { color: theme.text }]} numberOfLines={1}>學習資源</Text>
          <Text style={[styles.gridSub, { color: theme.textSub }]} numberOfLines={1}>圖書館 / Moodle</Text>
        </View>

        <AnimatedPressable
          onPress={openSchedule}
          onPressIn={() => Animated.spring(pressAnim, { toValue: 1, useNativeDriver: true }).start()}
          onPressOut={() => Animated.spring(pressAnim, { toValue: 0, useNativeDriver: true }).start()}
          style={[styles.gridCard, { backgroundColor: theme.card, shadowColor: theme.text }, pressStyle]}
        >
          <AppSymbol name="clock.fill" size={32} tintColor={theme.primary} style={styles.gridIcon} fallback={<Text>課表</Text>} />
          <Text style={[styles.gridTitle, { color: theme.text }]} numberOfLines={1}>下節課</Text>
          {nextClass ? (
            <>
              <Text style={[styles.gridSub, { color: theme.textSub }]} numberOfLines={1}>{normalizeText(nextClass.course.name)}</Text>
              <Text style={[styles.gridMeta, { color: theme.textSub }]} numberOfLines={1}>{normalizeText(nextClass.course.location) || '未知地點'}</Text>
              <Text style={[styles.gridMeta, { color: theme.textSub }]} numberOfLines={1}>{`${nextClass.dayLabel} ${nextClass.startLabel}-${nextClass.endLabel}`}</Text>
            </>
          ) : scheduleLoading ? (
            <View style={styles.gridLoadingRow}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={[styles.gridMeta, { color: theme.textSub, marginLeft: 6 }]}>讀取快取中...</Text>
            </View>
          ) : (
            <Text style={[styles.gridSub, { color: theme.textSub }]}>尚未同步課表</Text>
          )}
        </AnimatedPressable>

        <AnimatedPressable
          onPress={openGrades}
          onPressIn={() => Animated.spring(gradePressAnim, { toValue: 1, useNativeDriver: true }).start()}
          onPressOut={() => Animated.spring(gradePressAnim, { toValue: 0, useNativeDriver: true }).start()}
          style={[styles.gridCard, { backgroundColor: theme.card, shadowColor: theme.text }, gradePressStyle]}
        >
          <AppSymbol name="medal.fill" size={32} tintColor={theme.warning} style={styles.gridIcon} fallback={<Text>成績</Text>} />
          <Text style={[styles.gridTitle, { color: theme.text }]} numberOfLines={1}>成績</Text>
          {gradeSummary ? (
            <>
              <Text style={[styles.gridSub, { color: theme.textSub }]} numberOfLines={1}>平均 {gradeSummary.avg || '--'}</Text>
              <Text style={[styles.gridMeta, { color: theme.textSub }]} numberOfLines={1}>班排 {gradeSummary.classRank || '--'}</Text>
              <Text style={[styles.gridMeta, { color: theme.textSub }]} numberOfLines={1}>系排 {gradeSummary.deptRank || '--'}</Text>
            </>
          ) : gradeLoading ? (
            <View style={styles.gridLoadingRow}>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={[styles.gridMeta, { color: theme.textSub, marginLeft: 6 }]}>讀取成績中...</Text>
            </View>
          ) : (
            <Text style={[styles.gridSub, { color: theme.textSub }]}>尚未同步成績</Text>
          )}
        </AnimatedPressable>

        <AnimatedPressable
          onPress={openTutoring}
          style={[styles.gridCard, { backgroundColor: theme.card, shadowColor: theme.text }]}
        >
          <View style={styles.gridIconRow}>
            <AppSymbol name="book.fill" size={32} tintColor={theme.success} style={styles.gridIcon} fallback={<Text>課輔</Text>} />
            <TutoringPendingBadge count={pendingTutoringCount} size="small" />
          </View>
          <Text style={[styles.gridTitle, { color: theme.text }]} numberOfLines={1}>課業輔導</Text>
          <Text style={[styles.gridSub, { color: theme.textSub }]} numberOfLines={1}>公告 / 教材 / 作業</Text>
          <Text style={[styles.gridMeta, { color: theme.textSub }]} numberOfLines={1}>點此查看課程詳情</Text>
        </AnimatedPressable>
      </View>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16 },
  bottomSpacer: { height: 120 },
  heroCard: {
    borderRadius: 32,
    padding: 24,
    marginBottom: 20,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 22, fontWeight: '700', marginLeft: 8 },
  cardText: { fontSize: 16, lineHeight: 24 },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  gridCard: {
    width: '47.5%',
    minHeight: 160,
    marginBottom: 16,
    padding: 20,
    alignItems: 'flex-start',
    borderRadius: 28,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  gridIcon: { marginBottom: 16 },
  gridIconRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  gridTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
  gridSub: { fontSize: 14, fontWeight: '500' },
  gridMeta: { fontSize: 13, marginTop: 4 },
  gridLoadingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
});
