import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import TutoringCourseDetailScreen from '../../src/features/tutoring/screens/TutoringCourseDetailScreen';

export default function TutoringCourseDetailRoute() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const courseCode = typeof params.courseCode === 'string' ? params.courseCode : '';
  const courseName = typeof params.courseName === 'string' ? params.courseName : undefined;
  const department = typeof params.department === 'string' ? params.department : undefined;

  return (
    <TutoringCourseDetailScreen
      courseCode={courseCode}
      courseName={courseName}
      department={department}
      onBack={() => router.back()}
    />
  );
}
