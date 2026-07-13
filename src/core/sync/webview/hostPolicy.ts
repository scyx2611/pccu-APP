export const ALLOWED_WEBVIEW_HOSTS = [
  'ecampus.pccu.edu.tw',
  'ap1.pccu.edu.tw',
  'ap2.pccu.edu.tw',
  'icas.pccu.edu.tw',
  'ebus.gov.taipei',
] as const;

const hostSet = new Set<string>(ALLOWED_WEBVIEW_HOSTS);

export const ALLOWED_WEBVIEW_ORIGINS = ALLOWED_WEBVIEW_HOSTS.map(
  (hostname) => `https://${hostname}`,
);

export function isAllowedWebViewUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      hostSet.has(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}
