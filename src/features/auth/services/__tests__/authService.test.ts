type Credentials = { account: string; password: string };

const mockVaultGetSaved = jest.fn<Promise<Credentials | null>, []>();
const mockVaultGetActive = jest.fn<Credentials | null, []>();
const mockVaultSave = jest.fn<Promise<void>, [Credentials]>();
const mockVaultSetActive = jest.fn<void, [Credentials]>();
const mockVaultClearActive = jest.fn<void, []>();
const mockVaultClearPersisted = jest.fn<Promise<void>, []>();
const mockVaultClearProfile = jest.fn<Promise<void>, []>();
const mockFetch = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
const mockSessionTransition = jest.fn<Promise<void>, ['logout']>();

jest.mock('../../../../composition/appSession', () => ({
  appSessionCoordinator: {
    transition: (reason: 'logout') => mockSessionTransition(reason),
  },
}));

jest.mock('../../infrastructure/SecureStoreCredentialVault', () => ({
  credentialVault: {
    getSaved: () => mockVaultGetSaved(),
    getActive: () => mockVaultGetActive(),
    save: (credentials: Credentials) => mockVaultSave(credentials),
    setActive: (credentials: Credentials) => mockVaultSetActive(credentials),
    clearActive: () => mockVaultClearActive(),
    clearPersisted: () => mockVaultClearPersisted(),
    clearProfile: () => mockVaultClearProfile(),
  },
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

jest.mock('../../../schedule/storage/scheduleStorage', () => ({
  clearCourses: jest.fn(async () => undefined),
}));

jest.mock('../../../grade/storage/gradeStorage', () => ({
  clearGrades: jest.fn(async () => undefined),
}));

import {
  clearPersistedPCCUCredentials,
  clearSessionPCCUCredentials,
  getSavedPCCUCredentials,
  loginPCCU,
  logoutPCCU,
  savePCCUCredentials,
} from '../authService';

const loginResponse = (hasError: boolean): Response =>
  ({
    json: jest.fn(async () => ({
      d: { HasError: hasError, MessageKey: hasError ? 'invalid_credentials' : '' },
    })),
  }) as unknown as Response;

describe('authService CredentialVault facade', () => {
  beforeEach(() => {
    mockVaultGetSaved.mockReset().mockResolvedValue(null);
    mockVaultGetActive.mockReset().mockReturnValue(null);
    mockVaultSave.mockReset().mockResolvedValue(undefined);
    mockVaultSetActive.mockReset();
    mockVaultClearActive.mockReset();
    mockVaultClearPersisted.mockReset().mockResolvedValue(undefined);
    mockVaultClearProfile.mockReset().mockResolvedValue(undefined);
    mockFetch.mockReset().mockResolvedValue(loginResponse(false));
    mockSessionTransition.mockReset().mockResolvedValue(undefined);
    global.fetch = mockFetch as typeof fetch;
  });

  it('keeps a successful non-remembered login in memory only', async () => {
    await expect(
      loginPCCU(' B4123456 ', ' secret ', { persistCredentials: false }),
    ).resolves.toEqual({ success: true });

    expect(mockVaultSetActive).toHaveBeenCalledWith({
      account: 'B4123456',
      password: 'secret',
    });
    expect(mockVaultSave).not.toHaveBeenCalled();
  });

  it('persists a remembered successful login only through the vault', async () => {
    await expect(loginPCCU('B4123456', 'secret', { persistCredentials: true })).resolves.toEqual({
      success: true,
    });

    expect(mockVaultSetActive).toHaveBeenCalledWith({
      account: 'B4123456',
      password: 'secret',
    });
    expect(mockVaultSave).toHaveBeenCalledWith({
      account: 'B4123456',
      password: 'secret',
    });
  });

  it('delegates saved, session, and persisted credential operations to the vault', async () => {
    const credentials = { account: 'B4123456', password: 'secret' };
    mockVaultGetSaved.mockResolvedValue(credentials);

    await expect(getSavedPCCUCredentials()).resolves.toEqual(credentials);
    await savePCCUCredentials(' B4123456 ', ' secret ');
    clearSessionPCCUCredentials();
    await clearPersistedPCCUCredentials();

    expect(mockVaultGetSaved).toHaveBeenCalledTimes(1);
    expect(mockVaultSave).toHaveBeenCalledWith(credentials);
    expect(mockVaultClearActive).toHaveBeenCalledTimes(1);
    expect(mockVaultClearPersisted).toHaveBeenCalledTimes(1);
  });

  it('keeps the deprecated logout wrapper on the session coordinator', async () => {
    await expect(logoutPCCU()).resolves.toBeUndefined();

    expect(mockSessionTransition).toHaveBeenCalledWith('logout');
    expect(mockVaultClearActive).not.toHaveBeenCalled();
    expect(mockVaultClearPersisted).not.toHaveBeenCalled();
    expect(mockVaultClearProfile).not.toHaveBeenCalled();
  });
});
