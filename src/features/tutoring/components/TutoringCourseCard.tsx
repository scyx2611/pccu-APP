import React from 'react';
import { Text, StyleSheet, Pressable, Animated } from 'react-native';
import { TutoringCourse } from '../types';
import { useTheme } from '../../../providers/theme/ThemeProvider';

interface TutoringCourseCardProps {
  course: TutoringCourse;
  latestMessage: string;
  onPress: (courseCode: string) => void;
}

export default function TutoringCourseCard({ course, latestMessage, onPress }: TutoringCourseCardProps) {
  const { theme } = useTheme();
  const pressAnim = React.useRef(new Animated.Value(0)).current;
  const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

  const animatedStyle = {
    transform: [{ scale: pressAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] }) }],
  };

  return (
    <AnimatedPressable
      style={[styles.card, { backgroundColor: theme.card, borderColor: '#FFFFFF', shadowColor: theme.text }, animatedStyle]}
      onPress={() => onPress(course.courseCode)}
      onPressIn={() => Animated.spring(pressAnim, { toValue: 1, useNativeDriver: true }).start()}
      onPressOut={() => Animated.spring(pressAnim, { toValue: 0, useNativeDriver: true }).start()}
    >
      <Text style={[styles.courseName, { color: theme.text }]} numberOfLines={2}>
        {course.courseName}
      </Text>
      <Text style={[styles.countLine, { color: theme.textSub }]} numberOfLines={1}>
        公告 {course.announcementCount}　教材 {course.materialCount}　作業 {course.homeworkCount}
      </Text>
      <Text style={[styles.latestLine, { color: theme.text }]} numberOfLines={2}>
        {latestMessage}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 34,
    padding: 25,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.10,
    shadowRadius: 26,
    elevation: 12,
  },
  courseName: {
    fontSize: 21,
    lineHeight: 29,
    fontWeight: '900',
    marginBottom: 10,
  },
  countLine: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
    marginBottom: 12,
  },
  latestLine: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '800',
  },
});
