import {
  clearRegisteredWebViewSession,
  registerWebViewSessionControl,
  type WebViewSessionControl,
} from '../webViewSessionControl';

const createControl = (): WebViewSessionControl => ({
  clearSession: jest.fn(async () => undefined),
});

describe('webViewSessionControl', () => {
  it('is a no-op when no WebView host is registered', async () => {
    await expect(clearRegisteredWebViewSession('logout')).resolves.toBeUndefined();
  });

  it('routes clearing to the newest registration', async () => {
    const first = createControl();
    const second = createControl();
    const unregisterFirst = registerWebViewSessionControl(first);
    const unregisterSecond = registerWebViewSessionControl(second);

    await clearRegisteredWebViewSession('account_switch');

    expect(first.clearSession).not.toHaveBeenCalled();
    expect(second.clearSession).toHaveBeenCalledWith('account_switch');

    unregisterFirst();
    await clearRegisteredWebViewSession('logout');
    expect(second.clearSession).toHaveBeenCalledWith('logout');
    unregisterSecond();
  });

  it('supports idempotent unregister without clearing a replacement', async () => {
    const first = createControl();
    const second = createControl();
    const unregisterFirst = registerWebViewSessionControl(first);
    const unregisterSecond = registerWebViewSessionControl(second);

    unregisterFirst();
    unregisterFirst();
    await clearRegisteredWebViewSession('logout');
    expect(second.clearSession).toHaveBeenCalledTimes(1);

    unregisterSecond();
    unregisterSecond();
    await expect(clearRegisteredWebViewSession('logout')).resolves.toBeUndefined();
    expect(second.clearSession).toHaveBeenCalledTimes(1);
  });
});
