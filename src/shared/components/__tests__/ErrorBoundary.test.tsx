const mockReportBoundaryError = jest.fn();

jest.mock('../../observability/errorReporting', () => ({
  reportBoundaryError: (event: unknown) => mockReportBoundaryError(event),
}));

jest.mock('../../../providers/theme/ThemeProvider', () => ({
  useTheme: () => ({
    theme: {
      bg: '#ffffff',
      text: '#000000',
      textSub: '#666666',
      primary: '#007aff',
    },
  }),
}));

import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import ErrorBoundary from '../ErrorBoundary';

describe('ErrorBoundary', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    mockReportBoundaryError.mockClear();
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('shows a sanitized fallback and remounts children when retry is pressed', () => {
    let renderCount = 0;
    let shouldThrow = true;
    const FlakyChild = () => {
      renderCount += 1;
      if (shouldThrow) {
        throw new Error('password=super-secret');
      }
      return <Text>recovered child</Text>;
    };

    const rendered = render(
      <ErrorBoundary label="root">
        <FlakyChild />
      </ErrorBoundary>,
    );

    expect(rendered.getByText('畫面暫時無法顯示')).toBeTruthy();
    expect(rendered.getByText('重試')).toBeTruthy();
    expect(JSON.stringify(rendered.toJSON())).not.toContain('super-secret');
    expect(JSON.stringify(rendered.toJSON())).not.toContain('FlakyChild');
    expect(mockReportBoundaryError).toHaveBeenCalledWith({
      errorName: 'Error',
      boundary: 'root',
      retryCount: 0,
    });

    const failedRenderCount = renderCount;
    shouldThrow = false;
    fireEvent.press(rendered.getByText('重試'));

    expect(rendered.getByText('recovered child')).toBeTruthy();
    expect(renderCount).toBeGreaterThan(failedRenderCount);
  });
});
