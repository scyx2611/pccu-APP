import AsyncStorage from '@react-native-async-storage/async-storage';
import { CourseData, hasSuspiciousCourseNames, sanitizeCourseList } from '../../pccu/parsers/pccuScraper';

const STORAGE_KEY = 'cached_schedule';
const LAST_STORAGE_KEY = 'cached_schedule_last';

let cachedCourses: CourseData[] | null = null;
let cachedUpdatedAt: number | null = null;
let isMockData = false;

export async function setCourses(
  courses: CourseData[],
  mock: boolean = false,
  updatedAt: number = Date.now()
): Promise<void> {
  const normalizedCourses = sanitizeCourseList(courses);
  cachedCourses = normalizedCourses;
  cachedUpdatedAt = updatedAt;
  isMockData = mock;

  try {
    const payload = { courses: normalizedCourses, mock, updatedAt };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    await AsyncStorage.setItem(LAST_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.log('Save schedule cache failed:', error);
  }
}

export async function getCourses(): Promise<{ courses: CourseData[] | null; mock: boolean; updatedAt: number | null }> {
  if (cachedCourses) {
    return { courses: cachedCourses, mock: isMockData, updatedAt: cachedUpdatedAt };
  }

  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      cachedCourses = sanitizeCourseList(parsed.courses || []);
      cachedUpdatedAt = typeof parsed.updatedAt === 'number' ? parsed.updatedAt : null;
      if (hasSuspiciousCourseNames(cachedCourses)) {
        await clearCourses();
        return { courses: null, mock: false, updatedAt: null };
      }
      isMockData = parsed.mock ?? false;
      return { courses: cachedCourses, mock: isMockData, updatedAt: cachedUpdatedAt };
    }

    const lastStored = await AsyncStorage.getItem(LAST_STORAGE_KEY);
    if (lastStored) {
      const parsed = JSON.parse(lastStored);
      cachedCourses = sanitizeCourseList(parsed.courses || []);
      cachedUpdatedAt = typeof parsed.updatedAt === 'number' ? parsed.updatedAt : null;
      if (hasSuspiciousCourseNames(cachedCourses)) {
        await clearCourses();
        return { courses: null, mock: false, updatedAt: null };
      }
      isMockData = parsed.mock ?? false;
      return { courses: cachedCourses, mock: isMockData, updatedAt: cachedUpdatedAt };
    }
  } catch (error) {
    console.log('Load schedule cache failed:', error);
  }

  return { courses: null, mock: false, updatedAt: null };
}

export function hasCache(): boolean {
  return cachedCourses !== null && cachedCourses.length > 0;
}

export async function clearCourses(): Promise<void> {
  cachedCourses = null;
  cachedUpdatedAt = null;
  isMockData = false;

  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
    await AsyncStorage.removeItem(LAST_STORAGE_KEY);
  } catch (error) {
    console.log('Clear schedule cache failed:', error);
  }
}
