# MyCCU Phase 1 Typed Sync Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the untyped PCCU queue with a typed, generation-safe `SyncCoordinator` while preserving every existing hook, WebView executor, session-transition, and Expo Go behavior behind a compatibility facade.

**Architecture:** `src/core/sync` owns typed contracts, the pure request reducer, a feature-agnostic workflow execution port, deterministic queueing, deadlines, cancellation, and a reactive request snapshot source. `LegacyPccuSyncEngineFacade` adapts the existing singleton API and `GlobalScraperWebView` executor to that core; no feature workflow, repository, parser, navigation branch, or persistence path is extracted in this phase.

**Tech Stack:** TypeScript 5.9, React Native 0.81 AppState, Expo SDK 54, React Native WebView, Jest 29 fake timers, React Native Testing Library, Expo Go.

---

## Phase boundary and prerequisites

Implement this plan only after Phase 0 is merged and verified. Phase 0 supplies these stable inputs:

- `src/core/sync/contracts.ts` already exports `SYNC_KINDS` and `SyncKind`; Task 1 expands that file without changing those names.
- `src/core/sync/webview/protocol.ts` exports `WebViewProtocolIdentity`; the Phase 0 legacy host creates it from `request.id`, a host-local generation, a nonce, and `request.type`.
- `src/core/session/AppSessionCoordinator.ts` consumes `SessionSyncPort` with `blockNewRequests`, `abortActiveAndRejectQueue`, `resetAfterSessionChange`, and `allowNewRequests`.
- `src/composition/appSession.ts` adapts the legacy engine singleton to that port.
- Phase 0 scripts are `lint`, `lint:boundaries`, `format:check`, `coverage:ci`, `export:smoke`, and `verify`; root `typecheck` is strict.

Do not create traffic, grade, schedule, or tutoring workflow implementations here. `WorkflowRegistry.ts` is only the typed execution seam that Phase 2 will populate with pure workflow/host adapters. Keep all current navigation, parsing, retry, storage, and Zustand mutations inside `GlobalScraperWebView.tsx` until the Phase 2 plans.

## Existing behavior that must remain observable

- Lower numeric priority runs first, but an active request is never preempted.
- Schedule and grade bootstrap waits up to eight seconds for a late executor mount and then rehydrates the current storage modules.
- Grade and schedule hooks return `Promise<void>`; traffic returns its current `{ success, snapshot/message, updatedAt }` union; tutoring overview/detail remain `Promise<void>`.
- `silent` suppresses feature loading/error UI but is not placed in the new core command input. The facade may copy it back into the legacy executor options until the tutoring branch is extracted.
- Tutoring overview and detail keep their current hook-level deduplication and cache/force guards. Coordinator coalescing is an additional cross-caller guarantee.
- A WebView unmount releases the PCCU session lease and rejects all active or queued facade callers.
- The Phase 0 `SessionSyncPort` blocks requests during logout/account switching and permits them only after `markAuthenticated()` calls `allowNewRequests()`.

## File responsibility map

**Create:**

- `src/core/sync/requestReducer.ts` — pure, generation-aware lifecycle transitions.
- `src/core/sync/WorkflowRegistry.ts` — feature-agnostic typed execution lookup port.
- `src/core/sync/requestSelectors.ts` — immutable snapshot source types and pure request selectors.
- `src/core/sync/SyncCoordinator.ts` — stable queue, coalescing, generation ownership, deadlines, cancellation, background handling, and subscriptions.
- `src/features/pccu/engine/compat/LegacyPccuExecutionAdapter.ts` — the sole typed-to-legacy executor boundary.
- `src/features/pccu/engine/compat/LegacyPccuSyncEngineFacade.ts` — typed adapter for the old singleton/executor/session APIs.
- `src/composition/sync.ts` — the only production registry/coordinator/facade composition.
- Focused tests under `src/core/sync/__tests__/` and `src/features/pccu/engine/compat/__tests__/`.

**Modify:**

- `src/core/sync/contracts.ts` — expand the Phase 0 kind union into the application contract map, policy, outcome, and stable error types.
- `src/features/pccu/engine/PccuSyncEngine.ts` — become a compatibility re-export only.
- `src/features/pccu/engine/GlobalScraperWebView.tsx` — consume the coordinator generation and typed legacy request; do not move feature branches.
- `src/composition/appSession.ts` — bind `SessionSyncPort` directly to the facade.
- Grade, schedule, traffic, and tutoring sync hooks plus `tutoringFileActions.ts` — call the facade with typed policy intent while retaining current return/store behavior.
- `LoadingScreen.tsx`, `useTrafficData.ts`, and their tests — label bootstrap, automatic, and manual reasons explicitly.
- Existing engine, WebView, hook, warmup, bootstrap, and tutoring file-action tests — preserve compatibility and add lifecycle assertions.
- Phase 0 Jest coverage configuration — enforce at least 90% branches and 80% lines for new `src/core/sync` modules.

### Task 1: Expand the typed synchronization contracts

**Files:**

- Modify: `src/core/sync/contracts.ts`
- Create: `src/core/sync/__tests__/contracts.test.ts`

- [ ] **Step 1: Write the contract and type-rejection tests**

Create `src/core/sync/__tests__/contracts.test.ts`:

```ts
import {
  SYNC_KINDS,
  SyncError,
  type SyncCommand,
  type SyncContractMap,
  type SyncOutcome,
} from '../contracts';

describe('sync contracts', () => {
  it('keeps the seven public sync kinds stable', () => {
    expect(SYNC_KINDS).toEqual([
      'grade',
      'schedule',
      'traffic',
      'tutoring',
      'tutoring-detail',
      'tutoring-download',
      'tutoring-upload',
    ]);
  });

  it('binds each kind to its input at compile time', () => {
    const detail: SyncCommand<'tutoring-detail'> = {
      kind: 'tutoring-detail',
      input: { courseCode: 'CS101' },
      accountScope: 'legacy-session-1',
      resourceKey: 'CS101',
      policy: { priority: 5, reason: 'user', force: false },
    };
    expect(detail.input.courseCode).toBe('CS101');

    // @ts-expect-error tutoring-detail always requires a courseCode
    const invalidDetail: SyncCommand<'tutoring-detail'> = { ...detail, input: undefined };
    expect(invalidDetail).toBeDefined();
  });

  it('keeps outcomes and stable errors presentation-independent', () => {
    const error = SyncError.cancelled('queue_cleared', 'Queued sync was cleared.');
    const outcome: SyncOutcome<SyncContractMap['grade']['output']> = { ok: false, error };

    expect(outcome).toEqual({ ok: false, error });
    expect(error.code).toBe('cancelled');
    expect(error.cancellationReason).toBe('queue_cleared');
    expect(error).toBeInstanceOf(Error);
  });
});
```

- [ ] **Step 2: Run the focused test and strict typecheck to verify red**

Run:

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/core/sync/__tests__/contracts.test.ts
npm.cmd run typecheck
```

Expected: Jest and TypeScript fail because `SyncCommand`, `SyncContractMap`, `SyncOutcome`, and `SyncError` are not exported yet; the failure must not be a fixture or environment error.

- [ ] **Step 3: Replace `contracts.ts` with the complete typed contract surface**

```ts
export const SYNC_KINDS = [
  'grade',
  'schedule',
  'traffic',
  'tutoring',
  'tutoring-detail',
  'tutoring-download',
  'tutoring-upload',
] as const;

export type SyncKind = (typeof SYNC_KINDS)[number];
export type SyncReason = 'user' | 'bootstrap' | 'warmup';

export type SyncPolicy = Readonly<{
  priority: number;
  reason: SyncReason;
  force: boolean;
}>;

export type SyncErrorCode =
  | 'auth'
  | 'navigation'
  | 'protocol'
  | 'parse'
  | 'storage'
  | 'timeout'
  | 'cancelled'
  | 'unsupported';

export type SyncCancellationReason =
  | 'queue_cleared'
  | 'session_transition'
  | 'executor_unmounted'
  | 'coordinator_destroyed'
  | 'app_background';

export type SyncTimeoutKind = 'hard' | 'idle';

export class SyncError extends Error {
  readonly code: SyncErrorCode;
  readonly retryable: boolean;
  readonly cancellationReason?: SyncCancellationReason;
  readonly timeoutKind?: SyncTimeoutKind;

  constructor(
    code: SyncErrorCode,
    message: string,
    options: {
      retryable?: boolean;
      cancellationReason?: SyncCancellationReason;
      timeoutKind?: SyncTimeoutKind;
    } = {},
  ) {
    super(message);
    this.name = 'SyncError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.cancellationReason = options.cancellationReason;
    this.timeoutKind = options.timeoutKind;
    Object.setPrototypeOf(this, SyncError.prototype);
  }

  static cancelled(reason: SyncCancellationReason, message: string): SyncError {
    return new SyncError('cancelled', message, { cancellationReason: reason });
  }

  static timeout(kind: SyncTimeoutKind, message: string): SyncError {
    return new SyncError('timeout', message, { retryable: true, timeoutKind: kind });
  }
}

export function toSyncError(error: unknown, fallbackCode: SyncErrorCode = 'unsupported'): SyncError {
  if (error instanceof SyncError) return error;
  if (error instanceof Error) return new SyncError(fallbackCode, error.message);
  return new SyncError(fallbackCode, String(error));
}

export type GradeSyncPayload = Readonly<{ semestersCount: number | null }>;
export type ScheduleSyncPayload = Readonly<{ coursesCount: number | null }>;
export type TrafficSyncPayload = Readonly<{
  counts: Readonly<{ downhill: number; uphill: number }> | null;
}>;
export type TutoringOverviewPayload = Readonly<{
  coursesCount: number | null;
  pendingAssignmentsCount: number | null;
}>;
export type TutoringCourseDetailPayload = Readonly<{ courseCode: string }>;

export type TutoringDownloadCommand = Readonly<{
  courseCode: string;
  kind: 'announcement' | 'material' | 'assignment' | 'submitted';
  fileName?: string;
  downloadUrl?: string;
  targetNo?: number | null;
  serialNo?: number | null;
  homeSn?: number | null;
}>;

export type TutoringDownloadResult = Readonly<{
  fileName: string;
  mimeType: string;
  base64: string;
}>;

export type TutoringUploadCommand = Readonly<{
  courseCode: string;
  homeSn: number;
  fileName: string;
  mimeType: string;
  base64: string;
}>;

export type TutoringUploadResult = Readonly<{ message: string }>;

export interface SyncContractMap {
  grade: { input: undefined; output: GradeSyncPayload };
  schedule: { input: undefined; output: ScheduleSyncPayload };
  traffic: { input: undefined; output: TrafficSyncPayload };
  tutoring: { input: undefined; output: TutoringOverviewPayload };
  'tutoring-detail': {
    input: { courseCode: string };
    output: TutoringCourseDetailPayload;
  };
  'tutoring-download': {
    input: TutoringDownloadCommand;
    output: TutoringDownloadResult;
  };
  'tutoring-upload': {
    input: TutoringUploadCommand;
    output: TutoringUploadResult;
  };
}

export type SyncInput<K extends SyncKind> = SyncContractMap[K]['input'];
export type SyncOutput<K extends SyncKind> = SyncContractMap[K]['output'];

export type SyncCommand<K extends SyncKind> = Readonly<{
  kind: K;
  input: SyncInput<K>;
  accountScope: string;
  resourceKey: string;
  policy: SyncPolicy;
}>;

export type SyncOutcome<T> =
  | { ok: true; data: T; updatedAt: number }
  | { ok: false; error: SyncError };
```

- [ ] **Step 4: Run the contract test and typecheck to verify green**

Run the two commands from Step 2.

Expected: the focused suite passes and strict TypeScript exits 0, including the intentional `@ts-expect-error` assertion.

- [ ] **Step 5: Commit the contract map**

```powershell
git add src/core/sync/contracts.ts src/core/sync/__tests__/contracts.test.ts
git commit -m "feat(sync): add typed sync contracts"
```

### Task 2: Add the pure generation-aware request reducer

**Files:**

- Create: `src/core/sync/requestReducer.ts`
- Create: `src/core/sync/__tests__/requestReducer.test.ts`

- [ ] **Step 1: Write failing reducer transition tests**

Create `src/core/sync/__tests__/requestReducer.test.ts` with tests for the complete legal path, stale generation events, requeue/new generation, queued cancellation, and terminal idempotence:

```ts
import { SyncError } from '../contracts';
import { requestReducer } from '../requestReducer';

describe('requestReducer', () => {
  it('moves through the request lifecycle and records one terminal state', () => {
    const queued = requestReducer(undefined, {
      type: 'queued', requestId: 'r1', kind: 'schedule', sequence: 1, at: 10,
    });
    const active = requestReducer(queued, { type: 'activated', generation: 1, at: 20 });
    const navigating = requestReducer(active, {
      type: 'progress', generation: 1, phase: 'navigating', at: 30,
    });
    const succeeded = requestReducer(navigating, { type: 'succeeded', generation: 1, at: 40 });

    expect(succeeded).toMatchObject({
      requestId: 'r1', phase: 'succeeded', generation: 1, attempt: 1, finishedAt: 40,
    });
    expect(requestReducer(succeeded, {
      type: 'failed', generation: 1, error: new SyncError('parse', 'late'), at: 50,
    })).toBe(succeeded);
  });

  it('ignores progress and completion from a stale generation', () => {
    const queued = requestReducer(undefined, {
      type: 'queued', requestId: 'r2', kind: 'grade', sequence: 2, at: 10,
    });
    const first = requestReducer(queued, { type: 'activated', generation: 4, at: 20 });
    const requeued = requestReducer(first, { type: 'requeued', generation: 4, at: 30 });
    const second = requestReducer(requeued, { type: 'activated', generation: 5, at: 40 });

    expect(requestReducer(second, {
      type: 'progress', generation: 4, phase: 'committing', at: 50,
    })).toBe(second);
    expect(requestReducer(second, { type: 'succeeded', generation: 4, at: 60 })).toBe(second);
    expect(second).toMatchObject({ phase: 'active', generation: 5, attempt: 2 });
  });

  it('cancels a queued request without inventing a generation', () => {
    const queued = requestReducer(undefined, {
      type: 'queued', requestId: 'r3', kind: 'traffic', sequence: 3, at: 10,
    });
    const error = SyncError.cancelled('queue_cleared', 'cleared');
    const cancelled = requestReducer(queued, {
      type: 'cancelled', generation: null, error, at: 20,
    });

    expect(cancelled).toMatchObject({ phase: 'cancelled', generation: null, errorCode: 'cancelled' });
  });
});
```

- [ ] **Step 2: Run the reducer suite to verify red**

Run:

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/core/sync/__tests__/requestReducer.test.ts
```

Expected: FAIL because `requestReducer.ts` does not exist.

- [ ] **Step 3: Implement the reducer as a complete pure module**

Create `src/core/sync/requestReducer.ts`:

```ts
import type { SyncError, SyncErrorCode, SyncKind } from './contracts';

export type SyncRequestPhase =
  | 'queued'
  | 'active'
  | 'navigating'
  | 'extracting'
  | 'validating'
  | 'committing'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type SyncRequestState = Readonly<{
  requestId: string;
  kind: SyncKind;
  sequence: number;
  phase: SyncRequestPhase;
  generation: number | null;
  attempt: number;
  createdAt: number;
  queuedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  errorCode: SyncErrorCode | null;
}>;

export type SyncRequestEvent =
  | { type: 'queued'; requestId: string; kind: SyncKind; sequence: number; at: number }
  | { type: 'activated'; generation: number; at: number }
  | {
      type: 'progress';
      generation: number;
      phase: 'navigating' | 'extracting' | 'validating' | 'committing';
      at: number;
    }
  | { type: 'requeued'; generation: number; at: number }
  | { type: 'succeeded'; generation: number; at: number }
  | { type: 'failed'; generation: number; error: SyncError; at: number }
  | { type: 'cancelled'; generation: number | null; error: SyncError; at: number };

const terminal = new Set<SyncRequestPhase>(['succeeded', 'failed', 'cancelled']);
const progressRank: Record<'active' | 'navigating' | 'extracting' | 'validating' | 'committing', number> = {
  active: 0,
  navigating: 1,
  extracting: 2,
  validating: 3,
  committing: 4,
};

export function requestReducer(
  state: SyncRequestState | undefined,
  event: SyncRequestEvent,
): SyncRequestState | undefined {
  if (!state) {
    if (event.type !== 'queued') return undefined;
    return {
      requestId: event.requestId,
      kind: event.kind,
      sequence: event.sequence,
      phase: 'queued',
      generation: null,
      attempt: 0,
      createdAt: event.at,
      queuedAt: event.at,
      startedAt: null,
      finishedAt: null,
      errorCode: null,
    };
  }

  if (terminal.has(state.phase) || event.type === 'queued') return state;

  if (event.type === 'activated') {
    if (state.phase !== 'queued') return state;
    return {
      ...state,
      phase: 'active',
      generation: event.generation,
      attempt: state.attempt + 1,
      startedAt: event.at,
      finishedAt: null,
      errorCode: null,
    };
  }

  if (event.type === 'cancelled' && state.phase === 'queued') {
    if (event.generation !== null) return state;
    return { ...state, phase: 'cancelled', finishedAt: event.at, errorCode: event.error.code };
  }

  if (state.generation === null || event.generation !== state.generation) return state;

  if (event.type === 'progress') {
    if (!(state.phase in progressRank)) return state;
    const current = progressRank[state.phase as keyof typeof progressRank];
    if (progressRank[event.phase] < current) return state;
    return { ...state, phase: event.phase };
  }

  if (event.type === 'requeued') {
    return { ...state, phase: 'queued', generation: null, queuedAt: event.at, startedAt: null };
  }

  if (event.type === 'succeeded') {
    return { ...state, phase: 'succeeded', finishedAt: event.at, errorCode: null };
  }

  if (event.type === 'failed') {
    return { ...state, phase: 'failed', finishedAt: event.at, errorCode: event.error.code };
  }

  return { ...state, phase: 'cancelled', finishedAt: event.at, errorCode: event.error.code };
}
```

- [ ] **Step 4: Run reducer tests and typecheck**

Run:

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/core/sync/__tests__/requestReducer.test.ts
npm.cmd run typecheck
```

Expected: the reducer suite passes and TypeScript exits 0.

- [ ] **Step 5: Commit the reducer**

```powershell
git add src/core/sync/requestReducer.ts src/core/sync/__tests__/requestReducer.test.ts
git commit -m "feat(sync): add request lifecycle reducer"
```

### Task 3: Define the workflow execution port and reactive selectors

**Files:**

- Create: `src/core/sync/WorkflowRegistry.ts`
- Create: `src/core/sync/requestSelectors.ts`
- Create: `src/core/sync/__tests__/requestSelectors.test.ts`
- Create: `src/core/sync/__tests__/WorkflowRegistry.test.ts`

- [ ] **Step 1: Write the selector test first**

```ts
import type { SyncRequestState } from '../requestReducer';
import {
  createEmptyRequestSnapshot,
  selectActiveRequest,
  selectLatestRequestForKind,
  selectRequestById,
} from '../requestSelectors';

describe('request selectors', () => {
  it('selects immutable request state without feature-store knowledge', () => {
    const schedule: SyncRequestState = {
      requestId: 'schedule-1', kind: 'schedule', sequence: 1, phase: 'active',
      generation: 8, attempt: 1, createdAt: 10, queuedAt: 10, startedAt: 20,
      finishedAt: null, errorCode: null,
    };
    const snapshot = { version: 1, requests: new Map([[schedule.requestId, schedule]]) };

    expect(selectRequestById(snapshot, 'schedule-1')).toBe(schedule);
    expect(selectActiveRequest(snapshot)).toBe(schedule);
    expect(selectLatestRequestForKind(snapshot, 'schedule')).toBe(schedule);
    expect(createEmptyRequestSnapshot().requests.size).toBe(0);
  });
});
```

In `WorkflowRegistry.test.ts`, register a typed fake Grade adapter, assert `has('grade')` and `resolve('grade')`, and assert that registering a second Grade adapter throws `workflow_adapter_already_registered:grade`. Then call `replace(replacement)` and assert it returns the original and future resolution returns the replacement; this explicit method is the Phase 2 strangler cutover seam. The fake adapter must return `WorkflowExecutionResult<SyncOutput<'grade'>>`; do not use `any` or a casted object literal.

- [ ] **Step 2: Run the selector test to verify red**

Run `npm.cmd test -- --runInBand --runTestsByPath src/core/sync/__tests__/requestSelectors.test.ts`.

Expected: FAIL because `requestSelectors.ts` does not exist.

- [ ] **Step 3: Create the registry port**

Create `src/core/sync/WorkflowRegistry.ts` exactly as follows. The name `WorkflowExecutionAdapter` is intentional: Phase 2 will adapt a pure `SyncWorkflow` plus the WebView host to this port, so this phase does not pretend the legacy executor is already a feature workflow.

```ts
import type { SyncInput, SyncKind, SyncOutput, SyncPolicy } from './contracts';
import type { SyncRequestPhase } from './requestReducer';

export type WorkflowExecutionResult<T> = Readonly<{ data: T; updatedAt: number }>;

export type WorkflowExecutionContext = Readonly<{
  requestId: string;
  kind: SyncKind;
  generation: number;
  policy: SyncPolicy;
  signal: AbortSignal;
  heartbeat: () => void;
  transition: (
    phase: Extract<SyncRequestPhase, 'navigating' | 'extracting' | 'validating' | 'committing'>,
  ) => void;
}>;

export interface WorkflowExecutionAdapter<K extends SyncKind> {
  readonly kind: K;
  execute(
    input: SyncInput<K>,
    context: WorkflowExecutionContext,
  ): Promise<WorkflowExecutionResult<SyncOutput<K>>>;
}

export class WorkflowRegistry {
  private readonly adapters = new Map<SyncKind, WorkflowExecutionAdapter<SyncKind>>();

  register<K extends SyncKind>(adapter: WorkflowExecutionAdapter<K>): void {
    if (this.adapters.has(adapter.kind)) {
      throw new Error(`workflow_adapter_already_registered:${adapter.kind}`);
    }
    this.adapters.set(adapter.kind, adapter as WorkflowExecutionAdapter<SyncKind>);
  }

  resolve<K extends SyncKind>(kind: K): WorkflowExecutionAdapter<K> | undefined {
    return this.adapters.get(kind) as WorkflowExecutionAdapter<K> | undefined;
  }

  replace<K extends SyncKind>(adapter: WorkflowExecutionAdapter<K>): WorkflowExecutionAdapter<K> | undefined {
    const previous = this.resolve(adapter.kind);
    this.adapters.set(adapter.kind, adapter as WorkflowExecutionAdapter<SyncKind>);
    return previous;
  }

  has(kind: SyncKind): boolean {
    return this.adapters.has(kind);
  }
}
```

- [ ] **Step 4: Create the immutable snapshot and selector module**

```ts
import type { SyncKind } from './contracts';
import type { SyncRequestState } from './requestReducer';

export type SyncRequestSnapshot = Readonly<{
  version: number;
  requests: ReadonlyMap<string, SyncRequestState>;
}>;

export interface SyncRequestStateSource {
  getSnapshot(): SyncRequestSnapshot;
  subscribe(listener: () => void): () => void;
}

export const createEmptyRequestSnapshot = (): SyncRequestSnapshot => ({
  version: 0,
  requests: new Map(),
});

export const selectRequestById = (
  snapshot: SyncRequestSnapshot,
  requestId: string,
): SyncRequestState | undefined => snapshot.requests.get(requestId);

export const selectActiveRequest = (
  snapshot: SyncRequestSnapshot,
): SyncRequestState | undefined =>
  [...snapshot.requests.values()].find((request) =>
    ['active', 'navigating', 'extracting', 'validating', 'committing'].includes(request.phase),
  );

export const selectLatestRequestForKind = (
  snapshot: SyncRequestSnapshot,
  kind: SyncKind,
): SyncRequestState | undefined =>
  [...snapshot.requests.values()]
    .filter((request) => request.kind === kind)
    .sort((left, right) => right.sequence - left.sequence)[0];
```

- [ ] **Step 5: Run the focused tests and typecheck**

Run:

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/core/sync/__tests__/requestSelectors.test.ts src/core/sync/__tests__/WorkflowRegistry.test.ts
npm.cmd run typecheck
```

Expected: PASS and exit 0.

- [ ] **Step 6: Commit the typed registry seam and selectors**

```powershell
git add src/core/sync/WorkflowRegistry.ts src/core/sync/requestSelectors.ts src/core/sync/__tests__/requestSelectors.test.ts src/core/sync/__tests__/WorkflowRegistry.test.ts
git commit -m "feat(sync): add workflow port and request selectors"
```

### Task 4: Build stable priority/FIFO queueing and background coalescing

**Files:**

- Create: `src/core/sync/SyncCoordinator.ts`
- Create: `src/core/sync/__tests__/SyncCoordinator.queue.test.ts`

- [ ] **Step 1: Write deterministic queue tests with an injected fake registry**

The test file must create deferred adapter results and assert all of these cases in separate tests:

```ts
it('does not preempt active work and orders queued work by priority then FIFO', async () => {
  const first = coordinator.request(command('grade', 5, 'user'));
  const warmup = coordinator.request(command('tutoring', 8, 'warmup'));
  const user = coordinator.request(command('schedule', 1, 'user'));

  expect(startedKinds).toEqual(['grade']);
  deferred.grade.resolve(result({ semestersCount: 1 }, 100));
  await flushMicrotasks();
  expect(startedKinds).toEqual(['grade', 'schedule']);
  deferred.schedule.resolve(result({ coursesCount: 2 }, 200));
  await flushMicrotasks();
  expect(startedKinds).toEqual(['grade', 'schedule', 'tutoring']);
  deferred.tutoring.resolve(result({ coursesCount: 3, pendingAssignmentsCount: 1 }, 300));

  await expect(Promise.all([first, user, warmup])).resolves.toHaveLength(3);
});

it('preserves FIFO for equal priority', async () => {
  const blocker = coordinator.request(command('grade', 1, 'user'));
  const schedule = coordinator.request(command('schedule', 5, 'user'));
  const traffic = coordinator.request(command('traffic', 5, 'user'));
  deferred.grade.resolve(result({ semestersCount: 1 }, 100));
  await flushMicrotasks();
  expect(startedKinds).toEqual(['grade', 'schedule']);
  deferred.schedule.resolve(result({ coursesCount: 1 }, 200));
  await flushMicrotasks();
  expect(startedKinds).toEqual(['grade', 'schedule', 'traffic']);
  deferred.traffic.resolve(result({ counts: null }, 300));
  await Promise.all([blocker, schedule, traffic]);
});

it('coalesces only non-forced background requests with the same full key', async () => {
  const left = coordinator.request(command('tutoring-detail', 6, 'warmup', {
    input: { courseCode: 'CS101' }, accountScope: 'scope-a', resourceKey: 'CS101',
  }));
  const same = coordinator.request(command('tutoring-detail', 6, 'warmup', {
    input: { courseCode: 'CS101' }, accountScope: 'scope-a', resourceKey: 'CS101',
  }));
  const otherResource = coordinator.request(command('tutoring-detail', 6, 'warmup', {
    input: { courseCode: 'CS102' }, accountScope: 'scope-a', resourceKey: 'CS102',
  }));

  expect(same).toBe(left);
  expect(otherResource).not.toBe(left);
  expect(registry.executeCount('tutoring-detail')).toBe(1);
});
```

The shared test helpers must use `unknown`, never `any`, and must include a forced user assertion showing `force: true` returns a distinct promise even when the other key fields match.

- [ ] **Step 2: Run the queue suite to verify red**

Run `npm.cmd test -- --runInBand --runTestsByPath src/core/sync/__tests__/SyncCoordinator.queue.test.ts`.

Expected: FAIL because `SyncCoordinator.ts` does not exist.

- [ ] **Step 3: Implement the coordinator queue and public typed request method**

Create `SyncCoordinator.ts` with these exact public options and methods:

```ts
export type SyncCoordinatorOptions = Readonly<{
  registry: WorkflowRegistry;
  appState?: AppStatePort;
  now?: () => number;
  createRequestId?: (kind: SyncKind, sequence: number) => string;
  hardTimeoutMs?: number;
  idleTimeoutMs?: number;
}>;

export class SyncCoordinator implements SyncRequestStateSource {
  constructor(options: SyncCoordinatorOptions);
  request<K extends SyncKind>(command: SyncCommand<K>): Promise<SyncOutcome<SyncOutput<K>>>;
  getSnapshot(): SyncRequestSnapshot;
  subscribe(listener: () => void): () => void;
  getQueueSize(): number;
  getState(): 'idle' | 'paused' | 'processing';
}
```

Use one internal erased boundary, never `any` or `Record<string, unknown>`:

```ts
type InternalRequest = {
  requestId: string;
  kind: SyncKind;
  policy: SyncPolicy;
  sequence: number;
  coalescingKey: string | null;
  backgroundRequeues: number;
  promise: Promise<SyncOutcome<unknown>>;
  run(context: WorkflowExecutionContext): Promise<WorkflowExecutionResult<unknown>>;
  resolve(outcome: SyncOutcome<unknown>): void;
  reject(error: SyncError): void;
};
```

The generic `request()` closure resolves the correct adapter before erasing only its result for heterogeneous queue storage:

```ts
const run = async (context: WorkflowExecutionContext): Promise<WorkflowExecutionResult<unknown>> => {
  const adapter = this.registry.resolve(command.kind);
  if (!adapter) {
    throw new SyncError('unsupported', `No sync workflow is registered for ${command.kind}.`);
  }
  const execution = await adapter.execute(command.input, context);
  return { data: execution.data as unknown, updatedAt: execution.updatedAt };
};
```

Generate a coalescing key only when `policy.reason !== 'user' && !policy.force`:

```ts
private coalescingKey<K extends SyncKind>(command: SyncCommand<K>): string | null {
  if (command.policy.reason === 'user' || command.policy.force) return null;
  return [command.accountScope, command.kind, command.resourceKey].join('\u0000');
}
```

Before activation, sort the queue without relying on heap stability:

```ts
private enqueue(entry: InternalRequest): void {
  this.queue.push(entry);
  this.queue.sort((left, right) =>
    left.policy.priority - right.policy.priority || left.sequence - right.sequence,
  );
}
```

Activation must increment one monotonic coordinator generation, create one `AbortController`, dispatch `activated`, and call only the resolved adapter. Success/failure handlers must first check both `requestId` and `generation`; stale handlers return without clearing current state. Workflow exceptions become `{ ok: false, error: toSyncError(error) }`; they do not escape from the typed core.

- [ ] **Step 4: Publish immutable reducer snapshots from every accepted transition**

Use copy-on-write maps so `getSnapshot()` stays referentially stable between transitions and subscribers can later be consumed safely by `useSyncExternalStore`:

```ts
private dispatch(requestId: string, event: SyncRequestEvent): void {
  const previous = this.snapshot.requests.get(requestId);
  const next = requestReducer(previous, event);
  if (!next || next === previous) return;

  const requests = new Map(this.snapshot.requests);
  requests.set(requestId, next);
  this.snapshot = { version: this.snapshot.version + 1, requests };
  for (const listener of this.listeners) listener();
}
```

On terminal settlement, remove the matching coalescing entry, clear `active`, settle exactly once, and immediately drain the next queued item. Do not add the legacy 300 ms inter-request timer; the legacy executor releases its session lease before its promise microtask settles.

- [ ] **Step 5: Run queue, reducer, selector, and type tests**

Run:

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/core/sync/__tests__/SyncCoordinator.queue.test.ts src/core/sync/__tests__/requestReducer.test.ts src/core/sync/__tests__/requestSelectors.test.ts
npm.cmd run typecheck
```

Expected: all focused suites pass; TypeScript exits 0; no production `Promise<any>` or untyped options exist in `src/core/sync`.

- [ ] **Step 6: Commit stable queueing and coalescing**

```powershell
git add src/core/sync/SyncCoordinator.ts src/core/sync/__tests__/SyncCoordinator.queue.test.ts
git commit -m "feat(sync): add stable coordinator queue"
```

### Task 5: Separate hard and idle deadlines and ignore late settlement

**Files:**

- Modify: `src/core/sync/SyncCoordinator.ts`
- Create: `src/core/sync/__tests__/SyncCoordinator.timeout.test.ts`

- [ ] **Step 1: Write fake-timer tests for both clocks and stale completion**

Use `hardTimeoutMs: 100` and `idleTimeoutMs: 40` in the test coordinator. Add these deterministic cases:

```ts
it('heartbeats extend idle time but never the hard deadline', async () => {
  const pending = coordinator.request(scheduleCommand);
  jest.advanceTimersByTime(35);
  registry.context('schedule').heartbeat();
  jest.advanceTimersByTime(35);
  registry.context('schedule').heartbeat();
  jest.advanceTimersByTime(30);

  await expect(pending).resolves.toMatchObject({
    ok: false,
    error: { code: 'timeout', timeoutKind: 'hard' },
  });
  expect(registry.signal('schedule').aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});

it('fails on idle timeout when no heartbeat arrives', async () => {
  const pending = coordinator.request(scheduleCommand);
  jest.advanceTimersByTime(40);
  await expect(pending).resolves.toMatchObject({
    ok: false,
    error: { code: 'timeout', timeoutKind: 'idle' },
  });
});

it('ignores a timed-out generation that settles after the next request starts', async () => {
  const stale = coordinator.request(scheduleCommand);
  jest.advanceTimersByTime(40);
  await stale;

  const current = coordinator.request(gradeCommand);
  const currentGeneration = registry.context('grade').generation;
  deferred.schedule.resolve(result({ coursesCount: 1 }, 50));
  await flushMicrotasks();

  expect(selectActiveRequest(coordinator.getSnapshot())?.generation).toBe(currentGeneration);
  jest.advanceTimersByTime(40);
  await expect(current).resolves.toMatchObject({
    ok: false,
    error: { code: 'timeout', timeoutKind: 'idle' },
  });
  expect(jest.getTimerCount()).toBe(0);
});
```

- [ ] **Step 2: Run the timeout suite to verify red**

Run `npm.cmd test -- --runInBand --runTestsByPath src/core/sync/__tests__/SyncCoordinator.timeout.test.ts`.

Expected: the first request remains pending or the assertions fail because deadlines are not implemented.

- [ ] **Step 3: Add generation-owned timer records**

Use separate handles on the active execution:

```ts
type TimerHandle = ReturnType<typeof setTimeout>;

type ActiveExecution = {
  entry: InternalRequest;
  generation: number;
  controller: AbortController;
  hardTimer: TimerHandle | null;
  idleTimer: TimerHandle | null;
};

private readonly hardTimeoutMs: number;
private readonly idleTimeoutMs: number;
```

Default `hardTimeoutMs` to `120_000` and `idleTimeoutMs` to `30_000`. Start both only on activation. The context heartbeat calls `refreshIdleTimeout(active)`; it never touches `hardTimer`.

- [ ] **Step 4: Implement guarded deadline callbacks**

```ts
private isCurrent(active: ActiveExecution): boolean {
  return this.active?.entry.requestId === active.entry.requestId
    && this.active.generation === active.generation;
}

private refreshIdleTimeout(active: ActiveExecution): void {
  if (!this.isCurrent(active)) return;
  if (active.idleTimer) clearTimeout(active.idleTimer);
  active.idleTimer = setTimeout(() => this.timeout(active, 'idle'), this.idleTimeoutMs);
}

private timeout(active: ActiveExecution, kind: 'hard' | 'idle'): void {
  if (!this.isCurrent(active)) return;
  const error = SyncError.timeout(
    kind,
    `Sync request ${active.entry.requestId} exceeded its ${kind} timeout.`,
  );
  active.controller.abort(error);
  this.finishFailure(active, error);
}

private clearTimers(active: ActiveExecution): void {
  if (active.hardTimer) clearTimeout(active.hardTimer);
  if (active.idleTimer) clearTimeout(active.idleTimer);
  active.hardTimer = null;
  active.idleTimer = null;
}
```

`finishSuccess` and `finishFailure` must call `isCurrent` before `clearTimers`; this is the late-settlement defense that prevents an old callback from clearing a newer generation's clocks.

- [ ] **Step 5: Run timeout, queue, and strict type tests**

Run:

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/core/sync/__tests__/SyncCoordinator.timeout.test.ts src/core/sync/__tests__/SyncCoordinator.queue.test.ts
npm.cmd run typecheck
```

Expected: both suites pass, both timeout variants are typed failures, and every terminal test reports zero timers.

- [ ] **Step 6: Commit deadline handling**

```powershell
git add src/core/sync/SyncCoordinator.ts src/core/sync/__tests__/SyncCoordinator.timeout.test.ts
git commit -m "feat(sync): add hard and idle deadlines"
```

### Task 6: Make clear, session transition, unmount, and destroy settle every caller

**Files:**

- Modify: `src/core/sync/SyncCoordinator.ts`
- Create: `src/core/sync/__tests__/SyncCoordinator.lifecycle.test.ts`

- [ ] **Step 1: Write cancellation settlement tests**

Create separate tests that assert:

```ts
await expect(queuedAfterClear).rejects.toMatchObject({
  code: 'cancelled', cancellationReason: 'queue_cleared',
});
await expect(activeAfterSessionTransition).rejects.toMatchObject({
  code: 'cancelled', cancellationReason: 'session_transition',
});
await expect(queuedAfterExecutorUnmount).rejects.toMatchObject({
  code: 'cancelled', cancellationReason: 'executor_unmounted',
});
await expect(activeAfterDestroy).rejects.toMatchObject({
  code: 'cancelled', cancellationReason: 'coordinator_destroyed',
});
expect(jest.getTimerCount()).toBe(0);
```

Also assert `clearQueue()` leaves the active request running, blocked requests fail fast, `allowNewRequests()` restores admission, a late adapter resolution after cancellation emits no second snapshot, and `destroy()` rejects both active and queued requests.

- [ ] **Step 2: Run the lifecycle suite to verify red**

Run `npm.cmd test -- --runInBand --runTestsByPath src/core/sync/__tests__/SyncCoordinator.lifecycle.test.ts`.

Expected: FAIL because cancellation APIs are absent.

- [ ] **Step 3: Add exactly-once settlement guards**

Add `settled: boolean` to `InternalRequest` and route all completion through these methods:

```ts
private resolveEntry(entry: InternalRequest, outcome: SyncOutcome<unknown>): void {
  if (entry.settled) return;
  entry.settled = true;
  if (entry.coalescingKey) this.coalesced.delete(entry.coalescingKey);
  entry.resolve(outcome);
}

private rejectEntry(entry: InternalRequest, error: SyncError): void {
  if (entry.settled) return;
  entry.settled = true;
  if (entry.coalescingKey) this.coalesced.delete(entry.coalescingKey);
  entry.reject(error);
}
```

- [ ] **Step 4: Implement the lifecycle API with typed reasons**

Add these public methods:

```ts
blockNewRequests(): void;
allowNewRequests(): void;
clearQueue(reason?: SyncCancellationReason): void;
abortActiveAndRejectQueue(reason: SyncCancellationReason): void;
resetAfterSessionChange(): void;
destroy(): void;
```

Use `queue_cleared` as the default `clearQueue` reason. `abortActiveAndRejectQueue` must abort the current controller, clear both timers, dispatch `cancelled` with the active generation, reject it, cancel every queued entry with `generation: null`, and leave admission state unchanged. `destroy` first marks the coordinator destroyed and blocked, then performs the same operation with `coordinator_destroyed`, clears listeners, and makes all later `request()` calls return an immediately rejected promise.

`resetAfterSessionChange()` is legal only with no active or queued work. It resets the request snapshot and paused flag but deliberately does not reset the monotonic generation counter.

- [ ] **Step 5: Run all coordinator suites**

Run:

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/core/sync/__tests__/SyncCoordinator.queue.test.ts src/core/sync/__tests__/SyncCoordinator.timeout.test.ts src/core/sync/__tests__/SyncCoordinator.lifecycle.test.ts
npm.cmd run typecheck
```

Expected: all tests pass; every cancellation promise settles; timer count returns to zero; strict typecheck exits 0.

- [ ] **Step 6: Commit deterministic cancellation**

```powershell
git add src/core/sync/SyncCoordinator.ts src/core/sync/__tests__/SyncCoordinator.lifecycle.test.ts
git commit -m "feat(sync): settle coordinator cancellation"
```

### Task 7: Implement foreground/background semantics

**Files:**

- Modify: `src/core/sync/SyncCoordinator.ts`
- Create: `src/core/sync/__tests__/SyncCoordinator.background.test.ts`

- [ ] **Step 1: Write the background behavior matrix with fake timers**

Cover these cases explicitly:

1. Active manual and queued manual requests reject immediately with `cancelled/app_background`.
2. Queued bootstrap/warmup requests remain queued while paused.
3. The first background event during active bootstrap/warmup aborts that generation, requeues the same promise once, and foreground activation receives a larger generation.
4. A second background event during the retried generation rejects that promise with `cancelled/app_background`.
5. A promise from the aborted first generation may settle late without changing the retried state or timers.

The key generation assertion is:

```ts
const firstGeneration = registry.context('tutoring').generation;
coordinator.enterBackground();
expect(coordinator.getState()).toBe('paused');
coordinator.enterForeground();
const secondGeneration = registry.context('tutoring').generation;
expect(secondGeneration).toBeGreaterThan(firstGeneration);
expect(pendingWarmup).not.toHaveSettled();
```

Use the suite's local settled flag helper rather than a matcher extension if `not.toHaveSettled()` is unavailable.

- [ ] **Step 2: Run the background suite to verify red**

Run `npm.cmd test -- --runInBand --runTestsByPath src/core/sync/__tests__/SyncCoordinator.background.test.ts`.

Expected: FAIL because `enterBackground` and `enterForeground` do not exist.

- [ ] **Step 3: Add paused queue handling**

Keep React Native outside `core/sync` by adding this port to `SyncCoordinator.ts` and an optional `appState` field to `SyncCoordinatorOptions`:

```ts
export interface AppStatePort {
  current(): 'active' | 'background' | 'inactive' | 'unknown';
  subscribe(listener: (state: 'active' | 'background' | 'inactive' | 'unknown') => void): () => void;
}
```

The constructor subscribes once, treats `background` as `enterBackground()`, treats the transition from a non-active state to `active` as `enterForeground()`, and stores the unsubscribe callback. `destroy()` invokes it exactly once. Tests use a fake port and assert no listener remains after destroy.

```ts
enterBackground(): void {
  if (this.paused || this.destroyed) return;
  this.paused = true;

  for (const entry of [...this.queue]) {
    if (entry.policy.reason === 'user') this.cancelQueued(entry, 'app_background');
  }

  const active = this.active;
  if (!active) return;
  if (active.entry.policy.reason === 'user' || active.entry.backgroundRequeues >= 1) {
    this.cancelActive(active, 'app_background');
    return;
  }

  this.clearTimers(active);
  active.controller.abort(SyncError.cancelled('app_background', 'App moved to background.'));
  this.active = null;
  active.entry.backgroundRequeues += 1;
  active.entry.sequence = ++this.sequence;
  this.dispatch(active.entry.requestId, {
    type: 'requeued', generation: active.generation, at: this.now(),
  });
  this.enqueue(active.entry);
}

enterForeground(): void {
  if (!this.paused || this.destroyed) return;
  this.paused = false;
  this.drain();
}
```

`drain()` must return while paused. The late callback from the aborted generation remains guarded by `isCurrent` and cannot settle the retained promise.

- [ ] **Step 4: Run every coordinator suite and typecheck**

Run:

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/core/sync/__tests__/SyncCoordinator.queue.test.ts src/core/sync/__tests__/SyncCoordinator.timeout.test.ts src/core/sync/__tests__/SyncCoordinator.lifecycle.test.ts src/core/sync/__tests__/SyncCoordinator.background.test.ts
npm.cmd run typecheck
```

Expected: all suites pass with zero leaked timers or unresolved manual callers.

- [ ] **Step 5: Commit background semantics**

```powershell
git add src/core/sync/SyncCoordinator.ts src/core/sync/__tests__/SyncCoordinator.background.test.ts
git commit -m "feat(sync): add background request semantics"
```

### Task 8: Adapt the legacy executor behind the typed coordinator

**Files:**

- Create: `src/features/pccu/engine/compat/LegacyPccuExecutionAdapter.ts`
- Create: `src/features/pccu/engine/compat/LegacyPccuSyncEngineFacade.ts`
- Create: `src/features/pccu/engine/compat/__tests__/LegacyPccuSyncEngineFacade.test.ts`
- Modify: `src/features/pccu/engine/PccuSyncEngine.ts`
- Modify: `src/features/pccu/engine/__tests__/PccuSyncEngine.test.ts`

- [ ] **Step 1: Write compatibility tests before moving the singleton (2-5 minutes)**

Test all seven kinds, default priorities, typed input conversion, executor-ready waiting, executor replacement, unmount rejection, `clearQueue`, session block/reset/allow, and singleton reset. The most important bridge cases are:

```ts
it('maps the legacy tutoring detail option into typed input', async () => {
  executor.resolve({ courseCode: 'CS101' });
  await expect(facade.requestSync('tutoring-detail', 5, {
    courseCode: 'CS101', reason: 'user', force: true,
  })).resolves.toEqual({ courseCode: 'CS101' });

  expect(coordinator.request).toHaveBeenCalledWith(expect.objectContaining({
    kind: 'tutoring-detail',
    input: { courseCode: 'CS101' },
    resourceKey: 'CS101',
    policy: { priority: 5, reason: 'user', force: true },
  }));
});

it('maps a typed cancellation back to one legacy rejection', async () => {
  coordinator.request.mockResolvedValue({
    ok: false,
    error: SyncError.cancelled('executor_unmounted', 'Shared scraper unmounted.'),
  });
  await expect(facade.requestSync('grade')).rejects.toMatchObject({ code: 'cancelled' });
});
```

- [ ] **Step 2: Run facade and old engine tests to verify red (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/pccu/engine/compat/__tests__/LegacyPccuSyncEngineFacade.test.ts src/features/pccu/engine/__tests__/PccuSyncEngine.test.ts
```

Expected: the new compatibility modules do not exist; the existing engine characterization remains green when run alone.

- [ ] **Step 3: Implement the legacy execution adapter (2-5 minutes)**

`LegacyPccuExecutionAdapter` is the sole untyped boundary. It owns the current executor registration/ready promise and exposes one typed adapter per kind to `WorkflowRegistry`:

```ts
export type LegacyExecutorRequest<K extends SyncKind> = Readonly<{
  id: string;
  type: K;
  generation: number;
  input: SyncInput<K>;
  legacyOptions: Readonly<Record<string, unknown>>;
  signal: AbortSignal;
  refreshTimeout(): void;
}>;

export type LegacyExecutor = <K extends SyncKind>(
  request: LegacyExecutorRequest<K>,
) => Promise<SyncOutput<K>>;

export class LegacyPccuExecutionAdapter {
  setExecutor(executor: LegacyExecutor | null): number | null;
  clearExecutor(executorId?: number): void;
  waitForExecutorReady(timeoutMs?: number): Promise<void>;
  createAdapter<K extends SyncKind>(kind: K): WorkflowExecutionAdapter<K>;
  destroy(): void;
}
```

`createAdapter(kind).execute` waits for the currently registered executor, passes the coordinator request ID/generation/signal/heartbeat, and checks the same executor registration ID before accepting settlement. It converts thrown legacy errors with `toSyncError`; a late executor promise after abort is ignored by the coordinator. No other new core or feature file may use `Record<string, unknown>`.

- [ ] **Step 4: Implement the exact legacy public facade (2-5 minutes)**

`LegacyPccuSyncEngineFacade` owns the old method names while delegating queue behavior to `SyncCoordinator`. It must export `SyncType`, `SyncRequest`, `SyncExecutor`, and `EngineState` aliases required by current tests, plus static `installInstance(instance)`, `getInstance()`, and `resetInstance()` methods. `getInstance()` throws `sync_composition_not_installed` until Task 9 installs the production composition; it must never construct a second coordinator implicitly. Map legacy calls as follows:

| Kind | Typed input | Resource key |
|---|---|---|
| grade, schedule, traffic, tutoring | `undefined` | kind |
| tutoring-detail | `{ courseCode }` | course code |
| tutoring-download | validated download fields | course code plus kind plus target/serial/home number |
| tutoring-upload | validated upload fields | course code plus home number plus file name |

Read `reason` only from the exact union `'user' | 'bootstrap' | 'warmup'`; default to `user`. Read `force` only when strictly `true`. The facade rejects missing tutoring fields with `SyncError('protocol', ..., { retryable: false })` before calling the coordinator. Use the temporary account scope returned by `src/composition/sync.ts`; never place the account string in a request ID, resource key, or log.

- [ ] **Step 5: Turn the old file into a compatibility re-export and run green (2-5 minutes)**

Reduce `PccuSyncEngine.ts` to named re-exports from `compat/LegacyPccuSyncEngineFacade.ts`, preserving every current import path. Run:

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/pccu/engine/compat/__tests__/LegacyPccuSyncEngineFacade.test.ts src/features/pccu/engine/__tests__/PccuSyncEngine.test.ts
npm.cmd run typecheck
```

Expected: facade and legacy characterization suites pass; `PccuSyncEngine.ts` contains no queue, timer, AppState, or executor implementation.

- [ ] **Step 6: Commit the compatibility boundary (2-5 minutes)**

```powershell
git add src/features/pccu/engine/compat src/features/pccu/engine/PccuSyncEngine.ts src/features/pccu/engine/__tests__/PccuSyncEngine.test.ts
git commit -m "refactor(sync): adapt legacy engine to coordinator"
```

### Task 9: Compose the coordinator and migrate every caller

**Files:**

- Create: `src/composition/sync.ts`
- Create: `src/composition/__tests__/sync.test.ts`
- Modify: `src/composition/AppCompositionRoot.tsx`
- Modify: `src/composition/appSession.ts`
- Modify: `src/features/pccu/engine/GlobalScraperWebView.tsx`
- Modify: `src/features/grade/hooks/useGradeSync.ts`
- Create: `src/features/grade/hooks/__tests__/useGradeSync.test.tsx`
- Modify: `src/features/schedule/hooks/useScheduleSync.ts`
- Modify: `src/features/traffic/hooks/useTrafficSync.ts`
- Modify: `src/features/tutoring/hooks/useTutoringSync.ts`
- Modify: `src/features/tutoring/services/tutoringFileActions.ts`
- Modify: `src/features/auth/screens/LoadingScreen.tsx`
- Modify: `src/features/tutoring/components/TutoringBackgroundWarmup.tsx`

- [ ] **Step 1: Write composition and caller-intent tests first (2-5 minutes)**

Assert `createSyncComposition()` registers exactly seven legacy adapters, shares one coordinator/facade, tears both down once, and exposes a reactive request source. Update existing hook tests to assert exact policy intent:

- button/screen refresh and file actions: `{ reason: 'user', force: callerValue }`;
- `LoadingScreen` bootstrap: `{ reason: 'bootstrap', force: false }`;
- tutoring background warmup and automatic Traffic refresh: `{ reason: 'warmup', force: false }`.

Keep the current hook return shapes unchanged.

- [ ] **Step 2: Run the integration matrix to verify red (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/composition/__tests__/sync.test.ts src/features/grade/hooks/__tests__/useGradeSync.test.tsx src/features/schedule/hooks/__tests__/useScheduleSync.test.tsx src/features/traffic/__tests__/trafficSync.test.ts src/features/tutoring/hooks/__tests__/useTutoringSync.test.tsx src/features/tutoring/components/__tests__/TutoringBackgroundWarmup.test.tsx
```

Expected: the composition is missing and existing callers do not expose all three typed reasons.

- [ ] **Step 3: Create one production composition (2-5 minutes)**

```ts
export function createSyncComposition(deps: {
  appState: AppStatePort;
  now?: () => number;
  accountScope(): string;
}) {
  const registry = new WorkflowRegistry();
  const legacyAdapter = new LegacyPccuExecutionAdapter();
  const legacyAdapters = new Map(SYNC_KINDS.map((kind) => {
    const adapter = legacyAdapter.createAdapter(kind);
    registry.register(adapter);
    return [kind, adapter] as const;
  }));
  const coordinator = new SyncCoordinator({ registry, appState: deps.appState, now: deps.now });
  const facade = new LegacyPccuSyncEngineFacade(coordinator, legacyAdapter, deps.accountScope);
  LegacyPccuSyncEngineFacade.installInstance(facade);
  return { registry, legacyAdapters, coordinator, facade, requestSource: coordinator, destroy: () => {
    LegacyPccuSyncEngineFacade.resetInstance(facade);
    coordinator.destroy();
    legacyAdapter.destroy();
  }};
}
```

The production singleton uses an opaque in-memory session UUID as the Phase 1 account scope. Phase 0 guarantees it is replaced after logout/account switch; Phase 3 replaces it with the versioned account hash. Export `syncComposition`, `pccuSyncFacade`, and `syncRequestSource` from this file.

- [ ] **Step 4: Bind root and session lifecycle (2-5 minutes)**

`AppCompositionRoot` creates the production composition once and destroys it only on root unmount. `GlobalScraperWebView` registers/clears its executor through `pccuSyncFacade`; its pending request uses the coordinator-provided `generation`, replacing `++protocolGenerationRef.current`. `appSession.ts` implements `SessionSyncPort` with facade block/abort/reset/allow methods, so Phase 0 cleanup semantics stay authoritative.

- [ ] **Step 5: Migrate all call sites without changing their public result (2-5 minutes)**

Call `pccuSyncFacade.requestSync(kind, priority, { ...validatedInput, reason, force })`. Do not expose coordinator phases from hooks yet. Grade, Schedule, Tutoring overview/detail still resolve `void`; Traffic retains its existing success/message/snapshot union; file actions retain current download/upload result/error mapping.

Update source imports to `src/composition/sync` or the compatibility `PccuSyncEngine` re-export only. No production file may construct another coordinator, registry, or facade.

- [ ] **Step 6: Run all caller and lifecycle tests and commit (5-10 minutes)**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/composition/__tests__/sync.test.ts src/features/pccu/engine/__tests__/GlobalScraperWebView.test.tsx src/features/auth/screens/__tests__/bootstrapSync.test.tsx src/features/schedule/hooks/__tests__/useScheduleSync.test.tsx src/features/traffic/__tests__/trafficSync.test.ts src/features/tutoring/hooks/__tests__/useTutoringSync.test.tsx src/features/tutoring/components/__tests__/TutoringBackgroundWarmup.test.tsx
npm.cmd run typecheck
git add src/composition/sync.ts src/composition/__tests__/sync.test.ts src/composition/AppCompositionRoot.tsx src/composition/appSession.ts src/features/pccu/engine/GlobalScraperWebView.tsx src/features/grade/hooks/useGradeSync.ts src/features/schedule/hooks/useScheduleSync.ts src/features/traffic/hooks/useTrafficSync.ts src/features/tutoring/hooks/useTutoringSync.ts src/features/tutoring/services/tutoringFileActions.ts src/features/auth/screens/LoadingScreen.tsx src/features/tutoring/components/TutoringBackgroundWarmup.tsx
git commit -m "refactor(sync): route callers through typed coordinator"
```

### Task 10: Enforce Phase 1 boundaries and pass Expo Go acceptance

**Files:**

- Create: `src/core/sync/__tests__/syncBoundaries.test.ts`
- Modify: `jest.config.js`
- Create: `docs/testing/phase-1-expo-go-checklist.md`
- Create: `docs/verification/myccu-refactor-phase-1.md`

- [ ] **Step 1: Add source-boundary and coverage tests (2-5 minutes)**

The boundary suite must resolve paths from the repository root and assert:

- `src/core/sync/**` imports no `src/features/**`, React, React Native WebView, AsyncStorage, SecureStore, or Zustand;
- `PccuSyncEngine.ts` is a re-export only;
- `LegacyPccuExecutionAdapter.ts` is the only new-core boundary containing `Record<string, unknown>`;
- production has one `new SyncCoordinator`, one `new WorkflowRegistry`, and one `new LegacyPccuSyncEngineFacade`;
- no `Promise<any>` remains in `src/core/sync` or `src/features/pccu/engine/compat`.

Raise Jest collection thresholds for `src/core/sync/**/*.{ts,tsx}` to at least 80% lines and 90% branches without lowering the Phase 0 global ratchet.

- [ ] **Step 2: Run every automated Phase 1 gate (5-15 minutes)**

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run lint:boundaries
npm.cmd run format:check
npm.cmd run coverage:ci
npm.cmd run export:smoke
npm.cmd run verify
```

Expected: every command exits 0; coordinator suites leak no timers or unresolved promises; export includes Android, iOS, and web bundles configured by the Phase 0 smoke command.

- [ ] **Step 3: Complete the Expo Go lifecycle checklist (10-20 minutes)**

Write and execute `docs/testing/phase-1-expo-go-checklist.md`: cold remembered login and bootstrap; manual Grade/Schedule/Traffic/Tutoring refresh; tutoring detail/download/upload; simultaneous refresh taps proving priority/FIFO without active preemption; repeated background Traffic/Tutoring calls proving coalescing; background during manual work with retry; background during bootstrap with one requeue; logout/account switch while active and queued; root navigation away/back causing scraper unmount/remount; no permanent loading state after timeout/cancel.

- [ ] **Step 4: Prove legacy behavior remains callable (2-5 minutes)**

Run:

```powershell
rg -n "class PriorityQueue|TASK_TIMEOUT_MS|PROCESSING_DELAY_MS|Promise<any>" src/features/pccu/engine src/core/sync
rg -n "traffic|grade|schedule|tutoring" src/features/pccu/engine/GlobalScraperWebView.tsx
```

Expected: the first command finds no legacy queue/timer implementation or untyped promise; the second still finds all four legacy orchestration families because workflow extraction begins only in Phase 2.

- [ ] **Step 5: Record sanitized evidence and commit (2-5 minutes)**

Create `docs/verification/myccu-refactor-phase-1.md` with commit SHA, commands, coverage, device OS, Expo Go version, and checklist. Include no account, password, HTML, course content, URL query, file content, or WebView payload.

```powershell
git add src/core/sync/__tests__/syncBoundaries.test.ts jest.config.js docs/testing/phase-1-expo-go-checklist.md docs/verification/myccu-refactor-phase-1.md
git commit -m "docs: record Phase 1 coordinator acceptance"
```

## Completion criteria

- All seven sync kinds have compile-time input/output contracts and typed outcomes.
- Priority/FIFO, coalescing, generation ownership, hard/idle deadlines, late settlement, cancellation, and foreground/background behavior are deterministic and fully settled.
- The old import path is a compatibility re-export; exactly one untyped legacy executor boundary remains and all callers run through the typed coordinator.
- Phase 0 session cleanup directly blocks, aborts, resets, and reopens the new coordinator/facade.
- `core/sync` has no feature, storage, WebView, or presentation dependency and meets its coverage target.
- The complete Phase 1 Expo Go checklist passes before any feature workflow is extracted.
