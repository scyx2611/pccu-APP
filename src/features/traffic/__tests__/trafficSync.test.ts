jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
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
  },
}));

const mockGetTrafficSnapshot = jest.fn(async () => null);

jest.mock('../storage/trafficStorage', () => ({
  getTrafficSnapshot: () => mockGetTrafficSnapshot(),
}));

import fs from 'fs';
import path from 'path';
import { act, renderHook } from '@testing-library/react-native';

import { useTrafficSync } from '../hooks/useTrafficSync';

describe('useTrafficSync (PccuSyncEngine wrapper)', () => {
  beforeEach(() => {
    mockRequestSync.mockClear();
    mockRequestSync.mockResolvedValue({ success: true });
    mockWaitForExecutorReady.mockClear();
    mockWaitForExecutorReady.mockResolvedValue(undefined);
    mockGetTrafficSnapshot.mockClear();
    mockGetTrafficSnapshot.mockResolvedValue(null);
  });

  it('calls PccuSyncEngine.requestSync with type "traffic" and default priority 5', async () => {
    const { result } = renderHook(() => useTrafficSync());

    await act(async () => {
      await result.current.sync();
    });

    expect(mockWaitForExecutorReady).toHaveBeenCalled();
    expect(mockRequestSync).toHaveBeenCalledWith('traffic', 5);
  });

  it('returns success with snapshot when sync succeeds', async () => {
    const fakeSnapshot = {
      downhill: [{ stopName: 'A', etaText: '3 分' }],
      uphill: [],
      updatedAt: 12345,
    };
    mockGetTrafficSnapshot.mockResolvedValue(fakeSnapshot);
    mockRequestSync.mockResolvedValue({ success: true, updatedAt: 12345 } as any);

    const { result } = renderHook(() => useTrafficSync());

    let syncResult: any;
    await act(async () => {
      syncResult = await result.current.sync();
    });

    expect(syncResult).toEqual({
      success: true,
      snapshot: fakeSnapshot,
      updatedAt: 12345,
    });
    expect(mockGetTrafficSnapshot).toHaveBeenCalled();
  });

  it('returns failure with message when sync fails', async () => {
    mockRequestSync.mockResolvedValue({
      success: false,
      message: '交通同步失敗',
    } as any);

    const { result } = renderHook(() => useTrafficSync());

    let syncResult: any;
    await act(async () => {
      syncResult = await result.current.sync();
    });

    expect(syncResult).toEqual({
      success: false,
      message: '交通同步失敗',
    });
  });

  it('returns failure with error message on exception', async () => {
    mockRequestSync.mockRejectedValue(new Error('網路錯誤'));

    const { result } = renderHook(() => useTrafficSync());

    let syncResult: any;
    await act(async () => {
      syncResult = await result.current.sync();
    });

    expect(syncResult).toEqual({
      success: false,
      message: '網路錯誤',
    });
  });

  it('skips sync if already in progress', async () => {
    mockRequestSync.mockImplementation(() => new Promise(() => {}));

    const { result } = renderHook(() => useTrafficSync());

    act(() => {
      void result.current.sync();
    });

    await act(async () => {
      await result.current.sync();
    });

    expect(mockRequestSync).toHaveBeenCalledTimes(1);
  });

  it('passes priority option to requestSync', async () => {
    const { result } = renderHook(() => useTrafficSync());

    await act(async () => {
      await result.current.sync({ priority: 1 });
    });

    expect(mockRequestSync).toHaveBeenCalledWith('traffic', 1);
  });

  it('TrafficSyncAgent.tsx has been deleted', () => {
    const agentPath = path.resolve(
      __dirname,
      '..',
      'components',
      'TrafficSyncAgent.tsx',
    );

    expect(fs.existsSync(agentPath)).toBe(false);
  });
});
