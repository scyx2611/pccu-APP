import React from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { ThemeMode, useTheme } from '../../../providers/theme/ThemeProvider';
import { logoutPCCU } from '../../auth/services/authService';
import AppSymbol from '../../../shared/components/AppSymbol';

export default function SettingsScreen() {
  const { mode, theme, isDark } = useTheme();

  const handleLogout = () => {
    Alert.alert('登出帳號', '確定要登出目前的 PCCU 帳號嗎？', [
      { text: '取消', style: 'cancel' },
      {
        text: '登出',
        style: 'destructive',
        onPress: async () => {
          await logoutPCCU();
          router.replace('/');
        },
      },
    ]);
  };

  const modeLabels: Record<ThemeMode, string> = {
    system: '系統',
    light: '淺色',
    dark: '深色',
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.sectionTitle, { color: theme.textSub }]}>應用設定</Text>
      <View style={[styles.insetGroup, { backgroundColor: theme.card }]}> 
        <TouchableOpacity style={styles.cellRow} onPress={() => router.push('/settings/notifications')}>
          <View style={[styles.iconContainer, { backgroundColor: theme.danger }]}> 
            <AppSymbol name="bell.fill" size={18} tintColor="#FFF" fallback={<Text style={{ color: '#FFF' }}>B</Text>} />
          </View>
          <Text style={[styles.cellText, { color: theme.text }]}>通知</Text>
          <AppSymbol name="chevron.right" size={14} tintColor={theme.border} weight="semibold" fallback={<Text style={{ color: theme.border }}>&gt;</Text>} />
        </TouchableOpacity>

        <View style={[styles.separator, { backgroundColor: theme.border }]} />

        <TouchableOpacity style={styles.cellRow} onPress={() => router.push('/settings/appearance')}>
          <View style={[styles.iconContainer, { backgroundColor: theme.primary }]}> 
            <AppSymbol name={isDark ? 'moon.fill' : 'sun.max.fill'} size={18} tintColor="#FFF" fallback={<Text style={{ color: '#FFF' }}>T</Text>} />
          </View>
          <Text style={[styles.cellText, styles.systemCellText, { color: theme.text }]}>外觀</Text>
          <Text style={[styles.cellValue, { color: theme.textSub }]}>{modeLabels[mode]}</Text>
          <AppSymbol name="chevron.right" size={14} tintColor={theme.border} weight="semibold" fallback={<Text style={{ color: theme.border }}>&gt;</Text>} />
        </TouchableOpacity>

        <View style={[styles.separator, { backgroundColor: theme.border }]} />

        <TouchableOpacity style={styles.cellRow} onPress={() => router.push('/settings/security')}>
          <View style={[styles.iconContainer, { backgroundColor: '#FF9500' }]}> 
            <AppSymbol name="lock.fill" size={18} tintColor="#FFF" fallback={<Text style={{ color: '#FFF' }}>S</Text>} />
          </View>
          <Text style={[styles.cellText, { color: theme.text }]}>安全性</Text>
          <AppSymbol name="chevron.right" size={14} tintColor={theme.border} weight="semibold" fallback={<Text style={{ color: theme.border }}>&gt;</Text>} />
        </TouchableOpacity>

        <View style={[styles.separator, { backgroundColor: theme.border }]} />

        <TouchableOpacity style={styles.cellRow} onPress={() => router.push('/settings/privacy')}>
          <View style={[styles.iconContainer, { backgroundColor: '#5AC8FA' }]}> 
            <AppSymbol name="hand.raised.fill" size={18} tintColor="#FFF" fallback={<Text style={{ color: '#FFF' }}>P</Text>} />
          </View>
          <Text style={[styles.cellText, { color: theme.text }]}>隱私</Text>
          <AppSymbol name="chevron.right" size={14} tintColor={theme.border} weight="semibold" fallback={<Text style={{ color: theme.border }}>&gt;</Text>} />
        </TouchableOpacity>

        <View style={[styles.separator, { backgroundColor: theme.border }]} />

        <TouchableOpacity style={styles.cellRow} onPress={() => router.push('/settings/developer')}>
          <View style={[styles.iconContainer, { backgroundColor: '#5856D6' }]}> 
            <AppSymbol name="wrench.and.screwdriver.fill" size={18} tintColor="#FFF" fallback={<Text style={{ color: '#FFF' }}>D</Text>} />
          </View>
          <Text style={[styles.cellText, { color: theme.text }]}>開發者</Text>
          <AppSymbol name="chevron.right" size={14} tintColor={theme.border} weight="semibold" fallback={<Text style={{ color: theme.border }}>&gt;</Text>} />
        </TouchableOpacity>

        <View style={[styles.separator, { backgroundColor: theme.border }]} />

        <TouchableOpacity style={styles.cellRow} onPress={() => router.push('/settings/about')}>
          <View style={[styles.iconContainer, { backgroundColor: theme.success || '#34C759' }]}> 
            <AppSymbol name="info.circle.fill" size={18} tintColor="#FFF" fallback={<Text style={{ color: '#FFF' }}>i</Text>} />
          </View>
          <Text style={[styles.cellText, { color: theme.text }]}>關於</Text>
          <AppSymbol name="chevron.right" size={14} tintColor={theme.border} weight="semibold" fallback={<Text style={{ color: theme.border }}>&gt;</Text>} />
        </TouchableOpacity>
      </View>

      <View style={[styles.insetGroup, { backgroundColor: theme.card }]}> 
        <TouchableOpacity style={styles.cellRowCenter} onPress={handleLogout}>
          <Text style={[styles.logoutText, { color: theme.danger }]}>登出目前帳號</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 16 },
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
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  cellRowCenter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    minHeight: 52,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cellText: {
    flex: 1,
    fontSize: 17,
    fontWeight: '500',
  },
  systemCellText: {
    fontWeight: '400',
  },
  cellValue: {
    fontSize: 17,
    marginRight: 8,
    fontWeight: '400',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 64,
  },
  logoutText: {
    fontSize: 17,
    fontWeight: '600',
  },
  bottomSpacer: { height: 80 },
});
