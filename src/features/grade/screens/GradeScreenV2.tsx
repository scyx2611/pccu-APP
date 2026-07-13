import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AppSymbol from '../../../shared/components/AppSymbol';
import DebugStamp from '../../../shared/components/DebugStamp';
import { useTheme } from '../../../providers/theme/ThemeProvider';
import { getDeveloperDebugEnabled } from '../../settings/storage/developerSettings';
import { buildUpdatedAtText } from '../../../utils/updatedAt';
import { type SemesterGrade } from '../../pccu/parsers/pccuScraper';
import {
  clearScraperDebugPreviewFrame,
  getScraperDebugRuntimeState,
  subscribeScraperDebugRuntimeState,
  type ScraperDebugRuntimeState,
} from '../../pccu/engine/scraperDebugPreview';
import { useGradeStore } from '../store/useGradeStore';
import { useGradeSync } from '../hooks/useGradeSync';

type GradeScreenProps = {
  showPreview?: boolean;
  onScrollY?: Animated.Value;
};

const FAIL_TEXT = new Set(['不及格', '未通過', 'F']);
const PRE_ENROLLMENT_TITLE = '入學前抵免';

const isFailScore = (value: string) => {
  if (FAIL_TEXT.has(value)) return true;
  const num = Number(value);
  return Number.isFinite(num) && num < 60;
};

const shouldUseFailColor = (semesterTitle: string, score: string) => {
  if (semesterTitle.includes(PRE_ENROLLMENT_TITLE)) return false;
  return isFailScore(score);
};

const isPassedScore = (semesterTitle: string, score: string) => {
  const normalizedScore = score.trim().toUpperCase();

  if (semesterTitle.includes(PRE_ENROLLMENT_TITLE) && score.trim() === '2') {
    return true;
  }

  if (normalizedScore === 'P') return true;
  if (normalizedScore === 'F') return false;

  const num = Number(score);
  if (Number.isFinite(num)) return num >= 60;

  return score.trim().length > 0 && !isFailScore(score);
};

const formatCourseScore = (semesterTitle: string, score: string) => {
  const normalizedScore = score.trim().toUpperCase();

  if (semesterTitle.includes(PRE_ENROLLMENT_TITLE) && score.trim() === '2') {
    return '已抵免';
  }

  if (normalizedScore === 'P') return '通過';
  if (normalizedScore === 'F') return '未通過';

  return score || '--';
};

const normalizeRank = (value?: string) => (value ? value.replace(/\s+/g, '') : '');
const isPreEnrollmentSemester = (title: string) => title.includes(PRE_ENROLLMENT_TITLE);

const getSemesterCredits = (semester: SemesterGrade) => {
  if (semester.stats.earnedCredits) return semester.stats.earnedCredits;

  const total = semester.courses.reduce((sum, course) => {
    const credits = Number(course.credits);
    return Number.isFinite(credits) ? sum + credits : sum;
  }, 0);

  if (!total) return '';
  return Number.isInteger(total) ? String(total) : total.toFixed(1);
};

const getCumulativeCredits = (semesters: SemesterGrade[]) => {
  const total = semesters.reduce((sum, semester) => {
    const credits = Number(getSemesterCredits(semester));
    return Number.isFinite(credits) ? sum + credits : sum;
  }, 0);

  if (!total) return '';
  return Number.isInteger(total) ? String(total) : total.toFixed(1);
};

const getPassSummary = (semesters: SemesterGrade[]) => {
  const courses = semesters.flatMap((semester) =>
    semester.courses.map((course) => ({
      semesterTitle: semester.title,
      score: course.score || '',
    })),
  );

  if (!courses.length) return '--';

  const passedCount = courses.filter((course) =>
    isPassedScore(course.semesterTitle, course.score),
  ).length;
  return `${passedCount}/${courses.length}`;
};

export default function GradeScreenV2({ showPreview }: GradeScreenProps) {
  const grades = useGradeStore((state) => state.grades);
  const lastSyncedAt = useGradeStore((state) => state.lastSyncedAt);
  const syncStatus = useGradeStore((state) => state.syncStatus);
  const error = useGradeStore((state) => state.error);
  const hydrate = useGradeStore((state) => state.hydrate);
  const resetSync = useGradeStore((state) => state.resetSync);
  const { sync } = useGradeSync();
  const { theme } = useTheme();

  const [resolvedShowPreview, setResolvedShowPreview] = useState(showPreview ?? false);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [debugRuntime, setDebugRuntime] = useState<ScraperDebugRuntimeState>(() =>
    getScraperDebugRuntimeState(),
  );

  const latestSemester = grades[0] || null;
  const isSyncing = syncStatus === 'syncing';
  const loading = isSyncing && grades.length === 0;
  const showDebug = __DEV__ && resolvedShowPreview;

  const updatedAtText = buildUpdatedAtText({
    updatedAt: lastSyncedAt,
    isUpdating: pullRefreshing || isSyncing,
    updatingLabel: '正在更新成績...',
    emptyLabel: '尚未同步成績',
  });

  const shouldShowNotice = !loading && !!error && (grades.length === 0 || error.includes('失敗'));
  const statusText = error || '';
  const summaryIconTint = theme.warning;

  const summaryItems = useMemo(() => {
    if (!latestSemester) return [];
    return [
      { label: '平均', value: latestSemester.stats.average || '--' },
      { label: '班排', value: normalizeRank(latestSemester.stats.classRank) || '--' },
      { label: '通過數', value: getPassSummary(grades) },
      { label: '累計學分', value: getCumulativeCredits(grades) || '--' },
    ];
  }, [grades, latestSemester]);

  const orderedGrades = useMemo(() => {
    const preEnrollment: SemesterGrade[] = [];
    const regular: SemesterGrade[] = [];

    grades.forEach((semester) => {
      if (isPreEnrollmentSemester(semester.title)) {
        preEnrollment.push(semester);
      } else {
        regular.push(semester);
      }
    });

    return [...preEnrollment, ...regular];
  }, [grades]);

  const handlePullRefresh = useCallback(() => {
    setPullRefreshing(true);
    resetSync();
    sync({ priority: 1 }).finally(() => {
      setPullRefreshing(false);
    });
  }, [sync, resetSync]);

  useEffect(() => {
    clearScraperDebugPreviewFrame();
  }, [showDebug]);

  useEffect(() => subscribeScraperDebugRuntimeState(setDebugRuntime), []);

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
    }, [showPreview]),
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const syncOnFocus = async () => {
        await hydrate();
        if (!active) return;
        await sync({ silent: true });
      };

      void syncOnFocus();

      return () => {
        active = false;
      };
    }, [hydrate, sync]),
  );

  const renderSummaryCard = () => {
    if (!latestSemester) return null;

    return (
      <View style={styles.summaryStack}>
        <View style={styles.summaryGrid}>
          {summaryItems.map((item) => (
            <View
              key={item.label}
              style={[
                styles.summaryChip,
                { backgroundColor: theme.syncBtnBg, borderColor: theme.border },
              ]}
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
        refreshControl={
          <RefreshControl
            refreshing={pullRefreshing}
            onRefresh={handlePullRefresh}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <View style={[styles.heroCard, { backgroundColor: theme.card, shadowColor: theme.text }]}>
          <View style={styles.heroHeader}>
            <AppSymbol name="medal.fill" size={28} tintColor={summaryIconTint} />
            <Text style={[styles.heroTitle, { color: theme.text }]}>成績概覽</Text>
          </View>
          {renderSummaryCard()}
        </View>

        {showDebug ? (
          <View
            style={[styles.noticeCard, { backgroundColor: theme.card, shadowColor: theme.text }]}
          >
            <Text style={[styles.noticeTitle, { color: theme.text }]}>Debug 資訊</Text>
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

        {loading ? (
          <View
            style={[styles.statusCard, { backgroundColor: theme.card, shadowColor: theme.text }]}
          >
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={[styles.statusText, { color: theme.textSub }]}>正在載入歷年成績...</Text>
          </View>
        ) : null}

        {shouldShowNotice ? (
          <View
            style={[styles.noticeCard, { backgroundColor: theme.card, shadowColor: theme.text }]}
          >
            <Text style={[styles.noticeTitle, { color: theme.text }]}>同步狀態</Text>
            <Text style={[styles.noticeText, { color: theme.textSub }]}>{statusText}</Text>
          </View>
        ) : null}

        {grades.length === 0 && !loading ? (
          <View
            style={[styles.sectionCard, { backgroundColor: theme.card, shadowColor: theme.text }]}
          >
            <Text style={[styles.cardTitle, { color: theme.text }]}>尚無成績資料</Text>
            <Text style={[styles.emptyText, { color: theme.textSub }]}>
              目前還沒有可顯示的歷年成績，請下拉或稍後重新同步。
            </Text>
          </View>
        ) : null}

        {orderedGrades.map((semester, index) => {
          const isPreEnrollment = isPreEnrollmentSemester(semester.title);
          const metaItems = [
            !isPreEnrollment ? `平均 ${semester.stats.average || '--'}` : '',
            semester.stats.classRank ? `班排 ${normalizeRank(semester.stats.classRank)}` : '',
            semester.stats.deptRank ? `系排 ${normalizeRank(semester.stats.deptRank)}` : '',
          ].filter(Boolean);

          return (
            <View
              key={`${semester.title}-${index}`}
              style={[
                styles.sectionCard,
                isPreEnrollment ? styles.preEnrollmentCard : null,
                { backgroundColor: theme.card, shadowColor: theme.text },
              ]}
            >
              <View
                style={[styles.sectionHeader, isPreEnrollment ? styles.preEnrollmentHeader : null]}
              >
                <View style={styles.sectionHeading}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>{semester.title}</Text>
                  <Text style={[styles.sectionMeta, { color: theme.textSub }]}>
                    {isPreEnrollment
                      ? `${semester.courses.length} 筆抵免`
                      : `${semester.courses.length} 門課程`}
                  </Text>
                </View>
              </View>

              {metaItems.length > 0 ? (
                <View
                  style={[styles.metaRow, isPreEnrollment ? styles.preEnrollmentMetaRow : null]}
                >
                  {metaItems.map((item) => (
                    <Text
                      key={`${semester.title}-${item}`}
                      style={[
                        styles.metaPill,
                        { color: theme.textSub, backgroundColor: theme.syncBtnBg },
                      ]}
                    >
                      {item}
                    </Text>
                  ))}
                </View>
              ) : null}

              <View
                style={[
                  styles.courseStack,
                  isPreEnrollment ? styles.preEnrollmentCourseStack : null,
                ]}
              >
                {semester.courses.map((course, courseIndex) => (
                  <View
                    key={`${semester.title}-${course.code}-${courseIndex}`}
                    style={[
                      styles.courseCard,
                      isPreEnrollment ? styles.preEnrollmentCourseCard : null,
                      { backgroundColor: theme.syncBtnBg, borderColor: theme.border },
                    ]}
                  >
                    <View style={styles.courseHeader}>
                      <View style={styles.courseMain}>
                        <Text style={[styles.courseName, { color: theme.text }]}>
                          {course.name}
                        </Text>
                        <Text style={[styles.courseMeta, { color: theme.textSub }]}>
                          {[
                            course.code || '',
                            course.type || '',
                            course.credits ? `${course.credits} 學分` : '',
                          ]
                            .filter(Boolean)
                            .join(' · ') || '尚無完整課程資訊'}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.courseScore,
                          {
                            color: shouldUseFailColor(semester.title, course.score)
                              ? theme.danger
                              : theme.text,
                          },
                        ]}
                      >
                        {formatCourseScore(semester.title, course.score)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          );
        })}

        <Text style={[styles.updatedText, { color: theme.textSub }]}>{updatedAtText}</Text>
        <View style={styles.bottomSpacer} />
      </ScrollView>
      {showDebug ? <DebugStamp label="DBG-GRADE-V2" /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 80 },
  debugText: {
    fontSize: 12,
    lineHeight: 18,
  },
  debugPreviewSlot: {
    minHeight: 164,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  debugPreviewHint: {
    marginTop: 10,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
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
  summaryStack: { marginTop: 14 },
  updatedText: { marginTop: 6, fontSize: 13, textAlign: 'center' },
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
  cardTitle: { fontSize: 18, fontWeight: '700' },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  summaryChip: {
    width: '48%',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  summaryChipLabel: { fontSize: 12, fontWeight: '600' },
  summaryChipValue: { fontSize: 18, fontWeight: '700', marginTop: 6 },
  sectionCard: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  preEnrollmentCard: { paddingTop: 18, paddingBottom: 18 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  preEnrollmentHeader: { marginBottom: 10 },
  sectionHeading: { flex: 1, paddingRight: 12 },
  sectionMeta: { marginTop: 6, fontSize: 13 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  preEnrollmentMetaRow: { marginBottom: 12 },
  metaPill: {
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: '600',
  },
  courseStack: { gap: 10 },
  preEnrollmentCourseStack: { gap: 8 },
  courseCard: { borderRadius: 20, borderWidth: 1, padding: 16 },
  preEnrollmentCourseCard: { paddingVertical: 14 },
  courseHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  courseMain: { flex: 1, paddingRight: 16 },
  courseName: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
  courseMeta: { fontSize: 13, marginTop: 6, lineHeight: 18 },
  courseScore: { fontSize: 24, fontWeight: '800', minWidth: 56, textAlign: 'right' },
  emptyText: { marginTop: 10, fontSize: 14, lineHeight: 21 },
  bottomSpacer: { height: 20 },
});
