export type SessionTransitionReason = 'logout' | 'account_switch';

export interface SessionSyncPort {
  blockNewRequests(reason: SessionTransitionReason): void;
  abortActiveAndRejectQueue(reason: SessionTransitionReason): void;
  resetAfterSessionChange(): void;
  allowNewRequests(): void;
}

export interface SessionCleanupPorts {
  sync: SessionSyncPort;
  clearWebView(reason: SessionTransitionReason): Promise<void>;
  resetAuthSession(): Promise<void>;
  clearActiveCredentials(): void;
  clearPersistentCredentials(): Promise<void>;
  clearProfile(): Promise<void>;
  clearFeatureCaches(): Promise<void>;
  resetFeatureStores(): void;
}

export class SessionCleanupError extends Error {
  readonly retryable = true;
  readonly reason: SessionTransitionReason;
  readonly failedOperationCount: number;

  constructor(reason: SessionTransitionReason, failedOperationCount: number) {
    super('session_cleanup_failed');
    this.name = 'SessionCleanupError';
    this.reason = reason;
    this.failedOperationCount = failedOperationCount;
  }
}

export class AppSessionCoordinator {
  private inFlight: Promise<void> | null = null;

  constructor(private readonly ports: SessionCleanupPorts) {}

  transition(reason: SessionTransitionReason): Promise<void> {
    if (this.inFlight) return this.inFlight;

    const pending = this.runTransition(reason);
    const tracked = pending.finally(() => {
      if (this.inFlight === tracked) this.inFlight = null;
    });
    this.inFlight = tracked;
    return tracked;
  }

  private async runTransition(reason: SessionTransitionReason): Promise<void> {
    this.ports.sync.blockNewRequests(reason);
    this.ports.sync.abortActiveAndRejectQueue(reason);

    const invoke = (operation: () => void | Promise<void>): Promise<void> => {
      try {
        return Promise.resolve(operation());
      } catch (error) {
        return Promise.reject(error);
      }
    };

    const quiescenceOperations = [
      invoke(() => this.ports.resetAuthSession()),
      invoke(() => this.ports.clearWebView(reason)),
    ];
    let failedOperationCount = 0;
    try {
      this.ports.clearActiveCredentials();
    } catch {
      failedOperationCount += 1;
    }

    const quiescenceResults = await Promise.allSettled(quiescenceOperations);
    failedOperationCount += quiescenceResults.filter(
      (result) => result.status === 'rejected',
    ).length;

    const cleanupResults = await Promise.allSettled([
      Promise.resolve().then(() => this.ports.clearPersistentCredentials()),
      Promise.resolve().then(() => this.ports.clearProfile()),
      Promise.resolve().then(() => this.ports.clearFeatureCaches()),
    ]);

    failedOperationCount += cleanupResults.filter((result) => result.status === 'rejected').length;
    try {
      this.ports.resetFeatureStores();
    } catch {
      failedOperationCount += 1;
    }

    if (failedOperationCount > 0) {
      throw new SessionCleanupError(reason, failedOperationCount);
    }

    try {
      this.ports.sync.resetAfterSessionChange();
      this.ports.sync.allowNewRequests();
    } catch {
      throw new SessionCleanupError(reason, 1);
    }
  }
}
