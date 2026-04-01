import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from '../../../providers/theme/ThemeProvider';
import { useTutoringSync } from '../hooks/useTutoringSync';
import { useTutoringStore } from '../store/useTutoringStore';
import TutoringAnnouncementItem from '../components/TutoringAnnouncementItem';
import TutoringMaterialItem from '../components/TutoringMaterialItem';
import TutoringAssignmentItem from '../components/TutoringAssignmentItem';
import AppSymbol from '../../../shared/components/AppSymbol';
import {
  TutoringAnnouncement,
  TutoringMaterial,
  TutoringAssignment,
} from '../types';

interface TutoringCourseDetailScreenProps {
  courseCode: string;
  courseName?: string;
  department?: string;
  onBack?: () => void;
}

type TabType = 'announcements' | 'materials' | 'assignments';

export default function TutoringCourseDetailScreen({
  courseCode,
  courseName,
  department,
  onBack,
}: TutoringCourseDetailScreenProps) {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<TabType>('announcements');
  const webViewRef = useRef<WebView>(null);

  // Read data from Zustand store instead of the old hook
  const courseDetail = useTutoringStore((state) => state.courseDetails.get(courseCode));
  const announcements = courseDetail?.announcements ?? [];
  const materials = courseDetail?.materials ?? [];
  const assignments = courseDetail?.assignments ?? [];

  const {
    statusText,
    startSync,
    handleMessage,
    handleNavChange,
    phaseRef,
  } = useTutoringSync({ webViewRef });

  const isSyncing = phaseRef.current !== 'idle' && phaseRef.current !== 'complete' && phaseRef.current !== 'error';

  const handleRefresh = useCallback(() => {
    startSync({ courseCode, manual: true });
  }, [startSync, courseCode]);

  const renderHeader = () => (
    <View style={[styles.header, { backgroundColor: theme.card, borderBottomColor: theme.border }]}>
      <View style={styles.headerTop}>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={styles.backButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <AppSymbol name="chevron.left" size={24} tintColor={theme.text} fallback={<Text style={{ color: theme.text, fontSize: 24 }}>{'<'}</Text>} />
          </TouchableOpacity>
        )}
        <View style={styles.headerTitleContainer}>
          <Text style={[styles.courseName, { color: theme.text }]} numberOfLines={1}>
            {courseName || courseCode}
          </Text>
          {department && (
            <Text style={[styles.department, { color: theme.textSub }]} numberOfLines={1}>
              {department}
            </Text>
          )}
        </View>
      </View>

      <View style={[styles.tabContainer, { backgroundColor: theme.bg }]}>
        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'announcements' && [styles.activeTab, { backgroundColor: theme.card, shadowColor: theme.text }],
          ]}
          onPress={() => setActiveTab('announcements')}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'announcements' ? theme.primary : theme.textSub },
              activeTab === 'announcements' && styles.activeTabText,
            ]}
          >
            公告 ({announcements.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'materials' && [styles.activeTab, { backgroundColor: theme.card, shadowColor: theme.text }],
          ]}
          onPress={() => setActiveTab('materials')}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'materials' ? theme.primary : theme.textSub },
              activeTab === 'materials' && styles.activeTabText,
            ]}
          >
            教材 ({materials.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tab,
            activeTab === 'assignments' && [styles.activeTab, { backgroundColor: theme.card, shadowColor: theme.text }],
          ]}
          onPress={() => setActiveTab('assignments')}
        >
          <Text
            style={[
              styles.tabText,
              { color: activeTab === 'assignments' ? theme.primary : theme.textSub },
              activeTab === 'assignments' && styles.activeTabText,
            ]}
          >
            作業 ({assignments.length})
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderEmptyState = () => {
    if (isSyncing) return null;

    let message = '';
    switch (activeTab) {
      case 'announcements':
        message = '目前沒有公告';
        break;
      case 'materials':
        message = '目前沒有教材';
        break;
      case 'assignments':
        message = '目前沒有作業';
        break;
    }

    return (
      <View style={styles.emptyContainer}>
        <AppSymbol name="tray" size={48} tintColor={theme.border} fallback={<Text style={{ fontSize: 48 }}>📭</Text>} />
        <Text style={[styles.emptyText, { color: theme.textSub }]}>{message}</Text>
      </View>
    );
  };

  const renderContent = () => {
    if (!courseDetail && !isSyncing) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSub }]}>下拉刷新以載入課程資料</Text>
        </View>
      );
    }

    if (isSyncing && announcements.length === 0 && materials.length === 0 && assignments.length === 0) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSub }]}>{statusText || '同步中...'}</Text>
        </View>
      );
    }

    switch (activeTab) {
      case 'announcements':
        return (
          <FlatList
            data={announcements}
            keyExtractor={(item, index) => item.serialNo?.toString() || index.toString()}
            renderItem={({ item }) => <TutoringAnnouncementItem announcement={item} />}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={renderEmptyState}
            refreshControl={
              <RefreshControl refreshing={isSyncing} onRefresh={handleRefresh} tintColor={theme.primary} />
            }
          />
        );
      case 'materials':
        return (
          <FlatList
            data={materials}
            keyExtractor={(item, index) => item.targetNo?.toString() || index.toString()}
            renderItem={({ item }) => <TutoringMaterialItem material={item} />}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={renderEmptyState}
            refreshControl={
              <RefreshControl refreshing={isSyncing} onRefresh={handleRefresh} tintColor={theme.primary} />
            }
          />
        );
      case 'assignments':
        return (
          <FlatList
            data={assignments}
            keyExtractor={(item, index) => item.mySn?.toString() || item.homeSn?.toString() || index.toString()}
            renderItem={({ item }) => <TutoringAssignmentItem assignment={item} />}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={renderEmptyState}
            refreshControl={
              <RefreshControl refreshing={isSyncing} onRefresh={handleRefresh} tintColor={theme.primary} />
            }
          />
        );
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {renderHeader()}
      {renderContent()}

      {/* Hidden WebView for real-time scraping */}
      <WebView
        ref={webViewRef}
        source={{ uri: 'https://ecampus.pccu.edu.tw/eCampus/default.aspx' }}
        style={styles.hiddenWebView}
        onMessage={handleMessage}
        onNavigationStateChange={handleNavChange}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState={false}
        mixedContentMode="always"
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 16,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  backButton: {
    marginRight: 12,
  },
  headerTitleContainer: {
    flex: 1,
  },
  courseName: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  department: {
    fontSize: 14,
  },
  tabContainer: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  activeTab: {
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
  },
  activeTabText: {
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  hiddenWebView: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    opacity: 0,
  },
});
