import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform, Switch } from 'react-native';
import { router } from 'expo-router';
import { logoutPCCU } from '../../auth/services/authService';
import { useTheme, ThemeMode } from '../../../providers/theme/ThemeProvider';
import AppSymbol from '../../../shared/components/AppSymbol';
import { getDeveloperDebugEnabled, setDeveloperDebugEnabled } from '../storage/developerSettings';

export default function SettingsScreen() {
  const { mode, setMode, theme, isDark } = useTheme();
  const [developerDebugEnabled, setDeveloperDebugEnabledState] = useState(false);

  useEffect(() => {
    let active = true;

    const loadSettings = async () => {
      const debugEnabled = await getDeveloperDebugEnabled();

      if (!active) return;

      setDeveloperDebugEnabledState(debugEnabled);
    };

    void loadSettings();

    return () => {
      active = false;
    };
  }, []);

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

  const showThemePicker = () => {
    const options = [
      { text: '跟隨系統', onPress: () => setMode('system') },
      { text: '淺色模式', onPress: () => setMode('light') },
      { text: '深色模式', onPress: () => setMode('dark') },
    ];

    if (Platform.OS === 'android') {
      Alert.alert('主題模式', '選擇你想使用的外觀', options, { cancelable: true });
      return;
    }

    Alert.alert('主題模式', '選擇你想使用的外觀', [
      ...options,
      { text: '取消', style: 'cancel' },
    ]);
  };

  const handleDeveloperDebugToggle = async (value: boolean) => {
    setDeveloperDebugEnabledState(value);
    await setDeveloperDebugEnabled(value);
  };

  const modeLabels: Record<ThemeMode, string> = {
    system: '跟隨系統',
    light: '淺色模式',
    dark: '深色模式',
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView
        style={[styles.container, { backgroundColor: theme.bg }]}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionTitle, { color: theme.textSub }]}>應用程式設定</Text>
        <View style={[styles.insetGroup, { backgroundColor: theme.card }]}>
          <TouchableOpacity style={styles.cellRow} onPress={() => router.push('/settings/notifications')}>
            <View style={[styles.iconContainer, { backgroundColor: theme.danger }]}>
              <AppSymbol name="bell.fill" size={18} tintColor="#FFF" fallback={<Text style={{ color: '#FFF' }}>B</Text>} />
            </View>
            <Text style={[styles.cellText, { color: theme.text }]}>通知</Text>
            <AppSymbol
              name="chevron.right"
              size={14}
              tintColor={theme.border}
              weight="semibold"
              fallback={<Text style={{ color: theme.border }}>&gt;</Text>}
            />
          </TouchableOpacity>

          <View style={[styles.separator, { backgroundColor: theme.border }]} />

          <TouchableOpacity style={styles.cellRow} onPress={showThemePicker}>
            <View style={[styles.iconContainer, { backgroundColor: theme.primary }]}>
              <AppSymbol
                name={isDark ? 'moon.fill' : 'sun.max.fill'}
                size={18}
                tintColor="#FFF"
                fallback={<Text style={{ color: '#FFF' }}>T</Text>}
              />
            </View>
            <Text style={[styles.cellText, { color: theme.text }]}>主題模式</Text>
            <Text style={[styles.cellValue, { color: theme.textSub }]}>{modeLabels[mode]}</Text>
            <AppSymbol
              name="chevron.right"
              size={14}
              tintColor={theme.border}
              weight="semibold"
              fallback={<Text style={{ color: theme.border }}>&gt;</Text>}
            />
          </TouchableOpacity>

          <View style={[styles.separator, { backgroundColor: theme.border }]} />

          <View style={styles.switchRow}>
            <View style={[styles.iconContainer, { backgroundColor: '#5856D6' }]}>
              <AppSymbol
                name="wrench.and.screwdriver.fill"
                size={18}
                tintColor="#FFF"
                fallback={<Text style={{ color: '#FFF' }}>D</Text>}
              />
            </View>
            <View style={styles.switchTextWrap}>
              <Text style={[styles.cellText, { color: theme.text }]}>開發者調適</Text>
              <Text style={[styles.cellCaption, { color: theme.textSub }]}>顯示課表與成績同步預覽</Text>
            </View>
            <Switch
              value={developerDebugEnabled}
              onValueChange={(value) => void handleDeveloperDebugToggle(value)}
              trackColor={{ false: theme.border, true: theme.primary }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={[styles.separator, { backgroundColor: theme.border }]} />

          <TouchableOpacity style={styles.cellRow} onPress={() => router.push('/settings/about')}>
            <View style={[styles.iconContainer, { backgroundColor: theme.success || '#34C759' }]}>
              <AppSymbol name="info.circle.fill" size={18} tintColor="#FFF" fallback={<Text style={{ color: '#FFF' }}>i</Text>} />
            </View>
            <Text style={[styles.cellText, { color: theme.text }]}>關於</Text>
            <AppSymbol
              name="chevron.right"
              size={14}
              tintColor={theme.border}
              weight="semibold"
              fallback={<Text style={{ color: theme.border }}>&gt;</Text>}
            />
          </TouchableOpacity>
        </View>

        <View style={[styles.insetGroup, { backgroundColor: theme.card }]}>
          <TouchableOpacity style={styles.cellRowCenter} onPress={handleLogout}>
            <Text style={[styles.logoutText, { color: theme.danger }]}>登出此帳號</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 64,
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
  switchTextWrap: {
    flex: 1,
    paddingRight: 16,
  },
  cellText: {
    flex: 1,
    fontSize: 17,
    fontWeight: '500',
  },
  cellCaption: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
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
  bottomSpacer: {
    height: 120,
  },
});
