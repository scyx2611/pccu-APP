import AsyncStorage from '@react-native-async-storage/async-storage';
import { CourseData } from './scraper';

const STORAGE_KEY = 'cached_schedule';

// 記憶體快取
let cachedCourses: CourseData[] | null = null;
let isMockData = false;

/**
 * 設定課表資料（同時寫入記憶體 + AsyncStorage）
 */
export async function setCourses(courses: CourseData[], mock: boolean = false): Promise<void> {
  cachedCourses = courses;
  isMockData = mock;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ courses, mock }));
  } catch (e) {
    console.log('儲存課表快取失敗:', e);
  }
}

/**
 * 取得課表資料（優先記憶體，其次 AsyncStorage）
 */
export async function getCourses(): Promise<{ courses: CourseData[] | null; mock: boolean }> {
  if (cachedCourses) {
    return { courses: cachedCourses, mock: isMockData };
  }

  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      cachedCourses = parsed.courses;
      isMockData = parsed.mock ?? false;
      return { courses: cachedCourses, mock: isMockData };
    }
  } catch (e) {
    console.log('讀取課表快取失敗:', e);
  }

  return { courses: null, mock: false };
}

/**
 * 記憶體中是否有快取
 */
export function hasCache(): boolean {
  return cachedCourses !== null && cachedCourses.length > 0;
}

/**
 * 清除快取（登出時呼叫）
 */
export async function clearCourses(): Promise<void> {
  cachedCourses = null;
  isMockData = false;
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.log('清除課表快取失敗:', e);
  }
}
