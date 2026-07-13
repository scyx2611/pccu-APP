export type WebViewHostAcceptanceProbe = (url: string) => boolean;

let activeProbe: WebViewHostAcceptanceProbe | null = null;

export function registerWebViewHostAcceptanceProbe(probe: WebViewHostAcceptanceProbe): () => void {
  activeProbe = probe;
  return () => {
    if (activeProbe === probe) activeProbe = null;
  };
}

export const runRegisteredWebViewHostAcceptanceProbe = (url: string): boolean | null =>
  activeProbe?.(url) ?? null;
