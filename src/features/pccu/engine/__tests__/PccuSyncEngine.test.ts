jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

import { PccuSyncEngine, SessionTransitionError } from '../PccuSyncEngine';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

const createDeferred = <T>(): Deferred<T> => {
  let resolve!: Deferred<T>['resolve'];
  let reject!: Deferred<T>['reject'];
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

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
      'Sync executor not ready. Shared scraper is not mounted yet.',
    );
  });

  it('rejects the active request if the executor is cleared during execution', async () => {
    const engine = PccuSyncEngine.getInstance();

    const executor = createDeferred<unknown>();
    const executorId = engine.setExecutor(() => executor.promise);

    const requestPromise = engine.requestSync('schedule');
    await Promise.resolve();

    engine.clearExecutor(executorId!);

    await expect(requestPromise).rejects.toThrow(
      'Sync executor became unavailable. Shared scraper was unmounted.',
    );

    executor.resolve({ success: true });
  });

  it('can accept a fresh executor after cleanup and process new requests', async () => {
    const engine = PccuSyncEngine.getInstance();

    const firstExecutorId = engine.setExecutor(() => new Promise(() => {}));
    const staleRequest = engine.requestSync('grade');
    await Promise.resolve();
    engine.clearExecutor(firstExecutorId!);
    await expect(staleRequest).rejects.toThrow(
      'Sync executor became unavailable. Shared scraper was unmounted.',
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
        }),
    );

    const requestPromise = engine.requestSync('schedule');

    jest.advanceTimersByTime(25_000);
    await Promise.resolve();

    jest.advanceTimersByTime(20_000);
    await Promise.resolve();

    await expect(requestPromise).resolves.toEqual({ success: true });
  });

  it('does not start queued requests after resume while an active request is still pending', async () => {
    const engine = PccuSyncEngine.getInstance();
    const calls: string[] = [];
    const grade = createDeferred<unknown>();
    const schedule = createDeferred<unknown>();

    engine.setExecutor((request) => {
      calls.push(request.type);
      return request.type === 'grade' ? grade.promise : schedule.promise;
    });

    const gradePromise = engine.requestSync('grade');
    await Promise.resolve();
    const schedulePromise = engine.requestSync('schedule');
    await Promise.resolve();

    expect(calls).toEqual(['grade']);

    engine.pause('app_state_inactive');
    engine.resume();
    await Promise.resolve();

    expect(calls).toEqual(['grade']);

    grade.resolve({ success: true, type: 'grade' });
    await Promise.resolve();
    jest.advanceTimersByTime(300);
    await Promise.resolve();

    expect(calls).toEqual(['grade', 'schedule']);

    schedule.resolve({ success: true, type: 'schedule' });

    await expect(gradePromise).resolves.toEqual({ success: true, type: 'grade' });
    await expect(schedulePromise).resolves.toEqual({ success: true, type: 'schedule' });
  });

  it('rejects new work immediately while a logout transition is blocked', async () => {
    const engine = PccuSyncEngine.getInstance();

    engine.blockNewRequests('logout');

    await expect(engine.requestSync('schedule')).rejects.toMatchObject({
      name: 'SessionTransitionError',
      reason: 'logout',
    });
    expect(engine.getQueueSize()).toBe(0);
  });

  it('rejects the active caller and drains every queued caller exactly once', async () => {
    const engine = PccuSyncEngine.getInstance();
    const executor = createDeferred<unknown>();
    const abortHandler = jest.fn();
    engine.setExecutor((request) => {
      request.setAbortHandler?.(abortHandler);
      return executor.promise;
    });

    const activeResult = engine.requestSync('grade').catch((error) => error);
    await Promise.resolve();
    const queuedResults = [
      engine.requestSync('schedule').catch((error) => error),
      engine.requestSync('traffic').catch((error) => error),
    ];

    engine.blockNewRequests('account_switch');
    engine.abortActiveAndRejectQueue('account_switch');

    await expect(activeResult).resolves.toBeInstanceOf(SessionTransitionError);
    for (const queuedResult of queuedResults) {
      await expect(queuedResult).resolves.toMatchObject({
        name: 'SessionTransitionError',
        reason: 'account_switch',
      });
    }
    expect(abortHandler).toHaveBeenCalledTimes(1);
    expect(engine.getQueueSize()).toBe(0);

    executor.resolve({ success: true });
    await Promise.resolve();
    expect(abortHandler).toHaveBeenCalledTimes(1);
  });

  it('cannot reopen requests until session reset completes', async () => {
    const engine = PccuSyncEngine.getInstance();
    engine.setExecutor(async () => ({ success: true }));

    engine.blockNewRequests('logout');
    engine.allowNewRequests();
    await expect(engine.requestSync('grade')).rejects.toBeInstanceOf(SessionTransitionError);

    engine.resetAfterSessionChange();
    engine.allowNewRequests();

    await expect(engine.requestSync('grade')).resolves.toEqual({ success: true });
  });
});
