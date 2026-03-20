let skipHomeSyncUntil = 0;

export const markPostLoginSyncHandled = (windowMs: number = 15000) => {
  skipHomeSyncUntil = Date.now() + windowMs;
};

export const consumeShouldSkipHomeSync = () => {
  const shouldSkip = Date.now() < skipHomeSyncUntil;
  skipHomeSyncUntil = 0;
  return shouldSkip;
};

export const clearPostLoginSyncHandled = () => {
  skipHomeSyncUntil = 0;
};
