import type { PCCUCredentials } from '../application/CredentialVault';
import { appSessionCoordinator } from '../../../composition/appSession';
import { credentialVault } from '../infrastructure/SecureStoreCredentialVault';
import { createLogger } from '../../../shared/utils/logger';
import {
  clearWarmSessionPromise,
  getAuthSessionGeneration,
  getWarmSessionPromise,
  isAuthSessionGenerationCurrent,
  isWarmSessionFresh,
  markWarmSession,
  setWarmSessionPromise,
  trackAuthSessionOperation,
  type AuthSessionResult,
} from './authSessionRuntime';

const API_BASE_URL = 'https://ecampus.pccu.edu.tw/eCampus';
const normalizeCredential = (value: string | null) => (value || '').trim();
const logger = createLogger('auth-service');

type SavedCredentials = PCCUCredentials;
type LoginOptions = { persistCredentials?: boolean };

export const clearSessionPCCUCredentials = () => credentialVault.clearActive();

export const loginPCCU = (
  account: string,
  password: string,
  options: LoginOptions = {},
): Promise<AuthSessionResult> =>
  trackAuthSessionOperation(async (operationGeneration) => {
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

      if (!isAuthSessionGenerationCurrent(operationGeneration)) {
        return { success: false, message: 'session_changed' };
      }

      if (data?.d && data.d.HasError === false) {
        const credentials = {
          account: normalizedAccount,
          password: normalizedPassword,
        };

        credentialVault.setActive(credentials);

        if (shouldPersistCredentials) {
          await credentialVault.save(credentials);
          if (!isAuthSessionGenerationCurrent(operationGeneration)) {
            return { success: false, message: 'session_changed' };
          }
        }

        return { success: true };
      }

      return {
        success: false,
        message: data?.d?.MessageKey || '登入失敗，請確認學號與密碼是否正確。',
      };
    } catch (error) {
      if (!isAuthSessionGenerationCurrent(operationGeneration)) {
        return { success: false, message: 'session_changed' };
      }
      logger.error('login_failed', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      return { success: false, message: '登入時發生問題，請稍後再試。' };
    }
  });

export const savePCCUCredentials = (account: string, password: string): Promise<void> =>
  trackAuthSessionOperation(async () => {
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
  });

export const clearPersistedPCCUCredentials = () => credentialVault.clearPersisted();

export const clearSavedPCCUCredentials = async () => {
  credentialVault.clearActive();
  await credentialVault.clearPersisted();
};

export const ensurePCCUSession = async (
  credentials?: SavedCredentials | null,
): Promise<AuthSessionResult> => {
  const resolvedCredentials =
    credentials || credentialVault.getActive() || (await getSavedPCCUCredentials());
  if (!resolvedCredentials) {
    return { success: false, message: '找不到可用的登入憑證。' };
  }

  const normalizedAccount = normalizeCredential(resolvedCredentials.account);
  if (isWarmSessionFresh(normalizedAccount, Date.now(), 45 * 1000)) {
    return { success: true };
  }

  const existingPromise = getWarmSessionPromise(normalizedAccount);
  if (existingPromise) return existingPromise;

  const operationGeneration = getAuthSessionGeneration();
  let warmPromise!: Promise<AuthSessionResult>;
  warmPromise = loginPCCU(resolvedCredentials.account, resolvedCredentials.password, {
    persistCredentials: false,
  })
    .then((result) => {
      if (result.success) {
        markWarmSession(normalizedAccount, Date.now(), operationGeneration);
      }
      return result;
    })
    .finally(() => {
      clearWarmSessionPromise(normalizedAccount, warmPromise);
    });
  setWarmSessionPromise(normalizedAccount, warmPromise);

  return warmPromise;
};

export const getSavedPCCUCredentials = (): Promise<SavedCredentials | null> => {
  const activeCredentials = credentialVault.getActive();
  return activeCredentials ? Promise.resolve(activeCredentials) : credentialVault.getSaved();
};

/** @deprecated Compatibility wrapper. Remove in Phase 4 after non-screen callers migrate. */
export const logoutPCCU = async () => {
  await appSessionCoordinator.transition('logout');
};
