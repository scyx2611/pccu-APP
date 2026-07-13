import AsyncStorage from '@react-native-async-storage/async-storage';
import { TrafficSnapshot } from '../types';

const STORAGE_KEY = 'cached_traffic_red5';

let cachedSnapshot: TrafficSnapshot | null = null;

export async function setTrafficSnapshot(snapshot: TrafficSnapshot): Promise<void> {
  cachedSnapshot = snapshot;

  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.log('Save traffic cache failed:', error);
  }
}

export async function getTrafficSnapshot(): Promise<TrafficSnapshot | null> {
  if (cachedSnapshot) {
    return cachedSnapshot;
  }

  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    cachedSnapshot = JSON.parse(stored) as TrafficSnapshot;
    return cachedSnapshot;
  } catch (error) {
    console.log('Load traffic cache failed:', error);
    return null;
  }
}

export async function clearTrafficSnapshot(): Promise<void> {
  cachedSnapshot = null;
  await AsyncStorage.removeItem(STORAGE_KEY);
}
