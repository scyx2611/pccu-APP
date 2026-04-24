import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import AppSymbol from '../../../shared/components/AppSymbol';
import { useTheme } from '../../../providers/theme/ThemeProvider';
import { useTrafficData } from '../hooks/useTrafficData';
import {
  TRAFFIC_SOURCE_URL,
  TrafficDirection,
  TrafficStopArrival,
  sortTrafficArrivals,
} from '../types';
import { buildUpdatedAtText } from '../../../utils/updatedAt';

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

  const updatedAtText = buildUpdatedAtText({
    updatedAt: traffic.snapshot?.updatedAt ?? null,
    isUpdating: traffic.pullRefreshing,
    updatingLabel: '正在更新交通動態...',
    emptyLabel: '尚未同步交通資訊',
  });

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
          <View style={styles.arrivalRow} key={`${direction}-${arrival.stopName}-${arrival.branchLabel}`}>
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
      refreshControl={(
        <RefreshControl
          refreshing={traffic.pullRefreshing}
          onRefresh={() => traffic.refresh('manual')}
          tintColor={theme.primary}
          colors={[theme.primary]}
        />
      )}
      >
        <View style={[styles.heroCard, { backgroundColor: theme.card, shadowColor: theme.text }]}>
        <View style={styles.heroHeader}>
          <AppSymbol name="bus.fill" size={28} tintColor={theme.warning} fallback={<Text>Bus</Text>} />
          <Text style={[styles.heroTitle, { color: theme.text }]}>交通動態</Text>
        </View>
        <Text style={[styles.heroText, { color: theme.textSub }]}>以大臺北公車紅 5 經文大路線為主，整理上下山校園站點的即時到站資訊。</Text>
        <View style={styles.actionRow}>
          <Pressable style={[styles.actionButton, { backgroundColor: theme.syncBtnBg }]} onPress={openSource}>
            <AppSymbol name="doc.text.magnifyingglass" size={16} tintColor={theme.text} fallback={<Text>i</Text>} />
            <Text style={[styles.actionText, { color: theme.text }]}>官方來源</Text>
          </Pressable>
        </View>
      </View>

      {traffic.loading && !traffic.snapshot ? (
        <View style={[styles.statusCard, { backgroundColor: theme.card, shadowColor: theme.text }]}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={[styles.statusText, { color: theme.textSub }]}>正在載入紅 5 即時資訊...</Text>
        </View>
      ) : null}

      {traffic.error ? (
        <View style={[styles.noticeCard, { backgroundColor: theme.card, shadowColor: theme.text }]}>
          <Text style={[styles.noticeTitle, { color: theme.text }]}>同步狀態</Text>
          <Text style={[styles.noticeText, { color: theme.textSub }]}>{traffic.error}</Text>
        </View>
      ) : null}

      {renderSection('下山 · 往劍潭方向', 'downhill', downhill)}
      {renderSection('上山 · 往陽明山方向', 'uphill', uphill)}

      <Text style={[styles.updatedText, { color: theme.textSub }]}>{updatedAtText}</Text>
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
  updatedText: { marginTop: 4, marginBottom: 8, fontSize: 13, textAlign: 'center' },
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
