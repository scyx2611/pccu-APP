import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { TutoringAnnouncement } from '../types';
import { useTheme } from '../../../providers/theme/ThemeProvider';
import AppSymbol from '../../../shared/components/AppSymbol';

interface TutoringAnnouncementItemProps {
  announcement: TutoringAnnouncement;
  isExpanded?: boolean;
  onToggle?: () => void;
}

export default function TutoringAnnouncementItem({ announcement, isExpanded: controlledExpanded, onToggle }: TutoringAnnouncementItemProps) {
  const { theme } = useTheme();
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = controlledExpanded ?? internalExpanded;

  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalExpanded(!internalExpanded);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } catch {
      return dateStr;
    }
  };

  const contentPreview = announcement.contentText || announcement.title;
  const truncatedPreview = contentPreview.length > 60
    ? contentPreview.slice(0, 60) + '...'
    : contentPreview;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: theme.card, shadowColor: theme.text }]}
      onPress={handleToggle}
      activeOpacity={0.7}
    >
      <View style={styles.headerRow}>
        {announcement.isRead ? null : (
          <View style={[styles.unreadDot, { backgroundColor: theme.primary }]} />
        )}
        <Text
          style={[
            styles.title,
            { color: theme.text, fontWeight: announcement.isRead ? '500' : '600' },
          ]}
          numberOfLines={2}
        >
          {announcement.title}
        </Text>
      </View>

      <View style={styles.metaRow}>
        <Text style={[styles.metaText, { color: theme.textSub }]}>
          {announcement.teacherName} · {formatDate(announcement.createdAt)}
        </Text>
      </View>

      {!isExpanded && (
        <Text style={[styles.previewText, { color: theme.textSub }]} numberOfLines={2}>
          {truncatedPreview}
        </Text>
      )}

      {isExpanded && (
        <View style={styles.expandedContent}>
          <View style={[styles.divider, { borderColor: theme.border }]} />
          <Text style={[styles.contentText, { color: theme.text }]} selectable>
            {announcement.contentText || announcement.contentHtml || '無內容'}
          </Text>
        </View>
      )}

      <View style={styles.expandRow}>
        <AppSymbol
          name={isExpanded ? 'chevron.up' : 'chevron.down'}
          size={16}
          tintColor={theme.primary}
          fallback={<Text>{isExpanded ? '▲' : '▼'}</Text>}
        />
        <Text style={[styles.expandText, { color: theme.primary }]}>
          {isExpanded ? '收合' : '展開公告'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    marginRight: 8,
    flexShrink: 0,
  },
  title: {
    fontSize: 15,
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  metaText: {
    fontSize: 12,
  },
  previewText: {
    fontSize: 13,
    lineHeight: 20,
    marginTop: 4,
  },
  expandedContent: {
    marginTop: 4,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginBottom: 10,
  },
  contentText: {
    fontSize: 14,
    lineHeight: 22,
  },
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  expandText: {
    fontSize: 12,
    fontWeight: '500',
  },
});
