import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';

import { useTheme } from '../../../providers/theme/ThemeProvider';
import { useTutoringStore } from '../store/useTutoringStore';
import { useTutoringSync } from '../hooks/useTutoringSync';
import TutoringCourseCard from '../components/TutoringCourseCard';
import { buildUpdatedAtText } from '../../../utils/updatedAt';
import { buildTutoringCourseCards } from '../utils/tutoringCourseCards';

const TUTORING_FRESH_MS = 5 * 60 * 1000;

function isTutoringDataFresh(lastSyncedAt: Date | null) {
  return !!lastSyncedAt && Date.now() - lastSyncedAt.getTime() < TUTORING_FRESH_MS;
}

export default function TutoringScreen() {
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const { theme } = useTheme();

  const courses = useTutoringStore((s) => s.courses);
  const courseDetails = useTutoringStore((s) => s.courseDetails);
  const pendingAssignments = useTutoringStore((s) => s.pendingAssignments);
  const lastSyncedAt = useTutoringStore((s) => s.lastSyncedAt);
  const syncStatus = useTutoringStore((s) => s.syncStatus);
  const syncPhase = useTutoringStore((s) => s.syncPhase);
  const error = useTutoringStore((s) => s.error);
  const hydrate = useTutoringStore((s) => s.hydrate);

  const { sync, syncCourseDetail } = useTutoringSync();

  const courseCards = useMemo(
    () => buildTutoringCourseCards(courses, courseDetails),
    [courses, courseDetails],
  );

  const statusText = useMemo(() => {
    switch (syncPhase) {
      case 'logging_in':
        return '登入課輔中';
      case 'fetching_courses':
        return '同步課程中';
      case 'fetching_details':
        return '預載課程內容中';
      case 'complete':
        return '同步完成';
      case 'error':
        return error ?? '同步失敗';
      default:
        return '';
    }
  }, [syncPhase, error]);

  const isSyncing =
    syncStatus === 'syncing' ||
    (syncPhase !== 'idle' && syncPhase !== 'complete' && syncPhase !== 'error');
  const loading = isSyncing && courses.length === 0;

  const updatedAtLineText = buildUpdatedAtText({
    updatedAt: lastSyncedAt?.getTime() ?? null,
    isUpdating: pullRefreshing || isSyncing,
    updatingLabel: '同步課輔資料中...',
    emptyLabel: '尚未同步課輔資料',
  });
  const syncLineText = statusText || updatedAtLineText;

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const syncOnFocus = async () => {
        if (!active) return;
        if (courses.length > 0 && isTutoringDataFresh(lastSyncedAt)) return;
        await sync({ silent: courses.length > 0 });
      };

      void syncOnFocus();

      return () => {
        active = false;
      };
    }, [sync, courses.length, lastSyncedAt]),
  );

  const handlePullRefresh = useCallback(() => {
    setPullRefreshing(true);
    const refreshAll = async () => {
      await sync({ silent: false, force: true, priority: 5 });
      const refreshedCourses = useTutoringStore.getState().courses;

      for (const course of refreshedCourses) {
        const courseCode = String(course.courseCode || '').trim();
        if (!courseCode) continue;
        await syncCourseDetail(courseCode, { silent: true, force: true, priority: 6 });
      }
    };

    void refreshAll().finally(() => {
      setPullRefreshing(false);
    });
  }, [sync, syncCourseDetail]);

  const handleCoursePress = useCallback((courseCode: string) => {
    router.push(`/tutoring/${courseCode}`);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView
        style={styles.container}
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
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>課輔專區</Text>
          <Text style={[styles.subtitle, { color: theme.textSub }]}>
            你還有{pendingAssignments.length}項作業未繳交
          </Text>
        </View>

        <View style={styles.cardsContainer}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>所有課程</Text>
          </View>

          {loading ? (
            <View
              style={[
                styles.statusCard,
                { backgroundColor: theme.card, borderColor: '#FFFFFF', shadowColor: theme.text },
              ]}
            >
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={[styles.statusCardText, { color: theme.textSub }]}>
                {statusText || '正在整理課輔課程...'}
              </Text>
            </View>
          ) : null}

          {!loading && courseCards.length === 0 ? (
            <View
              style={[
                styles.emptyCard,
                { backgroundColor: theme.card, borderColor: '#FFFFFF', shadowColor: theme.text },
              ]}
            >
              <Text style={[styles.emptyTitle, { color: theme.text }]}>目前沒有課程資料</Text>
              <Text style={[styles.emptyText, { color: theme.textSub }]}>
                下拉刷新或等待背景同步完成後，課程會顯示在這裡。
              </Text>
            </View>
          ) : null}

          {courseCards.map(({ course, latestMessage }) => (
            <TutoringCourseCard
              key={course.courseCode}
              course={course}
              latestMessage={latestMessage}
              onPress={handleCoursePress}
            />
          ))}

          <Text
            style={[
              styles.syncLine,
              { color: syncPhase === 'error' ? theme.danger || '#FF3B30' : theme.textSub },
            ]}
          >
            {syncLineText}
          </Text>

          <View style={styles.bottomSpacer} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {},
  header: {
    marginTop: -44,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  title: {
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '900',
    marginBottom: 8,
    letterSpacing: -0.8,
  },
  subtitle: {
    fontSize: 18,
    lineHeight: 29,
    fontWeight: '600',
  },
  sectionHeader: {
    marginBottom: 14,
    paddingHorizontal: 8,
  },
  sectionTitle: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  statusCard: {
    borderRadius: 34,
    padding: 25,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.1,
    shadowRadius: 26,
    elevation: 12,
  },
  statusCardText: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
  },
  emptyCard: {
    borderRadius: 34,
    padding: 25,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.1,
    shadowRadius: 26,
    elevation: 12,
  },
  emptyTitle: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '900',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
  },
  syncLine: {
    marginTop: 8,
    marginBottom: 8,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    fontWeight: '700',
  },
  cardsContainer: { paddingHorizontal: 16 },
  bottomSpacer: { height: 80 },
});
