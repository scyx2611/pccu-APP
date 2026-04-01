import { AppState, type AppStateStatus } from 'react-native';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SyncType = 'grade' | 'schedule' | 'traffic';

export interface SyncRequest {
  id: string;
  type: SyncType;
  priority: number;
  resolve: (data: any) => void;
  reject: (error: Error) => void;
}

export type SyncExecutor = (
  request: SyncRequest
) => Promise<any>;

export type EngineState = 'idle' | 'paused' | 'processing';

type ExecutorRecord = {
  id: number;
  execute: SyncExecutor;
};

// ---------------------------------------------------------------------------
// Priority Queue (min-heap by priority; lower number = higher priority)
// ---------------------------------------------------------------------------

class PriorityQueue {
  private heap: SyncRequest[] = [];

  get size(): number {
    return this.heap.length;
  }

  get isEmpty(): boolean {
    return this.heap.length === 0;
  }

  enqueue(request: SyncRequest): void {
    this.heap.push(request);
    this.bubbleUp(this.heap.length - 1);
  }

  dequeue(): SyncRequest | undefined {
    if (this.heap.length === 0) return undefined;
    if (this.heap.length === 1) return this.heap.pop();

    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  peek(): SyncRequest | undefined {
    return this.heap[0];
  }

  clear(): void {
    this.heap = [];
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = (index - 1) >> 1;
      if (this.heap[parentIndex].priority <= this.heap[index].priority) break;
      [this.heap[parentIndex], this.heap[index]] = [this.heap[index], this.heap[parentIndex]];
      index = parentIndex;
    }
  }

  private sinkDown(index: number): void {
    const length = this.heap.length;
    while (true) {
      const left = 2 * index + 1;
      const right = 2 * index + 2;
      let smallest = index;

      if (left < length && this.heap[left].priority < this.heap[smallest].priority) {
        smallest = left;
      }
      if (right < length && this.heap[right].priority < this.heap[smallest].priority) {
        smallest = right;
      }
      if (smallest === index) break;

      [this.heap[smallest], this.heap[index]] = [this.heap[index], this.heap[smallest]];
      index = smallest;
    }
  }
}

// ---------------------------------------------------------------------------
// PccuSyncEngine Singleton
// ---------------------------------------------------------------------------

const TASK_TIMEOUT_MS = 30_000; // 30 seconds per task
const PROCESSING_DELAY_MS = 300; // small delay between queued tasks
const EXECUTOR_READY_TIMEOUT_MS = 2_000;
const EXECUTOR_READY_POLL_MS = 50;

let instance: PccuSyncEngine | null = null;

export class PccuSyncEngine {
  private queue = new PriorityQueue();
  private state: EngineState = 'idle';
  private executorRecord: ExecutorRecord | null = null;
  private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
  private activeTimeout: ReturnType<typeof setTimeout> | null = null;
  private processingTimer: ReturnType<typeof setTimeout> | null = null;
  private _pausedReason: string | null = null;
  private executorSequence = 0;
  private activeRequest: SyncRequest | null = null;
  private activeExecutorId: number | null = null;

  // -----------------------------------------------------------------------
  // Singleton
  // -----------------------------------------------------------------------

  static getInstance(): PccuSyncEngine {
    if (!instance) {
      instance = new PccuSyncEngine();
    }
    return instance;
  }

  static resetInstance(): void {
    instance?.destroy();
    instance = null;
  }

  private constructor() {
    this.setupAppStateListener();
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Register the function that actually performs the sync work
   * (e.g. launching a hidden WebView, injecting scripts, parsing HTML).
   * The engine only manages the queue — the executor does the real work.
   */
  setExecutor(executor: SyncExecutor | null): number | null {
    if (!executor) {
      this.clearExecutor();
      return null;
    }

    const id = ++this.executorSequence;
    this.executorRecord = { id, execute: executor };
    return id;
  }

  clearExecutor(executorId?: number): void {
    if (!this.executorRecord) return;
    if (executorId !== undefined && this.executorRecord.id !== executorId) return;

    const activeWasOwnedByExecutor =
      this.activeRequest !== null && this.activeExecutorId === this.executorRecord.id;

    this.executorRecord = null;

    if (activeWasOwnedByExecutor && this.activeRequest) {
      const request = this.activeRequest;
      this.activeRequest = null;
      this.activeExecutorId = null;
      this.clearActiveTimeout();
      request.reject(new Error('Sync executor became unavailable. Shared scraper was unmounted.'));
      this.scheduleNext();
    }
  }

  isExecutorReady(): boolean {
    return this.executorRecord !== null;
  }

  waitForExecutorReady(timeoutMs = EXECUTOR_READY_TIMEOUT_MS, pollIntervalMs = EXECUTOR_READY_POLL_MS): Promise<void> {
    if (this.isExecutorReady()) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const startedAt = Date.now();

      const poll = () => {
        if (this.isExecutorReady()) {
          resolve();
          return;
        }

        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error('Sync executor not ready. Shared scraper did not mount in time.'));
          return;
        }

        setTimeout(poll, pollIntervalMs);
      };

      poll();
    });
  }

  /**
   * Enqueue a sync request. Returns a Promise that resolves/rejects when
   * the request is processed.
   */
  requestSync(type: SyncType, priority: number = 5): Promise<any> {
    return new Promise((resolve, reject) => {
      const request: SyncRequest = {
        id: this.generateId(type),
        type,
        priority,
        resolve,
        reject,
      };

      this.queue.enqueue(request);
      console.log(`[PccuSyncEngine] Enqueued ${type} (id=${request.id}, priority=${priority}, queue=${this.queue.size})`);

      this.processQueue();
    });
  }

  /**
   * Pause the queue (called automatically when app goes to background).
   */
  pause(reason?: string): void {
    if (this.state === 'paused') return;
    this.state = 'paused';
    this._pausedReason = reason ?? 'app_background';
    this.clearActiveTimeout();
    this.clearProcessingTimer();
    console.log(`[PccuSyncEngine] Paused — reason: ${this._pausedReason}`);
  }

  /**
   * Resume processing (called automatically when app returns to foreground).
   */
  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'idle';
    this._pausedReason = null;
    console.log('[PccuSyncEngine] Resumed');
    this.processQueue();
  }

  /**
   * Current engine state.
   */
  getState(): EngineState {
    return this.state;
  }

  /**
   * Number of pending requests in the queue.
   */
  getQueueSize(): number {
    return this.queue.size;
  }

  /**
   * Clear all pending requests. Active request is NOT cancelled.
   */
  clearQueue(): void {
    const count = this.queue.size;
    this.queue.clear();
    console.log(`[PccuSyncEngine] Cleared ${count} pending requests`);
  }

  /**
   * Tear down the engine (remove listeners, clear timers).
   */
  destroy(): void {
    this.clearActiveTimeout();
    this.clearProcessingTimer();
    this.appStateSubscription?.remove();
    this.appStateSubscription = null;
    this.queue.clear();
    this.state = 'idle';
      this.executorRecord = null;
      this.activeRequest = null;
      this.activeExecutorId = null;
  }

  // -----------------------------------------------------------------------
  // Internal — Queue Processing
  // -----------------------------------------------------------------------

  private processQueue(): void {
    if (this.state === 'paused') return;
    if (this.state === 'processing') return;
    if (this.queue.isEmpty) {
      this.state = 'idle';
      return;
    }

    const request = this.queue.dequeue();
    if (!request) return;

    this.state = 'processing';
    this.executeWithTimeout(request);
  }

  private executeWithTimeout(request: SyncRequest): void {
    if (!this.executorRecord) {
      request.reject(new Error('Sync executor not ready. Shared scraper is not mounted yet.'));
      this.scheduleNext();
      return;
    }

    const executorRecord = this.executorRecord;
    this.activeRequest = request;
    this.activeExecutorId = executorRecord.id;

    // Task-level timeout
    this.activeTimeout = setTimeout(() => {
      this.activeTimeout = null;
      this.activeRequest = null;
      this.activeExecutorId = null;
      const error = new Error(`Sync task ${request.id} (${request.type}) timed out after ${TASK_TIMEOUT_MS / 1000}s`);
      request.reject(error);
      console.warn(`[PccuSyncEngine] Timeout — ${request.id}`);
      this.scheduleNext();
    }, TASK_TIMEOUT_MS);

    try {
      const result = executorRecord.execute(request);

      Promise.resolve(result)
        .then((data) => {
          this.clearActiveTimeout();
          if (this.activeRequest?.id === request.id) {
            this.activeRequest = null;
            this.activeExecutorId = null;
          }
          request.resolve(data);
          console.log(`[PccuSyncEngine] Completed ${request.id}`);
          this.scheduleNext();
        })
        .catch((error) => {
          this.clearActiveTimeout();
          if (this.activeRequest?.id === request.id) {
            this.activeRequest = null;
            this.activeExecutorId = null;
          }
          request.reject(error instanceof Error ? error : new Error(String(error)));
          console.error(`[PccuSyncEngine] Error — ${request.id}:`, error);
          this.scheduleNext();
        });
    } catch (error) {
      this.clearActiveTimeout();
      if (this.activeRequest?.id === request.id) {
        this.activeRequest = null;
        this.activeExecutorId = null;
      }
      request.reject(error instanceof Error ? error : new Error(String(error)));
      this.scheduleNext();
    }
  }

  private scheduleNext(): void {
    if (this.state === 'paused') return;

    if (this.queue.isEmpty) {
      this.state = 'idle';
      return;
    }

    // Small delay between tasks to avoid overwhelming the WebView
    this.processingTimer = setTimeout(() => {
      this.processingTimer = null;
      this.processQueue();
    }, PROCESSING_DELAY_MS);
  }

  // -----------------------------------------------------------------------
  // Internal — AppState Listener
  // -----------------------------------------------------------------------

  private setupAppStateListener(): void {
    this.appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        this.pause('app_state_' + nextState);
      } else if (nextState === 'active') {
        this.resume();
      }
    });
  }

  // -----------------------------------------------------------------------
  // Internal — Helpers
  // -----------------------------------------------------------------------

  private clearActiveTimeout(): void {
    if (this.activeTimeout !== null) {
      clearTimeout(this.activeTimeout);
      this.activeTimeout = null;
    }
  }

  private clearProcessingTimer(): void {
    if (this.processingTimer !== null) {
      clearTimeout(this.processingTimer);
      this.processingTimer = null;
    }
  }

  private generateId(type: SyncType): string {
    return `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
