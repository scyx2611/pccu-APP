jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock('../../../schedule/storage/scheduleStorage', () => ({
  getCourses: jest.fn(async () => ({
    courses: [
      {
        id: 'course-1',
        name: '測試課程',
        teacher: '老師',
        location: '大義館',
        dayOfWeek: 1,
        startPeriod: 1,
        endPeriod: 2,
      },
    ],
    updatedAt: 123,
  })),
}));

jest.mock('../../../grade/storage/gradeStorage', () => ({
  getGrades: jest.fn(async () => ({
    grades: [
      {
        title: '113-1',
        stats: { average: '88', classRank: '3/45', deptRank: '5/120', earnedCredits: '20' },
        courses: [
          {
            name: '英文',
            score: '90',
            credits: '2',
          },
        ],
      },
    ],
    updatedAt: 456,
  })),
}));

import { act, renderHook } from '@testing-library/react-native';
import { PccuSyncEngine } from '../../../pccu/engine/PccuSyncEngine';
import { useScheduleSync } from '../../../schedule/hooks/useScheduleSync';
import { useGradeSync } from '../../../grade/hooks/useGradeSync';
import { useScheduleStore } from '../../../schedule/store/useScheduleStore';
import { useGradeStore } from '../../../grade/store/useGradeStore';

describe('bootstrap sync hooks wait for shared executor readiness', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    PccuSyncEngine.resetInstance();
    useScheduleStore.setState({ courses: [], lastSyncedAt: null, syncStatus: 'idle', error: null });
    useGradeStore.setState({ grades: [], lastSyncedAt: null, syncStatus: 'idle', error: null });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    PccuSyncEngine.resetInstance();
  });

  it('schedule sync waits for a late executor mount and rehydrates cached data', async () => {
    const engine = PccuSyncEngine.getInstance();
    const { result } = renderHook(() => useScheduleSync());

    const syncPromise = act(async () => {
      const promise = result.current.sync({ priority: 1 });

      setTimeout(() => {
        engine.setExecutor(async () => ({ success: true, updatedAt: 123 }));
      }, 100);

      jest.advanceTimersByTime(100);
      await promise;
    });

    await syncPromise;

    expect(useScheduleStore.getState().courses).toHaveLength(1);
    expect(useScheduleStore.getState().lastSyncedAt).toBe(123);
    expect(useScheduleStore.getState().syncStatus).toBe('idle');
  });

  it('grade sync waits for a late executor mount and rehydrates cached data', async () => {
    const engine = PccuSyncEngine.getInstance();
    const { result } = renderHook(() => useGradeSync());

    const syncPromise = act(async () => {
      const promise = result.current.sync({ priority: 1 });

      setTimeout(() => {
        engine.setExecutor(async () => ({ success: true, updatedAt: 456 }));
      }, 100);

      jest.advanceTimersByTime(100);
      await promise;
    });

    await syncPromise;

    expect(useGradeStore.getState().grades).toHaveLength(1);
    expect(useGradeStore.getState().lastSyncedAt).toBe(456);
    expect(useGradeStore.getState().syncStatus).toBe('idle');
  });
});
