import AsyncStorage from '@react-native-async-storage/async-storage';
import { SemesterGrade } from '../../pccu/parsers/pccuScraper';

const STORAGE_KEY = 'cached_grades';

let cachedGrades: SemesterGrade[] | null = null;
let cachedPre: SemesterGrade[] | null = null;
let cachedUpdatedAt: number | null = null;

export async function setGrades(
  grades: SemesterGrade[],
  preAdmission: SemesterGrade[] = [],
  updatedAt: number = Date.now(),
): Promise<void> {
  cachedGrades = grades;
  cachedPre = preAdmission;
  cachedUpdatedAt = updatedAt;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ grades, preAdmission, updatedAt }));
  } catch (e) {
    console.log('Save grades cache failed:', e);
  }
}

export async function getGrades(): Promise<{
  grades: SemesterGrade[] | null;
  preAdmission: SemesterGrade[] | null;
  updatedAt: number | null;
}> {
  if (cachedGrades) {
    return { grades: cachedGrades, preAdmission: cachedPre, updatedAt: cachedUpdatedAt };
  }

  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      cachedGrades = parsed.grades || null;
      cachedPre = parsed.preAdmission || null;
      cachedUpdatedAt = typeof parsed.updatedAt === 'number' ? parsed.updatedAt : null;
      return { grades: cachedGrades, preAdmission: cachedPre, updatedAt: cachedUpdatedAt };
    }
  } catch (e) {
    console.log('Load grades cache failed:', e);
  }

  return { grades: null, preAdmission: null, updatedAt: null };
}

export async function clearGrades(): Promise<void> {
  cachedGrades = null;
  cachedPre = null;
  cachedUpdatedAt = null;
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.log('Clear grades cache failed:', e);
  }
}
