import {
  registerWebViewHostAcceptanceProbe,
  runRegisteredWebViewHostAcceptanceProbe,
} from '../webViewAcceptanceProbe';

describe('webViewAcceptanceProbe', () => {
  it('returns null when the hidden WebView is not mounted', () => {
    expect(runRegisteredWebViewHostAcceptanceProbe('https://example.com')).toBeNull();
  });

  it('uses the newest production host decision and unregisters safely', () => {
    const first = jest.fn(() => true);
    const second = jest.fn(() => false);
    const unregisterFirst = registerWebViewHostAcceptanceProbe(first);
    const unregisterSecond = registerWebViewHostAcceptanceProbe(second);

    expect(runRegisteredWebViewHostAcceptanceProbe('http://example.com')).toBe(false);
    expect(second).toHaveBeenCalledWith('http://example.com');

    unregisterFirst();
    expect(runRegisteredWebViewHostAcceptanceProbe('http://example.com')).toBe(false);

    unregisterSecond();
    expect(runRegisteredWebViewHostAcceptanceProbe('http://example.com')).toBeNull();
  });
});
