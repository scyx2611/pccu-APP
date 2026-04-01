jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
}));

const mockGetSavedPCCUCredentials = jest.fn(async () => ({
  username: 'u123',
  password: 'p456',
}));

jest.mock('../../../auth/services/authService', () => ({
  getSavedPCCUCredentials: () => mockGetSavedPCCUCredentials(),
}));

jest.mock('../../sync/tutoringScripts', () => ({
  buildTutoringOverviewScript: jest.fn(() => 'true;'),
  buildTutoringAllAssignmentsScript: jest.fn(() => 'true;'),
  buildTutoringPendingAssignmentsScript: jest.fn(() => 'true;'),
  buildTutoringSingleCourseScript: jest.fn(() => 'true;'),
  buildWaitForCourseFpScript: jest.fn(() => 'true;'),
}));

jest.mock('../../storage/tutoringStorage', () => ({
  setCourses: jest.fn(),
  setPendingAssignments: jest.fn(),
  setAllAssignments: jest.fn(),
}));

import { act, renderHook } from '@testing-library/react-native';

import { pccuBrowserSessionGate } from '../../../pccu/engine/pccuBrowserSessionGate';
import { useTutoringSync } from '../useTutoringSync';
import { useTutoringStore } from '../../store/useTutoringStore';

describe('useTutoringSync PCCU session gate', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    pccuBrowserSessionGate.resetForTests();
    mockGetSavedPCCUCredentials.mockClear();
    useTutoringStore.setState({
      courses: [],
      courseDetails: new Map(),
      syncStatus: 'idle',
      syncPhase: 'idle',
      pendingAssignmentsCount: 0,
      pendingAssignments: [],
      lastSyncedAt: null,
      error: null,
      semester: '',
      welcomeText: '',
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    pccuBrowserSessionGate.resetForTests();
  });

  it('waits for the shared PCCU gate before entering logging_in', async () => {
    const existingLease = await pccuBrowserSessionGate.acquire('schedule');
    const webViewRef = { current: { injectJavaScript: jest.fn() } } as any;
    const { result } = renderHook(() => useTutoringSync({ webViewRef }));

    let syncPromise: Promise<void> | null = null;
    await act(async () => {
      syncPromise = result.current.startSync();
      await Promise.resolve();
    });

    expect(result.current.phaseRef.current).toBe('idle');
    expect(useTutoringStore.getState().syncStatus).toBe('syncing');
    expect(result.current.statusText).toBe('等待其他 PCCU 同步完成...');

    existingLease.release();

    await act(async () => {
      await syncPromise;
    });

    expect(result.current.phaseRef.current).toBe('logging_in');
    expect(pccuBrowserSessionGate.getCurrentOwner()).toContain('tutoring:all:');
  });

  it('releases the PCCU gate after a login failure so the next caller can proceed', async () => {
    const webViewRef = { current: { injectJavaScript: jest.fn() } } as any;
    const { result } = renderHook(() => useTutoringSync({ webViewRef }));

    await act(async () => {
      await result.current.startSync();
    });

    let nextAcquired = false;
    const nextLeasePromise = pccuBrowserSessionGate.acquire('schedule').then((lease) => {
      nextAcquired = true;
      return lease;
    });

    await Promise.resolve();
    expect(nextAcquired).toBe(false);

    await act(async () => {
      await result.current.handleMessage({
        nativeEvent: { data: JSON.stringify({ t: 'login_fail', m: '帳號密碼錯誤' }) },
      });
    });

    const nextLease = await nextLeasePromise;
    expect(nextAcquired).toBe(true);
    expect(result.current.phaseRef.current).toBe('complete');
    nextLease.release();
  });
});
