const mockTransition = jest.fn<Promise<void>, ['logout' | 'account_switch']>();
const mockRouterReplace = jest.fn();
const mockRouterPush = jest.fn();
const mockLogin = jest.fn();
const mockGetSavedCredentials = jest.fn();
const mockClearPersistedCredentials = jest.fn();
const mockSaveCredentials = jest.fn();
const mockEnsureSession = jest.fn();
const mockGetActiveVaultCredentials = jest.fn();
const mockGetSavedVaultCredentials = jest.fn();
const mockGetBiometricLoginEnabled = jest.fn();
const mockGetRememberCredentialsEnabled = jest.fn();

jest.mock('../../../composition/appSession', () => ({
  appSessionCoordinator: {
    transition: (reason: 'logout' | 'account_switch') => mockTransition(reason),
  },
}));

jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockRouterReplace(...args), push: mockRouterPush },
}));

jest.mock('../../../providers/theme/ThemeProvider', () => ({
  useTheme: () => ({
    mode: 'system',
    theme: {
      bg: '#fff',
      card: '#fff',
      text: '#000',
      textSub: '#666',
      border: '#ddd',
      primary: '#07f',
      danger: '#f00',
      syncBtnBg: '#fff',
      rankBg: '#eee',
    },
  }),
}));

jest.mock('../../../shared/components/AppSymbol', () => () => null);

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
}));

jest.mock('../../grade/storage/gradeStorage', () => ({
  getGrades: jest.fn(async () => ({ grades: null, preAdmission: null, updatedAt: null })),
}));

jest.mock('../services/authService', () => ({
  loginPCCU: (...args: unknown[]) => mockLogin(...args),
  getSavedPCCUCredentials: () => mockGetSavedCredentials(),
  clearSavedPCCUCredentials: jest.fn(async () => undefined),
  clearPersistedPCCUCredentials: () => mockClearPersistedCredentials(),
  savePCCUCredentials: (...args: unknown[]) => mockSaveCredentials(...args),
  ensurePCCUSession: (...args: unknown[]) => mockEnsureSession(...args),
}));

jest.mock('../infrastructure/SecureStoreCredentialVault', () => ({
  credentialVault: {
    getActive: () => mockGetActiveVaultCredentials(),
    getSaved: () => mockGetSavedVaultCredentials(),
  },
}));

jest.mock('../../settings/storage/securitySettings', () => ({
  getBiometricLoginEnabled: () => mockGetBiometricLoginEnabled(),
  getRememberCredentialsEnabled: () => mockGetRememberCredentialsEnabled(),
  setBiometricLoginEnabled: jest.fn(async () => undefined),
  setRememberCredentialsEnabled: jest.fn(async () => undefined),
}));

jest.mock('expo-local-authentication', () => ({
  AuthenticationType: { FACIAL_RECOGNITION: 2 },
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  supportedAuthenticationTypesAsync: jest.fn(async () => [2]),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'storeClient' },
  ExecutionEnvironment: { StoreClient: 'storeClient' },
}));

jest.mock('../services/bootstrapCache', () => ({
  getBootstrapCacheSnapshot: jest.fn(async () => ({ hasAnyCache: false })),
}));

import fs from 'fs';
import path from 'path';
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SessionCleanupError } from '../../../core/session/AppSessionCoordinator';
import LoginScreen from '../screens/LoginScreen';
import SettingsScreen from '../../settings/screens/SettingsScreen';
import SecurityScreen from '../../settings/screens/SecurityScreen';

type Deferred = { promise: Promise<void>; resolve: () => void };
const deferred = (): Deferred => {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
};

const confirmLatestAlert = (): void => {
  const buttons = jest.mocked(Alert.alert).mock.calls.at(-1)?.[2];
  const confirm = buttons?.[1];
  if (!confirm?.onPress) throw new Error('missing_confirm_action');
  confirm.onPress();
};

describe('session entry points', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockTransition.mockReset().mockResolvedValue(undefined);
    mockRouterReplace.mockReset();
    mockRouterPush.mockReset();
    mockLogin.mockReset().mockResolvedValue({ success: true });
    mockGetSavedCredentials.mockReset().mockResolvedValue(null);
    mockClearPersistedCredentials.mockReset().mockResolvedValue(undefined);
    mockSaveCredentials.mockReset().mockResolvedValue(undefined);
    mockEnsureSession.mockReset().mockResolvedValue({ success: true });
    mockGetActiveVaultCredentials.mockReset().mockReturnValue(null);
    mockGetSavedVaultCredentials.mockReset().mockResolvedValue(null);
    mockGetBiometricLoginEnabled.mockReset().mockResolvedValue(false);
    mockGetRememberCredentialsEnabled.mockReset().mockResolvedValue(false);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('awaits Settings logout cleanup before navigating', async () => {
    const pending = deferred();
    mockTransition.mockReturnValueOnce(pending.promise);
    const rendered = render(<SettingsScreen />);
    await act(async () => Promise.resolve());

    fireEvent.press(rendered.getByTestId('settings-logout-button'));
    act(() => confirmLatestAlert());

    expect(mockTransition).toHaveBeenCalledWith('logout');
    await waitFor(() =>
      expect(rendered.getByTestId('settings-logout-button').props.accessibilityState.disabled).toBe(
        true,
      ),
    );
    expect(mockRouterReplace).not.toHaveBeenCalled();

    await act(async () => {
      pending.resolve();
      await pending.promise;
    });

    expect(mockRouterReplace).toHaveBeenCalledWith('/login');
  });

  it('keeps Settings open after cleanup failure and retries safely', async () => {
    mockTransition
      .mockRejectedValueOnce(new SessionCleanupError('logout', 1))
      .mockResolvedValueOnce(undefined);
    const rendered = render(<SettingsScreen />);
    await act(async () => Promise.resolve());

    fireEvent.press(rendered.getByTestId('settings-logout-button'));
    await act(async () => {
      confirmLatestAlert();
      await Promise.resolve();
    });

    expect(mockRouterReplace).not.toHaveBeenCalled();
    fireEvent.press(await rendered.findByText('重試清除'));

    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/login'));
    expect(mockTransition).toHaveBeenCalledTimes(2);
  });

  it('awaits Security logout cleanup before navigating', async () => {
    const pending = deferred();
    mockTransition.mockReturnValueOnce(pending.promise);
    const rendered = render(<SecurityScreen />);
    await act(async () => Promise.resolve());

    fireEvent(rendered.getByTestId('security-remember-switch'), 'valueChange', true);
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    act(() => confirmLatestAlert());
    await waitFor(() => expect(mockTransition).toHaveBeenCalledWith('logout'));

    expect(mockRouterReplace).not.toHaveBeenCalled();
    pending.resolve();
    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledWith('/login'));
  });

  it('cleans a different account before issuing the network login', async () => {
    const pending = deferred();
    const order: string[] = [];
    mockTransition.mockImplementationOnce(() => {
      order.push('transition');
      return pending.promise;
    });
    mockLogin.mockImplementation(async () => {
      order.push('login');
      return { success: true };
    });
    mockGetActiveVaultCredentials.mockReturnValue({
      account: 'ACCOUNT_A',
      password: 'ACTIVE_PASSWORD',
    });
    mockGetBiometricLoginEnabled.mockResolvedValueOnce(true).mockResolvedValue(false);
    const rendered = render(<LoginScreen />);

    await waitFor(() => expect(mockGetSavedCredentials).toHaveBeenCalled());
    fireEvent.changeText(rendered.getByPlaceholderText('Account'), ' ACCOUNT_B ');
    fireEvent.changeText(rendered.getByPlaceholderText('Password'), 'NEW_PASSWORD');
    fireEvent.press(rendered.getByTestId('login-submit-button'));

    await waitFor(() => expect(mockTransition).toHaveBeenCalledWith('account_switch'));
    expect(mockLogin).not.toHaveBeenCalled();
    expect(order).toEqual(['transition']);

    pending.resolve();
    await waitFor(() => expect(mockLogin).toHaveBeenCalled());
    expect(order).toEqual(['transition', 'login']);
    const emittedLogs = JSON.stringify([
      consoleLogSpy.mock.calls,
      consoleWarnSpy.mock.calls,
      consoleErrorSpy.mock.calls,
    ]);
    expect(emittedLogs).not.toContain('ACCOUNT_B');
    expect(emittedLogs).not.toContain('NEW_PASSWORD');
  });

  it('does not clear the session before logging into the same account', async () => {
    mockGetActiveVaultCredentials.mockReturnValue({
      account: 'ACCOUNT_A',
      password: 'ACTIVE_PASSWORD',
    });
    mockGetBiometricLoginEnabled.mockResolvedValueOnce(true).mockResolvedValue(false);
    const rendered = render(<LoginScreen />);

    await waitFor(() => expect(mockGetSavedCredentials).toHaveBeenCalled());
    fireEvent.changeText(rendered.getByPlaceholderText('Account'), ' ACCOUNT_A ');
    fireEvent.changeText(rendered.getByPlaceholderText('Password'), 'NEW_PASSWORD');
    fireEvent.press(rendered.getByTestId('login-submit-button'));

    await waitFor(() => expect(mockLogin).toHaveBeenCalled());
    expect(mockTransition).not.toHaveBeenCalled();
  });

  it('forbids screens from importing the deprecated logout wrapper', () => {
    const screens = [
      path.resolve(__dirname, '../../settings/screens/SettingsScreen.tsx'),
      path.resolve(__dirname, '../../settings/screens/SecurityScreen.tsx'),
      path.resolve(__dirname, '../screens/LoginScreen.tsx'),
    ];

    for (const screen of screens) {
      expect(fs.readFileSync(screen, 'utf8')).not.toMatch(/\blogoutPCCU\b/);
    }
  });
});
