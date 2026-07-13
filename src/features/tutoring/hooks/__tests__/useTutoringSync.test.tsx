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

jest.mock('../../../pccu/engine/PccuSyncEngine', () => ({
  PccuSyncEngine: {
    getInstance: () => ({
      requestSync: function () {
        return mockRequestSync.apply(null, arguments as any);
      },
      waitForExecutorReady: () => mockWaitForExecutorReady(),
    }),
  },
}));

import { act, renderHook } from '@testing-library/react-native';

import { useTutoringSync } from '../useTutoringSync';
import { useTutoringStore } from '../../store/useTutoringStore';

describe('useTutoringSync (PccuSyncEngine wrapper)', () => {
  beforeEach(() => {
    mockRequestSync.mockClear();
    mockRequestSync.mockResolvedValue({ success: true });
    mockWaitForExecutorReady.mockClear();
    mockWaitForExecutorReady.mockResolvedValue(undefined);
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

  it('calls PccuSyncEngine.requestSync with type "tutoring"', async () => {
    const { result } = renderHook(() => useTutoringSync());

    await act(async () => {
      await result.current.sync();
    });

    expect(mockWaitForExecutorReady).toHaveBeenCalled();
    expect(mockRequestSync).toHaveBeenCalledWith('tutoring', 5);
  });

  it('calls PccuSyncEngine.requestSync with type "tutoring-detail" and courseCode', async () => {
    const { result } = renderHook(() => useTutoringSync());

    await act(async () => {
      await result.current.syncCourseDetail('CS101');
    });

    expect(mockWaitForExecutorReady).toHaveBeenCalled();
    expect(mockRequestSync).toHaveBeenCalledWith('tutoring-detail', 5, {
      courseCode: 'CS101',
    });
  });

  it('sets lastSyncedAt on successful sync', async () => {
    const { result } = renderHook(() => useTutoringSync());

    await act(async () => {
      await result.current.sync();
    });

    expect(useTutoringStore.getState().lastSyncedAt).not.toBeNull();
  });

  it('sets error on failed sync', async () => {
    mockRequestSync.mockResolvedValue({ success: false, message: '登入失敗' } as any);

    const { result } = renderHook(() => useTutoringSync());

    await act(async () => {
      await result.current.sync();
    });

    expect(useTutoringStore.getState().error).toBe('登入失敗');
  });

  it('sets error on sync exception', async () => {
    mockRequestSync.mockRejectedValue(new Error('網路錯誤'));

    const { result } = renderHook(() => useTutoringSync());

    await act(async () => {
      await result.current.sync();
    });

    expect(useTutoringStore.getState().error).toBe('網路錯誤');
  });

  it('skips sync if already in progress', async () => {
    let resolveRequest!: (value: { success: boolean }) => void;
    mockRequestSync.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );

    const { result } = renderHook(() => useTutoringSync());

    // Start first sync (won't resolve)
    act(() => {
      void result.current.sync();
    });

    // Try second sync while first is still running
    await act(async () => {
      await result.current.sync();
    });

    // Only one requestSync call should have been made
    expect(mockRequestSync).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRequest({ success: true });
      await Promise.resolve();
    });
  });

  it('does not surface errors from silent background sync', async () => {
    mockRequestSync.mockResolvedValue({ success: false, message: 'background failed' } as any);

    const { result } = renderHook(() => useTutoringSync());

    await act(async () => {
      await result.current.sync({ silent: true });
    });

    expect(useTutoringStore.getState().error).toBeNull();
    expect(useTutoringStore.getState().syncStatus).toBe('idle');
  });

  it('deduplicates overview sync across hook instances', async () => {
    let resolveRequest!: (value: { success: boolean }) => void;
    mockRequestSync.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );

    const first = renderHook(() => useTutoringSync());
    const second = renderHook(() => useTutoringSync());

    act(() => {
      void first.result.current.sync();
    });

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      void second.result.current.sync();
    });

    expect(mockRequestSync).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRequest({ success: true });
      await Promise.resolve();
    });
  });

  it('still syncs cached course detail when courseInfo is missing', async () => {
    useTutoringStore.setState({
      courseDetails: new Map([['CS101', { announcements: [], materials: [], assignments: [] }]]),
    });

    const { result } = renderHook(() => useTutoringSync());

    await act(async () => {
      await result.current.syncCourseDetail('CS101');
    });

    expect(mockRequestSync).toHaveBeenCalledWith('tutoring-detail', 5, {
      courseCode: 'CS101',
    });
  });

  it('still syncs cached course detail when progress and classmates have not been loaded yet', async () => {
    useTutoringStore.setState({
      courseDetails: new Map([
        [
          'CS101',
          {
            announcements: [],
            materials: [],
            assignments: [],
            courseInfo: {
              teacherName: 'teacher',
              academicYearTerm: '1142',
              departmentClass: 'class',
              requiredType: 'required',
              creditText: '2.0',
              englishLevel: 'N',
              scheduleText: 'schedule',
              expectedEnrollment: '64',
            },
          },
        ],
      ]),
    });

    const { result } = renderHook(() => useTutoringSync());

    await act(async () => {
      await result.current.syncCourseDetail('CS101');
    });

    expect(mockRequestSync).toHaveBeenCalledWith('tutoring-detail', 5, {
      courseCode: 'CS101',
    });
  });

  it('skips cached course detail with courseInfo unless force=true', async () => {
    useTutoringStore.setState({
      courseDetails: new Map([
        [
          'CS101',
          {
            announcements: [],
            materials: [],
            assignments: [],
            progress: [],
            classmates: [],
            courseInfo: {
              teacherName: '高荻華',
              academicYearTerm: '1142',
              departmentClass: 'U PCL 中文 1 (29)',
              requiredType: '必修',
              creditText: '2.0',
              englishLevel: 'N',
              scheduleText: '星期二, 02-03 大孝 0412',
              expectedEnrollment: '64',
            },
          },
        ],
      ]),
    });

    const { result } = renderHook(() => useTutoringSync());

    await act(async () => {
      await result.current.syncCourseDetail('CS101');
    });

    expect(mockRequestSync).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.syncCourseDetail('CS101', { force: true });
    });

    expect(mockRequestSync).toHaveBeenCalledWith('tutoring-detail', 5, {
      courseCode: 'CS101',
    });
  });

  it('does not surface errors or loading state from silent detail prefetch', async () => {
    mockRequestSync.mockResolvedValue({ success: false, message: 'detail prefetch failed' } as any);

    const { result } = renderHook(() => useTutoringSync());

    await act(async () => {
      await result.current.syncCourseDetail('CS101', { silent: true, priority: 9 });
    });

    expect(mockRequestSync).toHaveBeenCalledWith('tutoring-detail', 9, {
      courseCode: 'CS101',
      silent: true,
    });
    expect(useTutoringStore.getState().error).toBeNull();
    expect(useTutoringStore.getState().syncStatus).toBe('idle');
    expect(useTutoringStore.getState().syncPhase).toBe('idle');
  });

  it('passes priority option to requestSync', async () => {
    const { result } = renderHook(() => useTutoringSync());

    await act(async () => {
      await result.current.sync({ priority: 1 });
    });

    expect(mockRequestSync).toHaveBeenCalledWith('tutoring', 1);
  });

  it('does not set syncStatus to syncing when silent=true', async () => {
    const { result } = renderHook(() => useTutoringSync());

    await act(async () => {
      await result.current.sync({ silent: true });
    });

    // syncStatus should remain idle because silent=true
    expect(useTutoringStore.getState().syncStatus).toBe('idle');
  });

  it('sets syncStatus to syncing when silent is not true', async () => {
    const { result } = renderHook(() => useTutoringSync());

    // Start sync but don't await — check status during sync
    mockRequestSync.mockImplementation(() => new Promise(() => {}));

    act(() => {
      void result.current.sync({ silent: false });
    });

    expect(useTutoringStore.getState().syncStatus).toBe('syncing');
  });
});
