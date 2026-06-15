type ConsoleMethod = (...args: unknown[]) => void;

export type AppLogger = {
  debug: ConsoleMethod;
  warn: ConsoleMethod;
  error: ConsoleMethod;
};

const getEnv = (): Record<string, string | undefined> => {
  if (typeof process === 'undefined') {
    return {};
  }

  return process.env ?? {};
};

const isDebugEnabled = (): boolean => {
  const env = getEnv();

  if (env.EXPO_PUBLIC_DEBUG_LOGS === '1') {
    return true;
  }

  if (env.EXPO_PUBLIC_DEBUG_LOGS === '0') {
    return false;
  }

  return env.NODE_ENV !== 'test' && env.NODE_ENV !== 'production';
};

export const createLogger = (scope: string): AppLogger => {
  const prefix = `[${scope}]`;

  return {
    debug: (...args) => {
      if (isDebugEnabled()) {
        console.log(prefix, ...args);
      }
    },
    warn: (...args) => {
      console.warn(prefix, ...args);
    },
    error: (...args) => {
      console.error(prefix, ...args);
    },
  };
};
