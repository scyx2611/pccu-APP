import React from 'react';
import { View, Text, StyleSheet, ScrollView, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function HomeScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerSpacer} />
      
      {/* 歡迎橫幅：VisionOS 懸浮風格 */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="sparkles" size={24} color="#0A7AFF" />
          <Text style={styles.cardTitle}>早安，同學</Text>
        </View>
        <Text style={styles.cardText}>今天有一點微風，陽明山氣溫 18°C。別忘了帶件外套！</Text>
      </View>

      {/* 小卡片：兩兩並排 (Grid) */}
      <View style={styles.gridContainer}>
        <View style={[styles.card, styles.gridCard]}>
          <Ionicons name="bus" size={32} color="#FF9500" style={styles.gridIcon} />
          <Text style={styles.gridTitle}>紅 5 動態</Text>
          <Text style={styles.gridSub}>即將進站</Text>
        </View>
        
        <View style={[styles.card, styles.gridCard]}>
          <Ionicons name="library" size={32} color="#AF52DE" style={styles.gridIcon} />
          <Text style={styles.gridTitle}>圖書館</Text>
          <Text style={styles.gridSub}>預約座位</Text>
        </View>
      </View>

      {/* 佔位卡片：模擬捲動時的毛玻璃效果 */}
      <View style={styles.largeCard}>
        <Text style={styles.cardTitle}>校園公告</Text>
        <Text style={styles.cardText}>這裡是未來的校園最新動態，當您往上捲動時，這個區塊會流暢地滑過頂部與底部的玻璃導航列。</Text>
        <View style={styles.skeletonRow} />
        <View style={styles.skeletonRowShort} />
      </View>
      <View style={styles.largeCard}>
        <Text style={styles.cardTitle}>校園公告</Text>
        <Text style={styles.cardText}>這裡是未來的校園最新動態，當您往上捲動時，這個區塊會流暢地滑過頂部與底部的玻璃導航列。</Text>
        <View style={styles.skeletonRow} />
        <View style={styles.skeletonRowShort} />
      </View>
      <View style={styles.largeCard}>
        <Text style={styles.cardTitle}>校園公告</Text>
        <Text style={styles.cardText}>這裡是未來的校園最新動態，當您往上捲動時，這個區塊會流暢地滑過頂部與底部的玻璃導航列。</Text>
        <View style={styles.skeletonRow} />
        <View style={styles.skeletonRowShort} />
      </View>
      <View style={styles.largeCard}>
        <Text style={styles.cardTitle}>校園公告</Text>
        <Text style={styles.cardText}>這裡是未來的校園最新動態，當您往上捲動時，這個區塊會流暢地滑過頂部與底部的玻璃導航列。</Text>
        <View style={styles.skeletonRow} />
        <View style={styles.skeletonRowShort} />
      </View>

      {/* 底部留白，避免內容被懸浮 Tab 蓋住 */}
      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F9' }, // iOS 冷白灰背景
  content: { paddingHorizontal: 20 },
  headerSpacer: { height: 120 }, // 避開頂部 Navigation Bar
  bottomSpacer: { height: 140 }, // 避開底部懸浮 Tab Bar
  
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28, // iOS 26 連續曲線超大圓角
    padding: 24,
    marginBottom: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04, // 極度柔和的光影
    shadowRadius: 16,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardTitle: { fontSize: 20, fontWeight: '700', color: '#1C1C1E', marginLeft: 8 },
  cardText: { fontSize: 16, color: '#8E8E93', lineHeight: 24 },
  
  gridContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  gridCard: { width: '47%', marginBottom: 0, padding: 20, alignItems: 'flex-start' },
  gridIcon: { marginBottom: 16 },
  gridTitle: { fontSize: 18, fontWeight: '700', color: '#1C1C1E', marginBottom: 4 },
  gridSub: { fontSize: 14, color: '#8E8E93' },

  largeCard: {
    backgroundColor: '#FFFFFF', borderRadius: 28, padding: 24, marginBottom: 20,
    shadowColor: '#000000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.04, shadowRadius: 16,
  },
  skeletonRow: { height: 12, backgroundColor: '#E5E5EA', borderRadius: 6, width: '100%', marginTop: 24, marginBottom: 12 },
  skeletonRowShort: { height: 12, backgroundColor: '#E5E5EA', borderRadius: 6, width: '60%' },
});
