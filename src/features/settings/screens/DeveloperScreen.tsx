import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useTheme } from '../../../providers/theme/ThemeProvider';
import {
  getDeveloperDebugEnabled,
  getHomeCourseCardTestEnabled,
  setDeveloperDebugEnabled,
  setHomeCourseCardTestEnabled,
} from '../storage/developerSettings';
import { getCourseReminderPresentationMode } from '../../notifications/services/courseReminderService';

export default function DeveloperScreen() {
  const { theme } = useTheme();
  const [developerDebugEnabled, setDeveloperDebugEnabledState] = useState(false);
  const [homeCourseCardTestEnabled, setHomeCourseCardTestEnabledState] = useState(false);
  const [sendingTestNotification, setSendingTestNotification] = useState(false);

  useEffect(() => {
    let active = true;

    const loadSettings = async () => {
      const [debugEnabled, courseCardTestEnabled] = await Promise.all([
        getDeveloperDebugEnabled(),
        getHomeCourseCardTestEnabled(),
      ]);
      if (!active) return;
      setDeveloperDebugEnabledState(debugEnabled);
      setHomeCourseCardTestEnabledState(courseCardTestEnabled);
    };

    void loadSettings();

    return () => {
      active = false;
    };
  }, []);

  const handleDeveloperDebugToggle = async (value: boolean) => {
    setDeveloperDebugEnabledState(value);
    await setDeveloperDebugEnabled(value);
  };

  const handleHomeCourseCardTestToggle = async () => {
    const nextValue = !homeCourseCardTestEnabled;
    setHomeCourseCardTestEnabledState(nextValue);
    await setHomeCourseCardTestEnabled(nextValue);
  };

  const handleSendTestNotification = async () => {
    if (sendingTestNotification) return;

    setSendingTestNotification(true);
    try {
      const current = await Notifications.getPermissionsAsync();
      const granted =
        current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;

      let permissionGranted = granted;
      if (!permissionGranted) {
        const requested = await Notifications.requestPermissionsAsync();
        permissionGranted =
          requested.granted ||
          requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
      }

      if (!permissionGranted) {
        Alert.alert('無法送出通知', '目前尚未允許通知權限，請先到系統設定開啟通知。');
        return;
      }

      const presentationMode = getCourseReminderPresentationMode();
      await Notifications.scheduleNotificationAsync({
        content: {
          title: presentationMode === 'dynamic-island' ? '測試課程通知' : '測試一般通知',
          body: '程式設計(二) · 大義 0402',
          subtitle: '週一 09:10-12:00',
          sound: 'default',
          data: {
            kind: 'developer-test',
            presentationMode,
            dynamicIsland: {
              compactLeading: '程式設計(二)',
              compactTrailing: '大義 0402',
              expandedCourseName: '程式設計(二)',
              expandedTime: '週一 09:10-12:00',
              expandedLocation: '大義 0402',
            },
          },
        },
        trigger: null,
      });

      Alert.alert(
        '已送出測試通知',
        presentationMode === 'dynamic-island'
          ? '目前為 build 環境，已用靈動島資料模式送出測試通知。'
          : '目前不是 build 環境，已用一般通知模式送出測試通知。',
      );
    } catch (error) {
      Alert.alert('送出失敗', '測試通知送出失敗，請稍後再試。');
    } finally {
      setSendingTestNotification(false);
    }
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.sectionTitle, { color: theme.textSub }]}>開發工具</Text>
      <View style={[styles.insetGroup, { backgroundColor: theme.card }]}>
        <View style={styles.switchRow}>
          <View style={styles.textWrap}>
            <Text style={[styles.cellTitle, { color: theme.text }]}>開發者除錯模式</Text>
            <Text style={[styles.cellSubtitle, { color: theme.textSub }]}>
              顯示同步過程中的除錯資訊與預覽內容。
            </Text>
          </View>
          <Switch
            value={developerDebugEnabled}
            onValueChange={(value) => void handleDeveloperDebugToggle(value)}
            trackColor={{ false: theme.border, true: '#34C759' }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={[styles.separator, { backgroundColor: theme.border }]} />

        <Pressable style={styles.actionRow} onPress={() => void handleHomeCourseCardTestToggle()}>
          <View style={styles.textWrap}>
            <Text style={[styles.cellTitle, { color: theme.text }]}>首頁課程卡測試</Text>
            <Text style={[styles.cellSubtitle, { color: theme.textSub }]}>
              暫時顯示目前上計算機概論，下節為程式設計。
            </Text>
          </View>
          <Text
            style={[
              styles.actionLabel,
              { color: homeCourseCardTestEnabled ? theme.danger : theme.primary },
            ]}
          >
            {homeCourseCardTestEnabled ? '關閉' : '啟用'}
          </Text>
        </Pressable>

        <View style={[styles.separator, { backgroundColor: theme.border }]} />

        <Pressable style={styles.actionRow} onPress={() => void handleSendTestNotification()}>
          <View style={styles.textWrap}>
            <Text style={[styles.cellTitle, { color: theme.text }]}>通知測試</Text>
            <Text style={[styles.cellSubtitle, { color: theme.textSub }]}>
              立即送出一則課程提醒測試通知。
            </Text>
          </View>
          <Text
            style={[
              styles.actionLabel,
              { color: sendingTestNotification ? theme.textSub : theme.primary },
            ]}
          >
            {sendingTestNotification ? '送出中' : '送出'}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.noteCard, { backgroundColor: theme.card }]}>
        <Text style={[styles.noteText, { color: theme.textSub }]}>
          開發者工具只會影響測試與除錯流程，不會改動正式資料內容。
        </Text>
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 72,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 72,
  },
  textWrap: {
    flex: 1,
    paddingRight: 16,
  },
  cellTitle: {
    fontSize: 17,
    fontWeight: '500',
    marginBottom: 4,
  },
  cellSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  actionLabel: {
    fontSize: 17,
    fontWeight: '600',
  },
  noteCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  noteText: {
    fontSize: 14,
    lineHeight: 21,
  },
  bottomSpacer: { height: 80 },
});
