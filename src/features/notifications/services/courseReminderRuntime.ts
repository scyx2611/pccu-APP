import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

export type CourseReminderPresentationMode = 'dynamic-island' | 'notification';

export function canUseBuildOnlyIOSFeatures() {
  return Platform.OS === 'ios' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}

export function getCourseReminderPresentationMode(): CourseReminderPresentationMode {
  return canUseBuildOnlyIOSFeatures() ? 'dynamic-island' : 'notification';
}
