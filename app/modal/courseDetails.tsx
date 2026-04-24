import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useTheme } from '../../src/providers/theme/ThemeProvider';
import AppSymbol from '../../src/shared/components/AppSymbol';
import { CourseData } from '../../src/features/pccu/parsers/pccuScraper';

export default function CourseDetailsScreen() {
  const { data } = useLocalSearchParams<{ data: string }>();
  const { theme } = useTheme();

  let course: CourseData | null = null;
  try {
    if (data) course = JSON.parse(data);
  } catch (e) {}

  if (!course) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <Stack.Screen options={{ title: '課程詳細' }} />
        <Text style={{ color: theme.text, padding: 20 }}>無法載入課程資料</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <Stack.Screen options={{ title: '課程詳細' }} />
      <ScrollView contentContainerStyle={styles.scrollContent}>

        <View style={styles.header}>
          <Text style={[styles.courseName, { color: theme.text }]}>{course.name}</Text>
          <View style={[styles.badge, course.required ? { backgroundColor: 'rgba(255,59,48,0.1)' } : { backgroundColor: 'rgba(52,199,89,0.1)' }]}>
            <Text style={[styles.badgeText, course.required ? { color: theme.danger } : { color: theme.success }]}>
              {course.required ? '必修' : '選修'}
            </Text>
          </View>
        </View>

        <View style={[styles.insetGroup, { backgroundColor: theme.card }]}>
          <View style={styles.cellRow}>
            <View style={[styles.iconBox, { backgroundColor: theme.primary }]}>
              <AppSymbol name="person.fill" size={16} tintColor="#FFF" />
            </View>
            <Text style={[styles.cellLabel, { color: theme.textSub }]}>授課教師</Text>
            <Text style={[styles.cellValue, { color: theme.text }]}>{course.teacher}</Text>
          </View>
          <View style={[styles.separator, { backgroundColor: theme.border }]} />

          <View style={styles.cellRow}>
            <View style={[styles.iconBox, { backgroundColor: theme.success }]}>
              <AppSymbol name="clock.fill" size={16} tintColor="#FFF" />
            </View>
            <Text style={[styles.cellLabel, { color: theme.textSub }]}>上課時間</Text>
            <Text style={[styles.cellValue, { color: theme.text }]}>{course.periodRange}</Text>
          </View>
          <View style={[styles.separator, { backgroundColor: theme.border }]} />

          <View style={styles.cellRow}>
            <View style={[styles.iconBox, { backgroundColor: theme.danger }]}>
              <AppSymbol name="mappin.and.ellipse" size={16} tintColor="#FFF" />
            </View>
            <Text style={[styles.cellLabel, { color: theme.textSub }]}>教室位置</Text>
            <Text style={[styles.cellValue, { color: theme.text }]}>{course.location}</Text>
          </View>
          <View style={[styles.separator, { backgroundColor: theme.border }]} />

          <View style={styles.cellRow}>
            <View style={[styles.iconBox, { backgroundColor: theme.border }]}>
              <AppSymbol name="tag.fill" size={16} tintColor="#FFF" />
            </View>
            <Text style={[styles.cellLabel, { color: theme.textSub }]}>課程類別</Text>
            <Text style={[styles.cellValue, { color: theme.text }]}>{course.type || '未指定'}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16 },
  header: { marginBottom: 24, paddingHorizontal: 8 },
  courseName: { fontSize: 28, fontWeight: 'bold', marginBottom: 8 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  badgeText: { fontSize: 14, fontWeight: '700' },
  insetGroup: { borderRadius: 12, overflow: 'hidden' },
  cellRow: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  iconBox: { width: 30, height: 30, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  cellLabel: { flex: 1, fontSize: 16 },
  cellValue: { fontSize: 16, fontWeight: '500' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 58 }
});
