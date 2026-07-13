import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVELOPER_DEBUG_ENABLED_KEY = 'developer_debug_enabled';
const HOME_COURSE_CARD_TEST_ENABLED_KEY = 'home_course_card_test_enabled';

let cachedDeveloperDebugEnabled: boolean | null = null;
let cachedHomeCourseCardTestEnabled: boolean | null = null;
type DeveloperDebugListener = (enabled: boolean) => void;
type HomeCourseCardTestListener = (enabled: boolean) => void;

const developerDebugListeners = new Set<DeveloperDebugListener>();
const homeCourseCardTestListeners = new Set<HomeCourseCardTestListener>();

export function subscribeDeveloperDebugEnabled(listener: DeveloperDebugListener): () => void {
  developerDebugListeners.add(listener);
  return () => {
    developerDebugListeners.delete(listener);
  };
}

function notifyDeveloperDebugEnabled(value: boolean) {
  developerDebugListeners.forEach((listener) => {
    listener(value);
  });
}

export function subscribeHomeCourseCardTestEnabled(
  listener: HomeCourseCardTestListener,
): () => void {
  homeCourseCardTestListeners.add(listener);
  return () => {
    homeCourseCardTestListeners.delete(listener);
  };
}

function notifyHomeCourseCardTestEnabled(value: boolean) {
  homeCourseCardTestListeners.forEach((listener) => {
    listener(value);
  });
}

export async function getDeveloperDebugEnabled(): Promise<boolean> {
  if (cachedDeveloperDebugEnabled !== null) {
    return cachedDeveloperDebugEnabled;
  }

  try {
    const stored = await AsyncStorage.getItem(DEVELOPER_DEBUG_ENABLED_KEY);
    cachedDeveloperDebugEnabled = stored === 'true';
    return cachedDeveloperDebugEnabled;
  } catch (error) {
    console.log('Load developer debug setting failed:', error);
    return false;
  }
}

export async function setDeveloperDebugEnabled(value: boolean): Promise<void> {
  cachedDeveloperDebugEnabled = value;
  notifyDeveloperDebugEnabled(value);

  try {
    await AsyncStorage.setItem(DEVELOPER_DEBUG_ENABLED_KEY, value ? 'true' : 'false');
  } catch (error) {
    console.log('Save developer debug setting failed:', error);
  }
}

export async function getHomeCourseCardTestEnabled(): Promise<boolean> {
  if (cachedHomeCourseCardTestEnabled !== null) {
    return cachedHomeCourseCardTestEnabled;
  }

  try {
    const stored = await AsyncStorage.getItem(HOME_COURSE_CARD_TEST_ENABLED_KEY);
    cachedHomeCourseCardTestEnabled = stored === 'true';
    return cachedHomeCourseCardTestEnabled;
  } catch (error) {
    console.log('Load home course card test setting failed:', error);
    return false;
  }
}

export async function setHomeCourseCardTestEnabled(value: boolean): Promise<void> {
  cachedHomeCourseCardTestEnabled = value;
  notifyHomeCourseCardTestEnabled(value);

  try {
    await AsyncStorage.setItem(HOME_COURSE_CARD_TEST_ENABLED_KEY, value ? 'true' : 'false');
  } catch (error) {
    console.log('Save home course card test setting failed:', error);
  }
}
