import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useTheme } from '../../../providers/theme/ThemeProvider';
import {
  getCourseReminderPresentationMode,
  refreshScheduledCourseReminders,
} from '../../notifications/services/courseReminderService';
import {
  getCourseRemindersEnabled,
  getNotificationsEnabled,
  setCourseRemindersEnabled,
  setNotificationsEnabled,
} from '../storage/notificationSettings';

export default function NotificationsScreen() {
  const { theme } = useTheme();
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  const [courseRemindersEnabled, setCourseRemindersEnabledState] = useState(false);

  useEffect(() => {
    let active = true;

    const loadSettings = async () => {
      const [notifications, courseReminders] = await Promise.all([
        getNotificationsEnabled(),
        getCourseRemindersEnabled(),
      ]);

      if (!active) return;
      setNotificationsEnabledState(notifications);
      setCourseRemindersEnabledState(courseReminders);
    };

    void loadSettings();

    return () => {
      active = false;
    };
  }, []);

  const presentationMode = getCourseReminderPresentationMode();

  const handleNotificationsToggle = async (value: boolean) => {
    setNotificationsEnabledState(value);
    await setNotificationsEnabled(value);
    if (!value && courseRemindersEnabled) {
      await refreshScheduledCourseReminders([]);
      return;
    }
    await refreshScheduledCourseReminders();
  };

  const handleCourseRemindersToggle = async (value: boolean) => {
    setCourseRemindersEnabledState(value);
    await setCourseRemindersEnabled(value);

    if (value && presentationMode !== 'dynamic-island') {
      Alert.alert(
        '目前會使用一般通知',
        '你現在不是 build 環境，因此課程提醒會先用一般本地通知顯示；之後改用 iOS build / dev client 時，才會走靈動島模式。'
      );
    }

    await refreshScheduledCourseReminders();
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.sectionTitle, { color: theme.textSub }]}>通知設定</Text>
      <View style={[styles.insetGroup, { backgroundColor: theme.card }]}> 
        <View style={styles.switchRow}>
          <View style={styles.textWrap}>
            <Text style={[styles.cellTitle, { color: theme.text }]}>啟用通知</Text>
            <Text style={[styles.cellSubtitle, { color: theme.textSub }]}>接收課表、成績與校園相關提醒通知。</Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={handleNotificationsToggle}
            trackColor={{ false: theme.border, true: '#34C759' }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={[styles.separator, { backgroundColor: theme.border }]} />

        <View style={styles.switchRow}>
          <View style={styles.textWrap}>
            <Text style={[styles.cellTitle, { color: theme.text }]}>課程即時通知</Text>
            <Text style={[styles.cellSubtitle, { color: theme.textSub }]}>上課前 10 分鐘提醒下節課資訊。</Text>
          </View>
          <Switch
            value={notificationsEnabled && courseRemindersEnabled}
            onValueChange={handleCourseRemindersToggle}
            disabled={!notificationsEnabled}
            trackColor={{ false: theme.border, true: '#34C759' }}
            thumbColor="#FFFFFF"
          />
        </View>
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
  bottomSpacer: { height: 80 },
});
