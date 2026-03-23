import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import AppSymbol from '../../../components/AppSymbol';
import { useTheme } from '../../../contexts/ThemeContext';
import TrafficSyncAgent from '../components/TrafficSyncAgent';
import { useTrafficData } from '../hooks/useTrafficData';
import {
  TRAFFIC_SOURCE_URL,
  TrafficDirection,
  TrafficStopArrival,
  formatTrafficUpdatedAt,
  sortTrafficArrivals,
} from '../types';

function renderArrivalMeta(arrival: TrafficStopArrival) {
  return `${arrival.stopName} · ${arrival.branchLabel}`;
}

export default function TrafficScreen() {
  const { theme } = useTheme();
  const isFocused = useIsFocused();
  const traffic = useTrafficData({ active: isFocused });

  const downhill = useMemo(
    () => sortTrafficArrivals('downhill', traffic.snapshot?.downhill || []),
    [traffic.snapshot]
  );
  const uphill = useMemo(
    () => sortTrafficArrivals('uphill', traffic.snapshot?.uphill || []),
    [traffic.snapshot]
  );

  const openSource = () => {
    void Linking.openURL(TRAFFIC_SOURCE_URL);
  };

  const renderSection = (title: string, direction: TrafficDirection, items: TrafficStopArrival[]) => (
    <View style={[styles.sectionCard, { backgroundColor: theme.card, shadowColor: theme.text }]} key={direction}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      {items.length === 0 ? (
        <Text style={[styles.sectionEmpty, { color: theme.textSub }]}>暫無即時資料</Text>
      ) : (
        items.map((arrival) => (
          <View style={styles.arrivalRow} key={`${direction}-${arrival.stopName}`}>
            <View style={styles.arrivalTextBlock}>
              <Text style={[styles.arrivalStop, { color: theme.text }]}>{arrival.stopName}</Text>
              <Text style={[styles.arrivalMeta, { color: theme.textSub }]} numberOfLines={1}>
                {renderArrivalMeta(arrival)}
              </Text>
            </View>
            <Text style={[styles.arrivalEta, { color: arrival.isDue ? theme.warning : theme.primary }]}>
              {arrival.etaText}
            </Text>
          </View>
        ))
      )}
    </View>
  );

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <TrafficSyncAgent
        enabled={traffic.sync.enabled}
        reloadKey={traffic.sync.reloadKey}
        onComplete={traffic.sync.onComplete}
      />

      <View style={[styles.heroCard, { backgroundColor: theme.card, shadowColor: theme.text }]}>
        <View style={styles.heroHeader}>
          <AppSymbol name="bus.fill" size={28} tintColor={theme.warning} fallback={<Text>Bus</Text>} />
          <Text style={[styles.heroTitle, { color: theme.text }]}>紅 5 交通動態</Text>
        </View>
        <Text style={[styles.heroText, { color: theme.textSub }]}>
          直接抓取大臺北公車官方頁面，顯示文化大學與文化大學一兩個校園站牌的即時到站資訊。
        </Text>
        <View style={styles.actionRow}>
          <Pressable style={[styles.actionButton, { backgroundColor: theme.syncBtnBg }]} onPress={traffic.refresh}>
            <AppSymbol name="arrow.clockwise" size={16} tintColor={theme.primary} fallback={<Text>R</Text>} />
            <Text style={[styles.actionText, { color: theme.primary }]}>
              {traffic.refreshing ? '更新中...' : '重新整理'}
            </Text>
          </Pressable>
          <Pressable style={[styles.actionButton, { backgroundColor: theme.syncBtnBg }]} onPress={openSource}>
            <AppSymbol name="doc.text.magnifyingglass" size={16} tintColor={theme.text} fallback={<Text>i</Text>} />
            <Text style={[styles.actionText, { color: theme.text }]}>官方頁面</Text>
          </Pressable>
        </View>
        <Text style={[styles.updatedText, { color: theme.textSub }]}>
          {traffic.snapshot
            ? `${traffic.error ? '較早資料' : '最後更新'} ${formatTrafficUpdatedAt(traffic.snapshot.updatedAt)}`
            : '尚未取得交通資料'}
        </Text>
      </View>

      {traffic.loading && !traffic.snapshot ? (
        <View style={[styles.statusCard, { backgroundColor: theme.card, shadowColor: theme.text }]}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={[styles.statusText, { color: theme.textSub }]}>讀取紅 5 即時資訊中...</Text>
        </View>
      ) : null}

      {traffic.error ? (
        <View style={[styles.noticeCard, { backgroundColor: theme.card, shadowColor: theme.text }]}>
          <Text style={[styles.noticeTitle, { color: theme.text }]}>更新提醒</Text>
          <Text style={[styles.noticeText, { color: theme.textSub }]}>
            {traffic.error}
          </Text>
        </View>
      ) : null}

      {renderSection('下山 · 往劍潭', 'downhill', downhill)}
      {renderSection('上山 · 往陽明山', 'uphill', uphill)}
      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 16 },
  heroCard: {
    borderRadius: 28,
    padding: 22,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  heroHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  heroTitle: { fontSize: 22, fontWeight: '700', marginLeft: 8 },
  heroText: { fontSize: 15, lineHeight: 22 },
  actionRow: { flexDirection: 'row', marginTop: 16 },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginRight: 10,
  },
  actionText: { fontSize: 14, fontWeight: '600', marginLeft: 6 },
  updatedText: { marginTop: 14, fontSize: 13 },
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
  statusText: { marginTop: 10, fontSize: 14 },
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
  sectionCard: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', marginBottom: 14 },
  sectionEmpty: { fontSize: 14 },
  arrivalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  arrivalTextBlock: { flex: 1, marginRight: 12 },
  arrivalStop: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  arrivalMeta: { fontSize: 13 },
  arrivalEta: { fontSize: 18, fontWeight: '700' },
  bottomSpacer: { height: 80 },
});
