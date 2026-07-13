import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme } from '../../../providers/theme/ThemeProvider';
import { TAB_MATERIAL_COLORS, TOP_TAB_MATERIAL } from '../../../navigation/tabMaterials';
import AppSymbol from '../../../shared/components/AppSymbol';
import { useTutoringSync } from '../hooks/useTutoringSync';
import {
  downloadTutoringFile,
  uploadTutoringAssignmentFile,
} from '../services/tutoringFileActions';
import { useTutoringStore } from '../store/useTutoringStore';
import {
  TutoringAnnouncement,
  TutoringAssignment,
  TutoringClassmate,
  TutoringFileAttachment,
  TutoringMaterial,
  TutoringProgressItem,
} from '../types';
import { normalizeTutoringText } from '../utils/text';

interface TutoringCourseDetailScreenProps {
  courseCode: string;
  courseName?: string;
  department?: string;
  onBack?: () => void;
}

type TabType = 'course' | 'announcements' | 'materials' | 'assignments' | 'progress' | 'classmates';
type DetailItem =
  | { type: 'announcement'; item: TutoringAnnouncement }
  | { type: 'assignment'; item: TutoringAssignment };

const BOTTOM_TAB_SELECTED_COLOR = TAB_MATERIAL_COLORS.selected;
const BOTTOM_TAB_IDLE_COLOR = TAB_MATERIAL_COLORS.idle;
const SEGMENTED_CONTROL_MATERIAL = TOP_TAB_MATERIAL.background;
const SEGMENTED_CONTROL_ACTIVE_MATERIAL = TOP_TAB_MATERIAL.activeBackground;
const SEGMENTED_CONTROL_BORDER = TOP_TAB_MATERIAL.border;

const TABS: {
  key: TabType;
  label: string;
  icon: { default: string; selected: string };
}[] = [
  { key: 'course', label: '課程', icon: { default: 'book', selected: 'book.fill' } },
  { key: 'announcements', label: '公告', icon: { default: 'bell', selected: 'bell.fill' } },
  { key: 'materials', label: '教材', icon: { default: 'doc.text', selected: 'doc.text.fill' } },
  {
    key: 'assignments',
    label: '作業',
    icon: { default: 'checklist', selected: 'checklist.checked' },
  },
  { key: 'progress', label: '進度', icon: { default: 'chart.bar', selected: 'chart.bar.fill' } },
  { key: 'classmates', label: '同學', icon: { default: 'person.2', selected: 'person.2.fill' } },
];

function cleanText(value?: string | null) {
  return normalizeTutoringText(value).replace(/\s+/g, ' ').trim();
}

function cleanMultilineText(value?: string | null) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|p|li|tr|td|th|section|article|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatAnnouncementBody(announcement?: TutoringAnnouncement | null) {
  const title = cleanText(announcement?.title);
  let body = cleanMultilineText(announcement?.contentText || announcement?.contentHtml || title);

  body = body
    .replace(
      /\s*(發布日期|公告日期|公告內容|內容|考試時間|考試範圍|考試方式|說明|備註|附件)\s*[：:]\s*/g,
      '\n$1：',
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (title && body.startsWith(title)) {
    body = body.slice(title.length).trim();
  }

  return body || title;
}

function formatAnnouncementPreview(announcement: TutoringAnnouncement) {
  const title = cleanText(announcement.title);
  const body = formatAnnouncementBody(announcement);
  const line = body
    .split('\n')
    .map((item) => cleanText(item).replace(/^(公告內容|內容)[：:]\s*/, ''))
    .find((item) => item && item !== title && !/^(發布日期|公告日期)[：:]/.test(item));

  if (!line) return '';
  return line.length > 96 ? `${line.slice(0, 96)}...` : line;
}

function formatDate(value?: string | null) {
  if (!value) return '尚未同步';
  const date = new Date(String(value).replace(/\//g, '-'));
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return '尚未同步';
  const date = new Date(String(value).replace(/\//g, '-'));
  if (Number.isNaN(date.getTime())) return String(value);
  return `${formatDate(value)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function isAssignmentPending(assignment: TutoringAssignment) {
  return assignment.stateCode === '' || assignment.stateCode === '4';
}

function assignmentStatus(assignment: TutoringAssignment) {
  if (isAssignmentPending(assignment)) {
    const due = assignment.endAt ? new Date(assignment.endAt.replace(/\//g, '-')) : null;
    if (due && !Number.isNaN(due.getTime()) && due.getTime() < Date.now()) {
      return { label: '已逾期', color: '#FF3B30', bg: 'rgba(255,59,48,0.12)' };
    }
    return {
      label: assignment.stateLabel || '未繳交',
      color: '#FF9500',
      bg: 'rgba(255,149,0,0.14)',
    };
  }

  return { label: assignment.stateLabel || '已繳交', color: '#34C759', bg: 'rgba(52,199,89,0.14)' };
}

function hasExpectedCount(expected?: number, actual = 0) {
  return !expected || actual >= expected;
}

function hasLoadedCourseDetailSection(
  detail: { progress?: unknown; classmates?: unknown } | undefined,
  section: 'progress' | 'classmates',
) {
  return !!detail && Object.prototype.hasOwnProperty.call(detail, section);
}

function hasSuspiciousProgressRows(progress: TutoringProgressItem[]) {
  if (progress.length === 0) return false;

  const titles = progress.map((item) => cleanText(item.title));
  const values = progress.map((item) => cleanText(item.value));
  const hasLeadingJunk = titles.some((title) => /^[)）\]\s]+/.test(title));
  const hasScheduleDates = values.some((value) => /^20\d{2}[\/.-]\d{1,2}[\/.-]\d{1,2}/.test(value));
  const hasWeekTitles = titles.some((title) => /^第\s*\d+\s*週/.test(title));

  return hasLeadingJunk || (hasScheduleDates && !hasWeekTitles);
}

function attachmentLabel(attachment: TutoringFileAttachment) {
  return cleanText(attachment.fileName || attachment.title) || '附件';
}

function PressableCard({
  children,
  onPress,
  style,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  style?: any;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (value: number) => {
    Animated.spring(scale, {
      toValue: value,
      useNativeDriver: true,
      speed: 22,
      bounciness: 4,
    }).start();
  };

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => animateTo(0.97)}
        onPressOut={() => animateTo(1)}
        style={({ pressed }) => (pressed ? styles.cardPressed : null)}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

export default function TutoringCourseDetailScreen({
  courseCode,
  courseName,
  department,
}: TutoringCourseDetailScreenProps) {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<TabType>('course');
  const [refreshing, setRefreshing] = useState(false);
  const [detailItem, setDetailItem] = useState<DetailItem | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const progressRefreshAttemptRef = useRef<string | null>(null);

  const course = useTutoringStore((state) =>
    state.courses.find((item) => item.courseCode === courseCode),
  );
  const courseDetail = useTutoringStore((state) => state.courseDetails.get(courseCode));
  const syncPhase = useTutoringStore((state) => state.syncPhase);
  const error = useTutoringStore((state) => state.error);
  const { syncCourseDetail } = useTutoringSync();

  const announcements = courseDetail?.announcements ?? [];
  const materials = courseDetail?.materials ?? [];
  const assignments = courseDetail?.assignments ?? [];
  const progress = courseDetail?.progress ?? [];
  const classmates = courseDetail?.classmates ?? [];
  const courseInfo = courseDetail?.courseInfo;
  const resolvedCourseName =
    cleanText(courseName || course?.courseName || courseCode) || '課輔課程';
  const resolvedDepartment =
    cleanText(department || course?.deptName || course?.label) || '課輔課程';
  const pendingAssignments = assignments.filter(isAssignmentPending).length;
  const tabValues = TABS.map((tab) => {
    const count =
      tab.key === 'announcements'
        ? announcements.length
        : tab.key === 'materials'
          ? materials.length
          : tab.key === 'assignments'
            ? assignments.length
            : tab.key === 'progress'
              ? progress.length
              : tab.key === 'classmates'
                ? classmates.length
                : null;
    return { ...tab, count };
  });
  const needsSupplementalCourseDetail =
    !hasLoadedCourseDetailSection(courseDetail, 'progress') ||
    !hasLoadedCourseDetailSection(courseDetail, 'classmates');
  const needsCourseDetail =
    !courseDetail ||
    !courseDetail?.courseInfo ||
    needsSupplementalCourseDetail ||
    !hasExpectedCount(course?.announcementCount, announcements.length) ||
    !hasExpectedCount(course?.materialCount, materials.length) ||
    !hasExpectedCount(course?.homeworkCount, assignments.length);

  const statusText = useMemo(() => {
    switch (syncPhase) {
      case 'logging_in':
        return '登入課輔中';
      case 'fetching_courses':
        return '同步課輔課程中';
      case 'fetching_details':
        return '同步課程詳情中';
      case 'complete':
        return '同步完成';
      case 'error':
        return error ?? '同步失敗';
      default:
        return '';
    }
  }, [syncPhase, error]);

  const isSyncing =
    (!courseDetail || needsCourseDetail) &&
    syncPhase !== 'idle' &&
    syncPhase !== 'complete' &&
    syncPhase !== 'error';

  useEffect(() => {
    if (!courseDetail || needsCourseDetail) {
      void syncCourseDetail(courseCode);
    }
  }, [courseCode, courseDetail, needsCourseDetail, syncCourseDetail]);

  useEffect(() => {
    const needsProgressRefresh = progress.length === 0 || hasSuspiciousProgressRows(progress);
    if (
      activeTab !== 'progress' ||
      !needsProgressRefresh ||
      isSyncing ||
      syncPhase === 'fetching_details'
    )
      return;
    if (progressRefreshAttemptRef.current === courseCode) return;

    progressRefreshAttemptRef.current = courseCode;
    void syncCourseDetail(courseCode, { force: true });
  }, [activeTab, courseCode, isSyncing, progress.length, syncCourseDetail, syncPhase]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void syncCourseDetail(courseCode, { force: true }).finally(() => {
      setRefreshing(false);
    });
  }, [syncCourseDetail, courseCode]);

  const runDownload = useCallback((action: Parameters<typeof downloadTutoringFile>[0]) => {
    Alert.alert('下載附件', `確定要下載「${action.fileName || '附件'}」嗎？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '下載',
        onPress: () => {
          setBusyAction('download');
          void downloadTutoringFile(action)
            .catch((downloadError) => {
              Alert.alert(
                '下載失敗',
                downloadError instanceof Error ? downloadError.message : '請稍後再試。',
              );
            })
            .finally(() => setBusyAction(null));
        },
      },
    ]);
  }, []);

  const runUpload = useCallback(
    (assignment: TutoringAssignment) => {
      Alert.alert('上傳作業', '將選取一個檔案並上傳到課輔系統。', [
        { text: '取消', style: 'cancel' },
        {
          text: '選擇檔案',
          onPress: () => {
            setBusyAction('upload');
            void uploadTutoringAssignmentFile(courseCode, assignment.homeSn)
              .then((result) => {
                if (!result?.canceled) {
                  Alert.alert('上傳完成', '作業檔案已送出，稍後會重新同步狀態。');
                  void syncCourseDetail(courseCode, { force: true, silent: true });
                }
              })
              .catch((uploadError) => {
                Alert.alert(
                  '上傳失敗',
                  uploadError instanceof Error ? uploadError.message : '請稍後再試。',
                );
              })
              .finally(() => setBusyAction(null));
          },
        },
      ]);
    },
    [courseCode, syncCourseDetail],
  );

  const downloadAttachment = useCallback(
    (
      kind: 'announcement' | 'assignment' | 'submitted',
      attachment: TutoringFileAttachment,
      extra?: { homeSn?: number | null },
    ) => {
      runDownload({
        courseCode,
        kind,
        fileName: attachmentLabel(attachment),
        downloadUrl: attachment.downloadUrl,
        targetNo: attachment.targetNo,
        serialNo: attachment.serialNo,
        homeSn: extra?.homeSn ?? null,
      });
    },
    [courseCode, runDownload],
  );

  const openAnnouncementDetail = useCallback(
    (announcement: TutoringAnnouncement) => {
      const fallbackBody = cleanText(
        announcement.contentText || announcement.contentHtml || announcement.title,
      );
      setDetailItem({
        type: 'announcement',
        item: {
          ...announcement,
          contentText: fallbackBody,
          contentHtml: announcement.contentHtml || fallbackBody,
        },
      });

      if (!cleanText(announcement.contentText || announcement.contentHtml)) {
        void syncCourseDetail(courseCode, { force: true, silent: true });
      }
    },
    [courseCode, syncCourseDetail],
  );

  const renderCourseDetails = () => {
    const courseInfoRows = [
      { label: '課程代號', value: courseCode },
      { label: '授課教師', value: courseInfo?.teacherName },
      { label: '學年期', value: courseInfo?.academicYearTerm },
      { label: '開課班級', value: courseInfo?.departmentClass || resolvedDepartment },
      { label: '必選修', value: courseInfo?.requiredType },
      {
        label: '學分',
        value: courseInfo?.creditText || (course?.credit != null ? course.credit.toFixed(1) : ''),
      },
      { label: '英語授課', value: courseInfo?.englishLevel },
      { label: '上課時間', value: courseInfo?.scheduleText },
      { label: '預計人數', value: courseInfo?.expectedEnrollment },
    ];

    return (
      <View
        style={[
          styles.heroCard,
          {
            backgroundColor: theme.syncBtnBg || theme.card,
            borderColor: '#FFFFFF',
            shadowColor: theme.text,
          },
        ]}
      >
        <Text style={[styles.courseTitle, { color: theme.text }]} numberOfLines={3}>
          {resolvedCourseName}
        </Text>
        <Text style={[styles.courseMeta, { color: theme.textSub }]} numberOfLines={1}>
          {resolvedDepartment}
        </Text>

        <View style={styles.infoList}>
          {courseInfoRows.map((row) => (
            <View key={row.label} style={styles.infoRow}>
              <Text style={[styles.infoLabel, { color: theme.textSub }]}>{row.label}</Text>
              <Text style={[styles.infoValue, { color: theme.text }]}>
                {cleanText(row.value) || '尚未同步'}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: theme.text }]}>{announcements.length}</Text>
            <Text style={[styles.summaryLabel, { color: theme.textSub }]}>公告</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: theme.text }]}>{materials.length}</Text>
            <Text style={[styles.summaryLabel, { color: theme.textSub }]}>教材</Text>
          </View>
          <View style={styles.summaryItem}>
            <Text
              style={[
                styles.summaryValue,
                { color: pendingAssignments > 0 ? theme.danger || '#FF3B30' : theme.text },
              ]}
            >
              {assignments.length}
            </Text>
            <Text style={[styles.summaryLabel, { color: theme.textSub }]}>作業</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderAnnouncement = (announcement: TutoringAnnouncement, index: number) => {
    const preview = formatAnnouncementPreview(announcement);

    return (
      <PressableCard
        key={`${announcement.serialNo ?? index}-announcement`}
        onPress={() => openAnnouncementDetail(announcement)}
      >
        <View
          style={[
            styles.itemCard,
            { backgroundColor: theme.card, borderColor: '#FFFFFF', shadowColor: theme.text },
          ]}
        >
          <View style={styles.itemHeaderRow}>
            {!announcement.isRead ? (
              <View style={[styles.unreadDot, { backgroundColor: theme.primary }]} />
            ) : null}
            <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={2}>
              {cleanText(announcement.title) || '未命名公告'}
            </Text>
          </View>
          <Text style={[styles.itemMeta, { color: theme.textSub }]} numberOfLines={1}>
            {cleanText(announcement.teacherName) || '課輔系統'} ·{' '}
            {formatDate(announcement.createdAt)}
          </Text>
          {preview ? (
            <Text style={[styles.itemBody, { color: theme.textSub }]} numberOfLines={2}>
              {preview}
            </Text>
          ) : null}
          {(announcement.attachments ?? []).length > 0 ? (
            <Text style={[styles.itemMeta, { color: theme.primary }]} numberOfLines={1}>
              附件 {(announcement.attachments ?? []).length}
            </Text>
          ) : null}
        </View>
      </PressableCard>
    );
  };

  const renderMaterial = (material: TutoringMaterial, index: number) => (
    <PressableCard
      key={`${material.targetNo ?? index}-material`}
      onPress={() => {
        if (!material.downable) return;
        runDownload({
          courseCode,
          kind: 'material',
          fileName: cleanText(material.fileName || material.title) || '教材',
          downloadUrl: material.downloadUrl,
          targetNo: material.targetNo,
        });
      }}
    >
      <View
        style={[
          styles.itemCard,
          { backgroundColor: theme.card, borderColor: '#FFFFFF', shadowColor: theme.text },
        ]}
      >
        <View style={styles.itemHeaderRow}>
          <View style={[styles.typePill, { backgroundColor: 'rgba(10,122,255,0.10)' }]}>
            <Text style={[styles.typePillText, { color: theme.primary }]}>
              {material.catalog || '教材'}
            </Text>
          </View>
          {material.isNew ? (
            <View style={[styles.typePill, { backgroundColor: 'rgba(255,149,0,0.14)' }]}>
              <Text style={styles.newPillText}>NEW</Text>
            </View>
          ) : null}
          {material.downable ? (
            <View style={[styles.iconPill, { backgroundColor: theme.primary }]}>
              <AppSymbol
                name="arrow.down.doc.fill"
                size={14}
                tintColor="#FFFFFF"
                fallback={<Text style={styles.iconFallback}>↓</Text>}
              />
            </View>
          ) : null}
        </View>
        <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={2}>
          {cleanText(material.title || material.fileName) || '未命名教材'}
        </Text>
        <Text style={[styles.itemMeta, { color: theme.textSub }]} numberOfLines={1}>
          {cleanText(material.fileName) || '無檔名'} · 更新{' '}
          {formatDate(material.updatedAt || material.endAt)}
        </Text>
        {material.memoText ? (
          <Text style={[styles.itemBody, { color: theme.textSub }]} numberOfLines={3}>
            {cleanText(material.memoText)}
          </Text>
        ) : null}
      </View>
    </PressableCard>
  );

  const renderAssignment = (assignment: TutoringAssignment, index: number) => {
    const status = assignmentStatus(assignment);
    const remaining = assignment.remainingSubmissionCount;

    return (
      <PressableCard
        key={`${assignment.mySn ?? assignment.homeSn ?? index}-assignment`}
        onPress={() => setDetailItem({ type: 'assignment', item: assignment })}
      >
        <View
          style={[
            styles.itemCard,
            { backgroundColor: theme.card, borderColor: '#FFFFFF', shadowColor: theme.text },
          ]}
        >
          <View style={styles.itemHeaderRow}>
            <Text
              style={[styles.itemTitle, styles.itemTitleWithBadge, { color: theme.text }]}
              numberOfLines={2}
            >
              {cleanText(assignment.title) || '未命名作業'}
            </Text>
            <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
              <Text style={[styles.statusPillText, { color: status.color }]}>{status.label}</Text>
            </View>
          </View>
          <Text style={[styles.itemMeta, { color: theme.textSub }]} numberOfLines={1}>
            截止 {formatDateTime(assignment.endAt)}
          </Text>
          {remaining != null ? (
            <Text style={[styles.itemMeta, { color: theme.textSub }]} numberOfLines={1}>
              剩餘繳交次數 {remaining}
            </Text>
          ) : null}
          <Text style={[styles.itemMeta, { color: theme.primary }]} numberOfLines={1}>
            附件 {(assignment.attachments ?? []).length} · 已繳交{' '}
            {(assignment.submittedFiles ?? []).length}
          </Text>
        </View>
      </PressableCard>
    );
  };

  const renderProgress = (item: TutoringProgressItem, index: number) => (
    <View
      key={`${item.id || index}-progress`}
      style={[
        styles.itemCard,
        { backgroundColor: theme.card, borderColor: '#FFFFFF', shadowColor: theme.text },
      ]}
    >
      <View style={styles.itemHeaderRow}>
        <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={2}>
          {cleanText(item.title) || '課程進度'}
        </Text>
        {item.percent != null ? (
          <Text style={[styles.percentText, { color: theme.primary }]}>
            {Math.round(item.percent * 100)}%
          </Text>
        ) : null}
      </View>
      {item.percent != null ? (
        <View
          style={[
            styles.progressTrack,
            { backgroundColor: theme.border || 'rgba(142,142,147,0.18)' },
          ]}
        >
          <View
            style={[
              styles.progressFill,
              { backgroundColor: theme.primary, width: `${Math.round(item.percent * 100)}%` },
            ]}
          />
        </View>
      ) : null}
      {cleanText(item.value) ? (
        <Text style={[styles.itemBody, { color: theme.textSub }]}>{cleanText(item.value)}</Text>
      ) : null}
    </View>
  );

  const renderClassmate = (classmate: TutoringClassmate, index: number) => (
    <View
      key={`${classmate.id || index}-classmate`}
      style={[
        styles.itemCard,
        styles.classmateCard,
        { backgroundColor: theme.card, borderColor: '#FFFFFF', shadowColor: theme.text },
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: 'rgba(10,122,255,0.12)' }]}>
        <Text style={[styles.avatarText, { color: theme.primary }]}>
          {cleanText(classmate.name).slice(0, 1) || '同'}
        </Text>
      </View>
      <View style={styles.classmateBody}>
        <Text style={[styles.itemTitle, { color: theme.text }]} numberOfLines={1}>
          {cleanText(classmate.name) || '未命名同學'}
        </Text>
        <Text style={[styles.itemMeta, { color: theme.textSub }]} numberOfLines={1}>
          {cleanText(classmate.departmentClass) || cleanText(classmate.id) || '課輔同學'}
        </Text>
        {cleanText(classmate.email) ? (
          <Text style={[styles.itemMeta, { color: theme.textSub }]} numberOfLines={1}>
            {cleanText(classmate.email)}
          </Text>
        ) : null}
      </View>
    </View>
  );

  const renderItems = () => {
    if (activeTab === 'course') return renderCourseDetails();

    const activeItems =
      activeTab === 'announcements'
        ? announcements
        : activeTab === 'materials'
          ? materials
          : activeTab === 'assignments'
            ? assignments
            : activeTab === 'progress'
              ? progress
              : classmates;

    if (isSyncing && activeItems.length === 0) {
      return (
        <View
          style={[
            styles.stateCard,
            { backgroundColor: theme.card, borderColor: '#FFFFFF', shadowColor: theme.text },
          ]}
        >
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={[styles.stateText, { color: theme.textSub }]}>
            {statusText || '同步課程詳情中'}
          </Text>
        </View>
      );
    }

    if (activeItems.length === 0) {
      const label = TABS.find((tab) => tab.key === activeTab)?.label ?? '資料';
      return (
        <View
          style={[
            styles.stateCard,
            { backgroundColor: theme.card, borderColor: '#FFFFFF', shadowColor: theme.text },
          ]}
        >
          <Text style={[styles.stateTitle, { color: theme.text }]}>尚無{label}</Text>
          <Text style={[styles.stateText, { color: theme.textSub }]}>
            下拉重新整理可再次向課輔系統同步。
          </Text>
        </View>
      );
    }

    if (activeTab === 'announcements') return announcements.map(renderAnnouncement);
    if (activeTab === 'materials') return materials.map(renderMaterial);
    if (activeTab === 'assignments') return assignments.map(renderAssignment);
    if (activeTab === 'progress') return progress.map(renderProgress);
    return classmates.map(renderClassmate);
  };

  const renderAttachmentButton = (
    attachment: TutoringFileAttachment,
    kind: 'announcement' | 'assignment' | 'submitted',
    homeSn?: number | null,
  ) => (
    <Pressable
      key={`${kind}-${attachment.serialNo ?? attachment.targetNo ?? attachmentLabel(attachment)}`}
      style={[styles.attachmentButton, { borderColor: theme.border || 'rgba(142,142,147,0.25)' }]}
      onPress={() => downloadAttachment(kind, attachment, { homeSn })}
    >
      <AppSymbol name="paperclip" size={15} tintColor={theme.primary} fallback={<Text>↧</Text>} />
      <Text style={[styles.attachmentText, { color: theme.text }]} numberOfLines={1}>
        {attachmentLabel(attachment)}
      </Text>
    </Pressable>
  );

  const renderDetailModal = () => {
    if (!detailItem) return null;
    const isAnnouncement = detailItem.type === 'announcement';
    const latestAnnouncement = isAnnouncement
      ? (announcements.find(
          (announcement) =>
            detailItem.item.serialNo != null && announcement.serialNo === detailItem.item.serialNo,
        ) ??
        announcements.find(
          (announcement) => cleanText(announcement.title) === cleanText(detailItem.item.title),
        ) ??
        detailItem.item)
      : null;
    const detailAnnouncement = latestAnnouncement ?? (isAnnouncement ? detailItem.item : null);
    const title = isAnnouncement
      ? cleanText(detailItem.item.title) || '公告詳情'
      : cleanText(detailItem.item.title) || '作業詳情';
    const announcementBody = isAnnouncement ? formatAnnouncementBody(detailAnnouncement) : '';

    return (
      <Modal visible transparent animationType="slide" onRequestClose={() => setDetailItem(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]} numberOfLines={2}>
                {title}
              </Text>
              <Pressable style={styles.closeButton} onPress={() => setDetailItem(null)}>
                <AppSymbol
                  name="xmark"
                  size={16}
                  tintColor={theme.textSub}
                  fallback={<Text>×</Text>}
                />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {isAnnouncement ? (
                <>
                  <Text style={[styles.modalMeta, { color: theme.textSub }]}>
                    {cleanText(detailAnnouncement?.teacherName) || '課輔系統'} ·{' '}
                    {formatDateTime(detailAnnouncement?.createdAt)}
                  </Text>
                  <Text style={[styles.modalBody, { color: theme.text }]} selectable>
                    {announcementBody || title}
                  </Text>
                  {(detailAnnouncement?.attachments ?? []).length > 0 ? (
                    <View style={styles.modalSection}>
                      <Text style={[styles.modalSectionTitle, { color: theme.text }]}>附件</Text>
                      {(detailAnnouncement?.attachments ?? []).map((attachment) =>
                        renderAttachmentButton(attachment, 'announcement'),
                      )}
                    </View>
                  ) : null}
                </>
              ) : (
                <>
                  <View style={styles.modalSection}>
                    <Text style={[styles.modalMeta, { color: theme.textSub }]}>
                      截止 {formatDateTime(detailItem.item.endAt)}
                    </Text>
                    <Text style={[styles.modalMeta, { color: theme.textSub }]}>
                      剩餘繳交次數 {detailItem.item.remainingSubmissionCount ?? '未提供'}
                    </Text>
                    <Text style={[styles.modalMeta, { color: theme.textSub }]}>
                      已使用 {detailItem.item.usedCount ?? 0}
                      {detailItem.item.maxSubmissionCount != null
                        ? ` / ${detailItem.item.maxSubmissionCount}`
                        : ''}
                    </Text>
                  </View>
                  {detailItem.item.commentText ? (
                    <View style={styles.modalSection}>
                      <Text style={[styles.modalSectionTitle, { color: theme.text }]}>
                        作業說明
                      </Text>
                      <Text style={[styles.modalBody, { color: theme.text }]} selectable>
                        {cleanText(detailItem.item.commentText)}
                      </Text>
                    </View>
                  ) : null}
                  {(detailItem.item.attachments ?? []).length > 0 ? (
                    <View style={styles.modalSection}>
                      <Text style={[styles.modalSectionTitle, { color: theme.text }]}>
                        作業附件
                      </Text>
                      {(detailItem.item.attachments ?? []).map((attachment) =>
                        renderAttachmentButton(attachment, 'assignment', detailItem.item.homeSn),
                      )}
                    </View>
                  ) : null}
                  <View style={styles.modalSection}>
                    <Text style={[styles.modalSectionTitle, { color: theme.text }]}>
                      已繳交作業
                    </Text>
                    {(detailItem.item.submittedFiles ?? []).length > 0 ? (
                      (detailItem.item.submittedFiles ?? []).map((attachment) =>
                        renderAttachmentButton(attachment, 'submitted', detailItem.item.homeSn),
                      )
                    ) : (
                      <Text style={[styles.modalMeta, { color: theme.textSub }]}>
                        尚未同步到已繳交檔案
                      </Text>
                    )}
                  </View>
                  {detailItem.item.reviewText ? (
                    <View style={styles.modalSection}>
                      <Text style={[styles.modalSectionTitle, { color: theme.text }]}>
                        批改回饋
                      </Text>
                      <Text style={[styles.modalBody, { color: theme.text }]} selectable>
                        {cleanText(detailItem.item.reviewText)}
                      </Text>
                    </View>
                  ) : null}
                  {detailItem.item.uploadable ? (
                    <Pressable
                      style={[styles.primaryButton, { backgroundColor: theme.primary }]}
                      onPress={() => runUpload(detailItem.item)}
                      disabled={busyAction === 'upload'}
                    >
                      {busyAction === 'upload' ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : null}
                      <Text style={styles.primaryButtonText}>上傳作業</Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || isSyncing}
            onRefresh={handleRefresh}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        <View style={[styles.segmentedControl, { shadowColor: theme.text }]}>
          <View style={styles.segmentTabsRow}>
            {tabValues.map((tab) => {
              const active = activeTab === tab.key;
              const color = active ? BOTTOM_TAB_SELECTED_COLOR : BOTTOM_TAB_IDLE_COLOR;
              return (
                <Pressable
                  key={tab.key}
                  onPress={() => setActiveTab(tab.key)}
                  style={[styles.segmentTab, active && styles.segmentTabActive]}
                >
                  <View style={styles.segmentIconWrap}>
                    <AppSymbol
                      name={active ? tab.icon.selected : tab.icon.default}
                      size={20}
                      tintColor={color}
                      weight={active ? 'bold' : 'semibold'}
                      fallback={
                        <Text style={[styles.segmentIconFallback, { color }]}>
                          {active ? '●' : '○'}
                        </Text>
                      }
                    />
                  </View>
                  <View style={styles.segmentLabelRow}>
                    <Text
                      style={[
                        styles.segmentTabText,
                        active ? styles.segmentTabActiveText : styles.segmentTabInactiveText,
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.72}
                    >
                      {tab.label}
                    </Text>
                    {tab.count != null ? (
                      <Text style={[styles.segmentCountText, { color }]} numberOfLines={1}>
                        {tab.count}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.listStack}>{renderItems()}</View>

        <Text
          style={[
            styles.syncLine,
            { color: syncPhase === 'error' ? theme.danger || '#FF3B30' : theme.textSub },
          ]}
        >
          {statusText || '下拉可同步最新課輔資料'}
        </Text>

        <View style={styles.bottomSpacer} />
      </ScrollView>
      {busyAction === 'download' ? (
        <View style={styles.busyOverlay} pointerEvents="none">
          <ActivityIndicator size="small" color="#FFFFFF" />
          <Text style={styles.busyText}>處理附件中</Text>
        </View>
      ) : null}
      {renderDetailModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: 16,
  },
  segmentedControl: {
    backgroundColor: SEGMENTED_CONTROL_MATERIAL,
    borderRadius: 30,
    paddingHorizontal: 6,
    paddingVertical: 7,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SEGMENTED_CONTROL_BORDER,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  segmentTabsRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
  },
  segmentTab: {
    flex: 1,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    borderRadius: 22,
  },
  segmentTabActive: {
    backgroundColor: SEGMENTED_CONTROL_ACTIVE_MATERIAL,
  },
  segmentIconWrap: {
    height: 23,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  segmentTabText: {
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: -0.15,
  },
  segmentTabActiveText: {
    color: BOTTOM_TAB_SELECTED_COLOR,
    fontWeight: '700',
  },
  segmentTabInactiveText: {
    color: BOTTOM_TAB_IDLE_COLOR,
    fontWeight: '600',
  },
  segmentLabelRow: {
    minHeight: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  segmentCountText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    letterSpacing: -0.15,
  },
  segmentIconFallback: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '900',
  },
  heroCard: {
    borderRadius: 34,
    padding: 25,
    marginBottom: 4,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.1,
    shadowRadius: 26,
    elevation: 12,
  },
  courseTitle: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
  },
  courseMeta: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  infoList: {
    marginTop: 20,
    gap: 10,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
  },
  infoLabel: {
    flexShrink: 0,
    width: 94,
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '800',
  },
  infoValue: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '900',
    textAlign: 'right',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  summaryItem: {
    flex: 1,
  },
  summaryValue: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
  },
  summaryLabel: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '800',
  },
  listStack: {
    gap: 12,
  },
  cardPressed: {
    opacity: 0.92,
  },
  itemCard: {
    borderRadius: 28,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 6,
  },
  itemHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 8,
    marginRight: 8,
  },
  itemTitle: {
    flex: 1,
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '900',
  },
  itemTitleWithBadge: {
    marginRight: 10,
  },
  itemMeta: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
    marginTop: 2,
  },
  itemBody: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
  },
  typePill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 8,
  },
  typePillText: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '900',
  },
  newPillText: {
    color: '#FF9500',
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '900',
  },
  iconPill: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
  iconFallback: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  statusPill: {
    flexShrink: 0,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusPillText: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '900',
  },
  percentText: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '900',
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 6,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
  },
  classmateCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 17,
    fontWeight: '900',
  },
  classmateBody: {
    flex: 1,
  },
  stateCard: {
    borderRadius: 28,
    padding: 24,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 6,
  },
  stateTitle: {
    fontSize: 18,
    lineHeight: 25,
    fontWeight: '900',
  },
  stateText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  syncLine: {
    marginTop: 18,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    fontWeight: '700',
  },
  bottomSpacer: {
    height: 80,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    maxHeight: '82%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  modalTitle: {
    flex: 1,
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '900',
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
  modalMeta: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
  },
  modalBody: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 24,
    fontWeight: '600',
  },
  modalSection: {
    marginTop: 18,
  },
  modalSectionTitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '900',
    marginBottom: 8,
  },
  attachmentButton: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    marginTop: 8,
    gap: 8,
  },
  attachmentText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 22,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '900',
  },
  busyOverlay: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 26,
    minHeight: 46,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  busyText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
});
