import AsyncStorage from '@react-native-async-storage/async-storage';

const NOTIFICATIONS_ENABLED_KEY = 'notifications_enabled';
const COURSE_REMINDERS_ENABLED_KEY = 'course_reminders_enabled';

let cachedNotificationsEnabled: boolean | null = null;
let cachedCourseRemindersEnabled: boolean | null = null;

export async function getNotificationsEnabled(): Promise<boolean> {
  if (cachedNotificationsEnabled !== null) {
    return cachedNotificationsEnabled;
  }

  try {
    const stored = await AsyncStorage.getItem(NOTIFICATIONS_ENABLED_KEY);
    cachedNotificationsEnabled = stored !== 'false';
    return cachedNotificationsEnabled;
  } catch (error) {
    console.log('Load notification setting failed:', error);
    return true;
  }
}

export async function setNotificationsEnabled(value: boolean): Promise<void> {
  cachedNotificationsEnabled = value;

  try {
    await AsyncStorage.setItem(NOTIFICATIONS_ENABLED_KEY, value ? 'true' : 'false');
  } catch (error) {
    console.log('Save notification setting failed:', error);
  }
}

export async function getCourseRemindersEnabled(): Promise<boolean> {
  if (cachedCourseRemindersEnabled !== null) {
    return cachedCourseRemindersEnabled;
  }

  try {
    const stored = await AsyncStorage.getItem(COURSE_REMINDERS_ENABLED_KEY);
    cachedCourseRemindersEnabled = stored === 'true';
    return cachedCourseRemindersEnabled;
  } catch (error) {
    console.log('Load course reminder setting failed:', error);
    return false;
  }
}

export async function setCourseRemindersEnabled(value: boolean): Promise<void> {
  cachedCourseRemindersEnabled = value;

  try {
    await AsyncStorage.setItem(COURSE_REMINDERS_ENABLED_KEY, value ? 'true' : 'false');
  } catch (error) {
    console.log('Save course reminder setting failed:', error);
  }
}
