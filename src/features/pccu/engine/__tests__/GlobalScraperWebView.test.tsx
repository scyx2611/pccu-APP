const mockGetSavedPCCUCredentials = jest.fn(async () => ({
  username: 'u123',
  password: 'p456',
}));

const mockInjectJavaScript = jest.fn();
const webViewPropsRef: { current: any | null } = { current: null };

jest.mock('react-native-webview', () => {
  const React = require('react');

  return {
    WebView: React.forwardRef((props: any, ref: any) => {
      webViewPropsRef.current = props;
      React.useImperativeHandle(ref, () => ({
        injectJavaScript: mockInjectJavaScript,
      }));

      return null;
    }),
  };
});

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(),
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
}));

jest.mock('../../../schedule/storage/scheduleStorage', () => ({
  setCourses: jest.fn(),
}));

jest.mock('../../../traffic/storage/trafficStorage', () => ({
  setTrafficSnapshot: jest.fn(),
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
  buildTutoringOverviewScript: jest.fn(() => 'true;'),
  buildTutoringAllAssignmentsScript: jest.fn(() => 'true;'),
  buildTutoringPendingAssignmentsScript: jest.fn(() => 'true;'),
  buildTutoringSingleCourseScript: jest.fn(() => 'true;'),
  buildWaitForCourseFpScript: jest.fn(() => 'true;'),
}));

jest.mock('../../../tutoring/storage/tutoringStorage', () => ({
  setCourses: jest.fn(),
  setPendingAssignments: jest.fn(),
  setAllAssignments: jest.fn(),
}));

jest.mock('../../../tutoring/store/useTutoringStore', () => ({
  useTutoringStore: {
    getState: () => ({
      setSyncPhase: jest.fn(),
      setSyncStatus: jest.fn(),
      setCourses: jest.fn(),
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
import { act, render } from '@testing-library/react-native';

import GlobalScraperWebView from '../GlobalScraperWebView';
import { PccuSyncEngine } from '../PccuSyncEngine';
import { pccuBrowserSessionGate } from '../pccuBrowserSessionGate';
import {
  buildAdaptiveSchedulePageScript,
  buildServiceOpenScript,
} from '../../sync/pccuSyncScripts';

describe('GlobalScraperWebView PCCU session gate', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    PccuSyncEngine.resetInstance();
    pccuBrowserSessionGate.resetForTests();
    mockGetSavedPCCUCredentials.mockClear();
    mockInjectJavaScript.mockClear();
    (buildAdaptiveSchedulePageScript as jest.Mock).mockClear();
    (buildServiceOpenScript as jest.Mock).mockClear();
    webViewPropsRef.current = null;
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
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
      'Sync executor became unavailable. Shared scraper was unmounted.'
    );
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
      expect.stringContaining("window.__PCCU_ADAPTIVE_SCHEDULE_SYNC__.active = false;")
    );
    expect(mockInjectJavaScript).toHaveBeenLastCalledWith(
      expect.stringContaining("sessionStorage.removeItem('__PCCU_SCHEDULE_SEARCH_TS__');")
    );
    expect(mockInjectJavaScript).toHaveBeenLastCalledWith(expect.stringContaining('schedule-script;'));

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
      'Sync executor became unavailable. Shared scraper was unmounted.'
    );
  });
});
