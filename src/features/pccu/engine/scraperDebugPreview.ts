export type ScraperDebugPreviewFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ScraperDebugPreviewListener = (frame: ScraperDebugPreviewFrame | null) => void;
export type ScraperDebugRuntimeState = {
  status: string;
  message: string;
  url: string;
};
type ScraperDebugRuntimeListener = (state: ScraperDebugRuntimeState) => void;

let currentFrame: ScraperDebugPreviewFrame | null = null;
const listeners = new Set<ScraperDebugPreviewListener>();
let currentRuntimeState: ScraperDebugRuntimeState = {
  status: 'idle / none / idle',
  message: 'idle',
  url: '',
};
const runtimeListeners = new Set<ScraperDebugRuntimeListener>();

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

export function getScraperDebugRuntimeState(): ScraperDebugRuntimeState {
  return currentRuntimeState;
}

export function setScraperDebugRuntimeState(state: ScraperDebugRuntimeState): void {
  currentRuntimeState = state;
  runtimeListeners.forEach((listener) => {
    listener(state);
  });
}

export function subscribeScraperDebugRuntimeState(
  listener: ScraperDebugRuntimeListener
): () => void {
  runtimeListeners.add(listener);
  return () => {
    runtimeListeners.delete(listener);
  };
}
