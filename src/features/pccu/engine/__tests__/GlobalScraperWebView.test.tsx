const mockGetSavedPCCUCredentials = jest.fn(async () => ({
  username: 'u123',
  password: 'p456',
}));

const mockInjectJavaScript = jest.fn();
const mockRawInjectJavaScript = jest.fn();
const mockReload = jest.fn();
const mockStopLoading = jest.fn();
const mockClearCache = jest.fn();
const mockClearHistory = jest.fn();
const webViewPropsRef: { current: any | null } = { current: null };
const mockProtocolIdentityRef: { current: Record<string, unknown> | null } = { current: null };
const mockCurrentUrlRef = { current: '' };
const mockNonceCounterRef = { current: 0 };
let consoleWarnSpy: jest.SpyInstance;
const mockTutoringStoreSetCourses = jest.fn();

const mockRecordInjectedJavaScript = (script: string) => {
  mockRawInjectJavaScript(script);
  const identityMatch = script.match(/\/\*__MYCCU_PROTOCOL_IDENTITY__(.*?)__\*\//);
  if (identityMatch) {
    mockProtocolIdentityRef.current = JSON.parse(identityMatch[1]) as Record<string, unknown>;
  }

  const delimiter = '/*__MYCCU_PROTOCOL_PRELUDE_END__*/';
  const delimiterIndex = script.indexOf(delimiter);
  mockInjectJavaScript(
    delimiterIndex >= 0 ? script.slice(delimiterIndex + delimiter.length).trim() : script,
  );
};

jest.mock('react-native-webview', () => {
  const React = require('react');

  return {
    WebView: React.forwardRef((props: any, ref: any) => {
      mockCurrentUrlRef.current = props.source?.uri || mockCurrentUrlRef.current;
      webViewPropsRef.current = {
        ...props,
        onNavigationStateChange: (navigation: any) => {
          mockCurrentUrlRef.current = navigation?.url || mockCurrentUrlRef.current;
          return props.onNavigationStateChange?.(navigation);
        },
        onLoadEnd: (event: any) => {
          mockCurrentUrlRef.current = event?.nativeEvent?.url || mockCurrentUrlRef.current;
          return props.onLoadEnd?.(event);
        },
        onMessage: (event: any) => {
          let data = event?.nativeEvent?.data;
          try {
            const parsed = JSON.parse(data);
            if (
              parsed &&
              typeof parsed === 'object' &&
              parsed.version !== 1 &&
              mockProtocolIdentityRef.current
            ) {
              data = JSON.stringify({
                version: 1,
                ...mockProtocolIdentityRef.current,
                event: 'legacy-message',
                payload: parsed,
              });
            }
          } catch {}

          return props.onMessage?.({
            ...event,
            nativeEvent: {
              ...event?.nativeEvent,
              url: event?.nativeEvent?.url || mockCurrentUrlRef.current,
              data,
            },
          });
        },
      };
      React.useImperativeHandle(ref, () => ({
        injectJavaScript: mockRecordInjectedJavaScript,
        reload: mockReload,
        stopLoading: mockStopLoading,
        clearCache: mockClearCache,
        clearHistory: mockClearHistory,
      }));

      return null;
    }),
  };
});

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('expo-crypto', () => ({
  randomUUID: () => `nonce-${++mockNonceCounterRef.current}`,
}));

jest.mock('../../../auth/services/authService', () => ({
  getSavedPCCUCredentials: () => mockGetSavedPCCUCredentials(),
}));

jest.mock('../../sync/pccuSyncScripts', () => ({
  buildLoginScript: jest.fn(() => 'true;'),
  buildRobustGradePageScript: jest.fn(() => 'grade-script;'),
  buildAdaptiveSchedulePageScript: jest.fn(() => 'schedule-script;'),
  buildServiceOpenScript: jest.fn(() => 'service-open-script;'),
}));

jest.mock('../../../traffic/sync/trafficScripts', () => ({
  buildTrafficExtractionScript: jest.fn(() => 'true;'),
}));

jest.mock('../../parsers/pccuScraper', () => ({
  parseGradesFromHtml: jest.fn(() => []),
  parseScheduleFromHtml: jest.fn(() => []),
  hasSuspiciousCourseNames: jest.fn(() => false),
  sanitizeCourseList: jest.fn((courses) => courses),
}));

jest.mock('../../../grade/storage/gradeStorage', () => ({
  setGrades: jest.fn(),
  clearGrades: jest.fn(),
}));

jest.mock('../../../schedule/storage/scheduleStorage', () => ({
  setCourses: jest.fn(),
  clearCourses: jest.fn(),
}));

jest.mock('../../../traffic/storage/trafficStorage', () => ({
  setTrafficSnapshot: jest.fn(),
  clearTrafficSnapshot: jest.fn(),
}));

jest.mock('../../../notifications/services/courseReminderService', () => ({
  refreshScheduledCourseReminders: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../../tutoring/sync/tutoringScripts', () => ({
  buildTutoringOverviewScript: jest.fn(() => 'overview-script;'),
  buildTutoringAllAssignmentsScript: jest.fn(() => 'all-assignments-script;'),
  buildTutoringPendingAssignmentsScript: jest.fn(() => 'pending-assignments-script;'),
  buildTutoringSingleCourseScript: jest.fn(
    (courseCode: string) => `single-course-script:${courseCode};`,
  ),
  buildTutoringFileDownloadScript: jest.fn(() => 'file-download-script;'),
  buildTutoringFileUploadScript: jest.fn(() => 'file-upload-script;'),
  buildWaitForCourseFpScript: jest.fn((script: string) => `wait-for-coursefp:${script}`),
}));

jest.mock('../../../tutoring/storage/tutoringStorage', () => ({
  setCourses: jest.fn(),
  setPendingAssignments: jest.fn(),
  setAllAssignments: jest.fn(),
  setCourseInfo: jest.fn(),
  setCourseDetail: jest.fn(),
  clearAll: jest.fn(),
}));

jest.mock('../../../tutoring/store/useTutoringStore', () => ({
  useTutoringStore: {
    getState: () => ({
      setSyncPhase: jest.fn(),
      setSyncStatus: jest.fn(),
      setCourses: mockTutoringStoreSetCourses,
      setSemester: jest.fn(),
      setWelcomeText: jest.fn(),
      setPendingAssignments: jest.fn(),
      setLastSyncedAt: jest.fn(),
      updateCourseDetail: jest.fn(),
      setError: jest.fn(),
    }),
  },
}));

import React from 'react';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

import GlobalScraperWebView from '../GlobalScraperWebView';
import { PccuSyncEngine } from '../PccuSyncEngine';
import { pccuBrowserSessionGate } from '../pccuBrowserSessionGate';
import {
  buildAdaptiveSchedulePageScript,
  buildLoginScript,
  buildRobustGradePageScript,
  buildServiceOpenScript,
} from '../../sync/pccuSyncScripts';
import {
  buildTutoringOverviewScript,
  buildTutoringSingleCourseScript,
  buildWaitForCourseFpScript,
} from '../../../tutoring/sync/tutoringScripts';
import { setDeveloperDebugEnabled } from '../../../settings/storage/developerSettings';
import { clearScraperDebugPreviewFrame, setScraperDebugPreviewFrame } from '../scraperDebugPreview';
import { clearRegisteredWebViewSession } from '../../../../core/sync/webview/webViewSessionControl';
import { runRegisteredWebViewHostAcceptanceProbe } from '../../../../core/sync/webview/webViewAcceptanceProbe';
import {
  clearAll as clearTutoringStorage,
  setCourses as setTutoringCourses,
} from '../../../tutoring/storage/tutoringStorage';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
};

describe('GlobalScraperWebView PCCU session gate', () => {
  beforeEach(async () => {
    jest.useFakeTimers();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    PccuSyncEngine.resetInstance();
    pccuBrowserSessionGate.resetForTests();
    await setDeveloperDebugEnabled(false);
    clearScraperDebugPreviewFrame();
    mockGetSavedPCCUCredentials.mockClear();
    mockInjectJavaScript.mockClear();
    mockRawInjectJavaScript.mockClear();
    mockReload.mockClear();
    mockStopLoading.mockClear();
    mockClearCache.mockClear();
    mockClearHistory.mockClear();
    (buildAdaptiveSchedulePageScript as jest.Mock).mockClear();
    (buildLoginScript as jest.Mock).mockClear();
    (buildRobustGradePageScript as jest.Mock).mockClear();
    (buildServiceOpenScript as jest.Mock).mockClear();
    (buildTutoringOverviewScript as jest.Mock).mockClear();
    (buildTutoringSingleCourseScript as jest.Mock).mockClear();
    (buildWaitForCourseFpScript as jest.Mock).mockClear();
    webViewPropsRef.current = null;
    mockProtocolIdentityRef.current = null;
    mockCurrentUrlRef.current = '';
    mockNonceCounterRef.current = 0;
    mockTutoringStoreSetCourses.mockReset();
    jest.mocked(setTutoringCourses).mockReset().mockResolvedValue(undefined);
    jest.mocked(clearTutoringStorage).mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
      clearScraperDebugPreviewFrame();
      await Promise.resolve();
    });
    jest.useRealTimers();
    consoleWarnSpy.mockRestore();
    PccuSyncEngine.resetInstance();
    pccuBrowserSessionGate.resetForTests();
  });

  it('waits for an existing PCCU owner before starting a schedule sync', async () => {
    const existingLease = await pccuBrowserSessionGate.acquire('tutoring');
    const engine = PccuSyncEngine.getInstance();
    const rendered = render(<GlobalScraperWebView />);

    const requestPromise = engine.requestSync('schedule');
    const handledRequestPromise = requestPromise.catch((error) => error);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockGetSavedPCCUCredentials).not.toHaveBeenCalled();
    expect(pccuBrowserSessionGate.getQueueLength()).toBe(1);

    existingLease.release();

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockGetSavedPCCUCredentials).toHaveBeenCalledTimes(1);

    rendered.unmount();
    const error = await handledRequestPromise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      'Sync executor became unavailable. Shared scraper was unmounted.',
    );
  });

  it('allows an observed HTTPS redirect and rejects a deceptive suffix', async () => {
    const engine = PccuSyncEngine.getInstance();
    const rendered = render(<GlobalScraperWebView />);
    const requestPromise = engine.requestSync('schedule').catch((error) => error);

    await act(async () => {
      await Promise.resolve();
    });

    let allowed: boolean | undefined;
    act(() => {
      allowed = webViewPropsRef.current?.onShouldStartLoadWithRequest?.({
        url: 'https://ap1.pccu.edu.tw/queryCourse/index.asp',
      });
    });

    expect(allowed).toBe(true);
    expect(mockStopLoading).not.toHaveBeenCalled();

    let rejected: boolean | undefined;
    act(() => {
      rejected = webViewPropsRef.current?.onShouldStartLoadWithRequest?.({
        url: 'https://ecampus.pccu.edu.tw.evil.example/inside.aspx?secret=value',
      });
    });

    expect(rejected).toBe(false);
    expect(mockStopLoading).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledWith({
      event: 'webview_host_rejected',
      scope: 'global-scraper',
      fields: { syncKind: 'schedule' },
    });
    const error = await requestPromise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('webview_host_rejected');
    rendered.unmount();
  });

  it('rejects an HTTP redirect and settles the active request once', async () => {
    const engine = PccuSyncEngine.getInstance();
    const rendered = render(<GlobalScraperWebView />);
    const requestPromise = engine.requestSync('grade').catch((error) => error);

    await act(async () => {
      await Promise.resolve();
    });

    let rejected: boolean | undefined;
    act(() => {
      rejected = webViewPropsRef.current?.onShouldStartLoadWithRequest?.({
        url: 'http://ecampus.pccu.edu.tw/eCampus/inside.aspx',
      });
      webViewPropsRef.current?.onShouldStartLoadWithRequest?.({
        url: 'http://ecampus.pccu.edu.tw/eCampus/inside.aspx',
      });
    });

    expect(rejected).toBe(false);
    const error = await requestPromise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('webview_host_rejected');
    rendered.unmount();
  });

  it('does not let a stale protocol generation settle the active request', async () => {
    const engine = PccuSyncEngine.getInstance();
    const rendered = render(<GlobalScraperWebView />);

    for (let generation = 1; generation < 5; generation += 1) {
      const completedRequest = engine.requestSync('schedule').catch((error) => error);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      act(() => {
        webViewPropsRef.current?.onShouldStartLoadWithRequest?.({
          url: 'http://ecampus.pccu.edu.tw/eCampus/inside.aspx',
        });
      });
      await expect(completedRequest).resolves.toBeInstanceOf(Error);
      act(() => {
        jest.advanceTimersByTime(1);
      });
    }

    let settled = false;
    const requestPromise = engine
      .requestSync('schedule')
      .catch((error) => error)
      .finally(() => {
        settled = true;
      });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      webViewPropsRef.current?.onLoadEnd?.({
        nativeEvent: {
          url: 'https://ecampus.pccu.edu.tw/eCampus/default.aspx?ts=123',
        },
      });
      await Promise.resolve();
    });

    const activeIdentity = mockProtocolIdentityRef.current;
    expect(activeIdentity).toEqual(expect.objectContaining({ generation: 5 }));
    if (!activeIdentity) throw new Error('Expected active protocol identity');

    await act(async () => {
      webViewPropsRef.current?.onMessage?.({
        nativeEvent: {
          url: 'https://ecampus.pccu.edu.tw/eCampus/default.aspx',
          data: JSON.stringify({
            version: 1,
            ...activeIdentity,
            generation: 4,
            event: 'legacy-message',
            payload: { t: 'login_fail' },
            t: 'login_fail',
          }),
        },
      });
      await Promise.resolve();
    });

    expect(settled).toBe(false);
    rendered.unmount();
    const error = await requestPromise;
    expect(error).toBeInstanceOf(Error);
  });

  it('prefixes every injected legacy script with the active protocol identity', async () => {
    const engine = PccuSyncEngine.getInstance();
    const rendered = render(<GlobalScraperWebView />);
    const requestPromise = engine.requestSync('schedule').catch((error) => error);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onLoadEnd?.({
        nativeEvent: {
          url: 'https://ecampus.pccu.edu.tw/eCampus/default.aspx?ts=123',
        },
      });
      await Promise.resolve();
    });

    expect(mockRawInjectJavaScript).toHaveBeenCalled();
    for (const [script] of mockRawInjectJavaScript.mock.calls) {
      expect(script).toContain('/*__MYCCU_PROTOCOL_IDENTITY__');
      expect(script).toContain('/*__MYCCU_PROTOCOL_PRELUDE_END__*/');
    }
    expect(mockProtocolIdentityRef.current).toEqual(
      expect.objectContaining({
        generation: 1,
        nonce: 'nonce-1',
        syncKind: 'schedule',
      }),
    );

    rendered.unmount();
    const error = await requestPromise;
    expect(error).toBeInstanceOf(Error);
  });

  it('rejects a bound message from a disallowed current page without settling', async () => {
    const engine = PccuSyncEngine.getInstance();
    const rendered = render(<GlobalScraperWebView />);
    let settled = false;
    const requestPromise = engine
      .requestSync('schedule')
      .catch((error) => error)
      .finally(() => {
        settled = true;
      });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      webViewPropsRef.current?.onLoadEnd?.({
        nativeEvent: {
          url: 'https://ecampus.pccu.edu.tw/eCampus/default.aspx?ts=123',
        },
      });
      await Promise.resolve();
      webViewPropsRef.current?.onMessage?.({
        nativeEvent: {
          url: 'https://ecampus.pccu.edu.tw.evil.example/inside.aspx?secret=value',
          data: JSON.stringify({ t: 'login_fail' }),
        },
      });
      await Promise.resolve();
    });

    expect(settled).toBe(false);
    expect(consoleWarnSpy).toHaveBeenCalledWith({
      event: 'webview_message_rejected',
      scope: 'global-scraper',
      fields: { reason: 'disallowed_url', syncKind: 'schedule' },
    });

    rendered.unmount();
    const error = await requestPromise;
    expect(error).toBeInstanceOf(Error);
  });

  it('clears and remounts the isolated WebView session before resolving', async () => {
    const rendered = render(<GlobalScraperWebView />);
    let completed = false;
    let clearPromise!: Promise<void>;
    let repeatedClearPromise!: Promise<void>;

    await act(async () => {
      clearPromise = clearRegisteredWebViewSession('logout');
      repeatedClearPromise = clearRegisteredWebViewSession('logout');
      void clearPromise.then(() => {
        completed = true;
      });
      await Promise.resolve();
    });

    expect(completed).toBe(false);
    expect(repeatedClearPromise).toBe(clearPromise);
    expect(webViewPropsRef.current?.incognito).toBe(true);
    expect(webViewPropsRef.current?.cacheEnabled).toBe(false);
    expect(webViewPropsRef.current?.source?.uri).toBe('about:blank');
    expect(mockStopLoading).toHaveBeenCalledTimes(1);
    expect(mockClearCache).toHaveBeenCalledWith(true);
    expect(mockClearHistory).toHaveBeenCalledTimes(1);
    expect(mockRawInjectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('localStorage.clear()'),
    );
    expect(mockRawInjectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('sessionStorage.clear()'),
    );

    await act(async () => {
      webViewPropsRef.current?.onLoadEnd?.({
        nativeEvent: { url: 'about:blank' },
      });
      await Promise.all([clearPromise, repeatedClearPromise]);
    });

    expect(completed).toBe(true);
    rendered.unmount();
    await expect(clearRegisteredWebViewSession('logout')).resolves.toBeUndefined();
  });

  it('quiesces an old account message before session cleanup completes', async () => {
    const persistence = deferred<void>();
    jest.mocked(setTutoringCourses).mockReturnValueOnce(persistence.promise);
    const engine = PccuSyncEngine.getInstance();
    const rendered = render(<GlobalScraperWebView />);
    const requestPromise = engine.requestSync('tutoring').catch((error) => error);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      webViewPropsRef.current?.onLoadEnd?.({
        nativeEvent: { url: 'https://ecampus.pccu.edu.tw/eCampus/default.aspx?ts=123' },
      });
      await Promise.resolve();
    });
    expect(mockProtocolIdentityRef.current).not.toBeNull();

    let messagePromise!: Promise<void>;
    await act(async () => {
      messagePromise = webViewPropsRef.current?.onMessage?.({
        nativeEvent: {
          url: 'https://icas.pccu.edu.tw/cfp/',
          data: JSON.stringify({ t: 'courses', courses: [{ courseCode: 'ACCOUNT_A' }] }),
        },
      });
      await Promise.resolve();
    });
    expect(setTutoringCourses).toHaveBeenCalledTimes(1);

    let cleanupSettled = false;
    let cleanupPromise!: Promise<void>;
    await act(async () => {
      cleanupPromise = clearRegisteredWebViewSession('account_switch');
      void cleanupPromise.then(() => {
        cleanupSettled = true;
      });
      webViewPropsRef.current?.onLoadEnd?.({ nativeEvent: { url: 'about:blank' } });
      await Promise.resolve();
    });

    expect(cleanupSettled).toBe(false);

    persistence.resolve();
    await act(async () => {
      await Promise.all([messagePromise, cleanupPromise]);
    });

    expect(mockTutoringStoreSetCourses).not.toHaveBeenCalled();
    expect(await requestPromise).toBeInstanceOf(Error);
    rendered.unmount();
  });

  it('times out a stuck handler and lets a retry finish after late persistence settles', async () => {
    const persistence = deferred<void>();
    jest.mocked(setTutoringCourses).mockReturnValueOnce(persistence.promise);
    const engine = PccuSyncEngine.getInstance();
    const rendered = render(<GlobalScraperWebView />);
    const requestPromise = engine.requestSync('tutoring').catch((error) => error);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      webViewPropsRef.current?.onLoadEnd?.({
        nativeEvent: { url: 'https://ecampus.pccu.edu.tw/eCampus/default.aspx?ts=123' },
      });
      await Promise.resolve();
    });

    let messagePromise!: Promise<void>;
    await act(async () => {
      messagePromise = webViewPropsRef.current?.onMessage?.({
        nativeEvent: {
          url: 'https://icas.pccu.edu.tw/cfp/',
          data: JSON.stringify({ t: 'courses', courses: [{ courseCode: 'ACCOUNT_A' }] }),
        },
      });
      await Promise.resolve();
    });

    let firstCleanup!: Promise<void>;
    await act(async () => {
      firstCleanup = clearRegisteredWebViewSession('account_switch');
      webViewPropsRef.current?.onLoadEnd?.({ nativeEvent: { url: 'about:blank' } });
      jest.advanceTimersByTime(8_000);
      await Promise.resolve();
    });
    await expect(firstCleanup).rejects.toThrow('webview_session_reset_timeout');

    let retryCleanup!: Promise<void>;
    await act(async () => {
      retryCleanup = clearRegisteredWebViewSession('account_switch');
      persistence.resolve();
      webViewPropsRef.current?.onLoadEnd?.({ nativeEvent: { url: 'about:blank' } });
      await Promise.all([messagePromise, retryCleanup]);
    });

    expect(clearTutoringStorage).toHaveBeenCalled();
    expect(mockTutoringStoreSetCourses).not.toHaveBeenCalled();
    expect(await requestPromise).toBeInstanceOf(Error);
    rendered.unmount();
  });

  it('renders the live scraper preview only inside a registered debug slot', async () => {
    const rendered = render(<GlobalScraperWebView />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(rendered.queryByText('LIVE SCRAPER PREVIEW')).toBeNull();

    await act(async () => {
      await setDeveloperDebugEnabled(true);
      await Promise.resolve();
    });

    expect(rendered.queryByText('LIVE SCRAPER PREVIEW')).toBeNull();
    expect(webViewPropsRef.current?.pointerEvents).toBe('none');

    await act(async () => {
      setScraperDebugPreviewFrame({ x: 24, y: 320, width: 340, height: 260 });
      await Promise.resolve();
    });

    expect(rendered.getByText('LIVE SCRAPER PREVIEW')).toBeTruthy();
    const panelStyle = StyleSheet.flatten(rendered.getByTestId('scraper-debug-panel').props.style);
    expect(panelStyle.position).toBe('absolute');
    expect(panelStyle.backgroundColor).toBe('#fff');
    expect(panelStyle.left).toBe(24);
    expect(panelStyle.top).toBe(320);
    expect(panelStyle.width).toBe(340);
    expect(panelStyle.height).toBe(260);
    expect(rendered.queryByTestId('scraper-debug-drag-handle')).toBeNull();
    const previewStyle = StyleSheet.flatten(webViewPropsRef.current?.style);
    const previewContainerStyle = StyleSheet.flatten(webViewPropsRef.current?.containerStyle);

    expect(previewStyle.width).toBe('100%');
    expect(previewStyle.height).toBe('100%');
    expect(previewStyle.transform).toBeUndefined();
    expect(previewStyle.backgroundColor).toBe('#fff');
    expect(previewContainerStyle.backgroundColor).toBe('#fff');
    expect(webViewPropsRef.current?.pointerEvents).toBe('auto');

    fireEvent.press(rendered.getByTestId('scraper-debug-refresh-button'));
    expect(mockReload).toHaveBeenCalledTimes(1);

    await act(async () => {
      clearScraperDebugPreviewFrame();
      await Promise.resolve();
    });

    expect(rendered.queryByText('LIVE SCRAPER PREVIEW')).toBeNull();
    expect(webViewPropsRef.current?.pointerEvents).toBe('none');
  });

  it('does not open a PCCU target when inside.aspx is reached before login is verified', async () => {
    const engine = PccuSyncEngine.getInstance();
    const rendered = render(<GlobalScraperWebView />);

    const requestPromise = engine.requestSync('schedule').catch((error) => error);

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onLoadEnd?.({
        nativeEvent: {
          url: 'https://ecampus.pccu.edu.tw/eCampus/default.aspx?ts=123',
        },
      });
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ecampus.pccu.edu.tw/eCampus/inside.aspx',
      });
      jest.advanceTimersByTime(1_500);
      await Promise.resolve();
    });

    expect(buildServiceOpenScript).not.toHaveBeenCalled();

    rendered.unmount();
    const error = await requestPromise;
    expect(error).toBeInstanceOf(Error);
  });

  it('keeps tutoring login alive when navigation reaches inside.aspx before login_ok', async () => {
    const engine = PccuSyncEngine.getInstance();
    const rendered = render(<GlobalScraperWebView />);

    const requestPromise = engine.requestSync('tutoring').catch((error) => error);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onLoadEnd?.({
        nativeEvent: {
          url: 'https://ecampus.pccu.edu.tw/eCampus/default.aspx?ts=123',
        },
      });
      await Promise.resolve();
    });

    expect(buildLoginScript).toHaveBeenCalledTimes(1);

    await act(async () => {
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ecampus.pccu.edu.tw/eCampus/inside.aspx',
      });
      jest.advanceTimersByTime(600);
      await Promise.resolve();
    });

    expect(buildLoginScript).toHaveBeenCalledTimes(2);
    expect(buildServiceOpenScript).not.toHaveBeenCalled();

    rendered.unmount();
    const error = await requestPromise;
    expect(error).toBeInstanceOf(Error);
  });

  it('opens the 1202 tutoring service after login is verified', async () => {
    const engine = PccuSyncEngine.getInstance();
    const rendered = render(<GlobalScraperWebView />);

    const requestPromise = engine.requestSync('tutoring').catch((error) => error);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onLoadEnd?.({
        nativeEvent: {
          url: 'https://ecampus.pccu.edu.tw/eCampus/default.aspx?ts=123',
        },
      });
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onMessage?.({
        nativeEvent: { data: JSON.stringify({ t: 'login_ok' }) },
      });
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ecampus.pccu.edu.tw/eCampus/inside.aspx',
      });
      jest.advanceTimersByTime(1_200);
      await Promise.resolve();
    });

    expect(buildServiceOpenScript).toHaveBeenCalledWith('1202');
    expect(mockInjectJavaScript).toHaveBeenLastCalledWith('service-open-script;');

    rendered.unmount();
    const error = await requestPromise;
    expect(error).toBeInstanceOf(Error);
  });

  it('injects the tutoring overview script after icas CourseFP page loads', async () => {
    const engine = PccuSyncEngine.getInstance();
    const rendered = render(<GlobalScraperWebView />);

    const requestPromise = engine.requestSync('tutoring').catch((error) => error);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onMessage?.({
        nativeEvent: { data: JSON.stringify({ t: 'login_ok' }) },
      });
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://icas.pccu.edu.tw/cfp/',
      });
      jest.advanceTimersByTime(3_000);
      await Promise.resolve();
    });

    expect(buildTutoringOverviewScript).toHaveBeenCalledTimes(1);
    expect(buildWaitForCourseFpScript).toHaveBeenCalledWith('overview-script;');
    expect(mockInjectJavaScript).toHaveBeenLastCalledWith('wait-for-coursefp:overview-script;');

    rendered.unmount();
    const error = await requestPromise;
    expect(error).toBeInstanceOf(Error);
  });

  it('falls back from a stuck 1202 TransUrl handoff to the ICAS tutoring home', async () => {
    const engine = PccuSyncEngine.getInstance();
    const rendered = render(<GlobalScraperWebView />);

    const requestPromise = engine.requestSync('tutoring').catch((error) => error);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onMessage?.({
        nativeEvent: { data: JSON.stringify({ t: 'login_ok' }) },
      });
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ecampus.pccu.edu.tw/eCampus/TransUrl.aspx?PrjNo=1202&Area=service&MainMenuIndex=0&SubMenuIndex=00',
      });
      jest.advanceTimersByTime(2_500);
      await Promise.resolve();
    });

    expect(mockInjectJavaScript).toHaveBeenLastCalledWith(
      'window.location.href="https://icas.pccu.edu.tw/cfp/";true;',
    );

    rendered.unmount();
    const error = await requestPromise;
    expect(error).toBeInstanceOf(Error);
  });

  it('keeps tutoring overview retries behind the CourseFP readiness guard', async () => {
    const engine = PccuSyncEngine.getInstance();
    const rendered = render(<GlobalScraperWebView />);

    const requestPromise = engine.requestSync('tutoring').catch((error) => error);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onMessage?.({
        nativeEvent: { data: JSON.stringify({ t: 'login_ok' }) },
      });
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://icas.pccu.edu.tw/cfp/',
      });
      jest.advanceTimersByTime(3_000);
      await Promise.resolve();
    });

    mockInjectJavaScript.mockClear();
    (buildTutoringOverviewScript as jest.Mock).mockClear();
    (buildWaitForCourseFpScript as jest.Mock).mockClear();

    await act(async () => {
      webViewPropsRef.current?.onMessage?.({
        nativeEvent: { data: JSON.stringify({ t: 'err', m: 'CourseFP not ready' }) },
      });
      await Promise.resolve();
    });

    expect(buildTutoringOverviewScript).toHaveBeenCalledTimes(1);
    expect(buildWaitForCourseFpScript).toHaveBeenCalledWith('overview-script;');
    expect(mockInjectJavaScript).toHaveBeenLastCalledWith('wait-for-coursefp:overview-script;');

    rendered.unmount();
    const error = await requestPromise;
    expect(error).toBeInstanceOf(Error);
  });

  it('releases the PCCU gate when an active shared scraper request times out', async () => {
    const engine = PccuSyncEngine.getInstance();
    render(<GlobalScraperWebView />);

    const requestPromise = engine.requestSync('schedule');
    const handledRequestPromise = requestPromise.catch((error) => error);

    await act(async () => {
      await Promise.resolve();
    });

    expect(pccuBrowserSessionGate.getCurrentOwner()).toContain('shared-scraper:schedule:');

    await act(async () => {
      jest.advanceTimersByTime(30_000);
      await Promise.resolve();
    });

    const error = await handledRequestPromise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('timed out after 30s');

    const nextLease = await pccuBrowserSessionGate.acquire('tutoring');
    expect(nextLease.owner).toBe('tutoring');
    nextLease.release();
  });

  it('opens schedule service once, then injects schedule script once after handoff events converge', async () => {
    const engine = PccuSyncEngine.getInstance();
    const rendered = render(<GlobalScraperWebView />);

    const requestPromise = engine.requestSync('schedule').catch((error) => error);

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ecampus.pccu.edu.tw/eCampus/default.aspx?ts=123',
      });
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onMessage?.({
        nativeEvent: { data: JSON.stringify({ t: 'login_ok' }) },
      });
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ecampus.pccu.edu.tw/eCampus/inside.aspx',
      });
      jest.advanceTimersByTime(1_200);
      await Promise.resolve();
    });

    expect(buildServiceOpenScript).toHaveBeenCalledTimes(1);
    expect(buildServiceOpenScript).toHaveBeenCalledWith('1208');
    expect(buildAdaptiveSchedulePageScript).not.toHaveBeenCalled();
    expect(mockInjectJavaScript).toHaveBeenCalledWith('service-open-script;');

    await act(async () => {
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ecampus.pccu.edu.tw/eCampus/TransUrl.aspx?PrjNo=1208',
      });
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ecampus.pccu.edu.tw/eCampus/queryCourse/queryByStudent.asp?QuerySource=queryCourse',
      });
      webViewPropsRef.current?.onLoadEnd?.({
        nativeEvent: {
          url: 'https://ecampus.pccu.edu.tw/eCampus/queryCourse/queryByStudent.asp?QuerySource=queryCourse',
        },
      });
      jest.advanceTimersByTime(1_600);
      await Promise.resolve();
    });

    expect(buildServiceOpenScript).toHaveBeenCalledTimes(1);
    expect(buildAdaptiveSchedulePageScript).toHaveBeenCalledTimes(1);
    expect(mockInjectJavaScript).toHaveBeenCalledWith(expect.stringContaining('schedule-script;'));

    rendered.unmount();
    const error = await requestPromise;
    expect(error).toBeInstanceOf(Error);
  });

  it('does not reopen schedule service after popup navigates to transurl', async () => {
    const engine = PccuSyncEngine.getInstance();
    const rendered = render(<GlobalScraperWebView />);

    const requestPromise = engine.requestSync('schedule').catch((error) => error);

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ecampus.pccu.edu.tw/eCampus/default.aspx?ts=123',
      });
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onMessage?.({
        nativeEvent: { data: JSON.stringify({ t: 'login_ok' }) },
      });
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ecampus.pccu.edu.tw/eCampus/inside.aspx',
      });
      jest.advanceTimersByTime(1_200);
      await Promise.resolve();
    });

    expect(buildServiceOpenScript).toHaveBeenCalledTimes(1);

    await act(async () => {
      webViewPropsRef.current?.onMessage?.({
        nativeEvent: {
          data: JSON.stringify({
            t: 'popup',
            url: 'https://ecampus.pccu.edu.tw/eCampus/TransUrl.aspx?PrjNo=1208&Area=service',
          }),
        },
      });
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ecampus.pccu.edu.tw/eCampus/TransUrl.aspx?PrjNo=1208&Area=service',
      });
      webViewPropsRef.current?.onLoadEnd?.({
        nativeEvent: {
          url: 'https://ecampus.pccu.edu.tw/eCampus/TransUrl.aspx?PrjNo=1208&Area=service',
        },
      });
      jest.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(buildServiceOpenScript).toHaveBeenCalledTimes(1);

    rendered.unmount();
    const error = await requestPromise;
    expect(error).toBeInstanceOf(Error);
  });

  it('navigates schedule popup through TransUrl instead of forcing the query page directly', async () => {
    const engine = PccuSyncEngine.getInstance();
    const rendered = render(<GlobalScraperWebView />);

    const requestPromise = engine.requestSync('schedule').catch((error) => error);

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ecampus.pccu.edu.tw/eCampus/default.aspx?ts=123',
      });
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onMessage?.({
        nativeEvent: { data: JSON.stringify({ t: 'login_ok' }) },
      });
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ecampus.pccu.edu.tw/eCampus/inside.aspx',
      });
      jest.advanceTimersByTime(1_200);
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onMessage?.({
        nativeEvent: {
          data: JSON.stringify({
            t: 'popup',
            url: 'https://ecampus.pccu.edu.tw/eCampus/TransUrl.aspx?PrjNo=1208&Area=service',
          }),
        },
      });
      await Promise.resolve();
    });

    expect(mockInjectJavaScript).toHaveBeenLastCalledWith(
      'window.location.href="https://ecampus.pccu.edu.tw/eCampus/TransUrl.aspx?PrjNo=1208&Area=service";true;',
    );
    expect(mockInjectJavaScript).not.toHaveBeenCalledWith(
      'window.location.href="https://ecampus.pccu.edu.tw/eCampus/queryCourse/queryByStudent.asp?QuerySource=queryCourse";true;',
    );

    rendered.unmount();
    const error = await requestPromise;
    expect(error).toBeInstanceOf(Error);
  });

  it('injects the schedule script on the 1208 TransUrl page so it can click student schedule query', async () => {
    const engine = PccuSyncEngine.getInstance();
    const rendered = render(<GlobalScraperWebView />);

    const requestPromise = engine.requestSync('schedule').catch((error) => error);

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ecampus.pccu.edu.tw/eCampus/default.aspx?ts=123',
      });
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onMessage?.({
        nativeEvent: { data: JSON.stringify({ t: 'login_ok' }) },
      });
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ecampus.pccu.edu.tw/eCampus/inside.aspx',
      });
      jest.advanceTimersByTime(1_200);
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onMessage?.({
        nativeEvent: {
          data: JSON.stringify({
            t: 'popup',
            url: 'https://ecampus.pccu.edu.tw/eCampus/TransUrl.aspx?PrjNo=1208&Area=service',
          }),
        },
      });
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ecampus.pccu.edu.tw/eCampus/TransUrl.aspx?PrjNo=1208&Area=service',
      });
      webViewPropsRef.current?.onLoadEnd?.({
        nativeEvent: {
          url: 'https://ecampus.pccu.edu.tw/eCampus/TransUrl.aspx?PrjNo=1208&Area=service',
        },
      });
      jest.advanceTimersByTime(1_600);
      await Promise.resolve();
    });

    expect(buildServiceOpenScript).toHaveBeenCalledTimes(1);
    expect(buildAdaptiveSchedulePageScript).toHaveBeenCalledTimes(1);
    expect(mockInjectJavaScript).toHaveBeenLastCalledWith(
      expect.stringContaining('schedule-script;'),
    );

    rendered.unmount();
    const error = await requestPromise;
    expect(error).toBeInstanceOf(Error);
  });

  it('injects the schedule script when the 1208 popup goes directly to ap1 queryByStudent', async () => {
    const engine = PccuSyncEngine.getInstance();
    const rendered = render(<GlobalScraperWebView />);

    const requestPromise = engine.requestSync('schedule').catch((error) => error);

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ecampus.pccu.edu.tw/eCampus/default.aspx?ts=123',
      });
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onMessage?.({
        nativeEvent: { data: JSON.stringify({ t: 'login_ok' }) },
      });
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ecampus.pccu.edu.tw/eCampus/inside.aspx',
      });
      jest.advanceTimersByTime(1_200);
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onMessage?.({
        nativeEvent: {
          data: JSON.stringify({
            t: 'popup',
            url: 'https://ap1.pccu.edu.tw/queryCourse/queryByStudent.asp?QuerySource=queryCourse',
          }),
        },
      });
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ap1.pccu.edu.tw/queryCourse/queryByStudent.asp?QuerySource=queryCourse',
      });
      webViewPropsRef.current?.onLoadEnd?.({
        nativeEvent: {
          url: 'https://ap1.pccu.edu.tw/queryCourse/queryByStudent.asp?QuerySource=queryCourse',
        },
      });
      jest.advanceTimersByTime(1_600);
      await Promise.resolve();
    });

    expect(buildAdaptiveSchedulePageScript).toHaveBeenCalledTimes(1);
    expect(mockInjectJavaScript).toHaveBeenLastCalledWith(
      expect.stringContaining('schedule-script;'),
    );

    rendered.unmount();
    const error = await requestPromise;
    expect(error).toBeInstanceOf(Error);
  });

  it('navigates popup target URLs received via onOpenWindow into the shared schedule webview', async () => {
    const engine = PccuSyncEngine.getInstance();
    const rendered = render(<GlobalScraperWebView />);

    const requestPromise = engine.requestSync('schedule').catch((error) => error);

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ecampus.pccu.edu.tw/eCampus/default.aspx?ts=123',
      });
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onMessage?.({
        nativeEvent: { data: JSON.stringify({ t: 'login_ok' }) },
      });
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ecampus.pccu.edu.tw/eCampus/inside.aspx',
      });
      jest.advanceTimersByTime(1_200);
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onOpenWindow?.({
        nativeEvent: {
          targetUrl:
            'https://ap1.pccu.edu.tw/queryCourse/queryByStudent.asp?QuerySource=queryCourse',
        },
      });
      await Promise.resolve();
    });

    expect(mockInjectJavaScript).toHaveBeenLastCalledWith(
      'window.location.href="https://ap1.pccu.edu.tw/queryCourse/queryByStudent.asp?QuerySource=queryCourse";true;',
    );

    await act(async () => {
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ap1.pccu.edu.tw/queryCourse/queryByStudent.asp?QuerySource=queryCourse',
      });
      webViewPropsRef.current?.onLoadEnd?.({
        nativeEvent: {
          url: 'https://ap1.pccu.edu.tw/queryCourse/queryByStudent.asp?QuerySource=queryCourse',
        },
      });
      jest.advanceTimersByTime(1_600);
      await Promise.resolve();
    });

    expect(buildAdaptiveSchedulePageScript).toHaveBeenCalledTimes(1);
    expect(mockInjectJavaScript).toHaveBeenLastCalledWith(
      expect.stringContaining('schedule-script;'),
    );

    rendered.unmount();
    const error = await requestPromise;
    expect(error).toBeInstanceOf(Error);
  });

  it('resets schedule script state before injecting on query page handoff', async () => {
    const engine = PccuSyncEngine.getInstance();
    const rendered = render(<GlobalScraperWebView />);

    const requestPromise = engine.requestSync('schedule').catch((error) => error);

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ecampus.pccu.edu.tw/eCampus/default.aspx?ts=123',
      });
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onMessage?.({
        nativeEvent: {
          data: JSON.stringify({
            t: 'login_ok',
          }),
        },
      });
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ecampus.pccu.edu.tw/eCampus/inside.aspx',
      });
      jest.advanceTimersByTime(1_200);
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onMessage?.({
        nativeEvent: {
          data: JSON.stringify({
            t: 'popup',
            url: 'https://ecampus.pccu.edu.tw/eCampus/TransUrl.aspx?PrjNo=1208&Area=service',
          }),
        },
      });
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ecampus.pccu.edu.tw/eCampus/queryCourse/queryByStudent.asp?QuerySource=queryCourse',
      });
      webViewPropsRef.current?.onLoadEnd?.({
        nativeEvent: {
          url: 'https://ecampus.pccu.edu.tw/eCampus/queryCourse/queryByStudent.asp?QuerySource=queryCourse',
        },
      });
      jest.advanceTimersByTime(1_600);
      await Promise.resolve();
    });

    expect(mockInjectJavaScript).toHaveBeenLastCalledWith(
      expect.stringContaining('window.__PCCU_ADAPTIVE_SCHEDULE_SYNC__.active = false;'),
    );
    expect(mockInjectJavaScript).toHaveBeenLastCalledWith(
      expect.stringContaining("sessionStorage.removeItem('__PCCU_SCHEDULE_SEARCH_TS__');"),
    );
    expect(mockInjectJavaScript).toHaveBeenLastCalledWith(
      expect.stringContaining('schedule-script;'),
    );

    rendered.unmount();
    const error = await requestPromise;
    expect(error).toBeInstanceOf(Error);
  });

  it('navigates grade popup through TransUrl instead of forcing the score page directly', async () => {
    const engine = PccuSyncEngine.getInstance();
    const rendered = render(<GlobalScraperWebView />);

    const requestPromise = engine.requestSync('grade').catch((error) => error);

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ecampus.pccu.edu.tw/eCampus/default.aspx?ts=123',
      });
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onMessage?.({
        nativeEvent: {
          data: JSON.stringify({
            t: 'login_ok',
          }),
        },
      });
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ecampus.pccu.edu.tw/eCampus/inside.aspx',
      });
      jest.advanceTimersByTime(1_200);
      await Promise.resolve();
    });

    expect(buildServiceOpenScript).toHaveBeenCalledTimes(1);
    expect(buildServiceOpenScript).toHaveBeenCalledWith('1220');

    await act(async () => {
      webViewPropsRef.current?.onMessage?.({
        nativeEvent: {
          data: JSON.stringify({
            t: 'popup',
            url: 'https://ecampus.pccu.edu.tw/eCampus/TransUrl.aspx?PrjNo=1220&Area=service',
          }),
        },
      });
      await Promise.resolve();
    });

    expect(mockInjectJavaScript).toHaveBeenLastCalledWith(
      'window.location.href="https://ecampus.pccu.edu.tw/eCampus/TransUrl.aspx?PrjNo=1220&Area=service";true;',
    );
    expect(mockInjectJavaScript).not.toHaveBeenCalledWith(
      'window.location.href="https://ap2.pccu.edu.tw/studentscore/student/index.asp";true;',
    );

    await act(async () => {
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ap2.pccu.edu.tw/studentscore/student/index.asp',
      });
      jest.advanceTimersByTime(1_200);
      await Promise.resolve();
    });

    expect(buildRobustGradePageScript).toHaveBeenCalledTimes(1);
    expect(mockInjectJavaScript).toHaveBeenLastCalledWith('grade-script;');

    rendered.unmount();
    const error = await requestPromise;
    expect(error).toBeInstanceOf(Error);
  });

  it('refreshes timeout after gate wait so PCCU work still has usable budget', async () => {
    const existingLease = await pccuBrowserSessionGate.acquire('tutoring');
    const engine = PccuSyncEngine.getInstance();
    const rendered = render(<GlobalScraperWebView />);

    const requestPromise = engine.requestSync('schedule');
    const handledRequestPromise = requestPromise.catch((error) => error);

    await act(async () => {
      jest.advanceTimersByTime(25_000);
      await Promise.resolve();
    });

    existingLease.release();

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockGetSavedPCCUCredentials).toHaveBeenCalledTimes(1);

    await act(async () => {
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ecampus.pccu.edu.tw/eCampus/default.aspx?ts=123',
      });
      await Promise.resolve();
    });

    await act(async () => {
      jest.advanceTimersByTime(10_000);
      await Promise.resolve();
    });

    let settled = false;
    const trackedPromise = requestPromise
      .catch((error) => error)
      .finally(() => {
        settled = true;
      });
    await Promise.resolve();
    expect(settled).toBe(false);

    rendered.unmount();
    const error = await trackedPromise;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      'Sync executor became unavailable. Shared scraper was unmounted.',
    );
  });

  it('restarts the PCCU login flow when schedule query requires relogin', async () => {
    const engine = PccuSyncEngine.getInstance();
    const rendered = render(<GlobalScraperWebView />);

    void engine.requestSync('schedule').catch(() => null);

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ecampus.pccu.edu.tw/eCampus/default.aspx?ts=123',
      });
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onMessage?.({
        nativeEvent: { data: JSON.stringify({ t: 'login_ok' }) },
      });
      await Promise.resolve();
    });

    await act(async () => {
      webViewPropsRef.current?.onNavigationStateChange?.({
        loading: false,
        url: 'https://ecampus.pccu.edu.tw/eCampus/inside.aspx',
      });
      jest.advanceTimersByTime(1_200);
      await Promise.resolve();
    });

    const uriBeforeRelogin = webViewPropsRef.current?.source?.uri;
    mockInjectJavaScript.mockClear();

    await act(async () => {
      webViewPropsRef.current?.onMessage?.({
        nativeEvent: {
          data: JSON.stringify({ t: 'err', m: 'Schedule query requires relogin' }),
        },
      });
      await Promise.resolve();
    });

    expect(webViewPropsRef.current?.source?.uri).toContain('default.aspx');
    expect(webViewPropsRef.current?.source?.uri).not.toBe(uriBeforeRelogin);
    rendered.unmount();
  });
});
it('exposes the production host decision to the Expo Go acceptance probe', () => {
  render(<GlobalScraperWebView />);

  expect(
    runRegisteredWebViewHostAcceptanceProbe('https://ecampus.pccu.edu.tw/eCampus/default.aspx'),
  ).toBe(true);
  expect(
    runRegisteredWebViewHostAcceptanceProbe('http://ecampus.pccu.edu.tw/eCampus/default.aspx'),
  ).toBe(false);
  expect(
    runRegisteredWebViewHostAcceptanceProbe(
      'https://ecampus.pccu.edu.tw.attacker.example/eCampus/default.aspx',
    ),
  ).toBe(false);
  expect(mockStopLoading).toHaveBeenCalledTimes(2);
});
