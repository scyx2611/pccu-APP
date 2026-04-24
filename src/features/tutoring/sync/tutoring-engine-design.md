# Tutoring Engine Integration Design

This document specifies how the tutoring sync lifecycle (currently in `useTutoringSync.ts`, 505 lines) will be migrated into the `PccuSyncEngine` + `GlobalScraperWebView` architecture.

---

## 1. 5-Phase State Machine Mapping

The current `SyncPhase` type is:

```
'idle' → 'logging_in' → 'fetching_courses' → 'fetching_details' → 'complete' | 'error'
```

### Mapping to PccuSyncEngine Lifecycle

| SyncPhase | PccuSyncEngine Phase | Description |
|---|---|---|
| `idle` | No request enqueued | No sync in progress |
| `logging_in` | `executeRequest` → session gate acquired → `load_ecampus` → `logging_in` | WebView loads ecampus default.aspx, injects login script |
| `fetching_courses` | `open_target` → navigate to icas.pccu.edu.tw → inject `buildTutoringOverviewScript()` | After login, open tutoring system, fetch course list |
| `fetching_details` | `syncing` → inject `buildTutoringAllAssignmentsScript()` → inject `buildTutoringPendingAssignmentsScript()` | Fetch all assignments then filter pending |
| `complete` | `done` → `finishPccu()` called | Sync finished, lease released |
| `error` | `done` (with error) → `finishPccu({ success: false })` | Sync failed |

### Progress Communication to UI

The current hook uses `statusText` (a `useState` string) for human-readable progress. In the engine architecture:

- **Engine → GlobalScraperWebView**: Progress is implicit in the `PccuPhase` transitions and `data.t` message types.
- **GlobalScraperWebView → UI Store**: The handler updates `useTutoringStore` directly:
  - `setSyncPhase(phase)` — mirrors the 5-phase state machine
  - `setSyncStatus('syncing' | 'idle' | 'error')` — high-level status
  - Store selectors like `syncPhase`, `syncStatus` replace the old `statusText` / `phaseRef`
- **Status text replacement**: The new `useTutoringSync` hook (Task 9) will derive `statusText` from `syncPhase` + `syncStatus` in the Zustand store, rather than maintaining a separate `useState`.

---

## 2. Two Sync Flows

### 2a. Full-Sync (`tutoring`)

Triggered by: `engine.requestSync('tutoring', 5)`

```
1. Session gate acquire → lease obtained
2. Load ecampus default.aspx → inject login script
3. login_ok → navigate to inside.aspx
4. inside.aspx → inject buildServiceOpenScript('1202')  [function code 1202]
5. Popup URL intercepted → navigate to icas.pccu.edu.tw/cfp/
6. icas.pccu.edu.tw loaded → inject buildWaitForCourseFpScript(buildTutoringOverviewScript())
7. courses message → persist courses, inject buildTutoringAllAssignmentsScript()
8. all_assignments message → persist all assignments, inject buildTutoringPendingAssignmentsScript()
9. pending message → persist pending assignments, finish
```

### 2b. Single-Course-Detail (`tutoring-detail`)

Triggered by: `engine.requestSync('tutoring-detail', 5, { courseCode: 'ABC123' })`

```
1. Session gate acquire → lease obtained
2. Load ecampus default.aspx → inject login script
3. login_ok → navigate to inside.aspx
4. inside.aspx → inject buildServiceOpenScript('1202')
5. Popup URL intercepted → navigate to icas.pccu.edu.tw/cfp/
6. icas.pccu.edu.tw loaded → inject buildWaitForCourseFpScript(buildTutoringSingleCourseScript(courseCode))
7. single_course message → update courseDetail in store, finish
```

The `courseCode` is passed via `request.options.courseCode` — the new `options` field on `SyncRequest`.

---

## 3. Session Gate Integration

`pccuBrowserSessionGate` is a mutex that ensures only one sync operation uses the shared WebView at a time.

### Current behavior (useTutoringSync):

```typescript
const lease = await pccuBrowserSessionGate.acquire(`tutoring:${courseCode || 'all'}:${syncRunId}`);
// ... sync work ...
lease.release();  // called in finish()
```

### Engine architecture:

The session gate is already integrated into `GlobalScraperWebView.executeRequest()`:

```typescript
const lease = await pccuBrowserSessionGate.acquire(`shared-scraper:${type}:${request.id}`);
```

For tutoring types, the owner string will be:
- `tutoring`: `shared-scraper:tutoring:{request.id}`
- `tutoring-detail`: `shared-scraper:tutoring-detail:{request.id}`

The lease is released in `finishPccu()`. No changes needed to the gate itself.

### Blocking behavior:

- If the gate is locked when `requestSync('tutoring')` is called, the engine queues the request. When the executor picks it up, `pccuBrowserSessionGate.acquire()` will queue behind the current owner.
- The current `useTutoringSync` had an early-return check: `if (pccuBrowserSessionGate.isLocked()) return;` — this **will not exist** in the engine architecture. The engine's queue handles serialization; the hook simply enqueues and awaits.

---

## 4. WebView Message Routing

All message types emitted by tutoring scripts and how `GlobalScraperWebView` should handle each:

| `data.t` | Source Script | Handler Action |
|---|---|---|
| `waiting` | `buildWaitForCourseFpScript` | Update store `syncPhase` progress (informational, no phase change) |
| `coursefp_ready` | `buildWaitForCourseFpScript` | Log, no action (next message will be the data) |
| `diagnostic` | `buildDiagnosticScript` | Log only |
| `final_diagnostic` | `buildWaitForCourseFpScript` (timeout) | Log only — the script itself follows up with an `err` message, so no separate error handling needed |
| `status` | Various scripts | Update store status text |
| `user_name` | Login script | `SecureStore.setItemAsync('user_name', data.n)` |
| `login_ok` | `buildLoginScript` | Navigate to `inside.aspx` (same as grade/schedule) |
| `login_fail` | `buildLoginScript` | `finishPccu({ success: false, message: '登入失敗' })` |
| `popup` | `buildServiceOpenScript` | Navigate WebView to `data.url` |
| `courses` | `buildTutoringOverviewScript` | Persist courses → set phase `fetching_details` → inject `buildTutoringAllAssignmentsScript()` |
| `all_assignments` | `buildTutoringAllAssignmentsScript` | Persist all assignments → inject `buildTutoringPendingAssignmentsScript()` |
| `pending` | `buildTutoringPendingAssignmentsScript` | Persist pending → update `lastSyncedAt` → `finishPccu({ success: true })` |
| `single_course` | `buildTutoringSingleCourseScript` | Update `courseDetails` in store → `finishPccu({ success: true })` |
| `err` | Any script | If phase is `fetching_courses` or `fetching_details`, retry; otherwise fail |
| `html` | Fallback | No-op (same as current) |

### Key difference from grade/schedule:

- Grade/schedule use `data.t === 'html'` as the primary data channel.
- Tutoring uses structured JSON messages (`courses`, `all_assignments`, `pending`, `single_course`).
- The `popup` message for tutoring uses function code **1202** (vs 1208 for schedule, 1220 for grade).

---

## 5. Navigation State Handling

The tutoring flow has a distinct navigation pattern:

```
ecampus/default.aspx  →  (login)  →  ecampus/inside.aspx  →  (gfOpenLink 1202)  →  icas.pccu.edu.tw/cfp/
```

### URL detection in `handleNavChange`:

| URL Pattern | Action |
|---|---|
| `inside.aspx` | Inject `buildServiceOpenScript('1202')` to open the tutoring function |
| `default.aspx` (during `logging_in`) | Inject `buildLoginScript(credentials)` |
| `icas.pccu.edu.tw` | Tutoring system loaded — branch based on sync type: |
| | - `tutoring`: inject `buildWaitForCourseFpScript(buildTutoringOverviewScript())` |
| | - `tutoring-detail`: inject `buildWaitForCourseFpScript(buildTutoringSingleCourseScript(courseCode))` |

### Differences from grade/schedule:

- Grade/schedule navigate to `ap1.pccu.edu.tw` or `ap2.pccu.edu.tw` via `TransUrl.aspx`.
- Tutoring navigates to `icas.pccu.edu.tw` — a completely different domain.
- The `isTransUrlForType()` helper does NOT apply to tutoring. Instead, the `icas.pccu.edu.tw` URL is the signal that the tutoring system is ready.
- The `inside.aspx` → `gfOpenLink` step uses function code `1202` (tutoring) instead of `1208` (schedule) or `1220` (grade).

### 3-second delay:

The current `useTutoringSync` uses a 3000ms `setTimeout` after `inside.aspx` loads and after `icas.pccu.edu.tw` loads. In the engine architecture, these delays should be preserved but may need adjustment:
- `inside.aspx` → `buildServiceOpenScript('1202')`: 1200ms delay (matching grade/schedule pattern in `openPccuTarget`)
- `icas.pccu.edu.tw` → `buildWaitForCourseFpScript(...)`: 3000ms delay (the CourseFP JS framework needs time to initialize)

---

## 6. Watchdog Timeout

### Current behavior (useTutoringSync):

- 30-second watchdog (`SESSION_ACTIVITY_TIMEOUT_MS = 30_000`)
- Armed on: session lease acquired, each `handleNavChange` (non-loading), each `handleMessage`
- On timeout: calls `finish()` with a timeout message, preserving old data if available

### Engine architecture:

The engine already has a 30-second task timeout (`TASK_TIMEOUT_MS = 30_000`) that calls the abort handler. However, the tutoring flow needs **activity-based timeout refresh** (not a single 30s wall-clock timeout).

**Solution**: Use `request.refreshTimeout()` — already available on `SyncRequest`. The tutoring handler in `GlobalScraperWebView` should call `pending.request.refreshTimeout?.()` on:
- Every `handleNavChange` event (when `nav.loading === false`)
- Every `handleMessage` event (for tutoring-relevant messages)

This resets the engine's 30s timer, effectively creating an activity-based watchdog identical to the current behavior.

**Timeout message**: When the engine timeout fires, the abort handler receives reason `'timeout'`. The handler should set an appropriate error message:
- If `pccuPhaseRef.current === 'logging_in'`: "登入逾時"
- Otherwise: "同步逾時"

---

## 7. Retry Logic

### Current behavior (useTutoringSync):

- `MAX_RETRIES = 2`
- On `err` message during `fetching_courses` or `fetching_details` phase:
  - Increment retry counter
  - Re-inject `buildTutoringOverviewScript()` (restart from course fetch)
  - If retries exhausted, call `finish()` with failure message

### Engine architecture:

The `PendingRequest` already has a `retries` field. The tutoring handler should:

1. On `data.t === 'err'` during `fetching_courses` or `fetching_details` (full-sync mode):
   - If `pending.retries < 2`: increment, re-inject `buildTutoringOverviewScript()`
   - If `pending.retries >= 2`: `finishPccu({ success: false, message: '同步失敗' })`
2. On `data.t === 'err'` during `fetching_single_course` (detail-sync mode):
   - If `pending.retries < 2`: increment, re-inject `buildTutoringSingleCourseScript(courseCode)` (NOT the overview script — we want to retry the specific course, not restart the entire flow)
   - If `pending.retries >= 2`: `finishPccu({ success: false, message: '課程資料同步失敗' })`
3. On `data.t === 'err'` during other phases (e.g. `waiting_coursefp`, `open_target`): fail immediately (no retry)

This mirrors the existing `retryPccu()` pattern used for grade/schedule, but the retry script differs by sync type: full-sync retries from the overview script, detail-sync retries the single-course script.

---

## 8. Progress Reporting

### Current behavior:

`useTutoringSync` maintains a `statusText` state variable updated at every phase transition and message event. The UI reads `statusText` directly.

### Engine architecture:

Progress reporting shifts to the Zustand store:

| Event | Store Update |
|---|---|
| Sync starts | `setSyncStatus('syncing')`, `setSyncPhase('logging_in')` |
| Login success | `setSyncPhase('logging_in')` (already set) |
| inside.aspx loaded | No phase change (still `logging_in`) |
| icas.pccu.edu.tw loaded | `setSyncPhase('fetching_courses')` or `setSyncPhase('fetching_details')` |
| courses received | `setSyncPhase('fetching_details')` |
| Sync complete | `setSyncPhase('complete')`, `setSyncStatus('idle')` |
| Sync failed | `setSyncPhase('error')`, `setSyncStatus('error')` |

The new `useTutoringSync` hook (Task 9) will derive `statusText` from `syncPhase`:

```typescript
const statusText = useMemo(() => {
  switch (syncPhase) {
    case 'logging_in': return '登入中...';
    case 'fetching_courses': return '同步課程列表中...';
    case 'fetching_details': return '同步作業狀態中...';
    case 'complete': return '課業資料同步完成';
    case 'error': return error ?? '同步失敗';
    default: return '';
  }
}, [syncPhase, error]);
```

This eliminates the need for the engine/WebView to push status text strings — it only pushes phase transitions.

---

## 9. New useTutoringSync Hook Design

The new hook will be a thin wrapper around `PccuSyncEngine`, following the `useScheduleSync` / `useTrafficSync` pattern.

### API Surface

```typescript
interface UseTutoringSyncReturn {
  /** Trigger a full tutoring sync (courses + assignments + pending). */
  sync: (options?: { priority?: number; silent?: boolean }) => Promise<void>;
  /** Trigger a single-course detail sync. */
  syncCourseDetail: (courseCode: string, options?: { priority?: number }) => Promise<void>;
  /** Whether a sync is currently in progress. */
  syncInProgress: boolean;
}
```

### Implementation sketch

```typescript
export function useTutoringSync() {
  const setSyncStatus = useTutoringStore((s) => s.setSyncStatus);
  const setSyncPhase = useTutoringStore((s) => s.setSyncPhase);
  const setLastSyncedAt = useTutoringStore((s) => s.setLastSyncedAt);
  const setError = useTutoringStore((s) => s.setError);
  const syncInProgressRef = useRef(false);

  const sync = useCallback(async (options?: { priority?: number; silent?: boolean }) => {
    if (syncInProgressRef.current) return;
    const { priority = 5, silent = false } = options ?? {};

    try {
      syncInProgressRef.current = true;
      if (!silent) setSyncStatus('syncing');

      const engine = PccuSyncEngine.getInstance();
      await engine.waitForExecutorReady();
      const result = await engine.requestSync('tutoring', priority);

      if (result?.success) {
        setLastSyncedAt(new Date());
        if (!silent) setSyncStatus('idle');
      } else {
        setError(result?.message ?? '課業同步失敗');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : '課業同步失敗');
    } finally {
      syncInProgressRef.current = false;
    }
  }, [setSyncStatus, setLastSyncedAt, setError]);

  const syncCourseDetail = useCallback(async (courseCode: string, options?: { priority?: number }) => {
    if (syncInProgressRef.current) return;
    const { priority = 5 } = options ?? {};

    try {
      syncInProgressRef.current = true;
      setSyncStatus('syncing');

      const engine = PccuSyncEngine.getInstance();
      await engine.waitForExecutorReady();
      const result = await engine.requestSync('tutoring-detail', priority, { courseCode });

      if (!result?.success) {
        setError(result?.message ?? '課程資料同步失敗');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : '課程資料同步失敗');
    } finally {
      syncInProgressRef.current = false;
    }
  }, [setSyncStatus, setError]);

  return { sync, syncCourseDetail, syncInProgress: syncInProgressRef.current };
}
```

### Key differences from the old hook:

- **No `webViewRef`** — the WebView is owned by `GlobalScraperWebView`, not the screen.
- **No `handleMessage` / `handleNavChange`** — these are handled inside `GlobalScraperWebView`.
- **No `phaseRef`** — phase is read from the Zustand store.
- **No `statusText`** — derived from `syncPhase` in the store.
- **No session gate logic** — handled by `GlobalScraperWebView.executeRequest()`.
- **No watchdog** — handled by the engine's timeout + `refreshTimeout()`.

---

## 10. GlobalScraperWebView Handler Design

### New types needed

```typescript
type TutoringPhase =
  | 'idle'
  | 'load_ecampus'
  | 'logging_in'
  | 'open_target'
  | 'waiting_coursefp'
  | 'fetching_courses'
  | 'fetching_details'
  | 'fetching_single_course'
  | 'done';
```

### ActiveMode expansion

```typescript
type ActiveMode = 'pccu' | 'pccu-tutoring' | 'traffic' | 'none';
```

Tutoring uses the same ecampus login flow as grade/schedule (PCCU mode), but diverges after `inside.aspx`. A separate mode `pccu-tutoring` isolates the tutoring-specific message/nav handling from the grade/schedule paths.

### Handler responsibilities

#### `executeRequest` additions:

When `type === 'tutoring'` or `type === 'tutoring-detail'`:
- Set `activeModeRef.current = 'pccu-tutoring'`
- Extract `courseCode` from `request.options?.courseCode` (for `tutoring-detail`)
- Store `courseCode` in a ref for use in nav/message handlers
- Follow the same PCCU login flow (load ecampus → login → inside.aspx)

#### `handleNavChange` additions (mode === 'pccu-tutoring'):

```typescript
if (url.includes('inside.aspx')) {
  // Inject buildServiceOpenScript('1202') — tutoring function code
  tutoringPhaseRef.current = 'open_target';
  setTimeout(() => {
    webViewRef.current?.injectJavaScript(buildServiceOpenScript('1202'));
  }, 1200);
  return;
}

if (url.includes('icas.pccu.edu.tw')) {
  // Tutoring system loaded
  const isDetail = pending.request.type === 'tutoring-detail';
  const courseCode = tutoringCourseCodeRef.current;

  if (isDetail && courseCode) {
    tutoringPhaseRef.current = 'fetching_single_course';
    setTimeout(() => {
      webViewRef.current?.injectJavaScript(
        buildWaitForCourseFpScript(buildTutoringSingleCourseScript(courseCode))
      );
    }, 3000);
  } else {
    tutoringPhaseRef.current = 'fetching_courses';
    setTimeout(() => {
      webViewRef.current?.injectJavaScript(
        buildWaitForCourseFpScript(buildTutoringOverviewScript())
      );
    }, 3000);
  }
  return;
}

if (url.includes('default.aspx') && tutoringPhaseRef.current === 'logging_in') {
  // Inject login script (same as grade/schedule)
  runLogin();
  return;
}
```

#### `handleMessage` additions (mode === 'pccu-tutoring'):

```typescript
// Shared messages (same as grade/schedule)
if (data.t === 'user_name' && data.n) { SecureStore.setItemAsync('user_name', data.n); return; }
if (data.t === 'login_ok') { navigate to inside.aspx; return; }
if (data.t === 'login_fail') { finishPccu({ success: false, message: '登入失敗' }); return; }
if (data.t === 'popup' && data.url) { navigate to data.url; return; }

// Tutoring-specific messages
if (data.t === 'courses') {
  await storageSetCourses(data.courses);
  storeSetCourses(data.courses);
  if (data.semester) storeSetSemester(data.semester);
  if (data.welcome) storeSetWelcomeText(data.welcome);
  tutoringPhaseRef.current = 'fetching_details';
  webViewRef.current?.injectJavaScript(buildTutoringAllAssignmentsScript());
  return;
}

if (data.t === 'all_assignments') {
  await setAllAssignments(data.items);
  webViewRef.current?.injectJavaScript(buildTutoringPendingAssignmentsScript());
  return;
}

if (data.t === 'pending') {
  await setPendingAssignments(data.items);
  storeSetPendingAssignments(data.items);
  storeSetLastSyncedAt(Date.now());
  finishPccu({ success: true, data: { success: true, updatedAt: Date.now() } });
  return;
}

if (data.t === 'single_course') {
  const detail = {
    announcements: data.announcements ?? [],
    materials: data.materials ?? [],
    assignments: data.assignments ?? [],
  };
  useTutoringStore.getState().updateCourseDetail(data.courseCode, detail);
  finishPccu({ success: true, data: { success: true, updatedAt: Date.now() } });
  return;
}

if (data.t === 'err') {
  const phase = tutoringPhaseRef.current;
  if (phase === 'fetching_courses' || phase === 'fetching_details' || phase === 'fetching_single_course') {
    // Retry logic
    if (pending.retries < 2) {
      pending.retries += 1;
      tutoringPhaseRef.current = 'fetching_courses';
      webViewRef.current?.injectJavaScript(buildTutoringOverviewScript());
    } else {
      finishPccu({ success: false, message: '同步失敗' });
    }
  } else {
    finishPccu({ success: false, message: data.m ? `同步失敗：${data.m}` : '同步失敗' });
  }
  return;
}

// Diagnostic / waiting messages — log only, no phase change
if (data.t === 'waiting' || data.t === 'coursefp_ready' || data.t === 'diagnostic' || data.t === 'final_diagnostic' || data.t === 'status') {
  console.log('[global-scraper][tutoring]', data.t, data);
  return;
}
```

### New imports needed in GlobalScraperWebView:

```typescript
import {
  buildTutoringOverviewScript,
  buildTutoringAllAssignmentsScript,
  buildTutoringPendingAssignmentsScript,
  buildTutoringSingleCourseScript,
  buildWaitForCourseFpScript,
} from '../../tutoring/sync/tutoringScripts';
import {
  setCourses as storageSetCourses,
  setPendingAssignments,
  setAllAssignments,
} from '../../tutoring/storage/tutoringStorage';
import { useTutoringStore } from '../../tutoring/store/useTutoringStore';
```

### New refs needed:

```typescript
const tutoringPhaseRef = useRef<TutoringPhase>('idle');
const tutoringCourseCodeRef = useRef<string | null>(null);
```

### Popup handling for tutoring:

The current `handleMessage` has a special case for schedule popups (`shouldForceTargetFromPopup`). Tutoring needs a similar but different handling:

- When `data.t === 'popup'` and the URL contains `1202` (tutoring function code), navigate to the popup URL.
- Unlike schedule, tutoring does NOT need to force-navigate to a known target URL. The popup URL leads to `icas.pccu.edu.tw`, which is the correct destination.

---

## Summary of Changes by Task

| Task | File | Change |
|---|---|---|
| **T7 (this task)** | `PccuSyncEngine.ts` | Add `'tutoring'` and `'tutoring-detail'` to `SyncType`; add `options?` to `SyncRequest` and `requestSync` signature |
| **T7 (this task)** | `tutoring-engine-design.md` | This design document |
| **T9** | `GlobalScraperWebView.tsx` | Add `pccu-tutoring` mode, `TutoringPhase`, nav/message handlers, imports |
| **T9** | `tutoring/hooks/useTutoringSync.ts` | Rewrite as thin `PccuSyncEngine` wrapper (remove WebView ownership) |
| **T9** | `tutoring/screens/TutoringScreen.tsx` | Remove embedded `<WebView>`, use new hook API |
| **T9** | `tutoring/screens/TutoringCourseDetailScreen.tsx` | Remove embedded `<WebView>`, use `syncCourseDetail()` |
