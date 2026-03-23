import AsyncStorage from '@react-native-async-storage/async-storage';

const REMEMBER_CREDENTIALS_KEY = 'remember_credentials_enabled';
const BIOMETRIC_LOGIN_ENABLED_KEY = 'biometric_login_enabled';

let cachedRememberCredentialsEnabled: boolean | null = null;
let cachedBiometricLoginEnabled: boolean | null = null;

export async function getRememberCredentialsEnabled(): Promise<boolean> {
  if (cachedRememberCredentialsEnabled !== null) {
    return cachedRememberCredentialsEnabled;
  }

  try {
    const stored = await AsyncStorage.getItem(REMEMBER_CREDENTIALS_KEY);
    cachedRememberCredentialsEnabled = stored === 'true';
    return cachedRememberCredentialsEnabled;
  } catch (error) {
    console.log('Load remember credentials setting failed:', error);
    return false;
  }
}

export async function setRememberCredentialsEnabled(value: boolean): Promise<void> {
  cachedRememberCredentialsEnabled = value;

  try {
    await AsyncStorage.setItem(REMEMBER_CREDENTIALS_KEY, value ? 'true' : 'false');
  } catch (error) {
    console.log('Save remember credentials setting failed:', error);
  }
}

export async function getBiometricLoginEnabled(): Promise<boolean> {
  if (cachedBiometricLoginEnabled !== null) {
    return cachedBiometricLoginEnabled;
  }

  try {
    const stored = await AsyncStorage.getItem(BIOMETRIC_LOGIN_ENABLED_KEY);
    cachedBiometricLoginEnabled = stored === 'true';
    return cachedBiometricLoginEnabled;
  } catch (error) {
    console.log('Load biometric login setting failed:', error);
    return false;
  }
}

export async function setBiometricLoginEnabled(value: boolean): Promise<void> {
  cachedBiometricLoginEnabled = value;

  try {
    await AsyncStorage.setItem(BIOMETRIC_LOGIN_ENABLED_KEY, value ? 'true' : 'false');
  } catch (error) {
    console.log('Save biometric login setting failed:', error);
  }
}
