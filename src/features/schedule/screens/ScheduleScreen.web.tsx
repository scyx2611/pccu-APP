import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../../providers/theme/ThemeProvider';

export default function ScheduleScreen() {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <Text style={[styles.title, { color: theme.text }]}>Schedule is not available on web.</Text>
      <Text style={[styles.text, { color: theme.textSub }]}>
        Please use the iOS or Android app.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 8 },
  text: { fontSize: 14, textAlign: 'center' },
});
