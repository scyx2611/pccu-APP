import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  TutoringCourse,
  TutoringAssignment,
  TutoringSnapshot,
  TutoringAnnouncement,
  TutoringMaterial,
  TutoringCourseInfo,
} from '../types';

const STORAGE_KEY = 'cached_tutoring';
const LAST_STORAGE_KEY = 'cached_tutoring_last';

// In-memory cache
let cachedSnapshot: TutoringSnapshot | null = null;
let cachedCourses: TutoringCourse[] | null = null;
let cachedPendingAssignments: TutoringAssignment[] | null = null;
let cachedCourseDetails: Record<string, Record<string, any[]>> = {};
let cachedCourseInfo: Record<string, TutoringCourseInfo> = {};

export async function setTutoringData(snapshot: TutoringSnapshot): Promise<void> {
  cachedSnapshot = snapshot;
  cachedCourses = snapshot.courses;
  // Note: The actual TutoringSnapshot type on disk has pendingAssignmentCount,
  // but the prompt implies we might store the assignments themselves.
  // We'll store the whole snapshot as the primary data.
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    await AsyncStorage.setItem(LAST_STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.log('Save tutoring snapshot failed:', error);
  }
}

export async function getTutoringData(): Promise<{
  snapshot: TutoringSnapshot | null;
  updatedAt: number | null;
}> {
  if (cachedSnapshot) {
    return { snapshot: cachedSnapshot, updatedAt: cachedSnapshot.updatedAt };
  }

  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as TutoringSnapshot;
      cachedSnapshot = parsed;
      cachedCourses = parsed.courses;
      return { snapshot: parsed, updatedAt: parsed.updatedAt };
    }

    const lastStored = await AsyncStorage.getItem(LAST_STORAGE_KEY);
    if (lastStored) {
      const parsed = JSON.parse(lastStored) as TutoringSnapshot;
      cachedSnapshot = parsed;
      cachedCourses = parsed.courses;
      return { snapshot: parsed, updatedAt: parsed.updatedAt };
    }
  } catch (error) {
    console.log('Load tutoring snapshot failed:', error);
  }

  return { snapshot: null, updatedAt: null };
}

export async function setCourses(courses: TutoringCourse[]): Promise<void> {
  cachedCourses = courses;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    const snapshot: TutoringSnapshot = stored
      ? JSON.parse(stored)
      : {
          courses: [],
          pendingAssignmentCount: 0,
          updatedAt: Date.now(),
          semester: '',
          welcome: '',
        };

    snapshot.courses = courses;
    snapshot.updatedAt = Date.now();

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    await AsyncStorage.setItem(LAST_STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.log('Save tutoring courses failed:', error);
  }
}

export async function getCourses(): Promise<TutoringCourse[] | null> {
  if (cachedCourses) {
    return cachedCourses;
  }
  const { snapshot } = await getTutoringData();
  return snapshot?.courses || null;
}

export async function setAllAssignments(assignments: TutoringAssignment[]): Promise<void> {
  cachedPendingAssignments = assignments;
  try {
    const key = 'cached_tutoring_all_assignments';
    await AsyncStorage.setItem(key, JSON.stringify(assignments));

    // Also store per-course for useCourseDetail hook
    const byCourse: Record<string, TutoringAssignment[]> = {};
    for (const assignment of assignments) {
      const cc = assignment.courseCode;
      if (!byCourse[cc]) byCourse[cc] = [];
      byCourse[cc].push(assignment);
    }
    for (const [cc, items] of Object.entries(byCourse)) {
      await setCourseDetail(cc, 'assignments', items);
    }
  } catch (error) {
    console.log('Save all assignments failed:', error);
  }
}

export async function setPendingAssignments(assignments: TutoringAssignment[]): Promise<void> {
  cachedPendingAssignments = assignments;
  try {
    const key = 'cached_tutoring_pending';
    await AsyncStorage.setItem(key, JSON.stringify(assignments));
  } catch (error) {
    console.log('Save pending assignments failed:', error);
  }
}

export async function getPendingAssignments(): Promise<TutoringAssignment[] | null> {
  if (cachedPendingAssignments) {
    return cachedPendingAssignments;
  }
  try {
    const stored = await AsyncStorage.getItem('cached_tutoring_pending');
    if (stored) {
      cachedPendingAssignments = JSON.parse(stored);
      return cachedPendingAssignments;
    }
  } catch (error) {
    console.log('Load pending assignments failed:', error);
  }
  return null;
}

export async function setCourseDetail(
  courseCode: string,
  type: 'announcements' | 'materials' | 'assignments' | 'progress' | 'classmates',
  items: any[],
): Promise<void> {
  if (!cachedCourseDetails[courseCode]) {
    cachedCourseDetails[courseCode] = {};
  }
  cachedCourseDetails[courseCode][type] = items;

  try {
    const key = `cached_tutoring_${type}_${courseCode}`;
    await AsyncStorage.setItem(key, JSON.stringify(items));
  } catch (error) {
    console.log(`Save course ${type} failed:`, error);
  }
}

export async function getCourseDetail(
  courseCode: string,
  type: 'announcements' | 'materials' | 'assignments' | 'progress' | 'classmates',
): Promise<any[] | null> {
  if (cachedCourseDetails[courseCode]?.[type]) {
    return cachedCourseDetails[courseCode][type];
  }

  try {
    const key = `cached_tutoring_${type}_${courseCode}`;
    const stored = await AsyncStorage.getItem(key);
    if (stored) {
      const items = JSON.parse(stored);
      if (!cachedCourseDetails[courseCode]) {
        cachedCourseDetails[courseCode] = {};
      }
      cachedCourseDetails[courseCode][type] = items;
      return items;
    }
  } catch (error) {
    console.log(`Load course ${type} failed:`, error);
  }
  return null;
}

export async function setCourseInfo(courseCode: string, info: TutoringCourseInfo): Promise<void> {
  cachedCourseInfo[courseCode] = info;

  try {
    const key = `cached_tutoring_course_info_${courseCode}`;
    await AsyncStorage.setItem(key, JSON.stringify(info));
  } catch (error) {
    console.log('Save course info failed:', error);
  }
}

export async function getCourseInfo(courseCode: string): Promise<TutoringCourseInfo | null> {
  if (cachedCourseInfo[courseCode]) {
    return cachedCourseInfo[courseCode];
  }

  try {
    const key = `cached_tutoring_course_info_${courseCode}`;
    const stored = await AsyncStorage.getItem(key);
    if (stored) {
      const info = JSON.parse(stored) as TutoringCourseInfo;
      cachedCourseInfo[courseCode] = info;
      return info;
    }
  } catch (error) {
    console.log('Load course info failed:', error);
  }

  return null;
}

export function hasCache(): boolean {
  return cachedSnapshot !== null || (cachedCourses !== null && cachedCourses.length > 0);
}

export async function clearAll(): Promise<void> {
  cachedSnapshot = null;
  cachedCourses = null;
  cachedPendingAssignments = null;
  cachedCourseDetails = {};
  cachedCourseInfo = {};

  const keys = await AsyncStorage.getAllKeys();
  const tutoringKeys = keys.filter((key) => key.startsWith('cached_tutoring'));
  await AsyncStorage.multiRemove(tutoringKeys);
}
