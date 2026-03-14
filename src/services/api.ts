import * as SecureStore from 'expo-secure-store';
import { clearCourses } from './ScheduleStore';

const API_BASE_URL = 'https://ecampus.pccu.edu.tw/eCampus';

/**
 * 登入 PCCU（只做帳密驗證和保存）
 * 課表獲取改由 ScheduleScreen 的 WebView 處理
 */
export const loginPCCU = async (
  account: string,
  password: string
): Promise<{ success: boolean; message?: string }> => {
  try {
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
        Account: account,
        Password: password,
        SwitchUserId: '',
        UserRole: 'student',
        LangType: 'zh-TW',
        Switch: false,
      }),
    });

    const data = await response.json();

    if (data?.d && data.d.HasError === false) {
      console.log('登入成功');
      await SecureStore.setItemAsync('user_account', account);
      await SecureStore.setItemAsync('user_password', password);
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

export const logoutPCCU = async () => {
  await SecureStore.deleteItemAsync('user_account');
  await SecureStore.deleteItemAsync('user_password');
  await SecureStore.deleteItemAsync('session_cookie');
  await clearCourses();
};
