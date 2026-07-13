let failNextSessionCleanup = false;

export const armNextSessionCleanupFailure = (): void => {
  failNextSessionCleanup = true;
};

export const consumeNextSessionCleanupFailure = (): boolean => {
  const shouldFail = failNextSessionCleanup;
  failNextSessionCleanup = false;
  return shouldFail;
};
