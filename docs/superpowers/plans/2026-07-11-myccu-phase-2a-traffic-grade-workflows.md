# MyCCU Phase 2A Traffic and Grade Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract Traffic and Grade from `GlobalScraperWebView` into typed, registry-driven workflows whose runtime-decoded events drive pure reducers and whose only browser side effects are executed by `WebViewSessionHost`, while preserving the existing storage and hook behavior in Expo Go.

**Architecture:** Phase 2A keeps the Phase 1 coordinator and compatibility facade as the request entry point. A feature workflow owns navigation decisions, message decoding, retry state, parsing, and typed completion data; `WebViewSessionHost` owns the single physical WebView and interprets only core effect descriptions. Traffic is migrated and accepted first to prove the `WorkflowRegistry` seam, then Grade follows the proven shape; persistence stays in feature application adapters that call the existing storage facades, and no workflow imports AsyncStorage or Zustand.

**Tech Stack:** Expo 54, React Native 0.81, TypeScript 5.9, React 19, `react-native-webview`, Jest 29 with `jest-expo`, React Native Testing Library, Cheerio, existing AsyncStorage facades, Zustand compatibility stores.

---

## Scope and sequencing

This plan implements only Phase 2A from `docs/superpowers/specs/2026-07-11-myccu-refactor-architecture-design.md`:

1. Establish the generic WebView effect-execution seam without changing Schedule or Tutoring behavior.
2. Extract and accept Traffic completely.
3. Run the Traffic automated and Expo Go checkpoint.
4. Extract Grade using the accepted Traffic registry pattern.
5. Remove only the Traffic and Grade branches/imports/state from `GlobalScraperWebView`.

Schedule, Tutoring, account-scoped v2 repositories, cache migration, route decomposition, and screen redesign remain in later plans. Existing `trafficStorage` and `gradeStorage` are deliberately retained as temporary persistence facades. The new workflows return typed data and must not import either storage facade or any Zustand store.

## Phase 1 prerequisite interface

Do not begin Task 1 until Phase 1 is merged. Phase 2A extends the existing coordinator; it does not replace queue, timeout, cancellation, background, or request-snapshot semantics.

The Phase 1 surface is intentionally an execution-adapter seam. `src/core/sync/WorkflowRegistry.ts` exports `WorkflowExecutionContext`, `WorkflowExecutionAdapter<K>`, and one `WorkflowRegistry` class with `register(adapter)`, `replace(adapter)`, `resolve(kind)`, and `has(kind)`. `SyncCoordinator` calls only `resolve(kind).execute(...)`. Task 2 adds the pure WebView workflow model plus a runtime adapter that implements this existing interface.

At the start of this phase, Traffic and Grade outputs are compatibility summaries:

```ts
export type GradeSyncPayload = Readonly<{ semestersCount: number | null }>;
export type TrafficSyncPayload = Readonly<{
  counts: Readonly<{ downhill: number; uphill: number }> | null;
}>;
```

Task 3 changes only `SyncContractMap['traffic']['output']` to the feature-owned `TrafficSnapshot` after that type exists. Task 9 changes only `SyncContractMap['grade']['output']` to the feature-owned `GradeSyncPayload`. The coordinator remains generic and needs no semantic change.

`src/core/sync/webview/protocol.ts` from Phase 0 exports `WebViewProtocolIdentity`, `WebViewEnvelope`, `DecodeResult<T>`, and `decodeWebViewEnvelope`. Phase 2A adds `ValidatedWebViewEnvelope` and event-schema validation without weakening request ID, generation, nonce, kind, current-host, or version checks.

The compatibility facade is authoritative at `src/features/pccu/engine/compat/LegacyPccuSyncEngineFacade.ts`; there is no second facade under `src/core`. New workflow adapters return typed `SyncOutcome` data through that same public surface until their callers migrate.

Run this pre-flight command from the repository root:

```powershell
rg -n "class (SyncCoordinator|WorkflowRegistry)|interface WorkflowExecutionAdapter|class LegacyPccuSyncEngineFacade|WebViewProtocolIdentity" src/core/sync src/features/pccu/engine/compat
```

Expected: exactly one coordinator, one registry, one compatibility facade, and one protocol identity definition. Phase 1 coordinator suites, full verification, export smoke, and Expo Go evidence must already be green.

## Locked file map

### Core and composition

- Create: `src/core/sync/workflow.ts` — pure workflow identity, event, effect, transition, and decoder contracts.
- Create: `src/core/sync/webview/WebViewWorkflowRuntime.ts` — adapts a pure workflow to the Phase 1 `WorkflowExecutionAdapter` and publishes one active host snapshot.
- Create: `src/core/sync/webview/__tests__/WebViewWorkflowRuntime.test.ts` — reducer/session/abort/late-event/runtime-adapter behavior.
- Create: `src/core/sync/webview/WebViewSessionHost.tsx` — owns the single WebView and executes `WorkflowEffect` values only.
- Create: `src/core/sync/webview/__tests__/WebViewSessionHost.test.tsx` — fake-bridge host behavior, identity filtering, timer cleanup, and import-boundary tests.
- Modify: `src/composition/sync.ts` — create one workflow runtime and register its Traffic adapter first; add Grade only after the Traffic checkpoint.
- Modify: `src/composition/AppCompositionRoot.tsx` — inject the registry into the shared scraper controller/host without importing feature storage or stores into core.
- Modify: `src/features/pccu/engine/GlobalScraperWebView.tsx:1-40,104-139,169-344,400-582,589-663,770-819,1102-1119,1149-1261,1306-1436` — retain legacy Schedule/Tutoring orchestration but remove Traffic, then Grade, state and branches.
- Modify: `src/features/pccu/engine/__tests__/GlobalScraperWebView.test.tsx` — keep Schedule/Tutoring characterization and assert extracted kinds route through the registry rather than legacy branches.

### Traffic

- Create: `src/features/traffic/domain/types.ts` — Traffic domain contracts.
- Create: `src/features/traffic/domain/traffic.ts` — pure ETA normalization, arrival normalization, sorting, and selection.
- Create: `src/features/traffic/domain/__tests__/traffic.test.ts` — pure domain behavior.
- Modify: `src/features/traffic/types.ts` — compatibility re-export only.
- Create: `src/features/traffic/infrastructure/sync/trafficProtocol.ts` — runtime decoder for Traffic workflow messages.
- Create: `src/features/traffic/infrastructure/sync/__tests__/trafficProtocol.test.ts` — malformed and valid payload contracts.
- Create: `src/features/traffic/infrastructure/sync/trafficScripts.ts` — migrated extraction builder that emits versioned Traffic envelopes using active identity.
- Create: `src/features/traffic/infrastructure/sync/__tests__/trafficScripts.test.ts` — generated-script envelope and extraction contract.
- Create: `src/features/traffic/infrastructure/sync/trafficWorkflow.ts` — Traffic state type, pure reducer, effect helpers, and `SyncWorkflow<'traffic', ...>` adapter.
- Create: `src/features/traffic/infrastructure/sync/__tests__/trafficWorkflow.test.ts` — deterministic reducer, registry, and protocol-to-terminal-output contracts.
- Delete: `src/features/traffic/sync/trafficScripts.ts` — remove after the migrated builder and Traffic cutover are green.
- Create: `src/features/traffic/application/runTrafficSync.ts` — compatibility application adapter; commits workflow output through `trafficStorage` before returning success.
- Create: `src/features/traffic/application/__tests__/runTrafficSync.test.ts` — storage failure and success ordering.
- Modify: `src/features/traffic/hooks/useTrafficSync.ts` and `src/features/traffic/__tests__/trafficSync.test.ts` — call the application adapter and preserve the current hook result.
- Modify: `src/features/traffic/storage/trafficStorage.ts` — propagate write failures instead of swallowing them.
- Create: `__fixtures__/messages/traffic-rows-valid.json` — stable Traffic decoder fixture.

### Grade

- Create: `src/features/grade/domain/types.ts` — `CourseGrade`, `SemesterGrade`, and `GradeSyncPayload`.
- Create: `src/features/grade/infrastructure/parser/gradeParser.ts` — move `parseGradesFromHtml` out of the PCCU parser.
- Create: `src/features/grade/infrastructure/parser/__tests__/gradeParser.test.ts` — move all Grade parser cases and keep `grade-valid.html` coverage.
- Modify: `src/features/pccu/parsers/pccuScraper.ts:15-33,68-326` and `src/features/pccu/parsers/__tests__/pccuScraper.test.ts` — remove Grade contracts/parser/tests after the new suite is green.
- Create: `src/features/grade/infrastructure/sync/gradeProtocol.ts` and `src/features/grade/infrastructure/sync/__tests__/gradeProtocol.test.ts` — runtime message decoder.
- Modify: `src/features/pccu/sync/pccuSyncScripts.ts:670-744,746-873,1981-2446` and `src/features/pccu/sync/__tests__/pccuSyncScripts.test.ts` — keep shared login/service builders, move robust Grade extraction to a feature file, and emit versioned events.
- Create: `src/features/grade/infrastructure/sync/gradeScripts.ts` and `src/features/grade/infrastructure/sync/__tests__/gradeScripts.test.ts` — Grade extraction builder and its existing script contracts.
- Create: `src/features/grade/infrastructure/sync/gradeWorkflow.ts` — Grade state type, pure reducer, effect helpers, and workflow adapter.
- Create: `src/features/grade/infrastructure/sync/__tests__/gradeWorkflow.test.ts` — reducer and registry contract.
- Create: `src/features/grade/application/runGradeSync.ts` and `src/features/grade/application/__tests__/runGradeSync.test.ts` — existing storage commit followed by store projection in the hook.
- Modify: `src/features/grade/hooks/useGradeSync.ts`, `src/features/grade/storage/gradeStorage.ts`, `src/features/grade/store/useGradeStore.ts`, `src/features/grade/screens/GradeScreenV2.tsx`, `src/features/home/screens/HomeScreen.tsx`, and `app/modal/gradeDetails.tsx` — consume feature-owned domain types and preserve UI behavior.

## Effect and persistence invariants

- `WebViewSessionHost.tsx` may import React, React Native, `react-native-webview`, and `src/core/sync/**`; it may not import `src/features/**`, AsyncStorage, SecureStore, or Zustand.
- A feature reducer is a pure function. It receives `now` from its event and must not call `Date.now`, set timers, access WebView refs, parse JSON, read storage, or update a store.
- A feature runtime decoder accepts `unknown` and returns `DecodeResult<T>`; it must not use a type assertion as validation.
- A workflow creates browser, heartbeat, timer, completion, or failure effects. It does not execute them.
- `runTrafficSync` and `runGradeSync` receive the Phase 1 sync facade as a dependency, await a typed successful output, commit through the existing storage facade, and expose success only after that write resolves.
- `useGradeSync` may continue to publish committed Grade data into the existing Zustand store during Phase 2A; the Grade workflow may not import or call that store.
- Traffic is registered, cut over, tested, and checked in Expo Go before the first Grade production file is changed.

### Task 1: Lock the Phase 1 seam and characterize host-only effect execution

**Files:**
- Create: `src/core/sync/webview/__tests__/WebViewWorkflowRuntime.test.ts`
- Create: `src/core/sync/webview/__tests__/WebViewSessionHost.test.tsx`
- Modify: `src/features/pccu/engine/__tests__/GlobalScraperWebView.test.tsx`

- [ ] **Step 1: Run the Phase 1 prerequisite and baseline tests**

Run:

```powershell
rg -n "class (SyncCoordinator|WorkflowRegistry)|interface WorkflowExecutionAdapter|class LegacyPccuSyncEngineFacade|WebViewProtocolIdentity" src/core/sync src/features/pccu/engine/compat
npm.cmd test -- --runInBand src/core/sync src/features/pccu/engine/__tests__/GlobalScraperWebView.test.tsx
```

Expected: every Phase 1 prerequisite name is found; all core tests and the legacy shared-scraper suite pass with no open timer warning. `SyncWorkflow` and `WebViewWorkflowRuntime` do not exist yet.

- [ ] **Step 2: Write a failing host contract test using a behaviorful fake WebView**

Add this test skeleton; the mock must expose the same imperative methods the real host is allowed to call:

```tsx
const injectJavaScript = jest.fn();
const stopLoading = jest.fn();
const reload = jest.fn();
const propsRef: { current: Record<string, unknown> | null } = { current: null };

jest.mock('react-native-webview', () => {
  const React = require('react');
  return {
    WebView: React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) => {
      propsRef.current = props;
      React.useImperativeHandle(ref, () => ({ injectJavaScript, stopLoading, reload }));
      return null;
    }),
  };
});

it('executes only effects matching the active request identity', () => {
  const identity = { requestId: 'traffic-1', generation: 4, nonce: 'nonce-4', syncKind: 'traffic' as const };
  const { rerender } = render(
    <WebViewSessionHost
      identity={identity}
      effects={[{ ...identity, type: 'inject-java-script', script: 'true;' }]}
      initialUrl="about:blank"
      onEvent={jest.fn()}
      onHeartbeat={jest.fn()}
      onTerminalEffect={jest.fn()}
      sessionDriver={{ ensure: jest.fn(async () => undefined) }}
    />,
  );

  expect(injectJavaScript).toHaveBeenCalledWith('true;');

  rerender(
    <WebViewSessionHost
      identity={identity}
      effects={[{ ...identity, generation: 3, type: 'inject-java-script', script: 'stale;' }]}
      initialUrl="about:blank"
      onEvent={jest.fn()}
      onHeartbeat={jest.fn()}
      onTerminalEffect={jest.fn()}
      sessionDriver={{ ensure: jest.fn(async () => undefined) }}
    />,
  );

  expect(injectJavaScript).not.toHaveBeenCalledWith('stale;');
});
```

- [ ] **Step 3: Add failing timer and unmount assertions**

```tsx
it('turns schedule effects into identity-bound timer events and clears them on unmount', () => {
  jest.useFakeTimers();
  const onEvent = jest.fn();
  const identity = { requestId: 'traffic-2', generation: 5, nonce: 'nonce-5', syncKind: 'traffic' as const };
  const rendered = render(
    <WebViewSessionHost
      identity={identity}
      effects={[{ ...identity, type: 'schedule', token: 'extract-downhill', delayMs: 500 }]}
      initialUrl="about:blank"
      onEvent={onEvent}
      onHeartbeat={jest.fn()}
      onTerminalEffect={jest.fn()}
      sessionDriver={{ ensure: jest.fn(async () => undefined) }}
    />,
  );

  jest.advanceTimersByTime(500);
  expect(onEvent).toHaveBeenCalledWith({ type: 'timer', identity, token: 'extract-downhill', now: expect.any(Number) });

  rendered.unmount();
  expect(jest.getTimerCount()).toBe(0);
});
```

- [ ] **Step 4: Add a failing source-import boundary assertion**

```ts
it('does not import features, storage, SecureStore, or Zustand', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../WebViewSessionHost.tsx'),
    'utf8',
  );

  expect(source).not.toMatch(/features\//);
  expect(source).not.toMatch(/AsyncStorage|expo-secure-store|zustand/);
});
```

In `WebViewWorkflowRuntime.test.ts`, define a two-state fake workflow and assert that `createAdapter(workflow).execute(input, context)` publishes one identity/effect snapshot, a matching event advances the reducer, a matching complete effect resolves `{ data, updatedAt }`, a stale generation/nonce event is ignored, an `AbortSignal` rejects and clears the snapshot, and an event arriving after completion cannot settle the next execution. Use injected `createNonce: () => 'nonce-4'` and `now: () => 100`; use no React or WebView mock in this suite.

- [ ] **Step 5: Run the new suite and verify RED**

Run:

```powershell
npm.cmd test -- --runInBand src/core/sync/webview/__tests__/WebViewWorkflowRuntime.test.ts src/core/sync/webview/__tests__/WebViewSessionHost.test.tsx
```

Expected: FAIL because `workflow.ts`, `WebViewWorkflowRuntime.ts`, and `WebViewSessionHost.tsx` do not exist.

- [ ] **Step 6: Commit the red characterization tests**

```powershell
git add src/core/sync/webview/__tests__/WebViewWorkflowRuntime.test.ts src/core/sync/webview/__tests__/WebViewSessionHost.test.tsx src/features/pccu/engine/__tests__/GlobalScraperWebView.test.tsx
git commit -m "test: define webview workflow host contract"
```

### Task 2: Implement the generic `WebViewSessionHost` effect interpreter

**Files:**
- Create: `src/core/sync/workflow.ts`
- Modify: `src/core/sync/webview/protocol.ts`
- Create: `src/core/sync/webview/WebViewWorkflowRuntime.ts`
- Create: `src/core/sync/webview/WebViewSessionHost.tsx`
- Test: `src/core/sync/webview/__tests__/WebViewWorkflowRuntime.test.ts`
- Test: `src/core/sync/webview/__tests__/WebViewSessionHost.test.tsx`
- Modify: `src/features/pccu/engine/GlobalScraperWebView.tsx:169-344,1386-1436`
- Modify: `src/composition/sync.ts`
- Modify: `src/composition/AppCompositionRoot.tsx`

- [ ] **Step 1: Define the pure workflow model and its execution adapter**

Create `src/core/sync/workflow.ts` with `WorkflowIdentity`, `WorkflowContext`, `ValidatedWorkflowEvent`, `WorkflowEffect`, `WorkflowTransition`, `WebViewSessionDriver`, and `SyncWorkflow<K, S, E>` using the exact identities/effects from architecture specification Section 8.1. `WebViewSessionDriver.ensure(effect, emit)` is the injected PCCU session lease port used only for the `ensure-session` effect. Every effect carries request ID, generation, nonce, and sync kind. `decodeEvent` accepts a host-validated event and returns `DecodeResult<E>`; no workflow parses raw JSON.

In `src/core/sync/webview/protocol.ts`, export `type ValidatedWebViewEnvelope = WebViewEnvelope` only after the Phase 0 decoder has validated version and full identity. The name means core-envelope validation, not feature payload validation; Traffic and Grade decoders still validate `payload: unknown` field-by-field.

Create `WebViewWorkflowRuntime` with this public surface:

```ts
export type WebViewWorkflowSnapshot = Readonly<{
  version: number;
  identity: WorkflowIdentity | null;
  effects: readonly WorkflowEffect<unknown>[];
}>;

export class WebViewWorkflowRuntime {
  constructor(options: { createNonce(): string; now(): number });
  createAdapter<K extends SyncKind, S, E extends ValidatedWorkflowEvent>(
    workflow: SyncWorkflow<K, S, E>,
  ): WorkflowExecutionAdapter<K>;
  getSnapshot(): WebViewWorkflowSnapshot;
  subscribe(listener: () => void): () => void;
  dispatch(event: ValidatedWorkflowEvent): void;
  acceptTerminal(effect: Extract<WorkflowEffect<unknown>, { type: 'complete' | 'fail' }>): void;
  heartbeat(identity: WorkflowIdentity): void;
  destroy(): void;
}
```

`createAdapter().execute` creates the nonce, initializes one workflow session, publishes effects, and returns a promise resolved/rejected only by a matching terminal effect. It calls the Phase 1 context `heartbeat` and `transition` callbacks as workflow effects/phases occur. Only one execution may be active. Abort, destroy, identity change, or terminal settlement clears the snapshot and listeners safely; late events are ignored.

- [ ] **Step 2: Implement exact identity matching and a typed host ref**

```tsx
export type WebViewSessionHostProps<K extends SyncKind> = {
  identity: WorkflowIdentity<K> | null;
  effects: readonly WorkflowEffect<SyncOutput<K>>[];
  initialUrl: string;
  onEvent(event: ValidatedWorkflowEvent): void;
  onHeartbeat(identity: WorkflowIdentity<K>): void;
  onTerminalEffect(effect: Extract<WorkflowEffect<SyncOutput<K>>, { type: 'complete' | 'fail' }>): void;
  sessionDriver: WebViewSessionDriver;
};

const sameIdentity = (left: WorkflowIdentity | null, right: WorkflowIdentity) =>
  !!left &&
  left.requestId === right.requestId &&
  left.generation === right.generation &&
  left.nonce === right.nonce &&
  left.syncKind === right.syncKind;
```

- [ ] **Step 3: Implement the effect switch without feature imports**

```tsx
useEffect(() => {
  for (const effect of effects) {
    if (!sameIdentity(identity, effect)) continue;

    switch (effect.type) {
      case 'ensure-session':
        void sessionDriver.ensure(effect, onEvent);
        break;
      case 'navigate':
        setSourceUri(effect.url);
        break;
      case 'inject-java-script':
        webViewRef.current?.injectJavaScript(effect.script);
        break;
      case 'heartbeat':
        onHeartbeat(effect);
        break;
      case 'schedule': {
        const timer = setTimeout(() => {
          timersRef.current.delete(timer);
          onEvent({ type: 'timer', identity: effect, token: effect.token, now: Date.now() });
        }, effect.delayMs);
        timersRef.current.add(timer);
        break;
      }
      case 'complete':
      case 'fail':
        onTerminalEffect(effect);
        break;
    }
  }
}, [effects, identity, onEvent, onTerminalEffect]);
```

- [ ] **Step 4: Forward raw browser callbacks as identity-bound host events**

```tsx
const handleNavigation = useCallback((nav: WebViewNavigation) => {
  if (!identity) return;
  onEvent({
    type: 'navigation',
    identity,
    url: nav.url || '',
    loading: nav.loading,
    now: Date.now(),
  });
}, [identity, onEvent]);

const handleMessage = useCallback((event: WebViewMessageEvent) => {
  if (!identity) return;
  if (!isAllowedWebViewUrl(event.nativeEvent.url)) return;
  const decoded = decodeWebViewEnvelope(event.nativeEvent.data, identity);
  if (!decoded.ok) {
    onTerminalEffect({
      ...identity,
      type: 'fail',
      error: new SyncError('protocol', `webview_message_${decoded.reason}`, { retryable: false }),
    });
    return;
  }
  onEvent({ type: 'message', identity, envelope: decoded.value, now: Date.now() });
}, [identity, onEvent, onTerminalEffect]);
```

- [ ] **Step 5: Clear all scheduled effects when identity changes or the host unmounts**

```tsx
useEffect(() => () => {
  for (const timer of timersRef.current) clearTimeout(timer);
  timersRef.current.clear();
}, [identity?.requestId, identity?.generation, identity?.nonce]);
```

- [ ] **Step 6: Replace the physical `<WebView>` in `GlobalScraperWebView` with the host seam**

Keep legacy Schedule/Tutoring controller state in `GlobalScraperWebView`, but translate its current `source`, injection, reload, and terminal operations into core effects passed to the host. Do not move a Schedule/Tutoring branch in this task. The rendered seam must have this shape:

```tsx
<WebViewSessionHost
  identity={activeIdentity}
  effects={pendingHostEffects}
  initialUrl={PCCU_DEFAULT_URL}
  onEvent={handleHostEvent}
  onHeartbeat={refreshActiveTimeout}
  onTerminalEffect={handleTerminalEffect}
  sessionDriver={pccuSessionDriver}
/>
```

Create one `WebViewWorkflowRuntime` in `src/composition/sync.ts`, inject `Crypto.randomUUID` from `expo-crypto` as `createNonce`, expose it as `webViewWorkflowRuntime`, and destroy it with the Phase 1 composition. `GlobalScraperWebView` reads its snapshot with `useSyncExternalStore`; matching events, heartbeats, and terminal effects call the runtime methods above. The existing legacy Schedule/Tutoring controller continues to produce the same host props when the runtime snapshot has no extracted workflow.

- [ ] **Step 7: Run host, runtime, and legacy tests to verify GREEN**

Run:

```powershell
npm.cmd test -- --runInBand src/core/sync/webview/__tests__/WebViewWorkflowRuntime.test.ts src/core/sync/webview/__tests__/WebViewSessionHost.test.tsx src/features/pccu/engine/__tests__/GlobalScraperWebView.test.tsx
```

Expected: PASS; Schedule/Tutoring characterization remains unchanged, stale effects do not reach the fake WebView, and `jest.getTimerCount()` is zero after unmount.

- [ ] **Step 8: Run TypeScript and commit**

```powershell
npm.cmd run typecheck
git add src/core/sync/workflow.ts src/core/sync/webview/protocol.ts src/core/sync/webview/WebViewWorkflowRuntime.ts src/core/sync/webview/WebViewSessionHost.tsx src/core/sync/webview/__tests__/WebViewWorkflowRuntime.test.ts src/core/sync/webview/__tests__/WebViewSessionHost.test.tsx src/features/pccu/engine/GlobalScraperWebView.tsx src/composition/sync.ts src/composition/AppCompositionRoot.tsx
git commit -m "refactor: isolate webview effect execution"
```

Expected: typecheck exits 0 and the commit contains no Traffic or Grade branch deletion yet.

### Task 3: Move Traffic contracts and pure rules into the Traffic domain

**Files:**
- Create: `src/features/traffic/domain/types.ts`
- Create: `src/features/traffic/domain/traffic.ts`
- Create: `src/features/traffic/domain/__tests__/traffic.test.ts`
- Modify: `src/core/sync/contracts.ts`
- Modify: `src/core/sync/__tests__/contracts.test.ts`
- Modify: `src/features/traffic/types.ts`
- Modify: `src/features/traffic/storage/trafficStorage.ts`
- Modify: `src/features/traffic/hooks/useTrafficData.ts`
- Modify: `src/features/traffic/screens/TrafficScreen.tsx`

- [ ] **Step 1: Write failing pure domain tests for ETA, sorting, and snapshot shape**

```ts
import {
  normalizeTrafficArrival,
  normalizeTrafficEta,
  sortTrafficArrivals,
} from '../traffic';

describe('traffic domain', () => {
  it.each([
    ['進站中', { etaText: '進站中', etaMinutes: 0, isDue: true }],
    ['3 分', { etaText: '3分', etaMinutes: 3, isDue: false }],
    ['', { etaText: '尚無資料', etaMinutes: null, isDue: false }],
  ])('normalizes %s', (raw, expected) => {
    expect(normalizeTrafficEta(raw)).toEqual(expected);
  });

  it('orders campus stops before unknown stops without mutating input', () => {
    const input = [
      normalizeTrafficArrival({ stopName: '文化大學', direction: 'downhill', directionLabel: '下山', branchLabel: '②', stopSequence: 2 }),
      normalizeTrafficArrival({ stopName: '文化大學一', direction: 'downhill', directionLabel: '下山', branchLabel: '②', stopSequence: 1 }),
    ];
    const sorted = sortTrafficArrivals('downhill', input);
    expect(sorted.map((item) => item.stopName)).toEqual(['文化大學一', '文化大學']);
    expect(input[0].stopName).toBe('文化大學');
  });
});
```

- [ ] **Step 2: Run the domain test and verify RED**

Run:

```powershell
npm.cmd test -- --runInBand src/features/traffic/domain/__tests__/traffic.test.ts
```

Expected: FAIL because the domain files do not exist.

- [ ] **Step 3: Create the domain contracts**

```ts
export type TrafficDirection = 'downhill' | 'uphill';

export type TrafficStopArrivalDraft = {
  stopName: string;
  direction: TrafficDirection;
  directionLabel: string;
  branchLabel: string;
  etaText?: string;
  stopId?: string;
  stopSequence?: number | null;
  routeId?: string;
  routeName?: string;
};

export type TrafficStopArrival = Required<
  Pick<TrafficStopArrivalDraft, 'stopName' | 'direction' | 'directionLabel' | 'branchLabel'>
> & {
  etaText: string;
  etaMinutes: number | null;
  isDue: boolean;
  stopId?: string;
  stopSequence: number | null;
  routeId?: string;
  routeName?: string;
};

export type TrafficSnapshot = {
  downhill: TrafficStopArrival[];
  uphill: TrafficStopArrival[];
  updatedAt: number;
  sourceUrl: string;
};
```

After the feature type compiles, change the Traffic contract with a type-only import:

```ts
import type { TrafficSnapshot } from '../../features/traffic/domain/types';

export interface SyncContractMap {
  // unchanged kinds omitted from this excerpt
  traffic: { input: undefined; output: TrafficSnapshot };
}
```

This is an approved contract-only dependency, not a feature implementation import: the emitted JavaScript must contain no import from `features/traffic`. Update `contracts.test.ts` so `SyncOutput<'traffic'>` requires `downhill`, `uphill`, `updatedAt`, and `sourceUrl`; remove the Phase 1 `counts` fixture from coordinator tests by using a valid minimal snapshot helper.

- [ ] **Step 4: Move the current pure functions verbatim and expose a compatibility re-export**

Move `normalizeTrafficEta`, `normalizeTrafficArrival`, `sortTrafficArrivals`, `pickBestTrafficArrival`, `formatTrafficUpdatedAt`, and `TRAFFIC_SOURCE_URL` into `domain/traffic.ts`. Replace `src/features/traffic/types.ts` with:

```ts
export * from './domain/types';
export * from './domain/traffic';
```

- [ ] **Step 5: Update Traffic production imports to the domain path**

Use type-only imports where applicable:

```ts
import type { TrafficSnapshot } from '../domain/types';
import { TRAFFIC_SOURCE_URL, sortTrafficArrivals } from '../domain/traffic';
```

Keep `types.ts` only for callers intentionally deferred to a later phase; new Phase 2A code must import `domain/**` directly.

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```powershell
npm.cmd test -- --runInBand src/features/traffic/domain/__tests__/traffic.test.ts src/features/traffic/__tests__/trafficSync.test.ts
npm run typecheck
```

Expected: PASS with no import from Traffic domain back into `pccu`, storage, hooks, or screens.

- [ ] **Step 7: Commit**

```powershell
git add src/features/traffic/domain src/features/traffic/types.ts src/features/traffic/storage/trafficStorage.ts src/features/traffic/hooks/useTrafficData.ts src/features/traffic/screens/TrafficScreen.tsx src/core/sync/contracts.ts src/core/sync/__tests__/contracts.test.ts src/core/sync/__tests__/SyncCoordinator.queue.test.ts
git commit -m "refactor: own traffic domain contracts"
```

### Task 4: Add the Traffic runtime decoder and versioned extraction script

**Files:**
- Create: `__fixtures__/messages/traffic-rows-valid.json`
- Create: `src/features/traffic/infrastructure/sync/trafficProtocol.ts`
- Create: `src/features/traffic/infrastructure/sync/__tests__/trafficProtocol.test.ts`
- Create: `src/features/traffic/infrastructure/sync/trafficScripts.ts`
- Create: `src/features/traffic/infrastructure/sync/__tests__/trafficScripts.test.ts`
- Delete: `src/features/traffic/sync/trafficScripts.ts`

- [ ] **Step 1: Add the exact valid message fixture**

```json
{
  "version": 1,
  "requestId": "traffic-1",
  "generation": 7,
  "nonce": "nonce-7",
  "syncKind": "traffic",
  "event": "traffic_rows",
  "payload": {
    "direction": "downhill",
    "rows": [
      {
        "stopName": "文化大學一",
        "direction": "downhill",
        "directionLabel": "下山",
        "branchLabel": "②往劍潭經文大",
        "etaText": "3 分",
        "stopId": "TPE1001",
        "stopSequence": 12,
        "routeId": "0111000505",
        "routeName": "紅5"
      }
    ]
  }
}
```

- [ ] **Step 2: Write failing decoder tests covering valid and malformed payloads**

```ts
it('decodes a valid traffic_rows payload', () => {
  const envelope = JSON.parse(fixture('traffic-rows-valid.json')) as unknown;
  const decodedEnvelope = decodeWebViewEnvelope(JSON.stringify(envelope), identity);
  expect(decodedEnvelope.ok).toBe(true);
  if (!decodedEnvelope.ok) return;
  expect(decodeTrafficMessage(decodedEnvelope.value)).toEqual({
    ok: true,
    value: expect.objectContaining({ type: 'rows', direction: 'downhill' }),
  });
});

it.each([
  { direction: 'sideways', rows: [] },
  { direction: 'downhill', rows: 'not-an-array' },
  { direction: 'downhill', rows: [{ stopName: 42 }] },
])('rejects malformed traffic payload %#', (payload) => {
  expect(decodeTrafficMessage(envelope({ event: 'traffic_rows', payload }))).toEqual({
    ok: false,
    error: expect.objectContaining({ code: 'protocol' }),
  });
});
```

- [ ] **Step 3: Run decoder tests and verify RED**

Run:

```powershell
npm.cmd test -- --runInBand src/features/traffic/infrastructure/sync/__tests__/trafficProtocol.test.ts
```

Expected: FAIL because `trafficProtocol.ts` is missing.

- [ ] **Step 4: Implement hand-written field validation without assertions**

```ts
export type TrafficWorkflowMessage = {
  type: 'rows';
  direction: TrafficDirection;
  rows: TrafficStopArrivalDraft[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const decodeDirection = (value: unknown): TrafficDirection | null =>
  value === 'downhill' || value === 'uphill' ? value : null;

export function decodeTrafficMessage(
  envelope: ValidatedWebViewEnvelope,
): DecodeResult<TrafficWorkflowMessage> {
  if (envelope.syncKind !== 'traffic' || envelope.event !== 'traffic_rows') {
    return protocolFailure('Unexpected Traffic event');
  }
  if (!isRecord(envelope.payload)) return protocolFailure('Traffic payload must be an object');
  const direction = decodeDirection(envelope.payload.direction);
  if (!direction || !Array.isArray(envelope.payload.rows)) {
    return protocolFailure('Traffic direction or rows are invalid');
  }
  const rows: TrafficStopArrivalDraft[] = [];
  for (const candidate of envelope.payload.rows) {
    const decoded = decodeTrafficRow(candidate, direction);
    if (!decoded.ok) return decoded;
    rows.push(decoded.value);
  }
  return { ok: true, value: { type: 'rows', direction, rows } };
}
```

- [ ] **Step 5: Write the generated-script contract test**

```ts
it('posts a versioned envelope and never posts legacy top-level fields', () => {
  const script = buildTrafficExtractionScript(config, identity);
  expect(script).toContain('version: 1');
  expect(script).toContain('requestId: "traffic-1"');
  expect(script).toContain('generation: 7');
  expect(script).toContain('nonce: "nonce-7"');
  expect(script).toContain("syncKind: 'traffic'");
  expect(script).toContain("event: 'traffic_rows'");
  expect(script).toContain('payload: { direction: config.direction, rows: payload }');
  expect(script).not.toContain("t: type,");
});
```

- [ ] **Step 6: Change the script builder signature and replace the legacy post helper**

```diff
- export function buildTrafficExtractionScript(config: TrafficScriptConfig): string {
+ export function buildTrafficExtractionScript(
+   config: TrafficScriptConfig,
+   identity: WorkflowIdentity<'traffic'>,
+ ): string {
```

Use this exact generated JavaScript block in the current extraction IIFE; leave its DOM selectors, campus-stop filter, ETA refresh calls, polling interval, and 7-second completion condition unchanged:

```js
var config = ${JSON.stringify(config)};
var identity = ${JSON.stringify(identity)};
var post = function(payload) {
  window.ReactNativeWebView.postMessage(JSON.stringify({
    version: 1,
    requestId: identity.requestId,
    generation: identity.generation,
    nonce: identity.nonce,
    syncKind: 'traffic',
    event: 'traffic_rows',
    payload: { direction: config.direction, rows: payload }
  }));
};
```

- [ ] **Step 7: Run decoder and script tests to verify GREEN**

Run:

```powershell
npm.cmd test -- --runInBand src/features/traffic/infrastructure/sync/__tests__/trafficProtocol.test.ts src/features/traffic/infrastructure/sync/__tests__/trafficScripts.test.ts
```

Expected: PASS; malformed direction, rows, and row fields return `protocol`, while the script keeps both Red 5 route selectors and emits the active identity.

- [ ] **Step 8: Commit**

```powershell
git add __fixtures__/messages/traffic-rows-valid.json src/features/traffic/infrastructure/sync src/features/traffic/sync/trafficScripts.ts
git commit -m "feat: validate traffic workflow messages"
```

### Task 5: Build the pure Traffic reducer, effect descriptions, and workflow adapter

**Files:**
- Create: `src/features/traffic/infrastructure/sync/trafficWorkflow.ts`
- Create: `src/features/traffic/infrastructure/sync/__tests__/trafficWorkflow.test.ts`
- Modify: `src/composition/sync.ts`

- [ ] **Step 1: Write the failing happy-path reducer test**

```ts
it('loads downhill, extracts it, loads uphill, and completes one snapshot', () => {
  const state0 = createTrafficInitialState(context);
  const step1 = reduceTrafficWorkflow(state0, started(1_000));
  expect(step1.effects).toEqual([
    effect(identity, { type: 'navigate', url: expect.stringContaining('routeid=0111000505') }),
  ]);

  const step2 = reduceTrafficWorkflow(step1.state, navigation(DOWNHILL_URL, 1_100));
  expect(step2.state.phase).toBe('extracting-downhill');
  expect(step2.effects).toEqual([
    effect(identity, { type: 'heartbeat' }),
    effect(identity, { type: 'schedule', token: 'inject-downhill', delayMs: 500 }),
  ]);

  const step3 = reduceTrafficWorkflow(step2.state, timer('inject-downhill', 1_600));
  expect(step3.effects[0]).toEqual(
    effect(identity, { type: 'inject-java-script', script: expect.stringContaining('traffic_rows') }),
  );

  const step4 = reduceTrafficWorkflow(step3.state, rows('downhill', downhillRows, 2_000));
  expect(step4.state.phase).toBe('loading-uphill');
  expect(step4.effects).toEqual([
    effect(identity, { type: 'navigate', url: expect.stringContaining('routeid=0111000503') }),
  ]);

  const step5 = reduceTrafficWorkflow(
    reduceTrafficWorkflow(step4.state, navigation(UPHILL_URL, 2_100)).state,
    rows('uphill', uphillRows, 2_600),
  );
  expect(step5.state.phase).toBe('succeeded');
  expect(step5.effects).toEqual([
    effect(identity, {
      type: 'complete',
      updatedAt: 2_600,
      data: expect.objectContaining({ downhill: expect.any(Array), uphill: expect.any(Array) }),
    }),
  ]);
});
```

- [ ] **Step 2: Add failing illegal-event, stale-direction, and load-error tests**

```ts
it('fails closed when uphill rows arrive during downhill extraction', () => {
  const state = { ...createTrafficInitialState(context), phase: 'extracting-downhill' as const };
  const result = reduceTrafficWorkflow(state, rows('uphill', uphillRows, 2_000));
  expect(result.effects).toEqual([
    effect(identity, {
      type: 'fail',
      error: expect.objectContaining({ code: 'protocol', retryable: false }),
    }),
  ]);
});

it('maps a browser load error to navigation failure', () => {
  const result = reduceTrafficWorkflow(
    { ...createTrafficInitialState(context), phase: 'loading-downhill' as const },
    loadError(DOWNHILL_URL, 'network', 1_200),
  );
  expect(result.effects[0]).toEqual(
    effect(identity, { type: 'fail', error: expect.objectContaining({ code: 'navigation' }) }),
  );
});

it('ignores every event after a terminal transition', () => {
  const terminal = { ...createTrafficInitialState(context), phase: 'succeeded' as const };
  expect(reduceTrafficWorkflow(terminal, navigation(DOWNHILL_URL, 9_999))).toEqual({
    state: terminal,
    effects: [],
  });
});
```

- [ ] **Step 3: Run the workflow suite and verify RED**

Run:

```powershell
npm.cmd test -- --runInBand src/features/traffic/infrastructure/sync/__tests__/trafficWorkflow.test.ts
```

Expected: FAIL because `trafficWorkflow.ts` does not exist.

- [ ] **Step 4: Define the state, decoded event, and effect helper**

```ts
export type TrafficWorkflowPhase =
  | 'idle'
  | 'loading-downhill'
  | 'extracting-downhill'
  | 'loading-uphill'
  | 'extracting-uphill'
  | 'succeeded'
  | 'failed';

export type TrafficWorkflowState = {
  identity: WorkflowIdentity<'traffic'>;
  phase: TrafficWorkflowPhase;
  downhill: TrafficStopArrival[];
  uphill: TrafficStopArrival[];
};

export type TrafficWorkflowEvent =
  | Extract<ValidatedWorkflowEvent, { type: 'started' | 'navigation' | 'timer' | 'load-error' }>
  | { type: 'rows'; identity: WorkflowIdentity<'traffic'>; direction: TrafficDirection; rows: TrafficStopArrivalDraft[]; now: number };

const withIdentity = <O>(
  identity: WorkflowIdentity<'traffic'>,
  effect: O,
): O & WorkflowIdentity<'traffic'> => ({ ...identity, ...effect });
```

- [ ] **Step 5: Implement the pure reducer with exact route IDs and deterministic timestamps**

```ts
export function reduceTrafficWorkflow(
  state: TrafficWorkflowState,
  event: TrafficWorkflowEvent,
): WorkflowTransition<TrafficWorkflowState, TrafficSnapshot> {
  if (state.phase === 'succeeded' || state.phase === 'failed') return { state, effects: [] };

  if (event.type === 'started' && state.phase === 'idle') {
    return {
      state: { ...state, phase: 'loading-downhill' },
      effects: [withIdentity(state.identity, { type: 'navigate' as const, url: withTimestamp(DOWNHILL_URL, event.now) })],
    };
  }

  if (event.type === 'rows') {
    const expected = state.phase === 'extracting-downhill' ? 'downhill' : state.phase === 'extracting-uphill' ? 'uphill' : null;
    if (expected !== event.direction) return failProtocol(state, 'Traffic rows arrived in an illegal phase');
    const arrivals = event.rows.map(normalizeTrafficArrival);
    if (event.direction === 'downhill') {
      return {
        state: { ...state, phase: 'loading-uphill', downhill: arrivals },
        effects: [withIdentity(state.identity, { type: 'navigate' as const, url: withTimestamp(UPHILL_URL, event.now) })],
      };
    }
    const snapshot: TrafficSnapshot = {
      downhill: sortTrafficArrivals('downhill', state.downhill),
      uphill: sortTrafficArrivals('uphill', arrivals),
      updatedAt: event.now,
      sourceUrl: TRAFFIC_SOURCE_URL,
    };
    return {
      state: { ...state, phase: 'succeeded', uphill: arrivals },
      effects: [withIdentity(state.identity, { type: 'complete' as const, data: snapshot, updatedAt: event.now })],
    };
  }

  return reduceTrafficHostEvent(state, event);
}
```

- [ ] **Step 6: Implement the `SyncWorkflow` adapter and decoder bridge**

```ts
export const trafficWorkflow: SyncWorkflow<
  'traffic',
  TrafficWorkflowState,
  TrafficWorkflowEvent
> = {
  kind: 'traffic',
  allowedHosts: ['ebus.gov.taipei'],
  initialState: createTrafficInitialState,
  decodeEvent(state, event) {
    if (event.type !== 'message') return { ok: true, value: event };
    const decoded = decodeTrafficMessage(event.envelope);
    if (!decoded.ok) return decoded;
    return {
      ok: true,
      value: {
        type: 'rows',
        identity: state.identity,
        direction: decoded.value.direction,
        rows: decoded.value.rows,
        now: event.now,
      },
    };
  },
  transition: reduceTrafficWorkflow,
};
```

- [ ] **Step 7: Prove the registry pattern before adding Grade**

Add this contract test:

```ts
it('registers and resolves Traffic without a feature import in core', () => {
  const registry = new WorkflowRegistry();
  const runtime = new WebViewWorkflowRuntime({ createNonce: () => 'nonce-7', now: () => 100 });
  const adapter = runtime.createAdapter(trafficWorkflow);
  registry.register(adapter);
  expect(registry.has('traffic')).toBe(true);
  expect(registry.resolve('traffic')).toBe(adapter);
  expect(() => registry.register(adapter)).toThrow(/already registered/i);
});
```

Then replace only the Phase 1 Traffic legacy adapter in the existing composition:

```ts
export function installTrafficWorkflow(composition: SyncComposition): void {
  const adapter = composition.webViewWorkflowRuntime.createAdapter(trafficWorkflow);
  const previous = composition.registry.replace(adapter);
  if (previous !== composition.legacyAdapters.get('traffic')) {
    throw new Error('traffic_legacy_adapter_missing');
  }
}
```

Call `installTrafficWorkflow(syncComposition)` once during composition creation after the runtime exists. Schedule, Grade, and all Tutoring kinds continue resolving to their Phase 1 legacy adapters.

- [ ] **Step 8: Run reducer, registry, protocol, and type tests**

Run:

```powershell
npm.cmd test -- --runInBand src/features/traffic/infrastructure/sync src/core/sync/__tests__/WorkflowRegistry.test.ts src/core/sync/webview/__tests__/WebViewWorkflowRuntime.test.ts
npm.cmd run typecheck
```

Expected: PASS; registry rejects duplicates, the reducer is deterministic under fixed `now`, and `trafficWorkflow.ts` contains no `Date.now`, AsyncStorage, Zustand, or WebView ref.

- [ ] **Step 9: Commit the accepted Traffic registry pattern**

```powershell
git add src/features/traffic/infrastructure/sync/trafficWorkflow.ts src/features/traffic/infrastructure/sync/__tests__/trafficWorkflow.test.ts src/composition/sync.ts
git commit -m "feat: register traffic sync workflow"
```

### Task 6: Commit Traffic output through the existing storage facade

**Files:**
- Create: `src/features/traffic/application/runTrafficSync.ts`
- Create: `src/features/traffic/application/__tests__/runTrafficSync.test.ts`
- Modify: `src/features/traffic/storage/trafficStorage.ts`
- Modify: `src/features/traffic/hooks/useTrafficSync.ts`
- Modify: `src/features/traffic/hooks/useTrafficData.ts`
- Modify: `src/features/traffic/__tests__/trafficSync.test.ts`

- [ ] **Step 1: Write failing application tests for commit-before-success and storage failure**

```ts
it('persists the typed workflow output before reporting success', async () => {
  const order: string[] = [];
  const sync = jest.fn(async () => {
    order.push('workflow');
    return { success: true as const, data: snapshot, updatedAt: snapshot.updatedAt };
  });
  const persist = jest.fn(async () => { order.push('persist'); });

  await expect(runTrafficSync({ requestSync: sync, persist }, policy)).resolves.toEqual({
    success: true,
    snapshot,
    updatedAt: snapshot.updatedAt,
  });
  expect(order).toEqual(['workflow', 'persist']);
});

it('returns a storage failure and never reports success when persistence rejects', async () => {
  const persist = jest.fn(async () => { throw new Error('disk full'); });
  await expect(runTrafficSync({ requestSync: successfulRequest, persist }, policy)).resolves.toEqual({
    success: false,
    message: '交通資訊儲存失敗',
    error: expect.objectContaining({ code: 'storage' }),
  });
});
```

- [ ] **Step 2: Run the application suite and verify RED**

Run:

```powershell
npm.cmd test -- --runInBand src/features/traffic/application/__tests__/runTrafficSync.test.ts
```

Expected: FAIL because `runTrafficSync.ts` is missing.

- [ ] **Step 3: Stop swallowing Traffic storage write failures**

Replace the `try/catch` in `setTrafficSnapshot` with:

```ts
export async function setTrafficSnapshot(snapshot: TrafficSnapshot): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  cachedSnapshot = snapshot;
}
```

The in-memory cache changes only after AsyncStorage resolves, so a failed write preserves the previous cached snapshot.

- [ ] **Step 4: Implement the application adapter with dependency injection**

```ts
export type RunTrafficSyncDeps = {
  requestSync: Pick<LegacyPccuSyncEngineFacade, 'requestSync'>['requestSync'];
  persist(snapshot: TrafficSnapshot): Promise<void>;
};

export type TrafficHookSyncResult =
  | { success: true; snapshot: TrafficSnapshot; updatedAt: number }
  | { success: false; message: string; error: SyncError };

export async function runTrafficSync(
  deps: RunTrafficSyncDeps,
  policy: SyncPolicy,
): Promise<TrafficHookSyncResult> {
  let snapshot: TrafficSnapshot;
  try {
    snapshot = await deps.requestSync('traffic', policy.priority, {
      reason: policy.reason,
      force: policy.force,
    });
  } catch (cause) {
    const error = toSyncError(cause);
    return { success: false, message: error.message, error };
  }
  try {
    await deps.persist(snapshot);
    return { success: true, snapshot, updatedAt: snapshot.updatedAt };
  } catch {
    return {
      success: false,
      message: '無法儲存交通資訊，請稍後重試。',
      error: new SyncError('storage', 'Traffic snapshot commit failed', { retryable: true }),
    };
  }
}
```

- [ ] **Step 5: Make the hook map presentation intent to `SyncPolicy`**

```ts
const result = await runTrafficSync(
  {
    requestSync: engine.requestSync.bind(engine),
    persist: trafficStorage.setTrafficSnapshot,
  },
  {
    priority: options.priority ?? (options.reason === 'warmup' ? 10 : 5),
    reason: options.reason ?? 'user',
    force: options.force ?? options.reason !== 'warmup',
  },
);
```

Update `useTrafficData.refresh` so manual refresh passes `{ reason: 'user', force: true }` and automatic refresh passes `{ reason: 'warmup', force: false }`. Do not pass `silent` into the workflow.

- [ ] **Step 6: Update the hook tests to assert typed data and policy mapping**

```ts
expect(mockRequestSync).toHaveBeenCalledWith('traffic', 5, {
  reason: 'user',
  force: true,
});
expect(mockSetTrafficSnapshot).toHaveBeenCalledWith(fakeSnapshot);
```

Add a rejection test whose mocked `setTrafficSnapshot` throws and expect `error.code === 'storage'` while `getTrafficSnapshot` is not used to fabricate success.

- [ ] **Step 7: Run application, hook, and storage tests**

Run:

```powershell
npm.cmd test -- --runInBand src/features/traffic/application src/features/traffic/__tests__/trafficSync.test.ts
```

Expected: PASS; success is observed after persistence and the workflow module itself has no storage import.

- [ ] **Step 8: Commit**

```powershell
git add src/features/traffic/application src/features/traffic/storage/trafficStorage.ts src/features/traffic/hooks/useTrafficSync.ts src/features/traffic/hooks/useTrafficData.ts src/features/traffic/__tests__/trafficSync.test.ts
git commit -m "refactor: commit traffic workflow output in application layer"
```

### Task 7: Cut Traffic over to the registry and delete its legacy branch

**Files:**
- Modify: `src/features/pccu/engine/GlobalScraperWebView.tsx`
- Modify: `src/features/pccu/engine/__tests__/GlobalScraperWebView.test.tsx`
- Modify: `src/core/sync/webview/__tests__/WebViewSessionHost.test.tsx`
- Delete: `src/features/traffic/sync/trafficScripts.ts`

- [ ] **Step 1: Write the failing registered-workflow integration test**

```tsx
it('runs Traffic through the registered session and resolves its complete effect once', async () => {
  const request = engine.requestSync('traffic');
  await flushMicrotasks();

  fireNavigation('https://ebus.gov.taipei/Route/StopsOfRoute?routeid=0111000505');
  jest.advanceTimersByTime(500);
  expect(injectJavaScript).toHaveBeenCalledWith(expect.stringContaining('traffic_rows'));

  fireEnvelope(trafficEnvelope('downhill', downhillRows));
  fireNavigation('https://ebus.gov.taipei/Route/StopsOfRoute?routeid=0111000503');
  jest.advanceTimersByTime(500);
  fireEnvelope(trafficEnvelope('uphill', uphillRows));

  await expect(request).resolves.toEqual({
    success: true,
    data: expect.objectContaining({ downhill: expect.any(Array), uphill: expect.any(Array) }),
    updatedAt: expect.any(Number),
  });
  expect(onWorkflowComplete).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Add a failing source-boundary test for complete Traffic deletion**

```ts
it('contains no Traffic feature branch after registry cutover', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../GlobalScraperWebView.tsx'), 'utf8');
  expect(source).not.toMatch(/TrafficPhase|TrafficPartial|trafficPhaseRef|trafficPartialRef/);
  expect(source).not.toMatch(/buildTrafficExtractionScript|setTrafficSnapshot|normalizeTrafficArrival|TRAFFIC_(?:DOWNHILL|UPHILL|SOURCE)/);
  expect(source).not.toContain("mode === 'traffic'");
});
```

- [ ] **Step 3: Run the integration suite and verify RED**

Run:

```powershell
npm.cmd test -- --runInBand src/features/pccu/engine/__tests__/GlobalScraperWebView.test.tsx src/core/sync/webview/__tests__/WebViewSessionHost.test.tsx
```

Expected: FAIL because the controller still owns the Traffic phase, storage, and message branches.

- [ ] **Step 4: Route every registered kind through a generic workflow session**

Use one feature-agnostic branch before the legacy Schedule/Tutoring branch:

```ts
const registered = workflowRegistry.get(request.type);
if (registered) {
  const context = request.workflowContext;
  const session = registered.start(context);
  activeWorkflowSessionRef.current = session;
  activeIdentityRef.current = session.identity;
  enqueueHostEffects(session.dispatch({
    type: 'started',
    identity: session.identity,
    now: Date.now(),
  }));
  return;
}
```

`handleHostEvent` must dispatch only to the matching active session, enqueue returned effects, and ignore events after terminal settlement.

- [ ] **Step 5: Delete the Traffic-only controller code in one mechanical pass**

Remove:

- Traffic constants and `withTimestamp` only if no legacy caller remains.
- `TrafficPhase`, `TrafficPartial`, Traffic entries in `ActiveMode`, Traffic refs/state.
- the `type === 'traffic'` request initializer.
- `finishTraffic` and `injectTrafficScript`.
- Traffic navigation, message, catch/error, URL effect, active URI, and debug-phase branches.
- all Traffic feature imports.

Do not change Grade, Schedule, or Tutoring logic in this step.

- [ ] **Step 6: Delete the old script path after all imports use infrastructure**

Run:

```powershell
rg -n "features/traffic/sync/trafficScripts|\.\./sync/trafficScripts" app src
```

Expected: no output. Delete `src/features/traffic/sync/trafficScripts.ts`; the only builder is `src/features/traffic/infrastructure/sync/trafficScripts.ts`.

- [ ] **Step 7: Run Traffic, host, and all legacy shared-scraper tests**

Run:

```powershell
npm.cmd test -- --runInBand src/features/traffic src/core/sync/webview src/features/pccu/engine/__tests__/GlobalScraperWebView.test.tsx
npm run typecheck
```

Expected: PASS; Traffic settles exactly once, storage is written by the application adapter, and existing Grade/Schedule/Tutoring shared-scraper tests remain green.

- [ ] **Step 8: Commit the Traffic cutover**

```powershell
git add src/features/pccu/engine/GlobalScraperWebView.tsx src/features/pccu/engine/__tests__/GlobalScraperWebView.test.tsx src/core/sync/webview src/features/traffic/infrastructure/sync src/features/traffic/sync/trafficScripts.ts
git commit -m "refactor: extract traffic from global scraper"
```

### Task 8: Traffic acceptance checkpoint before touching Grade

**Files:**
- Verify only; do not modify Grade production files in this task.

- [ ] **Step 1: Run the complete automated gate**

Run:

```powershell
npm run verify
```

Expected: typecheck and every Jest suite pass; Jest reports no open handle or pending timer warning.

- [ ] **Step 2: Build an Expo bundle smoke artifact**

Run:

```powershell
npx expo export --platform ios --output-dir dist/phase-2a-traffic-export
```

Expected: Expo exits 0 and writes an iOS bundle under `dist/phase-2a-traffic-export`; there is no unresolved module from the deleted Traffic script path.

- [ ] **Step 3: Start Expo Go with a clean Metro cache**

Run:

```powershell
npm start -- --clear
```

Expected: Metro displays the Expo Go QR code and the app reaches the existing login/home entry without a red error screen.

- [ ] **Step 4: Verify Traffic on a supported Expo Go device**

Perform these actions in order:

1. Open `/(tabs)/home/traffic` with network enabled.
2. Wait for automatic refresh; verify the downhill and uphill sections each finish loading and the updated time changes.
3. Pull to refresh; verify only one visible refresh runs and cached rows remain visible during the request.
4. Background the app during another refresh, return to foreground, then pull once more; verify the second request completes and no rows from the cancelled generation overwrite it.
5. Disable network and refresh; verify the last snapshot stays visible with a failure notice.
6. Re-enable network and refresh; verify recovery without restarting the app.

Expected: all six checks pass and the debug event stream, if enabled, contains request ID/kind/generation/phase only—no raw message payload.

- [ ] **Step 5: Verify the untouched legacy flows**

Open Grade, Schedule, Tutoring overview, and one Tutoring detail screen; trigger one refresh in each.

Expected: each behaves as it did before the Traffic cutover. A failure here blocks Task 9 because the Traffic registry seam is not accepted.

### Task 9: Move Grade contracts and parsing into the Grade feature

**Files:**
- Create: `src/features/grade/domain/types.ts`
- Create: `src/features/grade/infrastructure/parser/gradeParser.ts`
- Create: `src/features/grade/infrastructure/parser/__tests__/gradeParser.test.ts`
- Modify: `src/core/sync/contracts.ts`
- Modify: `src/core/sync/__tests__/contracts.test.ts`
- Modify: `src/features/pccu/parsers/pccuScraper.ts`
- Modify: `src/features/pccu/parsers/__tests__/pccuScraper.test.ts`
- Modify: `src/features/grade/storage/gradeStorage.ts`
- Modify: `src/features/grade/store/useGradeStore.ts`
- Modify: `src/features/grade/screens/GradeScreenV2.tsx`
- Modify: `src/features/home/screens/HomeScreen.tsx`
- Modify: `app/modal/gradeDetails.tsx`

- [ ] **Step 1: Copy every existing Grade parser assertion into the new feature suite**

The new test must import from the feature parser and retain the fixture helper:

```ts
import fs from 'fs';
import path from 'path';
import { parseGradesFromHtml } from '../gradeParser';

const fixture = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, '../../../../../../__fixtures__/html', name), 'utf8');

describe('gradeParser', () => {
  it('parses the current historical-grade fixture', () => {
    const semesters = parseGradesFromHtml(fixture('grade-valid.html'));
    expect(semesters).toHaveLength(1);
    expect(semesters[0]).toEqual(expect.objectContaining({
      title: '113學年度第1學期',
      courses: expect.arrayContaining([
        expect.objectContaining({ code: 'CS1010', name: '程式設計', credits: '3', score: '88' }),
      ]),
    }));
  });

  it('returns an empty result for empty, malformed, and login error HTML', () => {
    expect(parseGradesFromHtml('')).toEqual([]);
    expect(() => parseGradesFromHtml(fixture('malformed.html'))).not.toThrow();
    expect(parseGradesFromHtml(fixture('error-page.html'))).toEqual([]);
  });
});
```

Also copy the existing multi-row header, missing-code, and split-subject-header cases unchanged from `pccuScraper.test.ts`; no Grade assertion may be deleted before it passes at the new path.

- [ ] **Step 2: Run the new parser suite and verify RED**

Run:

```powershell
npm.cmd test -- --runInBand src/features/grade/infrastructure/parser/__tests__/gradeParser.test.ts
```

Expected: FAIL because `gradeParser.ts` and the feature-owned types do not exist.

- [ ] **Step 3: Define the Grade domain contracts**

```ts
export type CourseGrade = {
  type: string;
  code: string;
  name: string;
  credits: string;
  score: string;
};

export type SemesterGrade = {
  title: string;
  courses: CourseGrade[];
  stats: {
    totalPoints?: string;
    average?: string;
    earnedCredits?: string;
    classRank?: string;
    deptRank?: string;
  };
};

export type GradeSyncPayload = {
  grades: SemesterGrade[];
  preAdmission: SemesterGrade[];
  updatedAt: number;
};
```

Change `SyncContractMap['grade']['output']` to this feature-owned `GradeSyncPayload` with a type-only import in `src/core/sync/contracts.ts`. Update `contracts.test.ts` and the coordinator fake-result helper so a Grade output requires `grades`, `preAdmission`, and `updatedAt`. Verify the compiled JavaScript emits no feature import.

- [ ] **Step 4: Extract the parser with feature-local helpers**

Create `gradeParser.ts` by moving the complete current `parseGradesFromHtml` implementation at `pccuScraper.ts:144-326` and these exact helpers: `isNumeric`, `looksLikeCourseCode`, `isScoreText`, `guessCredits`, `guessScore`, `isGradeAnnouncementText`, `toHalfWidth`, `extractSemesterTitle`, `normalizeGradeHeader`, `findHeaderIndex`, and `findGradeNameHeaderIndex`. Copy `normalize`, `stripGarbledChars`, `stripEnrollmentCount`, and `cleanCourseNameText` into the new parser because Schedule still needs its own copies. Change only the type import at the destination:

```ts
import * as cheerio from 'cheerio';
import type { SemesterGrade } from '../../domain/types';
```

The destination must export only `parseGradesFromHtml`; helper behavior and the complete two-pass table parser remain byte-for-byte equivalent apart from formatting and the feature-owned type import.

- [ ] **Step 5: Run the new parser suite before deleting the old export**

Run:

```powershell
npm.cmd test -- --runInBand src/features/grade/infrastructure/parser/__tests__/gradeParser.test.ts
```

Expected: PASS with the same multi-row, missing-code, malformed, and error-page behavior as the old parser suite.

- [ ] **Step 6: Update every Grade type import and then remove the old Grade parser**

Replace imports in storage, store, Grade screen, Home, and the Grade details modal with:

```ts
import type { SemesterGrade } from '../domain/types';
```

Use the correct relative prefix at each caller. Remove `CourseGrade`, `SemesterGrade`, Grade-only helpers, and `parseGradesFromHtml` from `pccuScraper.ts`; remove only Grade cases/imports from `pccuScraper.test.ts`. The PCCU parser must continue exporting Schedule parsing unchanged.

- [ ] **Step 7: Prove the ownership move is complete**

Run:

```powershell
rg -n "SemesterGrade|CourseGrade|parseGradesFromHtml" app src/features --glob '!src/features/grade/**'
npm.cmd test -- --runInBand src/features/grade/infrastructure/parser src/features/pccu/parsers
npm run typecheck
```

Expected: `rg` returns no production import of Grade contracts/parser outside the Grade public surface; both parser suites and typecheck pass.

- [ ] **Step 8: Commit**

```powershell
git add src/features/grade/domain src/features/grade/infrastructure/parser src/features/pccu/parsers src/features/grade/storage/gradeStorage.ts src/features/grade/store/useGradeStore.ts src/features/grade/screens/GradeScreenV2.tsx src/features/home/screens/HomeScreen.tsx app/modal/gradeDetails.tsx src/core/sync/contracts.ts src/core/sync/__tests__/contracts.test.ts src/core/sync/__tests__/SyncCoordinator.queue.test.ts
git commit -m "refactor: move grade contracts and parser into feature"
```

### Task 10: Add the Grade runtime decoder and versioned Grade script

**Files:**
- Create: `src/features/grade/infrastructure/sync/gradeProtocol.ts`
- Create: `src/features/grade/infrastructure/sync/__tests__/gradeProtocol.test.ts`
- Create: `src/features/grade/infrastructure/sync/gradeScripts.ts`
- Create: `src/features/grade/infrastructure/sync/__tests__/gradeScripts.test.ts`
- Modify: `src/features/pccu/sync/pccuSyncScripts.ts`
- Modify: `src/features/pccu/sync/__tests__/pccuSyncScripts.test.ts`

- [ ] **Step 1: Write failing protocol tests for every accepted Grade event**

```ts
it.each([
  ['grade_html', { html: '<html><table></table></html>' }, { type: 'html' }],
  ['popup', { url: 'https://ecampus.pccu.edu.tw/eCampus/TransUrl.aspx?PrjNo=1220' }, { type: 'popup' }],
  ['status', { message: 'waiting' }, { type: 'progress' }],
  ['grade_probe', { message: 'rows=0' }, { type: 'progress' }],
  ['error', { message: 'Grade query timed out' }, { type: 'error' }],
])('decodes %s', (event, payload, expected) => {
  const decoded = decodeGradeMessage(envelope({ event, payload }));
  expect(decoded).toEqual({ ok: true, value: expect.objectContaining(expected) });
});

it.each([
  ['grade_html', { html: 42 }],
  ['popup', { url: 'javascript:alert(1)' }],
  ['status', { message: { raw: true } }],
  ['unknown', {}],
])('rejects malformed %s', (event, payload) => {
  expect(decodeGradeMessage(envelope({ event, payload }))).toEqual({
    ok: false,
    error: expect.objectContaining({ code: 'protocol' }),
  });
});
```

- [ ] **Step 2: Run the protocol suite and verify RED**

Run:

```powershell
npm.cmd test -- --runInBand src/features/grade/infrastructure/sync/__tests__/gradeProtocol.test.ts
```

Expected: FAIL because `gradeProtocol.ts` is missing.

- [ ] **Step 3: Implement exhaustive runtime decoding**

```ts
export type GradeWorkflowMessage =
  | { type: 'html'; html: string }
  | { type: 'popup'; url: string }
  | { type: 'progress'; message: string }
  | { type: 'error'; message: string };

export function decodeGradeMessage(
  envelope: ValidatedWebViewEnvelope,
): DecodeResult<GradeWorkflowMessage> {
  if (envelope.syncKind !== 'grade' || !isRecord(envelope.payload)) {
    return protocolFailure('Invalid Grade envelope');
  }
  switch (envelope.event) {
    case 'grade_html':
      return typeof envelope.payload.html === 'string'
        ? { ok: true, value: { type: 'html', html: envelope.payload.html } }
        : protocolFailure('Grade html must be a string');
    case 'popup':
      return decodeHttpsPopup(envelope.payload.url);
    case 'status':
    case 'grade_probe':
      return typeof envelope.payload.message === 'string'
        ? { ok: true, value: { type: 'progress', message: envelope.payload.message } }
        : protocolFailure('Grade progress message must be a string');
    case 'error':
      return typeof envelope.payload.message === 'string'
        ? { ok: true, value: { type: 'error', message: envelope.payload.message } }
        : protocolFailure('Grade error message must be a string');
    default:
      return protocolFailure('Unexpected Grade event');
  }
}
```

- [ ] **Step 4: Move every robust Grade script characterization before moving production**

Move the existing `buildRobustGradePageScript` tests from `pccuSyncScripts.test.ts` to `gradeScripts.test.ts`, change the import path, and add identity assertions:

```ts
it('emits versioned grade_html, grade_probe, status, and error envelopes', () => {
  const script = buildGradeExtractionScript(identity);
  expect(script).toContain('version: 1');
  expect(script).toContain('requestId: "grade-1"');
  expect(script).toContain('generation: 9');
  expect(script).toContain('nonce: "nonce-9"');
  expect(script).toContain("syncKind: 'grade'");
  expect(script).toContain("event: 'grade_html'");
  expect(script).toContain("event: 'grade_probe'");
  expect(script).toContain("event: 'error'");
});
```

- [ ] **Step 5: Run the moved script suite and verify RED**

Run:

```powershell
npm.cmd test -- --runInBand src/features/grade/infrastructure/sync/__tests__/gradeScripts.test.ts
```

Expected: FAIL because the feature script builder does not exist.

- [ ] **Step 6: Move the robust builder and replace its post helper**

Create `buildGradeExtractionScript(identity)` from the existing `buildRobustGradePageScript` body. Keep all current history-tab, direct `scoreListAll.asp`, query-form, grade-row, probe, 12-attempt, and regex-escape logic. Replace raw posts with this helper:

```ts
const postPrelude = (identity: WorkflowIdentity<'grade'>) => `
  var identity = ${JSON.stringify(identity)};
  function postGrade(event, payload) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      version: 1,
      requestId: identity.requestId,
      generation: identity.generation,
      nonce: identity.nonce,
      syncKind: 'grade',
      event: event,
      payload: payload
    }));
  }
`;
```

Map terminal HTML to `postGrade('grade_html', { html: picked.html })`, probes to `{ message }`, status to `{ message }`, and errors to `{ message }`. No Grade script may emit `t`, `h`, or `m` as top-level fields.

- [ ] **Step 7: Remove only Grade extraction exports/tests from the shared script file**

Delete `buildGradePageScript` and `buildRobustGradePageScript` from `pccuSyncScripts.ts`. Keep `buildLoginScript`, `buildServiceOpenScript`, Schedule builders, and their tests unchanged; Grade workflow will still call the shared session/service builders through injected pure dependencies.

- [ ] **Step 8: Run protocol, Grade script, shared script, and type tests**

Run:

```powershell
npm.cmd test -- --runInBand src/features/grade/infrastructure/sync/__tests__/gradeProtocol.test.ts src/features/grade/infrastructure/sync/__tests__/gradeScripts.test.ts src/features/pccu/sync/__tests__/pccuSyncScripts.test.ts
npm run typecheck
```

Expected: PASS; all prior robust Grade script assertions live at the feature path and shared Schedule/login/service tests remain green.

- [ ] **Step 9: Commit**

```powershell
git add src/features/grade/infrastructure/sync/gradeProtocol.ts src/features/grade/infrastructure/sync/__tests__/gradeProtocol.test.ts src/features/grade/infrastructure/sync/gradeScripts.ts src/features/grade/infrastructure/sync/__tests__/gradeScripts.test.ts src/features/pccu/sync/pccuSyncScripts.ts src/features/pccu/sync/__tests__/pccuSyncScripts.test.ts
git commit -m "feat: validate grade workflow messages"
```

### Task 11: Build the pure Grade reducer, effects, and workflow adapter

**Files:**
- Create: `src/features/grade/infrastructure/sync/gradeWorkflow.ts`
- Create: `src/features/grade/infrastructure/sync/__tests__/gradeWorkflow.test.ts`
- Modify: `src/core/sync/webview/__tests__/WebViewSessionHost.test.tsx`
- Modify: `src/composition/sync.ts`

- [ ] **Step 1: Write the failing authenticated Grade happy-path test**

```ts
it('ensures the PCCU session, opens 1220, extracts history, and completes typed grades', () => {
  const step1 = reduceGradeWorkflow(initial, started(1_000), deps);
  expect(step1.effects).toEqual([
    effect(identity, { type: 'ensure-session', session: 'pccu' }),
  ]);

  const step2 = reduceGradeWorkflow(step1.state, sessionReady(1_100), deps);
  expect(step2.effects).toEqual([
    effect(identity, { type: 'inject-java-script', script: 'open-1220;' }),
  ]);

  const step3 = reduceGradeWorkflow(step2.state, popup(TRANS_URL, 1_200), deps);
  expect(step3.effects).toEqual([
    effect(identity, { type: 'navigate', url: TRANS_URL }),
  ]);

  const step4 = reduceGradeWorkflow(step3.state, navigation(GRADE_INDEX_URL, 1_400), deps);
  expect(step4.effects).toEqual([
    effect(identity, { type: 'heartbeat' }),
    effect(identity, { type: 'schedule', token: 'inject-grade', delayMs: 1_200 }),
  ]);

  const step5 = reduceGradeWorkflow(step4.state, timer('inject-grade', 2_600), deps);
  expect(step5.effects).toEqual([
    effect(identity, { type: 'inject-java-script', script: 'grade-extract;' }),
  ]);

  const step6 = reduceGradeWorkflow(step5.state, html(GRADE_HTML, 3_000), deps);
  expect(step6.effects).toEqual([
    effect(identity, {
      type: 'complete',
      updatedAt: 3_000,
      data: { grades: parsedGrades, preAdmission: [], updatedAt: 3_000 },
    }),
  ]);
});
```

- [ ] **Step 2: Add failing retry, relogin, TransUrl, and terminal-state tests**

```ts
it('retries empty parsed HTML twice, then fails with parse', () => {
  let state = { ...initial, phase: 'extracting' as const };
  state = reduceGradeWorkflow(state, html('<html></html>', 1_000), deps).state;
  expect(state.extractAttempts).toBe(1);
  state = reduceGradeWorkflow(state, html('<html></html>', 2_000), deps).state;
  const terminal = reduceGradeWorkflow(state, html('<html></html>', 3_000), deps);
  expect(terminal.effects[0]).toEqual(
    effect(identity, { type: 'fail', error: expect.objectContaining({ code: 'parse' }) }),
  );
});

it('requests one new PCCU session for a relogin marker', () => {
  const result = reduceGradeWorkflow(
    { ...initial, phase: 'extracting' as const },
    remoteError('Grade query requires relogin', 2_000),
    deps,
  );
  expect(result.effects).toEqual([
    effect(identity, { type: 'ensure-session', session: 'pccu' }),
  ]);
});

it('never replaces a 1220 TransUrl popup with a hard-coded score URL', () => {
  const result = reduceGradeWorkflow(
    { ...initial, phase: 'opening-service' as const },
    popup(TRANS_URL, 1_200),
    deps,
  );
  expect(result.effects).toEqual([effect(identity, { type: 'navigate', url: TRANS_URL })]);
});
```

- [ ] **Step 3: Run the Grade workflow suite and verify RED**

Run:

```powershell
npm.cmd test -- --runInBand src/features/grade/infrastructure/sync/__tests__/gradeWorkflow.test.ts
```

Expected: FAIL because `gradeWorkflow.ts` does not exist.

- [ ] **Step 4: Define Grade state and decoded events**

```ts
export type GradeWorkflowPhase =
  | 'idle'
  | 'ensuring-session'
  | 'opening-service'
  | 'waiting-handoff'
  | 'extracting'
  | 'succeeded'
  | 'failed';

export type GradeWorkflowState = {
  identity: WorkflowIdentity<'grade'>;
  phase: GradeWorkflowPhase;
  extractAttempts: number;
  sessionAttempts: number;
};

export type GradeWorkflowEvent =
  | Extract<ValidatedWorkflowEvent, { type: 'started' | 'session-ready' | 'session-error' | 'navigation' | 'load-end' | 'timer' | 'load-error' }>
  | { type: 'popup'; identity: WorkflowIdentity<'grade'>; url: string; now: number }
  | { type: 'html'; identity: WorkflowIdentity<'grade'>; html: string; now: number }
  | { type: 'progress'; identity: WorkflowIdentity<'grade'>; message: string; now: number }
  | { type: 'remote-error'; identity: WorkflowIdentity<'grade'>; message: string; now: number };
```

- [ ] **Step 5: Implement pure effect factories and reducer dependencies**

```ts
export type GradeWorkflowDeps = {
  buildServiceScript(code: '1220', identity: WorkflowIdentity<'grade'>): string;
  buildExtractionScript(identity: WorkflowIdentity<'grade'>): string;
  parse(html: string): SemesterGrade[];
};

const fail = (
  state: GradeWorkflowState,
  code: SyncErrorCode,
  message: string,
  retryable: boolean,
): WorkflowTransition<GradeWorkflowState, GradeSyncPayload> => ({
  state: { ...state, phase: 'failed' },
  effects: [{ ...state.identity, type: 'fail', error: { code, message, retryable } }],
});
```

Implement `reduceGradeWorkflow(state, event, deps)` as the exact sequence tested above. Recognize Grade target URLs with `/studentscore/student/(index|index_score|scoreListAll).asp`, schedule the extractor once per handoff, treat progress as heartbeat only, retry empty parsed data at most twice, and ignore all events after `succeeded` or `failed`. Use `event.now` for `GradeSyncPayload.updatedAt` and the terminal effect; do not call `Date.now` in the reducer.

- [ ] **Step 6: Implement the message-decoding adapter**

```ts
export function createGradeWorkflow(deps: GradeWorkflowDeps): SyncWorkflow<
  'grade',
  GradeWorkflowState,
  GradeWorkflowEvent
> {
  return {
    kind: 'grade',
    allowedHosts: ['ecampus.pccu.edu.tw', 'ap2.pccu.edu.tw'],
    initialState: (context) => ({ identity: context, phase: 'idle', extractAttempts: 0, sessionAttempts: 0 }),
    decodeEvent(state, event) {
      if (event.type !== 'message') return { ok: true, value: event };
      const decoded = decodeGradeMessage(event.envelope);
      if (!decoded.ok) return decoded;
      return { ok: true, value: toGradeWorkflowEvent(state.identity, decoded.value, event.now) };
    },
    transition: (state, event) => reduceGradeWorkflow(state, event, deps),
  };
}
```

- [ ] **Step 7: Test the host's generic session effect execution**

```tsx
it('delegates ensure-session to the injected driver and forwards session-ready', async () => {
  const onEvent = jest.fn();
  const sessionDriver = {
    ensure: jest.fn(async (effect, emit) => {
      emit({ type: 'session-ready', identity: effect, session: 'pccu', now: 1_100 });
    }),
  };
  render(
    <WebViewSessionHost
      identity={identity}
      effects={[{ ...identity, type: 'ensure-session', session: 'pccu' }]}
      initialUrl="about:blank"
      onEvent={onEvent}
      onHeartbeat={jest.fn()}
      onTerminalEffect={jest.fn()}
      sessionDriver={sessionDriver}
    />,
  );
  await act(async () => undefined);
  expect(sessionDriver.ensure).toHaveBeenCalledTimes(1);
  expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'session-ready' }));
});
```

- [ ] **Step 8: Register Grade only now that Traffic acceptance passed**

```ts
const gradeAdapter = webViewWorkflowRuntime.createAdapter(createGradeWorkflow({
  buildServiceScript: (code, identity) => buildServiceOpenScript(code, identity),
  buildExtractionScript: buildGradeExtractionScript,
  parse: parseGradesFromHtml,
}));
const previousGradeAdapter = registry.replace(gradeAdapter);
if (previousGradeAdapter !== legacyAdapters.get('grade')) {
  throw new Error('grade_legacy_adapter_missing');
}
```

Add a registry assertion that `resolve('traffic')` and `resolve('grade')` return workflow-runtime adapters while Schedule/Tutoring still resolve to their Phase 1 legacy adapters.

- [ ] **Step 9: Run all workflow and host tests**

Run:

```powershell
npm.cmd test -- --runInBand src/features/traffic/infrastructure/sync src/features/grade/infrastructure/sync src/core/sync/webview src/core/sync/__tests__/WorkflowRegistry.test.ts
npm.cmd run typecheck
```

Expected: PASS; Grade has exact host allowlists, parsing is deterministic, and neither feature workflow imports storage or Zustand.

- [ ] **Step 10: Commit**

```powershell
git add src/features/grade/infrastructure/sync/gradeWorkflow.ts src/features/grade/infrastructure/sync/__tests__/gradeWorkflow.test.ts src/core/sync/webview/__tests__/WebViewSessionHost.test.tsx src/composition/sync.ts
git commit -m "feat: register grade sync workflow"
```

### Task 12: Commit Grade output through storage, then publish the compatibility store

**Files:**
- Create: `src/features/grade/application/runGradeSync.ts`
- Create: `src/features/grade/application/__tests__/runGradeSync.test.ts`
- Modify: `src/features/grade/storage/gradeStorage.ts`
- Modify: `src/features/grade/hooks/useGradeSync.ts`
- Modify: `src/features/auth/screens/__tests__/bootstrapSync.test.tsx`

- [ ] **Step 1: Write failing application tests for ordering and storage failure**

```ts
it('commits Grade payload before returning success', async () => {
  const order: string[] = [];
  const requestSync = jest.fn(async () => {
    order.push('workflow');
    return { success: true as const, data: payload, updatedAt: payload.updatedAt };
  });
  const persist = jest.fn(async () => { order.push('storage'); });

  await expect(runGradeSync({ requestSync, persist }, policy)).resolves.toEqual({
    success: true,
    data: payload,
    updatedAt: payload.updatedAt,
  });
  expect(order).toEqual(['workflow', 'storage']);
});

it('maps a rejected Grade write to storage and preserves the previous store projection', async () => {
  const persist = jest.fn(async () => { throw new Error('quota'); });
  await expect(runGradeSync({ requestSync: successfulRequest, persist }, policy)).resolves.toEqual({
    success: false,
    message: '成績儲存失敗',
    error: expect.objectContaining({ code: 'storage' }),
  });
  expect(useGradeStore.getState().grades).toEqual(previousGrades);
});
```

- [ ] **Step 2: Run the application suite and verify RED**

Run:

```powershell
npm.cmd test -- --runInBand src/features/grade/application/__tests__/runGradeSync.test.ts
```

Expected: FAIL because `runGradeSync.ts` does not exist.

- [ ] **Step 3: Make Grade storage atomic at the legacy facade boundary**

```ts
export async function setGrades(
  grades: SemesterGrade[],
  preAdmission: SemesterGrade[] = [],
  updatedAt: number = Date.now(),
): Promise<void> {
  const serialized = JSON.stringify({ grades, preAdmission, updatedAt });
  await AsyncStorage.setItem(STORAGE_KEY, serialized);
  cachedGrades = grades;
  cachedPre = preAdmission;
  cachedUpdatedAt = updatedAt;
}
```

Remove the write-side `try/catch`; read-side stale-cache fallback may remain for Phase 2A. This ensures a failed write cannot replace the in-memory cache or be reported as success.

- [ ] **Step 4: Implement the Grade application adapter**

```ts
export type GradeHookSyncResult =
  | { success: true; data: GradeSyncPayload; updatedAt: number }
  | { success: false; message: string; error: SyncError };

export async function runGradeSync(
  deps: {
    requestSync: Pick<LegacyPccuSyncEngineFacade, 'requestSync'>['requestSync'];
    persist(grades: SemesterGrade[], preAdmission: SemesterGrade[], updatedAt: number): Promise<void>;
  },
  policy: SyncPolicy,
): Promise<GradeHookSyncResult> {
  let payload: GradeSyncPayload;
  try {
    payload = await deps.requestSync('grade', policy.priority, {
      reason: policy.reason,
      force: policy.force,
    });
  } catch (cause) {
    const error = toSyncError(cause);
    return { success: false, message: error.message, error };
  }
  try {
    await deps.persist(payload.grades, payload.preAdmission, payload.updatedAt);
    return { success: true, data: payload, updatedAt: payload.updatedAt };
  } catch {
    return {
      success: false,
      message: '無法儲存成績資料，請稍後重試。',
      error: new SyncError('storage', 'Grade commit failed', { retryable: true }),
    };
  }
}
```

- [ ] **Step 5: Publish Zustand state only after `runGradeSync` succeeds**

Replace the hook's storage re-read with typed committed data:

```ts
const result = await runGradeSync(
  {
    requestSync: engine.requestSync.bind(engine),
    persist: gradeStorage.setGrades,
  },
  {
    priority: options.priority ?? 5,
    reason: options.reason ?? (options.silent ? 'warmup' : 'user'),
    force: options.force ?? !options.silent,
  },
);

if (result.success) {
  setGrades(result.data.grades);
  setLastSyncedAt(result.data.updatedAt);
  if (!options.silent) setSyncStatus('idle');
} else {
  setError(result.message);
}
```

`silent` affects only presentation status and policy mapping; it is not placed in the workflow input or message envelope.

- [ ] **Step 6: Update bootstrap mocks to return a typed Grade payload**

```ts
engine.setExecutor(async () => ({
  grades: bootstrapGrades,
  preAdmission: [],
  updatedAt: 456,
}));
```

Assert the store changes only after mocked `setGrades` resolves. Add a rejected-storage case and assert the previous store remains while `syncStatus` becomes `error`.

- [ ] **Step 7: Run application, hook/bootstrap, and type tests**

Run:

```powershell
npm.cmd test -- --runInBand src/features/grade/application src/features/auth/screens/__tests__/bootstrapSync.test.tsx
npm run typecheck
```

Expected: PASS; the Grade application adapter imports storage but not Zustand, the workflow imports neither, and the hook publishes only committed data.

- [ ] **Step 8: Commit**

```powershell
git add src/features/grade/application src/features/grade/storage/gradeStorage.ts src/features/grade/hooks/useGradeSync.ts src/features/auth/screens/__tests__/bootstrapSync.test.tsx
git commit -m "refactor: commit grade workflow output before store publication"
```

### Task 13: Cut Grade over to the registry and delete its legacy branch

**Files:**
- Modify: `src/features/pccu/engine/GlobalScraperWebView.tsx`
- Modify: `src/features/pccu/engine/__tests__/GlobalScraperWebView.test.tsx`
- Modify: `src/features/grade/infrastructure/sync/__tests__/gradeWorkflow.test.ts`

- [ ] **Step 1: Move the legacy Grade handoff assertion to the workflow contract**

Add the equivalent of the current `navigates grade popup through TransUrl` test to `gradeWorkflow.test.ts`, using the real Grade workflow session and fake host effects:

```ts
it('preserves the 1220 popup handoff and injects only after an AP2 target navigation', () => {
  const session = registeredGrade.start(context);
  dispatch(session, started(1_000));
  dispatch(session, sessionReady(1_100));

  expect(dispatch(session, popup(TRANS_URL, 1_200))).toEqual([
    effect(identity, { type: 'navigate', url: TRANS_URL }),
  ]);
  expect(dispatch(session, navigation(GRADE_INDEX_URL, 1_500))).toEqual([
    effect(identity, { type: 'heartbeat' }),
    effect(identity, { type: 'schedule', token: 'inject-grade', delayMs: 1_200 }),
  ]);
  expect(dispatch(session, timer('inject-grade', 2_700))).toEqual([
    effect(identity, { type: 'inject-java-script', script: expect.stringContaining('grade_html') }),
  ]);
});
```

- [ ] **Step 2: Write the failing GlobalScraper source-boundary assertion**

```ts
it('contains no Grade implementation after registry cutover', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../GlobalScraperWebView.tsx'), 'utf8');
  expect(source).not.toMatch(/normalizeGradeUrl|isGradeQueryUrl|persistGrades|saveGrades/);
  expect(source).not.toMatch(/parseGradesFromHtml|SemesterGrade|buildGradeExtractionScript|buildRobustGradePageScript/);
  expect(source).not.toContain("type === 'grade'");
});
```

- [ ] **Step 3: Run Grade and shared-scraper tests and verify RED**

Run:

```powershell
npm.cmd test -- --runInBand src/features/grade/infrastructure/sync/__tests__/gradeWorkflow.test.ts src/features/pccu/engine/__tests__/GlobalScraperWebView.test.tsx
```

Expected: FAIL because the Global controller still owns Grade URL matching, injection, parsing, retries, and storage.

- [ ] **Step 4: Delete Grade from the legacy controller**

Remove:

- Grade parser, type, storage, and script imports.
- `normalizeGradeUrl` and `isGradeQueryUrl`.
- Grade choices inside `injectPccuScript` and `openPccuTarget`.
- `persistGrades`.
- Grade navigation, message, retry-label, load-end, and error-message branches.
- the legacy Grade test that is now covered by the registered workflow contract.

The registered-workflow branch introduced in Task 7 already catches `grade` before Schedule/Tutoring fallback. Simplify the remaining PCCU legacy branch to Schedule-only logic; do not create a Grade compatibility `if` elsewhere.

- [ ] **Step 5: Verify no Grade implementation remains under PCCU transport**

Run:

```powershell
rg -n "parseGradesFromHtml|SemesterGrade|CourseGrade|buildRobustGradePageScript|buildGradePageScript|type === 'grade'" src/features/pccu
```

Expected: no output. Shared login and `buildServiceOpenScript` remain because later Schedule/Tutoring workflows still use them.

- [ ] **Step 6: Run Grade, Traffic, host, and legacy regression tests**

Run:

```powershell
npm.cmd test -- --runInBand src/features/grade src/features/traffic src/core/sync/webview src/features/pccu/engine src/features/pccu/sync src/features/pccu/parsers
npm run typecheck
```

Expected: PASS; Traffic and Grade resolve via registry, while Schedule and all Tutoring kinds still resolve via the compatibility fallback.

- [ ] **Step 7: Commit**

```powershell
git add src/features/pccu/engine/GlobalScraperWebView.tsx src/features/pccu/engine/__tests__/GlobalScraperWebView.test.tsx src/features/grade/infrastructure/sync/__tests__/gradeWorkflow.test.ts
git commit -m "refactor: extract grade from global scraper"
```

### Task 14: Enforce Phase 2A boundaries and run the full automated gate

**Files:**
- Create: `src/__tests__/workflowBoundaries.test.ts`
- Modify: `src/composition/sync.ts`

- [ ] **Step 1: Write source-boundary tests for workflows and host**

```ts
const read = (relativePath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

it.each([
  'src/features/traffic/infrastructure/sync/trafficWorkflow.ts',
  'src/features/grade/infrastructure/sync/gradeWorkflow.ts',
])('%s has no persistence, store, React, or WebView dependency', (file) => {
  const source = read(file);
  expect(source).not.toMatch(/AsyncStorage|storage\/|store\/|zustand|use[A-Z]|react-native-webview/);
  expect(source).not.toMatch(/Date\.now\s*\(/);
});

it('WebViewSessionHost has no feature dependency', () => {
  const source = read('src/core/sync/webview/WebViewSessionHost.tsx');
  expect(source).not.toMatch(/src\/features|\.\.\/\.\.\/features/);
  expect(source).not.toMatch(/AsyncStorage|expo-secure-store|zustand/);
});

it('GlobalScraper retains no extracted implementation', () => {
  const source = read('src/features/pccu/engine/GlobalScraperWebView.tsx');
  expect(source).not.toMatch(/TrafficPhase|trafficPhaseRef|parseGradesFromHtml|persistGrades|type === 'grade'|type === 'traffic'/);
});
```

- [ ] **Step 2: Add a concrete registry inventory assertion**

```ts
it('composition registers Traffic and Grade while later Phase 2 kinds remain legacy', () => {
  expect(syncComposition.registry.resolve('traffic')).not.toBe(syncComposition.legacyAdapters.get('traffic'));
  expect(syncComposition.registry.resolve('grade')).not.toBe(syncComposition.legacyAdapters.get('grade'));
  expect(syncComposition.registry.resolve('schedule')).toBe(syncComposition.legacyAdapters.get('schedule'));
  expect(syncComposition.registry.resolve('tutoring')).toBe(syncComposition.legacyAdapters.get('tutoring'));
  expect(syncComposition.registry.resolve('tutoring-detail')).toBe(syncComposition.legacyAdapters.get('tutoring-detail'));
  expect(syncComposition.registry.resolve('tutoring-download')).toBe(syncComposition.legacyAdapters.get('tutoring-download'));
  expect(syncComposition.registry.resolve('tutoring-upload')).toBe(syncComposition.legacyAdapters.get('tutoring-upload'));
});
```

- [ ] **Step 3: Run the boundary test and repair only real violations**

Run:

```powershell
npm.cmd test -- --runInBand src/__tests__/workflowBoundaries.test.ts
```

Expected: PASS. If a source assertion fails, move the offending responsibility to the feature application adapter, composition root, or core host port named in this plan; do not weaken the regex to permit the dependency.

- [ ] **Step 4: Run all focused Phase 2A suites with coverage**

Run:

```powershell
npm.cmd test -- --runInBand --coverage --collectCoverageFrom="src/core/sync/webview/**/*.{ts,tsx}" --collectCoverageFrom="src/features/traffic/{domain,infrastructure,application}/**/*.ts" --collectCoverageFrom="src/features/grade/{domain,infrastructure,application}/**/*.ts" src/core/sync/webview src/features/traffic src/features/grade src/__tests__/workflowBoundaries.test.ts
```

Expected: all suites pass; new workflow, protocol, host, and application modules meet at least 80% line coverage, and protocol/host critical branches meet the architecture's 90% branch target.

- [ ] **Step 5: Run repository verification**

Run:

```powershell
npm run verify
```

Expected: typecheck and the entire Jest suite pass, including unchanged Schedule, Tutoring, auth bootstrap, routes, Home, and notifications tests.

- [ ] **Step 6: Run the final Expo export smoke**

Run:

```powershell
npx expo export --platform ios --output-dir dist/phase-2a-traffic-grade-export
```

Expected: Expo exits 0; the bundle contains no unresolved old parser/script path and no production syntax error.

- [ ] **Step 7: Commit the boundary gate**

```powershell
git add src/__tests__/workflowBoundaries.test.ts src/composition/sync.ts
git commit -m "test: enforce extracted workflow boundaries"
```

### Task 15: Final Expo Go regression and handoff

**Files:**
- Verify only.

- [ ] **Step 1: Start the accepted build in Expo Go**

Run:

```powershell
npm start -- --clear
```

Expected: the app cold-launches without Metro errors and the Phase 0/1 bootstrap path reaches Login or Home.

- [ ] **Step 2: Verify Grade end to end**

On the supported Expo Go device:

1. Sign in with valid saved credentials and open `/(tabs)/home/grade`.
2. Trigger refresh and verify the PCCU 1220 handoff reaches historical grades.
3. Verify semester titles, course names, credits, scores, averages, and rankings match the previously accepted screen.
4. Pull to refresh again and verify exactly one request runs.
5. Background during refresh, return, and retry; verify the cancelled generation cannot overwrite the later result.
6. Disable network and refresh; verify the last committed grades remain visible with a sanitized failure message.
7. Re-enable network and verify recovery.

Expected: all seven checks pass; no account, password, raw HTML, full URL query, or message payload appears in logs/debug UI.

- [ ] **Step 3: Re-run Traffic end to end after Grade registration**

Repeat the six Traffic actions from Task 8.

Expected: both directions still update, manual request policy still bypasses warmup coalescing, and Grade registration did not alter Traffic effects or storage.

- [ ] **Step 4: Verify legacy fallback and application shell**

Perform one refresh in Schedule, Tutoring overview, Tutoring detail, and each Expo Go-supported Tutoring file action. Then verify Home, Native Tabs, Grade details modal, theme switching, and biometric fallback entry.

Expected: later Phase 2 workflows retain current behavior, routes and modal headers remain intact, and no second WebView session is mounted.

- [ ] **Step 5: Verify logout/account isolation inherited from Phase 0/1**

Log out while no sync is active, sign in again, then repeat with a sync active.

Expected: active and queued requests settle as typed cancellation, the WebView session resets, and no Traffic/Grade data from the previous account appears after the next login. Any failure blocks Phase 2A completion and is fixed in the owning Phase 0/1 interface rather than bypassed in a feature workflow.

- [ ] **Step 6: Inspect final diff and commit history**

Run:

```powershell
git status --short
git diff --stat HEAD~13..HEAD
git log -13 --oneline
```

Expected: only Phase 2A core seam, Traffic, Grade, composition, focused PCCU deletions, fixtures, and tests changed; there are thirteen focused commits including the initial red host-contract commit, with no generated `dist` files staged.

## Completion criteria

- Traffic passed the registry, automated, export, and Expo Go checkpoint before Grade production work began.
- Traffic and Grade each own domain types, a hand-written runtime decoder, a pure reducer with typed effects, a `SyncWorkflow` adapter, and contract tests.
- `WebViewSessionHost` owns one WebView and executes only identity-bound core effects.
- Traffic and Grade workflows import neither storage nor Zustand; storage failures surface as `storage` and success is exposed only after persistence.
- `GlobalScraperWebView` contains no Traffic or Grade state, navigation, message, parser, retry, storage, or error branch.
- Schedule and Tutoring remain callable through the Phase 1 compatibility fallback.
- Full verification, coverage thresholds, Expo export, and the Expo Go regression checklist pass.
