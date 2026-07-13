const mockGetItemAsync = jest.fn<Promise<string | null>, [string]>();
const mockSetItemAsync = jest.fn<Promise<void>, [string, string]>();
const mockDeleteItemAsync = jest.fn<Promise<void>, [string]>();
const mockAsyncStorageGetItem = jest.fn<Promise<string | null>, [string]>();
const mockAsyncStorageSetItem = jest.fn<Promise<void>, [string, string]>();
const mockAsyncStorageRemoveItem = jest.fn<Promise<void>, [string]>();

jest.mock('expo-secure-store', () => ({
  getItemAsync: (key: string) => mockGetItemAsync(key),
  setItemAsync: (key: string, value: string) => mockSetItemAsync(key, value),
  deleteItemAsync: (key: string) => mockDeleteItemAsync(key),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: (key: string) => mockAsyncStorageGetItem(key),
  setItem: (key: string, value: string) => mockAsyncStorageSetItem(key, value),
  removeItem: (key: string) => mockAsyncStorageRemoveItem(key),
}));

import {
  ACCOUNT_KEY,
  LEGACY_CREDENTIALS_MIRROR_KEY,
  PASSWORD_KEY,
  SecureStoreCredentialVault,
} from '../SecureStoreCredentialVault';

describe('SecureStoreCredentialVault', () => {
  let vault: SecureStoreCredentialVault;

  beforeEach(() => {
    mockGetItemAsync.mockReset().mockResolvedValue(null);
    mockSetItemAsync.mockReset().mockResolvedValue(undefined);
    mockDeleteItemAsync.mockReset().mockResolvedValue(undefined);
    mockAsyncStorageGetItem.mockReset().mockResolvedValue(null);
    mockAsyncStorageSetItem.mockReset().mockResolvedValue(undefined);
    mockAsyncStorageRemoveItem.mockReset().mockResolvedValue(undefined);
    vault = new SecureStoreCredentialVault();
  });

  it.each([
    [null, 'secret'],
    ['B4123456', null],
  ])('clears both secure values when one half is missing', async (account, password) => {
    mockGetItemAsync.mockImplementation(async (key) => (key === ACCOUNT_KEY ? account : password));

    await expect(vault.migrateV2()).resolves.toEqual({ status: 'requires_sign_in' });

    expect(mockDeleteItemAsync).toHaveBeenCalledWith(ACCOUNT_KEY);
    expect(mockDeleteItemAsync).toHaveBeenCalledWith(PASSWORD_KEY);
    expect(mockAsyncStorageRemoveItem).toHaveBeenCalledWith(LEGACY_CREDENTIALS_MIRROR_KEY);
    expect(vault.getActive()).toBeNull();
  });

  it('preserves complete SecureStore credentials and never reads the mirror', async () => {
    mockGetItemAsync.mockImplementation(async (key) =>
      key === ACCOUNT_KEY ? ' B4123456 ' : ' secret ',
    );

    await expect(vault.migrateV2()).resolves.toEqual({
      status: 'ready',
      credentials: { account: 'B4123456', password: 'secret' },
    });

    expect(mockAsyncStorageGetItem).not.toHaveBeenCalled();
    expect(mockAsyncStorageRemoveItem).toHaveBeenCalledWith(LEGACY_CREDENTIALS_MIRROR_KEY);
    expect(mockDeleteItemAsync).not.toHaveBeenCalled();
  });

  it('normalizes and saves a complete pair while keeping an active in-memory copy', async () => {
    await vault.save({ account: ' B4123456 ', password: ' secret ' });

    expect(mockSetItemAsync).toHaveBeenCalledWith(ACCOUNT_KEY, 'B4123456');
    expect(mockSetItemAsync).toHaveBeenCalledWith(PASSWORD_KEY, 'secret');
    expect(vault.getActive()).toEqual({ account: 'B4123456', password: 'secret' });
    await expect(vault.getSaved()).resolves.toEqual({ account: 'B4123456', password: 'secret' });
    expect(mockGetItemAsync).not.toHaveBeenCalled();
  });

  it('can clear only the active in-memory credentials', () => {
    vault.setActive({ account: 'B4123456', password: 'secret' });

    vault.clearActive();

    expect(vault.getActive()).toBeNull();
    expect(mockDeleteItemAsync).not.toHaveBeenCalled();
  });

  it('rolls back both secure values when a partial save fails', async () => {
    mockSetItemAsync.mockImplementation(async (key) => {
      if (key === PASSWORD_KEY) throw new Error('write failed');
    });

    await expect(vault.save({ account: 'B4123456', password: 'secret' })).rejects.toThrow(
      'credential_vault_write_failed',
    );

    expect(mockDeleteItemAsync).toHaveBeenCalledWith(ACCOUNT_KEY);
    expect(mockDeleteItemAsync).toHaveBeenCalledWith(PASSWORD_KEY);
    expect(mockAsyncStorageRemoveItem).toHaveBeenCalledWith(LEGACY_CREDENTIALS_MIRROR_KEY);
    expect(vault.getActive()).toBeNull();
  });

  it('deduplicates repeated migration calls', async () => {
    mockGetItemAsync.mockImplementation(async (key) =>
      key === ACCOUNT_KEY ? 'B4123456' : 'secret',
    );

    const first = vault.migrateV2();
    const second = vault.migrateV2();

    expect(second).toBe(first);
    await expect(first).resolves.toEqual({
      status: 'ready',
      credentials: { account: 'B4123456', password: 'secret' },
    });
    expect(mockGetItemAsync).toHaveBeenCalledTimes(2);
    expect(mockAsyncStorageRemoveItem).toHaveBeenCalledTimes(1);
  });

  it('clears non-credential profile keys independently', async () => {
    await vault.clearProfile();

    expect(mockDeleteItemAsync).toHaveBeenCalledWith('session_cookie');
    expect(mockDeleteItemAsync).toHaveBeenCalledWith('user_name');
    expect(mockDeleteItemAsync).toHaveBeenCalledTimes(2);
  });
});
