jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

import { PccuSyncEngine } from '../PccuSyncEngine';

describe('PccuSyncEngine executor lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    PccuSyncEngine.resetInstance();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    PccuSyncEngine.resetInstance();
  });

  it('fails fast when sync is requested before executor registration', async () => {
    const engine = PccuSyncEngine.getInstance();

    await expect(engine.requestSync('schedule')).rejects.toThrow(
      'Sync executor not ready. Shared scraper is not mounted yet.'
    );
  });

  it('rejects the active request if the executor is cleared during execution', async () => {
    const engine = PccuSyncEngine.getInstance();

    let resolveExecutor: ((value: unknown) => void) | null = null;
    const executorId = engine.setExecutor(
      () =>
        new Promise((resolve) => {
          resolveExecutor = resolve;
        })
    );

    const requestPromise = engine.requestSync('schedule');
    await Promise.resolve();

    engine.clearExecutor(executorId!);

    await expect(requestPromise).rejects.toThrow(
      'Sync executor became unavailable. Shared scraper was unmounted.'
    );

    resolveExecutor?.({ success: true });
  });

  it('can accept a fresh executor after cleanup and process new requests', async () => {
    const engine = PccuSyncEngine.getInstance();

    const firstExecutorId = engine.setExecutor(() => new Promise(() => {}));
    const staleRequest = engine.requestSync('grade');
    await Promise.resolve();
    engine.clearExecutor(firstExecutorId!);
    await expect(staleRequest).rejects.toThrow(
      'Sync executor became unavailable. Shared scraper was unmounted.'
    );

    engine.setExecutor(async () => ({ success: true, updatedAt: 123 }));

    await expect(engine.requestSync('grade')).resolves.toEqual({ success: true, updatedAt: 123 });
  });

  it('waits longer for a late executor mount before failing readiness', async () => {
    const engine = PccuSyncEngine.getInstance();

    const readinessPromise = engine.waitForExecutorReady();

    jest.advanceTimersByTime(7_500);
    await Promise.resolve();

    engine.setExecutor(async () => ({ success: true }));
    jest.advanceTimersByTime(100);

    await expect(readinessPromise).resolves.toBeUndefined();
  });

  it('refreshes the active timeout when the executor reports progress', async () => {
    const engine = PccuSyncEngine.getInstance();

    engine.setExecutor(
      (request) =>
        new Promise((resolve) => {
          setTimeout(() => request.refreshTimeout?.(), 25_000);
          setTimeout(() => resolve({ success: true }), 45_000);
        })
    );

    const requestPromise = engine.requestSync('schedule');

    jest.advanceTimersByTime(25_000);
    await Promise.resolve();

    jest.advanceTimersByTime(20_000);
    await Promise.resolve();

    await expect(requestPromise).resolves.toEqual({ success: true });
  });
});
