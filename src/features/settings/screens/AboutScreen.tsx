import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image } from 'react-native';
import { Stack } from 'expo-router';
import { useTheme } from '../../../providers/theme/ThemeProvider';

export default function AboutScreen() {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <Stack.Screen options={{ title: '關於' }} />
      <ScrollView contentContainerStyle={styles.scrollContent} contentInsetAdjustmentBehavior="automatic">

        <View style={styles.headerContainer}>
          <Image source={require('../../../../assets/icon.png')} style={styles.logo} />
          <Text style={[styles.appName, { color: theme.text }]}>PCCU App</Text>
          <Text style={[styles.version, { color: theme.textSub }]}>版本 2.0.0 (iOS 26 Style)</Text>
        </View>

        <View style={[styles.insetGroup, { backgroundColor: theme.card }]}>
          <View style={styles.cellRow}>
            <Text style={[styles.cellTitle, { color: theme.text }]}>開發者</Text>
            <Text style={[styles.cellValue, { color: theme.textSub }]}>PCCU Developer Team</Text>
          </View>
          <View style={[styles.separator, { backgroundColor: theme.border }]} />
          <View style={styles.cellRow}>
            <Text style={[styles.cellTitle, { color: theme.text }]}>開源授權</Text>
            <Text style={[styles.cellValue, { color: theme.textSub }]}>MIT License</Text>
          </View>
        </View>

        <Text style={[styles.footerText, { color: theme.textSub }]}>本應用程式非中國文化大學官方發行，資料僅供參考，請以學校系統為準。</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16 },
  headerContainer: { alignItems: 'center', marginVertical: 32 },
  logo: { width: 80, height: 80, borderRadius: 18, marginBottom: 16 },
  appName: { fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  version: { fontSize: 15 },
  insetGroup: { borderRadius: 10, overflow: 'hidden', marginBottom: 20 },
  cellRow: { flexDirection: 'row', alignItems: 'center', padding: 16, justifyContent: 'space-between' },
  cellTitle: { fontSize: 17, fontWeight: '400' },
  cellValue: { fontSize: 17 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  footerText: { fontSize: 13, textAlign: 'center', marginTop: 16, lineHeight: 20, paddingHorizontal: 16 }
});
