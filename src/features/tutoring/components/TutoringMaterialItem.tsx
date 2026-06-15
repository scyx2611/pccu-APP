import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { TutoringMaterial } from '../types';
import { useTheme } from '../../../providers/theme/ThemeProvider';
import AppSymbol from '../../../shared/components/AppSymbol';

interface TutoringMaterialItemProps {
  material: TutoringMaterial;
  onDownload?: () => void;
}

function getFileIcon(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'pdf': return 'doc.fill';
    case 'doc':
    case 'docx': return 'doc.text.fill';
    case 'ppt':
    case 'pptx': return 'presentation.fill';
    case 'xls':
    case 'xlsx': return 'tablecells.fill';
    case 'zip':
    case 'rar':
    case '7z': return 'archivebox.fill';
    default: return 'doc.fill';
  }
}

function getFileEmoji(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'pdf': return '📕';
    case 'doc':
    case 'docx': return '📘';
    case 'ppt':
    case 'pptx': return '📙';
    case 'xls':
    case 'xlsx': return '📗';
    case 'zip':
    case 'rar': return '📦';
    default: return '📄';
  }
}

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return dateStr;
  }
}

export default function TutoringMaterialItem({ material, onDownload }: TutoringMaterialItemProps) {
  const { theme } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: theme.card, shadowColor: theme.text }]}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <AppSymbol name={getFileIcon(material.fileName)} size={20} tintColor={theme.primary} fallback={<Text>{getFileEmoji(material.fileName)}</Text>} />
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={2}>
            {material.title}
          </Text>
        </View>
        {material.downable && onDownload && (
          <TouchableOpacity
            style={[styles.downloadBtn, { backgroundColor: theme.primary }]}
            onPress={onDownload}
            activeOpacity={0.7}
          >
            <Text style={styles.downloadBtnText}>下載</Text>
          </TouchableOpacity>
        )}
      </View>

      {material.catalog ? (
        <View style={styles.categoryRow}>
          <View style={[styles.categoryBadge, { backgroundColor: 'rgba(10,122,255,0.1)' }]}>
            <Text style={[styles.categoryText, { color: theme.primary }]}>{material.catalog}</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.infoRow}>
        <Text style={[styles.infoText, { color: theme.textSub }]}>
          檔案：{material.fileName}
        </Text>
      </View>

      <Text style={[styles.infoText, { color: theme.textSub }]}>
        更新：{formatDate(material.updatedAt)}
      </Text>

      {material.memoText ? (
        <Text style={[styles.noteText, { color: theme.textSub }]}>
          備註：{material.memoText}
        </Text>
      ) : null}
    </View>
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
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  title: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '800',
    marginLeft: 12,
    flex: 1,
  },
  downloadBtn: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexShrink: 0,
  },
  downloadBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  categoryRow: {
    marginBottom: 6,
  },
  categoryBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  categoryText: {
    fontSize: 11,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  infoText: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  noteText: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 6,
  },
});
