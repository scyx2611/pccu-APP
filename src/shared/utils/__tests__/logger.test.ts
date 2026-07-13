import { createLogger } from '../logger';

describe('logger', () => {
  const originalEnv = process.env;
  const originalNodeEnv = process.env.NODE_ENV;
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, NODE_ENV: 'test' };
    delete process.env.EXPO_PUBLIC_DEBUG_LOGS;
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    process.env = originalEnv;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('suppresses debug output while tests run', () => {
    const logger = createLogger('sync');

    logger.debug('queued');

    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('allows debug output in tests when explicitly enabled', () => {
    process.env.EXPO_PUBLIC_DEBUG_LOGS = '1';
    const logger = createLogger('sync');

    logger.debug('queued', {
      url: 'https://ecampus.pccu.edu.tw/private?token=secret',
      password: 'secret',
    });

    expect(consoleLogSpy).toHaveBeenCalledWith({
      event: 'queued',
      scope: 'sync',
      fields: {
        url: 'https://ecampus.pccu.edu.tw',
        password: '[Redacted]',
      },
    });
  });

  it('suppresses debug output in production unless explicitly enabled', () => {
    process.env.NODE_ENV = 'production';
    const logger = createLogger('sync');

    logger.debug('queued');

    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('does not suppress warnings or errors', () => {
    const logger = createLogger('sync');

    logger.warn('slow');
    logger.error('failed');

    expect(consoleWarnSpy).toHaveBeenCalledWith({ event: 'slow', scope: 'sync' });
    expect(consoleErrorSpy).toHaveBeenCalledWith({ event: 'failed', scope: 'sync' });
  });
});
