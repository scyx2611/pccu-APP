import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type {
  CredentialMigrationResult,
  CredentialVault,
  PCCUCredentials,
} from '../application/CredentialVault';

export const ACCOUNT_KEY = 'user_account';
export const PASSWORD_KEY = 'user_password';
export const LEGACY_CREDENTIALS_MIRROR_KEY = 'user_credentials_cache_v1';

const PROFILE_KEYS = ['session_cookie', 'user_name'] as const;
const normalize = (value: string | null) => (value ?? '').trim();

const failureReasons = (results: PromiseSettledResult<unknown>[]) =>
  results
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => result.reason);

export class SecureStoreCredentialVault implements CredentialVault {
  private active: PCCUCredentials | null = null;
  private migration: Promise<CredentialMigrationResult> | null = null;

  migrateV2(): Promise<CredentialMigrationResult> {
    this.migration ??= this.runMigration();
    return this.migration;
  }

  private async runMigration(): Promise<CredentialMigrationResult> {
    const [mirrorDeletion, accountRead, passwordRead] = await Promise.allSettled([
      AsyncStorage.removeItem(LEGACY_CREDENTIALS_MIRROR_KEY),
      SecureStore.getItemAsync(ACCOUNT_KEY),
      SecureStore.getItemAsync(PASSWORD_KEY),
    ]);

    if (
      mirrorDeletion.status === 'rejected' ||
      accountRead.status === 'rejected' ||
      passwordRead.status === 'rejected'
    ) {
      return this.clearAfterFailure('credential_vault_migration_failed', [
        mirrorDeletion,
        accountRead,
        passwordRead,
      ]);
    }

    const account = normalize(accountRead.value);
    const password = normalize(passwordRead.value);
    if (!account || !password) {
      await this.clearPersisted();
      return { status: 'requires_sign_in' };
    }

    this.active = { account, password };
    return { status: 'ready', credentials: this.active };
  }

  async getSaved(): Promise<PCCUCredentials | null> {
    const result = await this.migrateV2();
    return result.status === 'ready' ? result.credentials : null;
  }

  getActive(): PCCUCredentials | null {
    return this.active;
  }

  setActive(credentials: PCCUCredentials): void {
    this.active = {
      account: normalize(credentials.account),
      password: normalize(credentials.password),
    };
  }

  async save(credentials: PCCUCredentials): Promise<void> {
    const normalized = {
      account: normalize(credentials.account),
      password: normalize(credentials.password),
    };
    if (!normalized.account || !normalized.password) {
      throw new Error('credential_vault_invalid_credentials');
    }

    const writes = await Promise.allSettled([
      SecureStore.setItemAsync(ACCOUNT_KEY, normalized.account),
      SecureStore.setItemAsync(PASSWORD_KEY, normalized.password),
      AsyncStorage.removeItem(LEGACY_CREDENTIALS_MIRROR_KEY),
    ]);
    if (writes.some((result) => result.status === 'rejected')) {
      await this.clearAfterFailure('credential_vault_write_failed', writes);
    }

    this.active = normalized;
    this.migration = Promise.resolve({ status: 'ready', credentials: this.active });
  }

  clearActive(): void {
    this.active = null;
  }

  async clearPersisted(): Promise<void> {
    this.clearActive();
    this.migration = null;
    const results = await Promise.allSettled([
      SecureStore.deleteItemAsync(ACCOUNT_KEY),
      SecureStore.deleteItemAsync(PASSWORD_KEY),
      AsyncStorage.removeItem(LEGACY_CREDENTIALS_MIRROR_KEY),
    ]);
    const failures = failureReasons(results);
    if (failures.length > 0) {
      throw new AggregateError(failures, 'credential_vault_clear_failed');
    }
  }

  async clearProfile(): Promise<void> {
    const results = await Promise.allSettled(
      PROFILE_KEYS.map((key) => SecureStore.deleteItemAsync(key)),
    );
    const failures = failureReasons(results);
    if (failures.length > 0) {
      throw new AggregateError(failures, 'profile_clear_failed');
    }
  }

  private async clearAfterFailure(
    message: string,
    failedOperationResults: PromiseSettledResult<unknown>[],
  ): Promise<never> {
    const causes = failureReasons(failedOperationResults);
    try {
      await this.clearPersisted();
    } catch (error) {
      causes.push(error);
    }
    throw new AggregateError(causes, message);
  }
}

export const credentialVault = new SecureStoreCredentialVault();
