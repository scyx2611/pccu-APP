import { redactLogValue } from './redaction';

export type LogLevel = 'debug' | 'warn' | 'error';

export type LogEvent = Readonly<{
  event: string;
  scope: string;
  fields?: Readonly<Record<string, unknown>>;
}>;

export interface AppLogger {
  debug(event: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(event: string, fields?: Readonly<Record<string, unknown>>): void;
  error(event: string, fields?: Readonly<Record<string, unknown>>): void;
}

const getEnv = (): Record<string, string | undefined> => {
  if (typeof process === 'undefined') return {};
  return process.env ?? {};
};

const isDebugEnabled = (): boolean => {
  const env = getEnv();
  if (env.EXPO_PUBLIC_DEBUG_LOGS === '1') return true;
  if (env.EXPO_PUBLIC_DEBUG_LOGS === '0') return false;
  return env.NODE_ENV !== 'test' && env.NODE_ENV !== 'production';
};

const emit = (
  level: LogLevel,
  scope: string,
  event: string,
  fields?: Readonly<Record<string, unknown>>,
): void => {
  const logEvent: LogEvent = fields ? { event, scope, fields } : { event, scope };
  const sanitized = redactLogValue(logEvent);

  if (level === 'debug') {
    console.log(sanitized);
    return;
  }
  if (level === 'warn') {
    console.warn(sanitized);
    return;
  }
  console.error(sanitized);
};

export const createLogger = (scope: string): AppLogger => ({
  debug: (event, fields) => {
    if (isDebugEnabled()) emit('debug', scope, event, fields);
  },
  warn: (event, fields) => emit('warn', scope, event, fields),
  error: (event, fields) => emit('error', scope, event, fields),
});
