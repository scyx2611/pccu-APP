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
  buildRobustGradePageScript: jest.fn(() => 'true;'),
  buildAdaptiveSchedulePageScript: jest.fn(() => 'true;'),
  buildServiceOpenScript: jest.fn(() => 'true;'),
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

import React from 'react';
import { act, render } from '@testing-library/react-native';

import GlobalScraperWebView from '../GlobalScraperWebView';
import { PccuSyncEngine } from '../PccuSyncEngine';
import { pccuBrowserSessionGate } from '../pccuBrowserSessionGate';

describe('GlobalScraperWebView PCCU session gate', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    PccuSyncEngine.resetInstance();
    pccuBrowserSessionGate.resetForTests();
    mockGetSavedPCCUCredentials.mockClear();
    mockInjectJavaScript.mockClear();
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
