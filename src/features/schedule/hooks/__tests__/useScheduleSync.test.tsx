jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

const mockGetCourses = jest.fn(async () => ({
  courses: [
    {
      name: '高等演算法實務',
      teacher: '王老師',
      location: '工程館 302',
      required: true,
      type: '必修',
      dayOfWeek: 3,
      periodRange: '',
      startPeriod: 2,
      endPeriod: 3,
    },
  ],
  updatedAt: 123,
}));

jest.mock('../../storage/scheduleStorage', () => ({
  getCourses: () => mockGetCourses(),
}));

const mockRequestSync = jest.fn(async (_type?: string, _priority?: number) => ({ success: true, updatedAt: 123 }));
const mockWaitForExecutorReady = jest.fn(async () => {});

jest.mock('../../../pccu/engine/PccuSyncEngine', () => ({
  PccuSyncEngine: {
    getInstance: () => ({
      requestSync: (type: string, priority?: number) => mockRequestSync(type, priority),
      waitForExecutorReady: () => mockWaitForExecutorReady(),
    }),
  },
}));

import { act, renderHook } from '@testing-library/react-native';
import { useScheduleSync } from '../useScheduleSync';
import { useScheduleStore } from '../../store/useScheduleStore';

describe('useScheduleSync', () => {
  beforeEach(() => {
    mockGetCourses.mockClear();
    mockRequestSync.mockClear();
    mockRequestSync.mockResolvedValue({ success: true, updatedAt: 123 });
    mockWaitForExecutorReady.mockClear();
    mockWaitForExecutorReady.mockResolvedValue(undefined);
    useScheduleStore.setState({
      courses: [],
      lastSyncedAt: null,
      syncStatus: 'idle',
      error: null,
    });
  });

  it('clears stale sync errors after a successful sync', async () => {
    useScheduleStore.setState({
      courses: [],
      lastSyncedAt: null,
      syncStatus: 'error',
      error: '課表同步失敗',
    });

    const { result } = renderHook(() => useScheduleSync());

    await act(async () => {
      await result.current.sync();
    });

    expect(useScheduleStore.getState().error).toBeNull();
    expect(useScheduleStore.getState().syncStatus).toBe('idle');
    expect(useScheduleStore.getState().courses).toHaveLength(1);
  });
});
