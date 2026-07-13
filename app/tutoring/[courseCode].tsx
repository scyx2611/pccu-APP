import React from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import TutoringCourseDetailScreen from '../../src/features/tutoring/screens/TutoringCourseDetailScreen';
import { useTutoringStore } from '../../src/features/tutoring/store/useTutoringStore';
import { normalizeTutoringText } from '../../src/features/tutoring/utils/text';

export default function TutoringCourseDetailRoute() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const courseCode = typeof params.courseCode === 'string' ? params.courseCode : '';
  const courseName = typeof params.courseName === 'string' ? params.courseName : undefined;
  const department = typeof params.department === 'string' ? params.department : undefined;
  const selectedCourse = useTutoringStore((state) =>
    state.courses.find((course) => String(course.courseCode) === courseCode),
  );
  const resolvedCourseName =
    normalizeTutoringText(courseName || selectedCourse?.courseName || courseCode) || '課輔課程';
  const resolvedDepartment = normalizeTutoringText(
    department || selectedCourse?.deptName || selectedCourse?.label,
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: resolvedCourseName,
          headerTitle: resolvedCourseName,
        }}
      />
      <TutoringCourseDetailScreen
        courseCode={courseCode}
        courseName={resolvedCourseName}
        department={resolvedDepartment}
        onBack={() => router.back()}
      />
    </>
  );
}
