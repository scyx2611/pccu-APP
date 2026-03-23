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

      <View style={styles.sectionBlock}>
        <Text style={[styles.sectionTitle, { color: theme.textSub }]}>應用資訊</Text>
        <View style={[styles.insetGroup, { backgroundColor: theme.card }]}>
          <View style={styles.cellRow}>
            <Text style={[styles.cellTitle, { color: theme.text }]}>開發者</Text>
            <Text style={[styles.cellValue, { color: theme.textSub }]}>資管系-蔡侑軒</Text>
          </View>
          <View style={[styles.separator, { backgroundColor: theme.border }]} />
          <View style={styles.cellRow}>
            <Text style={[styles.cellTitle, { color: theme.text }]}>授權條款</Text>
            <Text style={[styles.cellValue, { color: theme.textSub }]}>MIT License</Text>
          </View>
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={[styles.sectionTitle, { color: theme.textSub }]}>說明</Text>
        <View style={[styles.noteCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.noteText, { color: theme.textSub }]}>這個 App 用來整合 PCCU 校園常用資訊，提供課表、成績、交通與設定等功能，並持續朝更貼近 iOS 體驗的方向優化。</Text>
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={[styles.sectionTitle, { color: theme.textSub }]}>免責聲明</Text>
        <View style={[styles.noteCard, { backgroundColor: theme.card }]}>
          <Text style={[styles.noteText, { color: theme.textSub }]}>
            本 App 僅供學習、研究與個人使用參考，並非中國文化大學官方服務。頁面資料可能因同步時間、系統狀態或來源變動而有所落差，實際資訊仍應以校方系統、公告與正式通知為準。
          </Text>
        </View>
      </View>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 16, paddingBottom: 24 },
  heroCard: {
    marginHorizontal: 20,
    marginBottom: 28,
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  logo: { width: 84, height: 84, borderRadius: 20, marginBottom: 16 },
  appName: { fontSize: 24, fontWeight: '700', marginBottom: 6 },
  versionText: { fontSize: 15 },
  sectionBlock: {
    marginBottom: 20,
  },
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
    paddingVertical: 18,
    paddingHorizontal: 18,
  },
  noteText: { fontSize: 14, lineHeight: 22 },
  bottomSpacer: { height: 80 },
});
