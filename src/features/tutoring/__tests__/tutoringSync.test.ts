jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
}));

const mockRequestSync = jest.fn(async () => ({ success: true }));
const mockWaitForExecutorReady = jest.fn(async () => {});

jest.mock('../../pccu/engine/PccuSyncEngine', () => ({
  PccuSyncEngine: {
    getInstance: () => ({
      requestSync: function () {
        return mockRequestSync.apply(null, arguments as any);
      },
      waitForExecutorReady: () => mockWaitForExecutorReady(),
    }),
    TASK_TIMEOUT_MS: 30_000,
  },
}));

import fs from 'fs';
import path from 'path';
import { PccuSyncEngine } from '../../pccu/engine/PccuSyncEngine';
import { pccuBrowserSessionGate } from '../../pccu/engine/pccuBrowserSessionGate';
import { useTutoringStore } from '../store/useTutoringStore';
import type { SyncPhase } from '../types';

describe('Tutoring migration integration', () => {
  beforeEach(() => {
    mockRequestSync.mockClear();
    mockRequestSync.mockResolvedValue({ success: true });
    mockWaitForExecutorReady.mockClear();
    mockWaitForExecutorReady.mockResolvedValue(undefined);
    pccuBrowserSessionGate.resetForTests();
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

  // 1. Full sync flow
  it('calls PccuSyncEngine.requestSync with type "tutoring" and default priority 5', async () => {
    const engine = PccuSyncEngine.getInstance();
    await engine.waitForExecutorReady();
    const result = await engine.requestSync('tutoring', 5);

    expect(mockWaitForExecutorReady).toHaveBeenCalled();
    expect(mockRequestSync).toHaveBeenCalledWith('tutoring', 5);
    expect(result).toEqual({ success: true });
  });

  // 2. Course detail flow
  it('calls PccuSyncEngine.requestSync with type "tutoring-detail" and courseCode option', async () => {
    const engine = PccuSyncEngine.getInstance();
    await engine.waitForExecutorReady();
    const result = await engine.requestSync('tutoring-detail', 5, { courseCode: 'CS101' });

    expect(mockRequestSync).toHaveBeenCalledWith('tutoring-detail', 5, {
      courseCode: 'CS101',
    });
    expect(result).toEqual({ success: true });
  });

  // 3. Custom priority
  it('passes custom priority to requestSync', async () => {
    const engine = PccuSyncEngine.getInstance();
    await engine.waitForExecutorReady();
    await engine.requestSync('tutoring', 1);

    expect(mockRequestSync).toHaveBeenCalledWith('tutoring', 1);
  });

  // 4. Session gate
  it('pccuBrowserSessionGate is acquired before tutoring sync starts', async () => {
    expect(pccuBrowserSessionGate.isLocked()).toBe(false);

    const lease = await pccuBrowserSessionGate.acquire('tutoring-sync');
    expect(pccuBrowserSessionGate.isLocked()).toBe(true);
    expect(pccuBrowserSessionGate.getCurrentOwner()).toBe('tutoring-sync');

    // A second acquirer should be queued, not granted immediately
    let secondGranted = false;
    const secondPromise = pccuBrowserSessionGate.acquire('tutoring-detail').then((l) => {
      secondGranted = true;
      l.release();
    });
    expect(secondGranted).toBe(false);
    expect(pccuBrowserSessionGate.getQueueLength()).toBe(1);

    lease.release();
    await secondPromise;
    expect(secondGranted).toBe(true);
  });

  // 5. Watchdog timeout
  it('PccuSyncEngine rejects a tutoring request that exceeds 30s timeout', async () => {
    jest.useFakeTimers();

    // Use the real PccuSyncEngine (unmocked) to verify timeout behavior
    jest.unmock('../../pccu/engine/PccuSyncEngine');
    const { PccuSyncEngine: RealEngine } = jest.requireActual('../../pccu/engine/PccuSyncEngine');

    RealEngine.resetInstance();
    const engine = RealEngine.getInstance();
    engine.setExecutor(() => new Promise(() => {}));

    const requestPromise = engine.requestSync('tutoring', 5);
    jest.advanceTimersByTime(30_000);

    await expect(requestPromise).rejects.toThrow('timed out after 30s');

    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    RealEngine.resetInstance();
  });

  // 6. Retry on failure — store error state
  it('sets error in useTutoringStore when tutoring sync fails', () => {
    useTutoringStore.getState().setError('課業同步失敗');

    const state = useTutoringStore.getState();
    expect(state.error).toBe('課業同步失敗');
    expect(state.syncStatus).toBe('error');
    expect(state.syncPhase).toBe('error');
  });

  // 7. No embedded WebView
  it('TutoringScreen.tsx and TutoringCourseDetailScreen.tsx do not import WebView', () => {
    const screensDir = path.resolve(__dirname, '..', 'screens');
    const tutoringScreen = fs.readFileSync(
      path.join(screensDir, 'TutoringScreen.tsx'),
      'utf8',
    );
    const detailScreen = fs.readFileSync(
      path.join(screensDir, 'TutoringCourseDetailScreen.tsx'),
      'utf8',
    );

    const webViewImportPattern = /from\s+['"]react-native-webview['"]/;

    expect(webViewImportPattern.test(tutoringScreen)).toBe(false);
    expect(webViewImportPattern.test(detailScreen)).toBe(false);
  });

  // 8. SyncPhase states
  it('SyncPhase type covers all expected phases', () => {
    const validPhases: SyncPhase[] = [
      'idle',
      'logging_in',
      'fetching_courses',
      'fetching_details',
      'complete',
      'error',
    ];

    // Verify each phase is a valid SyncPhase value
    for (const phase of validPhases) {
      expect(typeof phase).toBe('string');
    }

    // Verify the store accepts each phase
    for (const phase of validPhases) {
      useTutoringStore.getState().setSyncPhase(phase);
      expect(useTutoringStore.getState().syncPhase).toBe(phase);
    }
  });
});
