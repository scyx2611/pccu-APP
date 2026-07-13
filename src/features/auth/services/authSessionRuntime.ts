import { clearPostLoginSyncHandled } from './postLoginSyncState';

export type AuthSessionResult = { success: boolean; message?: string };

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
  await Promise.allSettled([...inFlightOperations]);
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
