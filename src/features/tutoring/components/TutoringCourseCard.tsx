import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { TutoringCourse } from '../types';
import { useTheme } from '../../../providers/theme/ThemeProvider';
import AppSymbol from '../../../shared/components/AppSymbol';

interface TutoringCourseCardProps {
  course: TutoringCourse;
  pendingCount?: number;
  onPress: (courseCode: string) => void;
}

export default function TutoringCourseCard({ course, pendingCount = 0, onPress }: TutoringCourseCardProps) {
  const { theme } = useTheme();

  const handlePress = () => onPress(course.courseCode);

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.card, shadowColor: theme.text }]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <AppSymbol name="book.fill" size={20} tintColor={theme.primary} fallback={<Text>📚</Text>} />
          <Text style={[styles.courseName, { color: theme.text }]} numberOfLines={2}>
            {course.deptName ? `[${course.deptName}] ` : ''}{course.courseName}
          </Text>
        </View>
        {pendingCount > 0 && (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>{pendingCount > 99 ? '99+' : pendingCount}</Text>
          </View>
        )}
      </View>

      <View style={styles.metaRow}>
        <Text style={[styles.metaText, { color: theme.textSub }]}>
          授課教師：{course.label || '未指定'}
        </Text>
        <View style={styles.metaRight}>
          <Text style={[styles.metaText, { color: theme.textSub }]}>
            {course.credit != null ? `${course.credit} 學分` : ''}
          </Text>
          {course.isRemote && (
            <View style={[styles.remoteBadge, { backgroundColor: 'rgba(10,122,255,0.1)' }]}>
              <Text style={[styles.remoteBadgeText, { color: theme.primary }]}>🌐 遠距</Text>
            </View>
          )}
        </View>
      </View>

      <View style={[styles.divider, { borderColor: theme.border }]} />

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <AppSymbol name="bell.fill" size={14} tintColor={theme.textSub} fallback={<Text>📢</Text>} />
          <Text style={[styles.statText, { color: theme.textSub }]}>{course.announcementCount}</Text>
        </View>
        <View style={styles.statItem}>
          <AppSymbol name="doc.fill" size={14} tintColor={theme.textSub} fallback={<Text>📄</Text>} />
          <Text style={[styles.statText, { color: theme.textSub }]}>{course.materialCount}</Text>
        </View>
        <View style={styles.statItem}>
          <AppSymbol name="pencil.circle.fill" size={14} tintColor={theme.textSub} fallback={<Text>📝</Text>} />
          <Text style={[styles.statText, { color: theme.textSub }]}>{course.homeworkCount}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  courseName: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
    flex: 1,
  },
  pendingBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  pendingBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  metaText: {
    fontSize: 13,
  },
  metaRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  remoteBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 8,
  },
  remoteBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 10,
    marginBottom: 10,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
