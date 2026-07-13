import {
  AppSessionCoordinator,
  SessionCleanupError,
  type SessionCleanupPorts,
} from '../AppSessionCoordinator';

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

const deferred = (): Deferred => {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
};

const createPorts = () => {
  const calls: string[] = [];
  const ports: SessionCleanupPorts = {
    sync: {
      blockNewRequests: jest.fn(() => calls.push('block')),
      abortActiveAndRejectQueue: jest.fn(() => calls.push('abort')),
      resetAfterSessionChange: jest.fn(() => calls.push('reset-sync')),
      allowNewRequests: jest.fn(() => calls.push('allow')),
    },
    clearWebView: jest.fn(async () => {
      calls.push('clear-webview');
    }),
    resetAuthSession: jest.fn(async () => {
      calls.push('reset-auth-session');
    }),
    clearActiveCredentials: jest.fn(() => calls.push('clear-active-credentials')),
    clearPersistentCredentials: jest.fn(async () => {
      calls.push('clear-persistent-credentials');
    }),
    clearProfile: jest.fn(async () => {
      calls.push('clear-profile');
    }),
    clearFeatureCaches: jest.fn(async () => {
      calls.push('clear-feature-caches');
    }),
    resetFeatureStores: jest.fn(() => calls.push('reset-feature-stores')),
  };

  return { calls, ports };
};

describe('AppSessionCoordinator', () => {
  it('blocks and aborts sync before clearing session state, then reopens on success', async () => {
    const { calls, ports } = createPorts();
    const coordinator = new AppSessionCoordinator(ports);

    await coordinator.transition('logout');

    expect(calls.slice(0, 5)).toEqual([
      'block',
      'abort',
      'reset-auth-session',
      'clear-webview',
      'clear-active-credentials',
    ]);
    expect(calls.indexOf('clear-webview')).toBeGreaterThan(calls.indexOf('abort'));
    expect(calls.slice(-3)).toEqual(['reset-feature-stores', 'reset-sync', 'allow']);
    expect(ports.clearWebView).toHaveBeenCalledWith('logout');
  });

  it('settles every persistent clear and resets stores while leaving sync blocked on failure', async () => {
    const { calls, ports } = createPorts();
    jest
      .mocked(ports.clearPersistentCredentials)
      .mockRejectedValueOnce(new Error('secret deletion detail'));
    const coordinator = new AppSessionCoordinator(ports);

    const result = coordinator.transition('account_switch');

    await expect(result).rejects.toEqual(
      expect.objectContaining<Partial<SessionCleanupError>>({
        name: 'SessionCleanupError',
        message: 'session_cleanup_failed',
        retryable: true,
      }),
    );
    expect(ports.clearWebView).toHaveBeenCalledTimes(1);
    expect(ports.clearPersistentCredentials).toHaveBeenCalledTimes(1);
    expect(ports.clearProfile).toHaveBeenCalledTimes(1);
    expect(ports.clearFeatureCaches).toHaveBeenCalledTimes(1);
    expect(ports.resetFeatureStores).toHaveBeenCalledTimes(1);
    expect(ports.sync.resetAfterSessionChange).not.toHaveBeenCalled();
    expect(ports.sync.allowNewRequests).not.toHaveBeenCalled();
    expect(String(await result.catch((error) => error))).not.toContain('secret deletion detail');
    expect(calls).toContain('reset-feature-stores');
  });

  it('allows a failed cleanup to be retried successfully', async () => {
    const { ports } = createPorts();
    jest.mocked(ports.clearProfile).mockRejectedValueOnce(new Error('first attempt failed'));
    const coordinator = new AppSessionCoordinator(ports);

    await expect(coordinator.transition('logout')).rejects.toBeInstanceOf(SessionCleanupError);
    await expect(coordinator.transition('logout')).resolves.toBeUndefined();

    expect(ports.sync.blockNewRequests).toHaveBeenCalledTimes(2);
    expect(ports.sync.resetAfterSessionChange).toHaveBeenCalledTimes(1);
    expect(ports.sync.allowNewRequests).toHaveBeenCalledTimes(1);
  });

  it('returns the same in-flight promise for concurrent transitions', async () => {
    const { ports } = createPorts();
    const pendingWebView = deferred();
    jest.mocked(ports.clearWebView).mockReturnValue(pendingWebView.promise);
    const coordinator = new AppSessionCoordinator(ports);

    const first = coordinator.transition('logout');
    const second = coordinator.transition('account_switch');

    expect(second).toBe(first);
    expect(ports.sync.blockNewRequests).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(ports.clearWebView).toHaveBeenCalledWith('logout');

    pendingWebView.resolve();
    await first;
  });

  it('waits for auth and WebView work to quiesce before clearing persistent state', async () => {
    const { ports } = createPorts();
    const pendingAuth = deferred();
    const pendingWebView = deferred();
    jest.mocked(ports.resetAuthSession).mockReturnValue(pendingAuth.promise);
    jest.mocked(ports.clearWebView).mockReturnValue(pendingWebView.promise);
    const coordinator = new AppSessionCoordinator(ports);

    const transition = coordinator.transition('account_switch');
    await Promise.resolve();

    expect(ports.clearActiveCredentials).toHaveBeenCalledTimes(1);
    expect(ports.clearPersistentCredentials).not.toHaveBeenCalled();
    expect(ports.clearProfile).not.toHaveBeenCalled();
    expect(ports.clearFeatureCaches).not.toHaveBeenCalled();

    pendingAuth.resolve();
    pendingWebView.resolve();
    await transition;

    expect(ports.clearPersistentCredentials).toHaveBeenCalledTimes(1);
    expect(ports.clearProfile).toHaveBeenCalledTimes(1);
    expect(ports.clearFeatureCaches).toHaveBeenCalledTimes(1);
  });

  it('clears active credentials again after an in-flight auth write quiesces', async () => {
    const { ports } = createPorts();
    const pendingAuth = deferred();
    let activeAccount: string | null = 'ACCOUNT_A';
    jest.mocked(ports.clearActiveCredentials).mockImplementation(() => {
      activeAccount = null;
    });
    jest.mocked(ports.resetAuthSession).mockImplementation(async () => {
      await pendingAuth.promise;
      activeAccount = 'ACCOUNT_A';
    });
    const coordinator = new AppSessionCoordinator(ports);

    const transition = coordinator.transition('logout');
    await Promise.resolve();
    expect(activeAccount).toBeNull();

    pendingAuth.resolve();
    await transition;

    expect(activeAccount).toBeNull();
    expect(ports.clearActiveCredentials).toHaveBeenCalledTimes(2);
  });

  it('returns a retryable cleanup failure when bounded auth quiescence times out', async () => {
    jest.useFakeTimers();
    const { ports } = createPorts();
    jest.mocked(ports.resetAuthSession).mockImplementation(
      () =>
        new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error('auth_session_reset_timeout')), 8_000);
        }),
    );
    const coordinator = new AppSessionCoordinator(ports);

    try {
      const transition = coordinator.transition('account_switch');
      jest.advanceTimersByTime(8_000);
      await expect(transition).rejects.toBeInstanceOf(SessionCleanupError);
      expect(ports.clearPersistentCredentials).toHaveBeenCalledTimes(1);
      expect(ports.clearFeatureCaches).toHaveBeenCalledTimes(1);
      expect(ports.sync.allowNewRequests).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
