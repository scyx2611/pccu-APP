import { clearPostLoginSyncHandled } from './postLoginSyncState';
import { credentialVault } from '../infrastructure/SecureStoreCredentialVault';
import { createLogger } from '../../../shared/utils/logger';

export type AuthSessionResult = { success: boolean; message?: string };

const AUTH_SESSION_RESET_TIMEOUT_MS = 8_000;
const logger = createLogger('auth-session-runtime');

type WarmSessionPromise = {
  account: string;
  promise: Promise<AuthSessionResult>;
};

type WarmSession = {
  account: string;
  warmedAt: number;
};

let generation = 0;
let warmSessionPromise: WarmSessionPromise | null = null;
let warmSession: WarmSession | null = null;
const inFlightOperations = new Set<Promise<unknown>>();
const lateCredentialCompensations = new Set<Promise<void>>();

const clearLateCredentialPersistence = async (): Promise<void> => {
  let failureCount = 0;
  try {
    credentialVault.clearActive();
  } catch {
    failureCount += 1;
  }

  const results = await Promise.allSettled([credentialVault.clearPersisted()]);
  failureCount += results.filter((result) => result.status === 'rejected').length;

  try {
    credentialVault.clearActive();
  } catch {
    failureCount += 1;
  }

  if (failureCount > 0) {
    logger.warn('late_credential_cleanup_failed', { failureCount });
  }
};

export const getAuthSessionGeneration = (): number => generation;

export const isAuthSessionGenerationCurrent = (candidate: number): boolean =>
  candidate === generation;

export const trackAuthSessionOperation = <T>(
  operation: (operationGeneration: number) => Promise<T>,
): Promise<T> => {
  const operationGeneration = generation;
  const promise = Promise.resolve().then(() => operation(operationGeneration));
  inFlightOperations.add(promise);
  const remove = () => inFlightOperations.delete(promise);
  void promise.then(remove, remove);
  return promise;
};

export const resetAuthSessionRuntime = async (): Promise<void> => {
  generation += 1;
  warmSessionPromise = null;
  warmSession = null;
  clearPostLoginSyncHandled();

  const operations = [...inFlightOperations];
  const drainPromise = Promise.allSettled([...operations, ...lateCredentialCompensations]).then(
    () => undefined,
  );
  let timeout!: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<void>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error('auth_session_reset_timeout'));
    }, AUTH_SESSION_RESET_TIMEOUT_MS);
  });

  try {
    await Promise.race([drainPromise, timeoutPromise]);
  } catch (error) {
    if (error instanceof Error && error.message === 'auth_session_reset_timeout') {
      const compensation = Promise.allSettled(operations)
        .then(() => clearLateCredentialPersistence())
        .catch(() => undefined);
      lateCredentialCompensations.add(compensation);
      const releaseCompensation = () => lateCredentialCompensations.delete(compensation);
      void compensation.then(releaseCompensation, releaseCompensation);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

export const isWarmSessionFresh = (account: string, now: number, maxAgeMs: number): boolean =>
  warmSession?.account === account && now - warmSession.warmedAt < maxAgeMs;

export const getWarmSessionPromise = (account: string): Promise<AuthSessionResult> | null =>
  warmSessionPromise?.account === account ? warmSessionPromise.promise : null;

export const setWarmSessionPromise = (
  account: string,
  promise: Promise<AuthSessionResult>,
): void => {
  warmSessionPromise = { account, promise };
};

export const clearWarmSessionPromise = (
  account: string,
  promise: Promise<AuthSessionResult>,
): void => {
  if (warmSessionPromise?.account === account && warmSessionPromise.promise === promise) {
    warmSessionPromise = null;
  }
};

export const markWarmSession = (
  account: string,
  warmedAt: number,
  operationGeneration: number,
): void => {
  if (!isAuthSessionGenerationCurrent(operationGeneration)) return;
  warmSession = { account, warmedAt };
};
