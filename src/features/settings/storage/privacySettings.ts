import AsyncStorage from '@react-native-async-storage/async-storage';

const HIDE_HOME_GRADE_DETAILS_KEY = 'hide_home_grade_details';
const GRADE_FACE_ID_PROTECTION_KEY = 'grade_face_id_protection_enabled';

let cachedHideHomeGradeDetails: boolean | null = null;
let cachedGradeFaceIdProtectionEnabled: boolean | null = null;

export async function getHideHomeGradeDetails(): Promise<boolean> {
  if (cachedHideHomeGradeDetails !== null) {
    return cachedHideHomeGradeDetails;
  }

  try {
    const stored = await AsyncStorage.getItem(HIDE_HOME_GRADE_DETAILS_KEY);
    cachedHideHomeGradeDetails = stored === 'true';
    return cachedHideHomeGradeDetails;
  } catch (error) {
    console.log('Load privacy setting failed:', error);
    return false;
  }
}

export async function setHideHomeGradeDetails(value: boolean): Promise<void> {
  cachedHideHomeGradeDetails = value;

  try {
    await AsyncStorage.setItem(HIDE_HOME_GRADE_DETAILS_KEY, value ? 'true' : 'false');
  } catch (error) {
    console.log('Save privacy setting failed:', error);
  }
}

export async function getGradeFaceIdProtectionEnabled(): Promise<boolean> {
  if (cachedGradeFaceIdProtectionEnabled !== null) {
    return cachedGradeFaceIdProtectionEnabled;
  }

  try {
    const stored = await AsyncStorage.getItem(GRADE_FACE_ID_PROTECTION_KEY);
    cachedGradeFaceIdProtectionEnabled = stored === 'true';
    return cachedGradeFaceIdProtectionEnabled;
  } catch (error) {
    console.log('Load Face ID setting failed:', error);
    return false;
  }
}

export async function setGradeFaceIdProtectionEnabled(value: boolean): Promise<void> {
  cachedGradeFaceIdProtectionEnabled = value;

  try {
    await AsyncStorage.setItem(GRADE_FACE_ID_PROTECTION_KEY, value ? 'true' : 'false');
  } catch (error) {
    console.log('Save Face ID setting failed:', error);
  }
}
