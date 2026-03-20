import React from 'react';
import { View, Text, StyleSheet, ScrollView, Switch } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '../../../providers/theme/ThemeProvider';

export default function NotificationsScreen() {
  const { theme } = useTheme();
  const [notificationsEnabled, setNotificationsEnabled] = React.useState(true);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <Stack.Screen options={{ title: '通知' }} />
      <ScrollView contentContainerStyle={styles.scrollContent} contentInsetAdjustmentBehavior="automatic">

        <View style={[styles.insetGroup, { backgroundColor: theme.card }]}>
          <View style={styles.cellRow}>
            <View style={styles.cellTextContainer}>
              <Text style={[styles.cellTitle, { color: theme.text }]}>允許通知</Text>
              <Text style={[styles.cellSubtitle, { color: theme.textSub }]}>接收成績更新與重要公告的推播通知</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ true: theme.primary }}
            />
          </View>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16 },
  insetGroup: { borderRadius: 10, overflow: 'hidden', marginBottom: 20 },
  cellRow: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  cellTextContainer: { flex: 1, paddingRight: 16 },
  cellTitle: { fontSize: 17, fontWeight: '400', marginBottom: 4 },
  cellSubtitle: { fontSize: 13 }
});
