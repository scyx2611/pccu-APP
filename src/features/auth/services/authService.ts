import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { clearCourses } from '../../schedule/storage/scheduleStorage';
import { clearGrades } from '../../grade/storage/gradeStorage';
import { clearPostLoginSyncHandled } from './postLoginSyncState';

const API_BASE_URL = 'https://ecampus.pccu.edu.tw/eCampus';
const normalizeCredential = (value: string | null) => (value || '').trim();
const ACCOUNT_KEY = 'user_account';
const PASSWORD_KEY = 'user_password';
const CREDENTIALS_CACHE_KEY = 'user_credentials_cache_v1';

type SavedCredentials = { account: string; password: string };

let savedCredentialsCache: SavedCredentials | null | undefined;
let savedCredentialsLoadPromise: Promise<SavedCredentials | null> | null = null;
let sessionWarmPromise: Promise<{ success: boolean; message?: string }> | null = null;
let sessionWarmAt = 0;
let credentialsExplicitlyCleared = false;

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const writeCredentialsMirror = async (credentials: SavedCredentials) => {
  await AsyncStorage.setItem(CREDENTIALS_CACHE_KEY, JSON.stringify(credentials));
};

const clearCredentialsMirror = async () => {
  await AsyncStorage.removeItem(CREDENTIALS_CACHE_KEY);
};

const readCredentialsMirror = async (): Promise<SavedCredentials | null> => {
  try {
    const stored = await AsyncStorage.getItem(CREDENTIALS_CACHE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    const account = normalizeCredential(parsed?.account ?? null);
    const password = normalizeCredential(parsed?.password ?? null);
    if (!account || !password) return null;
    return { account, password };
  } catch (error) {
    return null;
  }
};

const readSavedCredentialsFromStore = async (): Promise<SavedCredentials | null> => {
  const mirroredCredentials = await readCredentialsMirror();
  if (mirroredCredentials) {
    credentialsExplicitlyCleared = false;
    try {
      await Promise.all([
        SecureStore.setItemAsync(ACCOUNT_KEY, mirroredCredentials.account),
        SecureStore.setItemAsync(PASSWORD_KEY, mirroredCredentials.password),
      ]);
    } catch (error) {}

    return mirroredCredentials;
  }

  let account = '';
  let password = '';

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const values = await Promise.all([
      SecureStore.getItemAsync(ACCOUNT_KEY),
      SecureStore.getItemAsync(PASSWORD_KEY),
    ]);

    account = normalizeCredential(values[0]);
    password = normalizeCredential(values[1]);

    if (account && password) {
      credentialsExplicitlyCleared = false;
      await writeCredentialsMirror({ account, password });
      return { account, password };
    }

    if (!account && !password && attempt < 1) {
      await sleep(120);
    }
  }

  return null;
};

/**
 * 登入 PCCU（只做帳密驗證和保存）
 * 課表獲取改由 ScheduleScreen 的 WebView 處理
 */
export const loginPCCU = async (
  account: string,
  password: string
): Promise<{ success: boolean; message?: string }> => {
  try {
    const normalizedAccount = normalizeCredential(account);
    const normalizedPassword = normalizeCredential(password);
    console.log('發送登入請求...');

    const response = await fetch(API_BASE_URL + '/default.aspx/gfChkLogin', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/json; charset=utf-8',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        Account: normalizedAccount,
        Password: normalizedPassword,
        SwitchUserId: '',
        UserRole: 'student',
        LangType: 'zh-TW',
        Switch: false,
      }),
    });

    const data = await response.json();

    if (data?.d && data.d.HasError === false) {
      console.log('登入成功');
      const previousAccount = await SecureStore.getItemAsync(ACCOUNT_KEY);
      if (previousAccount && previousAccount !== normalizedAccount) {
        await clearCourses();
        await clearGrades();
      }
      await SecureStore.setItemAsync(ACCOUNT_KEY, normalizedAccount);
      await SecureStore.setItemAsync(PASSWORD_KEY, normalizedPassword);
      await writeCredentialsMirror({
        account: normalizedAccount,
        password: normalizedPassword,
      });
      credentialsExplicitlyCleared = false;
      savedCredentialsCache = {
        account: normalizedAccount,
        password: normalizedPassword,
      };
      savedCredentialsLoadPromise = null;
      return { success: true };
    } else {
      return {
        success: false,
        message: data?.d?.MessageKey || '登入失敗，請檢查帳號密碼',
      };
    }
  } catch (error: any) {
    console.error('Login Error:', error);
    return { success: false, message: '網路連線失敗，請稍後再試' };
  }
};

export const ensurePCCUSession = async (
  credentials?: SavedCredentials | null
): Promise<{ success: boolean; message?: string }> => {
  const resolvedCredentials = credentials || (await getSavedPCCUCredentials());
  if (!resolvedCredentials) {
    return { success: false, message: '找不到登入憑證' };
  }

  if (Date.now() - sessionWarmAt < 45 * 1000) {
    return { success: true };
  }

  if (!sessionWarmPromise) {
    sessionWarmPromise = loginPCCU(resolvedCredentials.account, resolvedCredentials.password)
      .then((result) => {
        if (result.success) {
          sessionWarmAt = Date.now();
        }
        return result;
      })
      .finally(() => {
        sessionWarmPromise = null;
      });
  }

  return sessionWarmPromise;
};

export const getSavedPCCUCredentials = async (): Promise<{ account: string; password: string } | null> => {
  if (credentialsExplicitlyCleared) {
    return null;
  }

  if (savedCredentialsCache !== undefined && savedCredentialsCache !== null) {
    return savedCredentialsCache;
  }

  if (!savedCredentialsLoadPromise) {
    savedCredentialsLoadPromise = readSavedCredentialsFromStore()
      .then((credentials) => {
        if (credentials) {
          savedCredentialsCache = credentials;
        }
        return credentials;
      })
      .finally(() => {
        savedCredentialsLoadPromise = null;
      });
  }

  return savedCredentialsLoadPromise;
};

export const logoutPCCU = async () => {
  credentialsExplicitlyCleared = true;
  savedCredentialsCache = null;
  savedCredentialsLoadPromise = null;
  sessionWarmPromise = null;
  sessionWarmAt = 0;
  clearPostLoginSyncHandled();
  await SecureStore.deleteItemAsync(ACCOUNT_KEY);
  await SecureStore.deleteItemAsync(PASSWORD_KEY);
  await clearCredentialsMirror();
  await SecureStore.deleteItemAsync('session_cookie');
  await SecureStore.deleteItemAsync('user_name');
};
