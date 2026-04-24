import AsyncStorage from '@react-native-async-storage/async-storage';

const DEVELOPER_DEBUG_ENABLED_KEY = 'developer_debug_enabled';

let cachedDeveloperDebugEnabled: boolean | null = null;
type DeveloperDebugListener = (enabled: boolean) => void;

const developerDebugListeners = new Set<DeveloperDebugListener>();

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
