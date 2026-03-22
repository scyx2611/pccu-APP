import React from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { useTheme } from '../../../providers/theme/ThemeProvider';

export default function AboutScreen() {
  const { theme } = useTheme();
  const version = Constants.expoConfig?.version || '1.0.0';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.heroCard, { backgroundColor: theme.card }]}>
        <Image source={require('../../../../assets/icon.png')} style={styles.logo} />
        <Text style={[styles.appName, { color: theme.text }]}>PCCU App</Text>
        <Text style={[styles.versionText, { color: theme.textSub }]}>版本 {version}</Text>
      </View>

      <Text style={[styles.sectionTitle, { color: theme.textSub }]}>應用資訊</Text>
      <View style={[styles.insetGroup, { backgroundColor: theme.card }]}>
        <View style={styles.cellRow}>
          <Text style={[styles.cellTitle, { color: theme.text }]}>開發團隊</Text>
          <Text style={[styles.cellValue, { color: theme.textSub }]}>PCCU Developer Team</Text>
        </View>
        <View style={[styles.separator, { backgroundColor: theme.border }]} />
        <View style={styles.cellRow}>
          <Text style={[styles.cellTitle, { color: theme.text }]}>授權方式</Text>
          <Text style={[styles.cellValue, { color: theme.textSub }]}>MIT License</Text>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: theme.textSub }]}>說明</Text>
      <View style={[styles.noteCard, { backgroundColor: theme.card }]}>
        <Text style={[styles.noteText, { color: theme.textSub }]}>
          此 App 用於整合 PCCU 校園常用資訊，提供更接近原生 iOS 的操作體驗。
        </Text>
      </View>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 16 },
  heroCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  logo: { width: 84, height: 84, borderRadius: 20, marginBottom: 16 },
  appName: { fontSize: 24, fontWeight: '700', marginBottom: 6 },
  versionText: { fontSize: 15 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 36,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  insetGroup: {
    marginHorizontal: 20,
    borderRadius: 16,
    marginBottom: 24,
    overflow: 'hidden',
  },
  cellRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  cellTitle: { fontSize: 17, fontWeight: '500' },
  cellValue: { fontSize: 16 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  noteCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  noteText: { fontSize: 14, lineHeight: 21 },
  bottomSpacer: { height: 80 },
});
