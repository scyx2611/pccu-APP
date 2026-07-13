import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { TutoringAssignment } from '../types';
import { useTheme } from '../../../providers/theme/ThemeProvider';
import AppSymbol from '../../../shared/components/AppSymbol';

interface TutoringAssignmentItemProps {
  assignment: TutoringAssignment;
  isExpanded?: boolean;
  onToggle?: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  '': { label: '未繳交', bg: 'rgba(255,59,48,0.12)', color: '#FF3B30' },
  '4': { label: '需重交', bg: 'rgba(255,149,0,0.12)', color: '#FF9500' },
  '1': { label: '已繳交', bg: 'rgba(52,199,89,0.12)', color: '#34C759' },
  '2': { label: '已評分', bg: 'rgba(10,122,255,0.12)', color: '#0A7AFF' },
  '3': { label: '已評分', bg: 'rgba(10,122,255,0.12)', color: '#0A7AFF' },
};

function getStatusInfo(assignment: TutoringAssignment) {
  return (
    STATUS_CONFIG[assignment.stateCode] || {
      label: assignment.stateLabel || assignment.stateCode || '未知',
      bg: 'rgba(142,142,147,0.12)',
      color: '#8E8E93',
    }
  );
}

function isOverdue(assignment: TutoringAssignment): boolean {
  if (assignment.stateCode === '' || assignment.stateCode === '4') {
    if (assignment.endAt) {
      const due = new Date(assignment.endAt);
      return due < new Date();
    }
  }
  return false;
}

export default function TutoringAssignmentItem({
  assignment,
  isExpanded: controlledExpanded,
  onToggle,
}: TutoringAssignmentItemProps) {
  const { theme } = useTheme();
  const [internalExpanded, setInternalExpanded] = useState(false);
  const pressAnim = React.useRef(new Animated.Value(0)).current;
  const isExpanded = controlledExpanded ?? internalExpanded;
  const statusInfo = getStatusInfo(assignment);
  const overdue = isOverdue(assignment);

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalExpanded(!internalExpanded);
    }
  };

  const pressStyle: any = {
    transform: [{ scale: pressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.98] }) }],
  };

  const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '未設定';
    try {
      const d = new Date(dateStr);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return dateStr;
    }
  };

  return (
    <AnimatedPressable
      style={[styles.card, { backgroundColor: theme.card, shadowColor: theme.text }, pressStyle]}
      onPress={handleToggle}
      onPressIn={() => Animated.spring(pressAnim, { toValue: 1, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(pressAnim, { toValue: 0, useNativeDriver: true }).start()}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
          {assignment.title}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
          <Text style={[styles.statusText, { color: statusInfo.color }]}>
            {overdue ? '已逾期' : statusInfo.label}
          </Text>
        </View>
      </View>

      <Text style={[styles.metaText, { color: theme.textSub }]}>
        截止：{formatDate(assignment.endAt)}
      </Text>

      {(assignment.stateCode === '' || assignment.stateCode === '4') &&
        assignment.remainingSubmissionCount != null && (
          <Text style={[styles.metaText, { color: overdue ? '#FF3B30' : theme.textSub }]}>
            剩餘繳交次數：{assignment.remainingSubmissionCount}
          </Text>
        )}

      <View style={styles.expandToggle}>
        <AppSymbol
          name={isExpanded ? 'chevron.up' : 'chevron.down'}
          size={16}
          tintColor={theme.primary}
          fallback={<Text>{isExpanded ? '▲' : '▼'}</Text>}
        />
        <Text style={[styles.expandText, { color: theme.primary }]}>
          {isExpanded ? '收合' : '展開'}
        </Text>
      </View>

      {isExpanded && (
        <View style={styles.expandedContent}>
          <View style={[styles.divider, { borderColor: theme.border }]} />

          {assignment.commentText ? (
            <View style={styles.detailSection}>
              <Text style={[styles.detailLabel, { color: theme.text }]}>說明</Text>
              <Text style={[styles.detailText, { color: theme.textSub }]}>
                {assignment.commentText}
              </Text>
            </View>
          ) : null}

          {assignment.reviewText ? (
            <View style={styles.detailSection}>
              <Text style={[styles.detailLabel, { color: theme.text }]}>評語</Text>
              <Text style={[styles.detailText, { color: theme.textSub }]}>
                {assignment.reviewText}
              </Text>
            </View>
          ) : null}

          {assignment.attachments && assignment.attachments.length > 0 && (
            <View style={styles.detailSection}>
              <Text style={[styles.detailLabel, { color: theme.text }]}>
                附件 ({assignment.attachments.length})
              </Text>
              {assignment.attachments.map((att, idx) => (
                <View key={att.serialNo ?? idx} style={styles.attachmentRow}>
                  <AppSymbol
                    name="paperclip"
                    size={14}
                    tintColor={theme.textSub}
                    fallback={<Text>📎</Text>}
                  />
                  <Text style={[styles.attachmentText, { color: theme.textSub }]} numberOfLines={1}>
                    {att.title}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(150,150,150,0.1)',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 22,
    flex: 1,
    marginRight: 10,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    flexShrink: 0,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  metaText: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  expandToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  expandText: {
    fontSize: 12,
    fontWeight: '500',
  },
  expandedContent: {
    marginTop: 4,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  detailSection: {
    marginBottom: 10,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  detailText: {
    fontSize: 14,
    lineHeight: 22,
  },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  attachmentText: {
    fontSize: 13,
    flex: 1,
  },
});
