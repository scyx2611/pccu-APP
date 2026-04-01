import { useState, useCallback, useEffect, useRef } from 'react';
import {
  getCourses,
  getPendingAssignments,
  getCourseDetail,
  hasCache,
  getTutoringData as getStorageData,
} from '../storage/tutoringStorage';
import {
  TutoringCourse,
  TutoringAssignment,
  TutoringAnnouncement,
  TutoringMaterial,
  TutoringSnapshot,
} from '../types';

/**
 * Hook to manage global tutoring data including courses and pending assignments.
 */
export function useTutoringData() {
  const [courses, setCoursesState] = useState<TutoringCourse[]>([]);
  const [pendingAssignments, setPendingAssignmentsState] = useState<TutoringAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastUpdatedAt = useRef<number | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [coursesData, assignmentsData, storageData] = await Promise.all([
        getCourses(),
        getPendingAssignments(),
        getStorageData(),
      ]);

      setCoursesState(coursesData || []);
      setPendingAssignmentsState(assignmentsData || []);
      lastUpdatedAt.current = storageData.updatedAt;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tutoring data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return {
    courses,
    pendingAssignments,
    isLoading,
    error,
    lastUpdatedAt: lastUpdatedAt.current,
    refetch,
  };
}

/**
 * Hook to manage detail data for a specific course.
 */
export function useCourseDetail(courseCode: string) {
  const [announcements, setAnnouncements] = useState<TutoringAnnouncement[]>([]);
  const [materials, setMaterials] = useState<TutoringMaterial[]>([]);
  const [assignments, setAssignments] = useState<TutoringAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!courseCode) return;
    setIsLoading(true);
    setError(null);
    try {
      const [annoData, matData, assignData] = await Promise.all([
        getCourseDetail(courseCode, 'announcements'),
        getCourseDetail(courseCode, 'materials'),
        getCourseDetail(courseCode, 'assignments'),
      ]);

      setAnnouncements((annoData as TutoringAnnouncement[]) || []);
      setMaterials((matData as TutoringMaterial[]) || []);
      setAssignments((assignData as TutoringAssignment[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load course detail');
    } finally {
      setIsLoading(false);
    }
  }, [courseCode]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return {
    announcements,
    materials,
    assignments,
    isLoading,
    error,
    refetch,
  };
}

/**
 * Hook to compute the count of pending assignments.
 */
export function usePendingCount() {
  const { pendingAssignments } = useTutoringData();
  
  // Note: The prompt specifies filtering by 'status', but the TutoringAssignment type 
  // uses 'stateCode'. Based on tutoringScripts.ts:
  // stateCode === '' (empty string) represents 'pending' (unsubmitted)
  // stateCode === '4' represents 'resubmit'
  const count = pendingAssignments.filter(
    (assignment) => assignment.stateCode === '' || assignment.stateCode === '4'
  ).length;

  return { count };
}
