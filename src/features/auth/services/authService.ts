import type { PCCUCredentials } from '../application/CredentialVault';
import { appSessionCoordinator } from '../../../composition/appSession';
import { credentialVault } from '../infrastructure/SecureStoreCredentialVault';
import { clearPostLoginSyncHandled } from './postLoginSyncState';

const API_BASE_URL = 'https://ecampus.pccu.edu.tw/eCampus';
const normalizeCredential = (value: string | null) => (value || '').trim();

type SavedCredentials = PCCUCredentials;
type LoginOptions = { persistCredentials?: boolean };

let sessionWarmPromise: Promise<{ success: boolean; message?: string }> | null = null;
let sessionWarmAt = 0;

export const clearSessionPCCUCredentials = () => credentialVault.clearActive();

export const loginPCCU = async (
  account: string,
  password: string,
  options: LoginOptions = {},
): Promise<{ success: boolean; message?: string }> => {
  try {
    const normalizedAccount = normalizeCredential(account);
    const normalizedPassword = normalizeCredential(password);
    const shouldPersistCredentials = options.persistCredentials ?? true;

    const response = await fetch(API_BASE_URL + '/default.aspx/gfChkLogin', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'application/json, text/javascript, */*; q=0.01',
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
      const credentials = {
        account: normalizedAccount,
        password: normalizedPassword,
      };

      credentialVault.setActive(credentials);

      if (shouldPersistCredentials) {
        await credentialVault.save(credentials);
      }

      return { success: true };
    }

    return {
      success: false,
      message: data?.d?.MessageKey || '登入失敗，請確認學號與密碼是否正確。',
    };
  } catch (error) {
    console.error('Login Error:', error);
    return { success: false, message: '登入時發生問題，請稍後再試。' };
  }
};

export const savePCCUCredentials = async (account: string, password: string) => {
  const normalizedAccount = normalizeCredential(account);
  const normalizedPassword = normalizeCredential(password);

  if (!normalizedAccount || !normalizedPassword) {
    return;
  }

  const credentials = {
    account: normalizedAccount,
    password: normalizedPassword,
  };

  await credentialVault.save(credentials);
};

export const clearPersistedPCCUCredentials = () => credentialVault.clearPersisted();

export const clearSavedPCCUCredentials = async () => {
  credentialVault.clearActive();
  await credentialVault.clearPersisted();
};

export const ensurePCCUSession = async (
  credentials?: SavedCredentials | null,
): Promise<{ success: boolean; message?: string }> => {
  const resolvedCredentials =
    credentials || credentialVault.getActive() || (await getSavedPCCUCredentials());
  if (!resolvedCredentials) {
    return { success: false, message: '找不到可用的登入憑證。' };
  }

  if (Date.now() - sessionWarmAt < 45 * 1000) {
    return { success: true };
  }

  if (!sessionWarmPromise) {
    sessionWarmPromise = loginPCCU(resolvedCredentials.account, resolvedCredentials.password, {
      persistCredentials: false,
    })
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

export const getSavedPCCUCredentials = (): Promise<SavedCredentials | null> => {
  const activeCredentials = credentialVault.getActive();
  return activeCredentials ? Promise.resolve(activeCredentials) : credentialVault.getSaved();
};

/** @deprecated Compatibility wrapper. Remove in Phase 4 after non-screen callers migrate. */
export const logoutPCCU = async () => {
  await appSessionCoordinator.transition('logout');
  sessionWarmPromise = null;
  sessionWarmAt = 0;
  clearPostLoginSyncHandled();
};
