export type ScraperDebugPreviewFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ScraperDebugPreviewListener = (frame: ScraperDebugPreviewFrame | null) => void;

let currentFrame: ScraperDebugPreviewFrame | null = null;
const listeners = new Set<ScraperDebugPreviewListener>();

export function getScraperDebugPreviewFrame(): ScraperDebugPreviewFrame | null {
  return currentFrame;
}

export function setScraperDebugPreviewFrame(frame: ScraperDebugPreviewFrame | null): void {
  currentFrame = frame;
  listeners.forEach((listener) => {
    listener(frame);
  });
}

export function clearScraperDebugPreviewFrame(): void {
  setScraperDebugPreviewFrame(null);
}

export function subscribeScraperDebugPreviewFrame(
  listener: ScraperDebugPreviewListener
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
