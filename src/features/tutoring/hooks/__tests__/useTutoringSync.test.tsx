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

const flushMicrotasks = async () => {
  await Promise.resolve();
};

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

  it('releases the PCCU gate after a successful tutoring completion', async () => {
    const webViewRef = { current: { injectJavaScript: jest.fn() } } as any;
    const { result } = renderHook(() => useTutoringSync({ webViewRef }));

    await act(async () => {
      await result.current.startSync();
    });

    await act(async () => {
      await result.current.handleMessage({
        nativeEvent: { data: JSON.stringify({ t: 'pending', items: [] }) },
      });
    });

    expect(result.current.phaseRef.current).toBe('complete');
    expect(pccuBrowserSessionGate.isLocked()).toBe(false);

    const nextLease = await pccuBrowserSessionGate.acquire('schedule');
    expect(nextLease.owner).toBe('schedule');
    nextLease.release();
  });

  it('releases the PCCU gate when tutoring times out after gate acquisition', async () => {
    const webViewRef = { current: { injectJavaScript: jest.fn() } } as any;
    const { result } = renderHook(() => useTutoringSync({ webViewRef }));

    await act(async () => {
      await result.current.startSync();
    });

    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await flushMicrotasks();
    });

    expect(result.current.phaseRef.current).toBe('complete');
    expect(result.current.statusText).toBe('登入逾時');
    expect(pccuBrowserSessionGate.isLocked()).toBe(false);

    const nextLease = await pccuBrowserSessionGate.acquire('schedule');
    expect(nextLease.owner).toBe('schedule');
    nextLease.release();
  });

  it('releases the PCCU gate when the tutoring hook unmounts mid-sync', async () => {
    const webViewRef = { current: { injectJavaScript: jest.fn() } } as any;
    const { result, unmount } = renderHook(() => useTutoringSync({ webViewRef }));

    await act(async () => {
      await result.current.startSync();
    });

    unmount();

    expect(pccuBrowserSessionGate.isLocked()).toBe(false);

    const nextLease = await pccuBrowserSessionGate.acquire('schedule');
    expect(nextLease.owner).toBe('schedule');
    nextLease.release();
  });

  it('releases the PCCU gate if tutoring stalls after login so the next caller is not blocked forever', async () => {
    const webViewRef = { current: { injectJavaScript: jest.fn() } } as any;
    const { result } = renderHook(() => useTutoringSync({ webViewRef }));

    await act(async () => {
      await result.current.startSync();
    });

    await act(async () => {
      result.current.handleNavChange({
        loading: false,
        url: 'https://icas.pccu.edu.tw/cfp/',
        title: 'Tutoring',
      } as any);
    });

    let nextAcquired = false;
    const nextLeasePromise = pccuBrowserSessionGate.acquire('schedule').then((lease) => {
      nextAcquired = true;
      return lease;
    });

    await flushMicrotasks();
    expect(nextAcquired).toBe(false);
    expect(result.current.phaseRef.current).toBe('fetching_courses');

    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await flushMicrotasks();
    });

    const nextLease = await nextLeasePromise;
    expect(nextAcquired).toBe(true);
    expect(result.current.phaseRef.current).toBe('complete');
    expect(result.current.statusText).toBe('同步逾時');
    nextLease.release();
  });
});
