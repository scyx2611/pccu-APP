import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useTheme } from '../../src/providers/theme/ThemeProvider';
import { SemesterGrade } from '../../src/features/pccu/parsers/pccuScraper';

const TITLE_DEFAULT = '\u6210\u7e3e\u8a73\u60c5';
const LOAD_FAIL_TEXT = '\u7121\u6cd5\u8f09\u5165\u6210\u7e3e\u8cc7\u6599';
const SUMMARY_TITLE = '\u6210\u7e3e\u6458\u8981';
const COURSE_SECTION_TITLE = '\u8ab2\u7a0b\u6210\u7e3e';
const FAIL_TEXT = new Set(['\u4e0d\u53ca\u683c', '\u4e0d\u901a\u904e', 'F']);

const isFailScore = (value: string) => {
  if (FAIL_TEXT.has(value)) return true;
  const num = Number(value);
  return Number.isFinite(num) && num < 60;
};

export default function GradeDetailsScreen() {
  const { title, data } = useLocalSearchParams<{ title: string; data: string }>();
  const { theme } = useTheme();

  let semester: SemesterGrade | null = null;
  try {
    if (data) semester = JSON.parse(data);
  } catch (e) {}

  if (!semester) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <Stack.Screen options={{ title: title || TITLE_DEFAULT }} />
        <Text style={{ color: theme.text, padding: 20 }}>{LOAD_FAIL_TEXT}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <Stack.Screen options={{ title: title || TITLE_DEFAULT }} />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {semester.stats && Object.keys(semester.stats).length > 0 && (
          <View style={[styles.statsCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.statsTitle, { color: theme.text }]}>{SUMMARY_TITLE}</Text>
            {semester.stats.average && (
              <Text style={[styles.statsText, { color: theme.textSub }]}>
                {`\u5e73\u5747: ${semester.stats.average}`}
              </Text>
            )}
            {semester.stats.classRank && (
              <Text style={[styles.statsText, { color: theme.textSub }]}>
                {`\u73ed\u6392\u540d: ${semester.stats.classRank}`}
              </Text>
            )}
            {semester.stats.deptRank && (
              <Text style={[styles.statsText, { color: theme.textSub }]}>
                {`\u7cfb\u6392\u540d: ${semester.stats.deptRank}`}
              </Text>
            )}
            {semester.stats.earnedCredits && (
              <Text style={[styles.statsText, { color: theme.textSub }]}>
                {`\u7e3d\u5b78\u5206: ${semester.stats.earnedCredits}`}
              </Text>
            )}
          </View>
        )}

        <Text style={[styles.sectionTitle, { color: theme.textSub }]}>
          {`${COURSE_SECTION_TITLE} (${semester.courses.length})`}
        </Text>

        <View style={[styles.insetGroup, { backgroundColor: theme.card }]}>
          {semester.courses.map((course, idx) => (
            <View key={idx}>
              <View style={styles.courseRow}>
                <View style={styles.courseLeft}>
                  <Text style={[styles.courseName, { color: theme.text }]}>{course.name}</Text>
                  <View style={styles.courseTags}>
                    {!!course.type && (
                      <Text
                        style={[
                          styles.tag,
                          { backgroundColor: theme.border, color: theme.textSub },
                        ]}
                      >
                        {course.type}
                      </Text>
                    )}
                    <Text
                      style={[styles.tag, { backgroundColor: theme.border, color: theme.textSub }]}
                    >{`${course.credits || '--'} \u5b78\u5206`}</Text>
                  </View>
                </View>
                <View style={styles.courseRight}>
                  <Text
                    style={[
                      styles.scoreText,
                      { color: isFailScore(course.score) ? theme.danger : theme.text },
                    ]}
                  >
                    {course.score || '--'}
                  </Text>
                </View>
              </View>
              {idx < semester.courses.length - 1 && (
                <View style={[styles.separator, { backgroundColor: theme.border }]} />
              )}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 16 },
  statsCard: { padding: 16, borderRadius: 12, marginBottom: 20 },
  statsTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  statsText: { fontSize: 15, marginBottom: 4 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  insetGroup: { borderRadius: 12, overflow: 'hidden', marginBottom: 40 },
  courseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    justifyContent: 'space-between',
  },
  courseLeft: { flex: 1, paddingRight: 16 },
  courseName: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
  courseTags: { flexDirection: 'row', gap: 6 },
  tag: {
    fontSize: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  courseRight: { justifyContent: 'center', alignItems: 'flex-end' },
  scoreText: { fontSize: 24, fontWeight: 'bold' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
});
