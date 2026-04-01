import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';

import AppSymbol from '../../../shared/components/AppSymbol';
import { useTheme } from '../../../providers/theme/ThemeProvider';
import { useTutoringStore } from '../store/useTutoringStore';
import { useTutoringSync } from '../hooks/useTutoringSync';
import TutoringCourseCard from '../components/TutoringCourseCard';
import TutoringPendingBadge from '../components/TutoringPendingBadge';
import { buildUpdatedAtText } from '../../../utils/updatedAt';

export default function TutoringScreen() {
  const webViewRef = useRef<WebView>(null);
  const [webViewKey, setWebViewKey] = useState(0);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const { theme } = useTheme();

  // Zustand store
  const courses = useTutoringStore((s) => s.courses);
  const pendingAssignments = useTutoringStore((s) => s.pendingAssignments);
  const semester = useTutoringStore((s) => s.semester);
  const welcomeText = useTutoringStore((s) => s.welcomeText);
  const lastSyncedAt = useTutoringStore((s) => s.lastSyncedAt);
  const syncStatus = useTutoringStore((s) => s.syncStatus);
  const syncPhase = useTutoringStore((s) => s.syncPhase);
  const hydrate = useTutoringStore((s) => s.hydrate);

  // Sync hook
  const { statusText, handleMessage, handleNavChange, startSync } = useTutoringSync({
    webViewRef,
  });

  const isSyncing = syncStatus === 'syncing' || syncPhase !== 'idle' && syncPhase !== 'complete' && syncPhase !== 'error';
  const loading = isSyncing && courses.length === 0;

  const updatedAtLineText = buildUpdatedAtText({
    updatedAt: lastSyncedAt?.getTime() ?? null,
    isUpdating: pullRefreshing || loading,
    updatingLabel: '正在更新課業資料...',
    emptyLabel: '尚未同步課業資料',
  });

  // Hydrate store from cache on mount
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Auto-sync on focus
  useFocusEffect(
    useCallback(() => {
      let active = true;

      const syncOnFocus = async () => {
        if (!active) return;
        // Silent sync if we have cached data
        await startSync({ silent: courses.length > 0 });
      };

      void syncOnFocus();

      return () => {
        active = false;
      };
    }, [startSync, courses.length])
  );

  const handlePullRefresh = useCallback(() => {
    setPullRefreshing(true);
    void startSync({ manual: true, silent: false }).finally(() => {
      setPullRefreshing(false);
    });
  }, [startSync]);

  const handleCoursePress = useCallback((courseCode: string) => {
    router.push(`/tutoring/${courseCode}`);
  }, []);

  const renderSyncWebView = () => (
    <WebView
      key={webViewKey}
      ref={webViewRef}
      style={styles.hiddenWebViewInner}
      source={{ uri: 'https://ecampus.pccu.edu.tw/eCampus/default.aspx' }}
      originWhitelist={['*']}
      sharedCookiesEnabled
      thirdPartyCookiesEnabled
      domStorageEnabled
      cacheEnabled={false}
      onNavigationStateChange={handleNavChange}
      onMessage={handleMessage}
    />
  );

  return (
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
      {isSyncing ? <View style={styles.hiddenWebView}>{renderSyncWebView()}</View> : null}

      <View style={[styles.heroCard, { backgroundColor: theme.card, shadowColor: theme.text }]}>
        <View style={styles.heroHeader}>
          <AppSymbol name="book.fill" size={28} tintColor={theme.primary} fallback={<Text>📚</Text>} />
          <Text style={[styles.heroTitle, { color: theme.text }]}>課業輔導</Text>
        </View>
        <Text style={[styles.heroSubtitle, { color: theme.textSub }]}>
          {semester ? `${semester}學期` : '查看課程公告、教材與作業'}
        </Text>
        {welcomeText ? (
          <Text style={[styles.welcomeText, { color: theme.textSub, marginTop: 4 }]}>
            {welcomeText}
          </Text>
        ) : null}
      </View>

      {pendingAssignments.length > 0 && (
        <View style={[styles.pendingCard, { backgroundColor: theme.card, shadowColor: theme.text }]}>
          <View style={styles.pendingHeader}>
            <Text style={[styles.pendingTitle, { color: theme.text }]}>待辦作業</Text>
            <TutoringPendingBadge count={pendingAssignments.length} size="medium" />
          </View>
          {pendingAssignments.slice(0, 3).map((assignment, index) => (
            <View key={`${assignment.courseCode}-${assignment.homeSn}-${index}`} style={styles.pendingItem}>
              <Text style={[styles.pendingCourseName, { color: theme.textSub }]} numberOfLines={1}>
                {assignment.courseName}
              </Text>
              <Text style={[styles.pendingAssignmentTitle, { color: theme.text }]} numberOfLines={1}>
                {assignment.title}
              </Text>
              <Text style={[styles.pendingDueDate, { color: theme.danger || '#FF3B30' }]}>
                截止：{assignment.endAt || '未定'}
              </Text>
            </View>
          ))}
          {pendingAssignments.length > 3 && (
            <Text style={[styles.pendingMore, { color: theme.textSub }]}>
              還有 {pendingAssignments.length - 3} 項待辦作業...
            </Text>
          )}
        </View>
      )}

      {loading ? (
        <View style={[styles.statusCard, { backgroundColor: theme.card, shadowColor: theme.text }]}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={[styles.statusText, { color: theme.textSub, marginTop: 10 }]}>
            {statusText || '正在讀取課業資料...'}
          </Text>
        </View>
      ) : null}

      {!loading && statusText && (statusText.includes('失敗') || statusText.includes('請先登入')) ? (
        <View style={[styles.noticeCard, { backgroundColor: theme.card, shadowColor: theme.text }]}>
          <Text style={[styles.noticeTitle, { color: theme.text }]}>同步狀態</Text>
          <Text style={[styles.noticeText, { color: theme.textSub }]}>{statusText}</Text>
        </View>
      ) : null}

      {courses.length === 0 && !loading && !statusText && syncPhase === 'idle' ? (
        <View style={styles.emptyState}>
          <AppSymbol name="book.closed.fill" size={60} tintColor={theme.textSub} fallback={<Text>📚</Text>} />
          <Text style={[styles.emptyText, { color: theme.textSub }]}>目前沒有課程資料</Text>
        </View>
      ) : null}

      {courses.length > 0 && (
        <View style={styles.courseList}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>我的課程</Text>
          {courses.map((course) => {
            const pendingCount = pendingAssignments.filter(a => a.courseCode === course.courseCode).length;
            return (
              <TutoringCourseCard
                key={course.courseCode}
                course={course}
                pendingCount={pendingCount}
                onPress={handleCoursePress}
              />
            );
          })}
        </View>
      )}

      <Text style={[styles.updatedText, { color: theme.textSub }]}>{updatedAtLineText}</Text>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16 },
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
  heroHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  heroTitle: { fontSize: 22, fontWeight: '700', marginLeft: 8 },
  heroSubtitle: { fontSize: 14 },
  welcomeText: { fontSize: 13 },
  pendingCard: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  pendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  pendingTitle: { fontSize: 18, fontWeight: '700' },
  pendingItem: {
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  pendingCourseName: { fontSize: 12, marginBottom: 2 },
  pendingAssignmentTitle: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  pendingDueDate: { fontSize: 12, fontWeight: '500' },
  pendingMore: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
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
  emptyState: { alignItems: 'center', marginTop: 40, marginBottom: 40 },
  emptyText: { marginTop: 16, fontSize: 14 },
  courseList: { marginTop: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 14, marginLeft: 4 },
  updatedText: { marginTop: 16, marginBottom: 8, fontSize: 13, textAlign: 'center' },
  bottomSpacer: { height: 80 },
});
