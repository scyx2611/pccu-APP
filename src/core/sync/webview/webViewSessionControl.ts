export type WebViewSessionClearReason = 'logout' | 'account_switch';

export interface WebViewSessionControl {
  clearSession(reason: WebViewSessionClearReason): Promise<void>;
}

let activeControl: WebViewSessionControl | null = null;

export function registerWebViewSessionControl(control: WebViewSessionControl): () => void {
  activeControl = control;
  return () => {
    if (activeControl === control) activeControl = null;
  };
}

export const clearRegisteredWebViewSession = (reason: WebViewSessionClearReason) =>
  activeControl?.clearSession(reason) ?? Promise.resolve();
