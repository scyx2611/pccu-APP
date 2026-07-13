# MyCCU Phase 2C Tutoring Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract Tutoring overview, course detail, download, and upload from `GlobalScraperWebView` into four typed, registry-driven workflows, preserve the current cache/store and screen behavior, and isolate native file operations behind a runtime capability that is verifiable in Expo Go and a development build.

**Architecture:** Phase 2C reuses the Phase 1 `SyncContractMap` and the Phase 2A/2B `SyncWorkflow`, `WorkflowRegistry`, and `WebViewSessionHost` without adding a second coordinator or WebView effect API. Feature-local decoders turn versioned envelopes into typed Tutoring events; pure reducers own the 1202 handoff, CourseFP readiness, legal event order, and retry limits; application adapters persist typed overview/detail payloads through the temporary legacy storage facade before publishing the compatibility store. Download/upload browser work is typed like every other workflow, while document picking, base64 cache I/O, and sharing live behind a Tutoring file-capability port so unsupported Expo Go behavior fails explicitly and the production path is checked in a development build.

**Tech Stack:** Expo SDK 54, React Native 0.81, React 19, TypeScript 5.9, Expo Router, React Native WebView, Zustand, AsyncStorage, `expo-document-picker`, `expo-file-system`, `expo-sharing`, Jest 29, React Native Testing Library, Expo Go, EAS development builds.

---

## Phase boundary and prerequisites

Implement this plan only after Phase 2B is merged and its Schedule automated, export, and Expo Go checkpoints pass. Phase 2C assumes these exact seams already exist:

- `src/core/sync/contracts.ts` exports `SyncContractMap`, `SyncInput`, `SyncOutput`, `SyncPolicy`, `SyncError`, and all seven stable `SyncKind` values.
- `src/core/sync/workflow.ts` exports `WorkflowIdentity`, `WorkflowContext`, `ValidatedWorkflowEvent`, `WorkflowEffect`, `WorkflowTransition`, and `SyncWorkflow`.
- `src/core/sync/WorkflowRegistry.ts` registers pure workflows and creates an identity-bound `WorkflowSession`.
- `src/core/sync/webview/WebViewSessionHost.tsx` is the only physical WebView owner and executes only `ensure-session`, `navigate`, `inject-java-script`, `heartbeat`, `schedule`, `complete`, and `fail` effects.
- `src/composition/sync.ts` resolves `traffic`, `grade`, and `schedule` through `WebViewWorkflowRuntime` adapters; the four Tutoring kinds still resolve to their retained Phase 1 legacy adapters.
- `src/features/pccu/engine/GlobalScraperWebView.tsx` contains no Traffic, Grade, or Schedule feature implementation after Phase 2B. Its remaining feature branch is Tutoring and is deleted only after all four Tutoring workflows are registered and accepted.
- `src/features/pccu/engine/compat/LegacyPccuSyncEngineFacade.ts` remains the typed request entry point for existing hooks during this phase. “Delete the legacy fallback” means replace the last four legacy execution adapters and remove their controller branches; do not bypass the coordinator.

Run this pre-flight from the repository root:

```powershell
rg -n "SyncContractMap|SyncWorkflow|class WorkflowRegistry|WebViewSessionHost" src/core/sync
npm.cmd test -- --runInBand src/core/sync src/features/pccu/engine src/features/tutoring
npm.cmd run typecheck
```

Expected: all four prerequisite symbols are found; the core, host, engine, and existing Tutoring suites pass; strict TypeScript exits 0. If the registry does not already resolve Traffic, Grade, and Schedule, stop and finish Phase 2A/2B rather than recreating those seams here.

## Locked payloads and retry policy

The four workflow outputs are fixed for this plan:

```ts
export type CourseCode = string;

export type TutoringOverviewPayload = {
  courses: TutoringCourse[];
  allAssignments: TutoringAssignment[];
  pendingAssignments: TutoringAssignment[];
  semester: string;
  welcome: string;
  updatedAt: number;
};

export type TutoringCourseDetailPayload = {
  courseCode: CourseCode;
  detail: CourseDetail;
  updatedAt: number;
};

export type TutoringDownloadResult = {
  fileName: string;
  mimeType: string;
  base64: string;
};

export type TutoringUploadResult = {
  message: string;
};
```

`updatedAt` is always the `now` carried by the terminal validated event. Reducers never call `Date.now()`. `TutoringDownloadResult` must contain non-empty base64; upload completion carries only the sanitized remote message because `WorkflowExecutionResult.updatedAt` already records completion time.

Retry behavior is deliberately operation-specific:

| Situation | Automatic behavior | Terminal behavior |
|---|---|---|
| 1202 `TransUrl` is still active after 2,500 ms | Navigate to `https://icas.pccu.edu.tw/cfp/` once | A second failed handoff is `navigation` |
| CourseFP/AjaxMethods is not ready | One identity-bound probe every 500 ms, at most 60 probes | Probe 60 fails with idle-safe `timeout` |
| Overview extraction posts `tutoring_error` | Restart at `tutoring_courses`, at most two retries after the initial attempt | Third failure is `parse` or `navigation` according to the event |
| Detail extraction posts `tutoring_error` | Reinject the same course detail script, at most two retries after the initial attempt | Third failure is `parse` |
| Download posts `tutoring_error` | No automatic retry; GET may be manually retried by the user | Typed failure preserves the screen |
| Upload posts `tutoring_error` | Never auto-retry after submission starts, preventing a duplicate upload | Typed failure offers a manual retry |

CourseFP probes and handoff fallback are workflow effects, not native timers hidden in `GlobalScraperWebView`. DOM polling internal to one injected extraction script may remain when it observes a single page, but cross-page retries and request completion belong to the reducer.

## File responsibility map

### Core, composition, and the final strangler deletion

- Modify: `src/core/sync/contracts.ts` — bind the four existing Tutoring contract-map entries to the complete feature payloads.
- Modify: `src/composition/sync.ts` — replace overview, then detail, then download/upload legacy adapters in the approved order.
- Modify: `src/features/pccu/engine/GlobalScraperWebView.tsx` — delete the remaining Tutoring state, storage/store imports, routing/message branches, and unregistered-feature fallback after cutover.
- Modify: `src/features/pccu/engine/__tests__/GlobalScraperWebView.test.tsx` — move behavior assertions to workflow/host tests and retain only generic host/controller coverage.
- Modify: `src/__tests__/workflowBoundaries.test.ts` — require all seven kinds to be registered and prohibit Tutoring implementation in the global controller.

### Tutoring domain and protocol

- Create: `src/features/tutoring/domain/types.ts` — move all declarations from the current `types.ts` and add the four complete workflow payload types.
- Modify: `src/features/tutoring/types.ts` — compatibility re-export only.
- Create: `src/features/tutoring/infrastructure/sync/tutoringPayloadDecoders.ts` — hand-written runtime decoding of courses, assignments, details, and file payloads.
- Create: `src/features/tutoring/infrastructure/sync/tutoringProtocol.ts` — map validated envelopes to operation-specific Tutoring events.
- Create: `src/features/tutoring/infrastructure/sync/__tests__/tutoringProtocol.test.ts` — valid/malformed event contracts for all four kinds.
- Create: `__fixtures__/messages/tutoring-courses-valid.json`, `tutoring-single-course-valid.json`, `tutoring-file-downloaded-valid.json`, and `tutoring-file-uploaded-valid.json`.

### Browser scripts and pure workflows

- Create: `src/features/tutoring/infrastructure/sync/scriptBuilder.ts` — identity-bound envelope posting plus the existing pure normalizers.
- Create: `src/features/tutoring/infrastructure/sync/tutoringScripts.ts` — migrated overview/detail/file builders and a one-shot CourseFP probe.
- Create: `src/features/tutoring/infrastructure/sync/__tests__/tutoringScripts.test.ts` — retain every current text/progress/file script assertion and add envelope identity assertions.
- Create: `src/features/tutoring/infrastructure/sync/tutoringWorkflowSupport.ts` and `__tests__/tutoringWorkflowSupport.test.ts` — shared 1202 handoff and CourseFP bootstrap reducer.
- Create: `src/features/tutoring/infrastructure/sync/tutoringOverviewWorkflow.ts` and `__tests__/tutoringOverviewWorkflow.test.ts`.
- Create: `src/features/tutoring/infrastructure/sync/tutoringDetailWorkflow.ts` and `__tests__/tutoringDetailWorkflow.test.ts`.
- Create: `src/features/tutoring/infrastructure/sync/tutoringDownloadWorkflow.ts` and `__tests__/tutoringDownloadWorkflow.test.ts`.
- Create: `src/features/tutoring/infrastructure/sync/tutoringUploadWorkflow.ts` and `__tests__/tutoringUploadWorkflow.test.ts`.
- Delete after all imports move: `src/features/tutoring/sync/tutoringScripts.ts`, `src/features/tutoring/sync/scriptBuilder.ts`, and `src/features/tutoring/sync/__tests__/tutoringScripts.test.ts`.

### Application, temporary persistence, and file capability

- Create: `src/features/tutoring/application/runTutoringOverviewSync.ts` and `__tests__/runTutoringOverviewSync.test.ts`.
- Create: `src/features/tutoring/application/runTutoringDetailSync.ts` and `__tests__/runTutoringDetailSync.test.ts`.
- Create: `src/features/tutoring/application/TutoringFileCapability.ts` — native file-operation port and availability result.
- Create: `src/features/tutoring/application/runTutoringDownloadSync.ts` and `__tests__/runTutoringDownloadSync.test.ts`.
- Create: `src/features/tutoring/application/runTutoringUploadSync.ts` and `__tests__/runTutoringUploadSync.test.ts`.
- Create: `src/features/tutoring/infrastructure/files/expoTutoringFileCapability.ts` and `__tests__/expoTutoringFileCapability.test.ts`.
- Modify: `src/features/tutoring/storage/tutoringStorage.ts` — add throwing `commitTutoringOverview` and `commitTutoringCourseDetail` compatibility commits; Phase 3 replaces them with the account-scoped repository.
- Modify: `src/features/tutoring/hooks/useTutoringSync.ts` and `hooks/__tests__/useTutoringSync.test.tsx` — call typed application adapters; keep `silent` presentation-only.
- Modify: `src/features/tutoring/services/tutoringFileActions.ts` — retain its two public functions while delegating to typed application adapters and the file capability.
- Create: `src/features/tutoring/services/__tests__/tutoringFileActions.test.ts` — public compatibility and cancellation coverage.
- Modify: `src/features/tutoring/__tests__/tutoringSync.test.ts` and `components/__tests__/TutoringBackgroundWarmup.test.tsx` — update compatibility assertions without weakening deduplication/warmup behavior.

### Verification artifact

- Create after real device checks: `docs/verification/myccu-refactor-phase-2c.md` — actual commit SHA, command results, device/build versions, and sanitized pass/fail evidence only.

## Effect, persistence, and capability invariants

- All four workflows declare `['ecampus.pccu.edu.tw', 'icas.pccu.edu.tw']`; popup, navigation, error, and download URLs still pass through the core exact-host/HTTPS policy.
- A workflow imports no React, WebView, AsyncStorage, Zustand, DocumentPicker, FileSystem, or Sharing module. It parses no raw JSON and calls no clock or timer API.
- Every script-generated message contains version `1`, request ID, generation, nonce, and the exact `syncKind`. No Tutoring message reaches native with legacy top-level `t`, `m`, `items`, `courses`, or `base64` fields.
- `runTutoringOverviewSync` and `runTutoringDetailSync` report success only after the temporary persistence function resolves. Store publication happens afterward in `useTutoringSync`; a rejected write preserves the previous store projection and returns `storage`.
- The temporary multi-key Tutoring commits are intentionally not described as atomic. Phase 3 replaces them with generation-scoped chunks and one active manifest; Phase 2C merely stops swallowing write failures and centralizes the commit call.
- File capability is checked before a download request and before document picking. Unsupported capability becomes `SyncError('unsupported', ...)`, not a missing-module crash. A canceled picker performs no upload request.
- Native file paths, file base64, raw response text, course content, account, and full URLs never enter structured logs or verification documents.

### Task 1: Move Tutoring contracts into the feature and complete the contract map

**Files:**
- Create: `src/features/tutoring/domain/types.ts`
- Modify: `src/features/tutoring/types.ts`
- Modify: `src/core/sync/contracts.ts`
- Create: `src/features/tutoring/domain/__tests__/types.test.ts`

- [ ] **Step 1: Write the compile-time contract test**

Create `src/features/tutoring/domain/__tests__/types.test.ts`:

```ts
import type { SyncInput, SyncOutput } from '../../../../core/sync/contracts';
import type {
  CourseCode,
  TutoringCourseDetailPayload,
  TutoringOverviewPayload,
} from '../types';

const courseCode: CourseCode = 'CS101';

const overview: TutoringOverviewPayload = {
  courses: [],
  allAssignments: [],
  pendingAssignments: [],
  semester: '1142',
  welcome: 'Welcome',
  updatedAt: 1_000,
};

const detail: TutoringCourseDetailPayload = {
  courseCode,
  detail: {
    announcements: [],
    materials: [],
    assignments: [],
    progress: [],
    classmates: [],
  },
  updatedAt: 2_000,
};

describe('Tutoring sync contracts', () => {
  it('binds the four public kinds to complete feature payloads', () => {
    const overviewOutput: SyncOutput<'tutoring'> = overview;
    const detailInput: SyncInput<'tutoring-detail'> = { courseCode };
    const detailOutput: SyncOutput<'tutoring-detail'> = detail;
    const downloadOutput: SyncOutput<'tutoring-download'> = {
      fileName: 'week-1.pdf', mimeType: 'application/pdf', base64: 'Zm9v',
    };
    const uploadOutput: SyncOutput<'tutoring-upload'> = { message: 'uploaded' };

    expect({ overviewOutput, detailInput, detailOutput, downloadOutput, uploadOutput })
      .toBeDefined();
  });

  it('rejects incomplete detail and download results at compile time', () => {
    // @ts-expect-error course detail output requires detail and updatedAt
    const incompleteDetail: SyncOutput<'tutoring-detail'> = { courseCode };
    // @ts-expect-error a download without base64 cannot complete
    const incompleteDownload: SyncOutput<'tutoring-download'> = {
      fileName: 'week-1.pdf', mimeType: 'application/pdf',
    };
    expect([incompleteDetail, incompleteDownload]).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the contract test and strict typecheck to verify RED**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/tutoring/domain/__tests__/types.test.ts
npm.cmd run typecheck
```

Expected: Jest or TypeScript fails because `domain/types.ts` and the complete overview/detail outputs do not exist. The failure must be a missing/incorrect contract, not a Jest environment error.

- [ ] **Step 3: Move the existing domain declarations and add the complete outputs**

Move every declaration currently in `src/features/tutoring/types.ts` into `domain/types.ts` without changing its field names. Add these declarations beside `CourseDetail`:

```ts
export type CourseCode = string;

export type TutoringOverviewPayload = {
  courses: TutoringCourse[];
  allAssignments: TutoringAssignment[];
  pendingAssignments: TutoringAssignment[];
  semester: string;
  welcome: string;
  updatedAt: number;
};

export type TutoringCourseDetailPayload = {
  courseCode: CourseCode;
  detail: CourseDetail;
  updatedAt: number;
};

export type TutoringDownloadCommand = {
  courseCode: CourseCode;
  kind: 'announcement' | 'material' | 'assignment' | 'submitted';
  fileName?: string;
  downloadUrl?: string;
  targetNo?: number | null;
  serialNo?: number | null;
  homeSn?: number | null;
};

export type TutoringDownloadResult = {
  fileName: string;
  mimeType: string;
  base64: string;
};

export type TutoringUploadCommand = {
  courseCode: CourseCode;
  homeSn: number;
  fileName: string;
  mimeType: string;
  base64: string;
};

export type TutoringUploadResult = { message: string };
```

Replace `src/features/tutoring/types.ts` completely:

```ts
export * from './domain/types';
```

- [ ] **Step 4: Bind the existing `SyncContractMap` entries to these exact types**

Remove the Phase 1 compatibility-summary Tutoring payload declarations and use type-only imports in `src/core/sync/contracts.ts`:

```ts
import type {
  CourseCode,
  TutoringCourseDetailPayload,
  TutoringDownloadCommand,
  TutoringDownloadResult,
  TutoringOverviewPayload,
  TutoringUploadCommand,
  TutoringUploadResult,
} from '../../features/tutoring/domain/types';

export interface SyncContractMap {
  // Traffic, Grade, and Schedule entries stay exactly as Phase 2B left them.
  tutoring: { input: undefined; output: TutoringOverviewPayload };
  'tutoring-detail': {
    input: { courseCode: CourseCode };
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
```

Do not add `silent`, native file paths, picker assets, or presentation messages to `SyncContractMap`.

- [ ] **Step 5: Run domain, existing UI, and type tests to verify GREEN**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/tutoring/domain/__tests__/types.test.ts src/features/tutoring/utils/__tests__/tutoringCourseCards.test.ts src/features/tutoring/screens/__tests__/TutoringCourseDetailScreen.test.ts
npm.cmd run typecheck
```

Expected: all focused suites pass; TypeScript exits 0; the compatibility re-export keeps current screens, storage, store, and utilities compiling.

- [ ] **Step 6: Commit the domain contract cut**

```powershell
git add src/core/sync/contracts.ts src/features/tutoring/domain src/features/tutoring/types.ts
git commit -m "refactor: own tutoring sync contracts"
```

### Task 2: Add hand-written protocol decoders for all four operations

**Files:**
- Create: `src/features/tutoring/infrastructure/sync/tutoringPayloadDecoders.ts`
- Create: `src/features/tutoring/infrastructure/sync/tutoringProtocol.ts`
- Create: `src/features/tutoring/infrastructure/sync/__tests__/tutoringProtocol.test.ts`
- Create: `__fixtures__/messages/tutoring-courses-valid.json`
- Create: `__fixtures__/messages/tutoring-single-course-valid.json`
- Create: `__fixtures__/messages/tutoring-file-downloaded-valid.json`
- Create: `__fixtures__/messages/tutoring-file-uploaded-valid.json`

- [ ] **Step 1: Add exact valid fixtures for every terminal payload family**

`__fixtures__/messages/tutoring-courses-valid.json`:

```json
{"version":1,"requestId":"tutoring-1","generation":7,"nonce":"nonce-7","syncKind":"tutoring","event":"tutoring_courses","payload":{"welcome":"Welcome","semester":"1142","semesters":["1142"],"courses":[{"courseCode":"CS101","coCourseCode":"","deptName":"CS","courseName":"Testing","label":"CS - Testing","credit":2,"isRemote":false,"announcementCount":1,"materialCount":2,"pollCount":0,"homeworkCount":1,"postCount":0}]}}
```

`__fixtures__/messages/tutoring-single-course-valid.json`:

```json
{"version":1,"requestId":"detail-1","generation":8,"nonce":"nonce-8","syncKind":"tutoring-detail","event":"tutoring_single_course","payload":{"courseCode":"CS101","courseInfo":{"teacherName":"Teacher","academicYearTerm":"1142","departmentClass":"CS1","requiredType":"required","creditText":"2","englishLevel":"N","scheduleText":"Tue 1-2","expectedEnrollment":"40"},"announcements":[],"materials":[],"assignments":[],"progress":[],"classmates":[]}}
```

`__fixtures__/messages/tutoring-file-downloaded-valid.json`:

```json
{"version":1,"requestId":"download-1","generation":9,"nonce":"nonce-9","syncKind":"tutoring-download","event":"tutoring_file_downloaded","payload":{"fileName":"week-1.pdf","mimeType":"application/pdf","base64":"Zm9v"}}
```

`__fixtures__/messages/tutoring-file-uploaded-valid.json`:

```json
{"version":1,"requestId":"upload-1","generation":10,"nonce":"nonce-10","syncKind":"tutoring-upload","event":"tutoring_file_uploaded","payload":{"message":"uploaded"}}
```

- [ ] **Step 2: Write valid, malformed, and cross-kind decoder tests**

Create tests that first call `decodeWebViewEnvelope`, then the feature decoder:

```ts
it.each([
  ['tutoring-courses-valid.json', decodeTutoringOverviewMessage, 'courses'],
  ['tutoring-single-course-valid.json', decodeTutoringDetailMessage, 'single-course'],
  ['tutoring-file-downloaded-valid.json', decodeTutoringDownloadMessage, 'file-downloaded'],
  ['tutoring-file-uploaded-valid.json', decodeTutoringUploadMessage, 'file-uploaded'],
])('decodes %s', (name, decode, type) => {
  const raw = fixture(name);
  const envelope = decodeWebViewEnvelope(raw, identityFromFixture(raw));
  expect(envelope.ok).toBe(true);
  if (!envelope.ok) return;
  expect(decode(envelope.value)).toEqual({
    ok: true,
    value: expect.objectContaining({ type }),
  });
});

it.each([
  ['tutoring_courses', { courses: [{ courseCode: 42 }], semester: '1142', welcome: '' }],
  ['tutoring_single_course', { courseCode: 'CS101', announcements: 'bad' }],
  ['tutoring_file_downloaded', { fileName: 'x.pdf', mimeType: 'application/pdf', base64: '' }],
  ['tutoring_file_uploaded', { message: { raw: true } }],
])('rejects malformed %s', (event, payload) => {
  const decoded = decodeTutoringMessageForTest(event, payload);
  expect(decoded).toEqual({
    ok: false,
    error: expect.objectContaining({ code: 'protocol' }),
  });
});

it('rejects a valid detail event delivered to the overview decoder', () => {
  expect(decodeTutoringOverviewMessage(detailEnvelope)).toEqual({
    ok: false,
    error: expect.objectContaining({ code: 'protocol' }),
  });
});
```

Also cover the shared service events `popup` with an HTTPS PCCU/ICAS URL, `status` with a string message, and `error`, plus `tutoring_coursefp_waiting` with a positive integer attempt and `tutoring_coursefp_ready`. Reject `javascript:` popup URLs, negative attempts, object messages, unknown events, wrong `syncKind`, and any nullable-number field containing a string. The generic `popup`/`status`/`error` names deliberately match the identity-aware `buildServiceOpenScript` already used by Grade and Schedule.

- [ ] **Step 3: Run the protocol suite to verify RED**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/tutoring/infrastructure/sync/__tests__/tutoringProtocol.test.ts
```

Expected: FAIL because the feature decoders do not exist.

- [ ] **Step 4: Implement reusable payload primitives without assertions**

Create `tutoringPayloadDecoders.ts` with these public primitives and use them for every nested row:

```ts
import { SyncError } from '../../../../core/sync/contracts';
import type { DecodeResult } from '../../../../core/sync/webview/protocol';
import type {
  CourseDetail,
  TutoringAssignment,
  TutoringCourse,
  TutoringDownloadResult,
  TutoringUploadResult,
} from '../../domain/types';

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const protocolFailure = <T>(message: string): DecodeResult<T> => ({
  ok: false,
  error: new SyncError('protocol', message),
});

const stringValue = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;
const booleanValue = (value: unknown): boolean | null =>
  typeof value === 'boolean' ? value : null;
const nullableNumber = (value: unknown): number | null | undefined =>
  value === null ? null : typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export function decodeTutoringCourse(value: unknown): DecodeResult<TutoringCourse> {
  if (!isRecord(value)) return protocolFailure('Tutoring course must be an object.');
  const strings = ['courseCode', 'coCourseCode', 'deptName', 'courseName', 'label'] as const;
  const counts = ['announcementCount', 'materialCount', 'pollCount', 'homeworkCount', 'postCount'] as const;
  if (strings.some((key) => stringValue(value[key]) === null)) {
    return protocolFailure('Tutoring course string fields are invalid.');
  }
  if (counts.some((key) => typeof value[key] !== 'number' || !Number.isFinite(value[key]))) {
    return protocolFailure('Tutoring course counts are invalid.');
  }
  const credit = nullableNumber(value.credit);
  if (credit === undefined || booleanValue(value.isRemote) === null) {
    return protocolFailure('Tutoring course credit or remote flag is invalid.');
  }
  return {
    ok: true,
    value: {
      courseCode: value.courseCode as string,
      coCourseCode: value.coCourseCode as string,
      deptName: value.deptName as string,
      courseName: value.courseName as string,
      label: value.label as string,
      credit,
      isRemote: value.isRemote as boolean,
      announcementCount: value.announcementCount as number,
      materialCount: value.materialCount as number,
      pollCount: value.pollCount as number,
      homeworkCount: value.homeworkCount as number,
      postCount: value.postCount as number,
    },
  };
}

export function decodeNonEmptyDownload(value: unknown): DecodeResult<TutoringDownloadResult> {
  if (!isRecord(value)) return protocolFailure('Download payload must be an object.');
  if (
    typeof value.fileName !== 'string' || !value.fileName.trim() ||
    typeof value.mimeType !== 'string' || !value.mimeType.trim() ||
    typeof value.base64 !== 'string' || !value.base64.trim()
  ) {
    return protocolFailure('Download payload requires fileName, mimeType, and base64.');
  }
  return { ok: true, value: {
    fileName: value.fileName,
    mimeType: value.mimeType,
    base64: value.base64,
  } };
}

export function decodeUploadResult(value: unknown): DecodeResult<TutoringUploadResult> {
  if (!isRecord(value) || typeof value.message !== 'string') {
    return protocolFailure('Upload payload requires a message.');
  }
  return { ok: true, value: { message: value.message } };
}
```

Implement `decodeTutoringAssignment` and `decodeCourseDetail` in the same module by validating every field in `domain/types.ts`: required text/boolean fields must have the exact primitive type; `mySn`, `homeSn`, counts, attachment serial/target numbers, and progress percent accept only finite number or `null`; optional attachment arrays, `progress`, `classmates`, and `courseInfo` are decoded recursively. Preserve empty arrays; never drop a malformed row or coerce a string number, because partial acceptance would persist an unvalidated snapshot.

- [ ] **Step 5: Implement four operation-specific envelope decoders**

Create `tutoringProtocol.ts` with exported unions and functions:

```ts
export type TutoringControlMessage =
  | { type: 'popup'; url: string }
  | { type: 'progress'; message: string }
  | { type: 'coursefp-waiting'; attempt: number; hasCourseFP: boolean; hasAjax: boolean; source: string }
  | { type: 'coursefp-ready'; attempt: number; source: string }
  | { type: 'remote-error'; message: string };

export type TutoringOverviewMessage = TutoringControlMessage |
  { type: 'courses'; courses: TutoringCourse[]; semester: string; welcome: string } |
  { type: 'all-assignments'; items: TutoringAssignment[] } |
  { type: 'pending'; items: TutoringAssignment[] };

export type TutoringDetailMessage = TutoringControlMessage |
  { type: 'single-course'; courseCode: CourseCode; detail: CourseDetail };

export type TutoringDownloadMessage = TutoringControlMessage |
  { type: 'file-downloaded'; result: TutoringDownloadResult };

export type TutoringUploadMessage = TutoringControlMessage |
  { type: 'file-uploaded'; result: TutoringUploadResult };

export function decodeTutoringOverviewMessage(
  envelope: ValidatedWebViewEnvelope,
): DecodeResult<TutoringOverviewMessage>;
export function decodeTutoringDetailMessage(
  envelope: ValidatedWebViewEnvelope,
): DecodeResult<TutoringDetailMessage>;
export function decodeTutoringDownloadMessage(
  envelope: ValidatedWebViewEnvelope,
): DecodeResult<TutoringDownloadMessage>;
export function decodeTutoringUploadMessage(
  envelope: ValidatedWebViewEnvelope,
): DecodeResult<TutoringUploadMessage>;
```

Each function first checks its exact `syncKind`, then switches exhaustively on the event names listed in Step 2. `tutoring_courses` decodes every course, `tutoring_all_assignments`/`tutoring_pending` decode every assignment, `tutoring_single_course` uses `decodeCourseDetail`, and the file events use the non-empty file decoders. Return `protocol` for an event that belongs to another Tutoring operation.

- [ ] **Step 6: Run protocol, envelope, and type tests to verify GREEN**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/tutoring/infrastructure/sync/__tests__/tutoringProtocol.test.ts src/core/sync/webview/__tests__/protocol.test.ts
npm.cmd run typecheck
```

Expected: every valid fixture decodes, every malformed/cross-kind case returns `protocol`, and strict TypeScript exits 0 with no `any` in either decoder file.

- [ ] **Step 7: Commit the protocol boundary**

```powershell
git add __fixtures__/messages/tutoring-*.json src/features/tutoring/infrastructure/sync/tutoringPayloadDecoders.ts src/features/tutoring/infrastructure/sync/tutoringProtocol.ts src/features/tutoring/infrastructure/sync/__tests__/tutoringProtocol.test.ts
git commit -m "feat: validate tutoring workflow messages"
```

### Task 3: Migrate Tutoring scripts to identity-bound envelopes and one-shot CourseFP probes

**Files:**
- Create: `src/features/tutoring/infrastructure/sync/scriptBuilder.ts`
- Create: `src/features/tutoring/infrastructure/sync/tutoringScripts.ts`
- Create: `src/features/tutoring/infrastructure/sync/__tests__/tutoringScripts.test.ts`
- Test source: `src/features/tutoring/sync/__tests__/tutoringScripts.test.ts`

- [ ] **Step 1: Copy every current script assertion to the infrastructure path before moving production**

Copy all assertions for text entity repair, UTF-8 mojibake repair, progress-document discrimination, full-content progress parsing, attachment discovery, FormData upload, and syntactic validity. Change only imports, then add this identity contract:

```ts
const overviewIdentity = {
  requestId: 'tutoring-1', generation: 7, nonce: 'nonce-7', syncKind: 'tutoring' as const,
};

it('posts versioned overview envelopes with the active identity', () => {
  const script = buildTutoringOverviewScript(overviewIdentity);
  expect(script).toContain('version: 1');
  expect(script).toContain('requestId: "tutoring-1"');
  expect(script).toContain('generation: 7');
  expect(script).toContain('nonce: "nonce-7"');
  expect(script).toContain("syncKind: 'tutoring'");
  expect(script).toContain("tutoring_courses");
  expect(script).not.toContain("postMessage(JSON.stringify({ t:");
});

it('builds a one-shot CourseFP probe without an internal interval', () => {
  const script = buildTutoringCourseFpProbeScript(overviewIdentity, 4);
  expect(script).toContain('findCourseFpContext');
  expect(script).toContain('tutoring_coursefp_ready');
  expect(script).toContain('tutoring_coursefp_waiting');
  expect(script).toContain('attempt: 4');
  expect(script).not.toContain('setInterval');
});
```

Add matching identity assertions for detail, download, and upload scripts. Their `syncKind` values must be exact and their terminal event names must be `tutoring_single_course`, `tutoring_file_downloaded`, and `tutoring_file_uploaded`.

- [ ] **Step 2: Run the moved script suite to verify RED**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/tutoring/infrastructure/sync/__tests__/tutoringScripts.test.ts
```

Expected: FAIL because the infrastructure builders and identity-aware signatures do not exist.

- [ ] **Step 3: Move `baseHelpers` and make `post` wrap one versioned envelope**

Move the current normalizers unchanged into the infrastructure `scriptBuilder.ts`. Replace its raw post helper and builder signature with:

```ts
import type { SyncKind } from '../../../../core/sync/contracts';
import type { WorkflowIdentity } from '../../../../core/sync/workflow';

type TutoringSyncKind = Extract<
  SyncKind,
  'tutoring' | 'tutoring-detail' | 'tutoring-download' | 'tutoring-upload'
>;

export function createTutoringScript<K extends TutoringSyncKind>(
  identity: WorkflowIdentity<K>,
  scriptBody: string,
): string {
  return `
    (function() {
      var identity = ${JSON.stringify(identity)};
      var eventNames = {
        courses: 'tutoring_courses',
        all_assignments: 'tutoring_all_assignments',
        pending: 'tutoring_pending',
        single_course: 'tutoring_single_course',
        file_downloaded: 'tutoring_file_downloaded',
        file_uploaded: 'tutoring_file_uploaded',
        popup: 'popup',
        status: 'status',
        waiting: 'tutoring_coursefp_waiting',
        coursefp_ready: 'tutoring_coursefp_ready',
        err: 'error'
      };
      function post(payload) {
        payload = payload || {};
        var event = eventNames[payload.t];
        var body = {};
        Object.keys(payload).forEach(function(key) {
          if (key !== 't' && key !== 'm') body[key] = payload[key];
        });
        if (payload.m != null) body.message = String(payload.m);
        window.ReactNativeWebView.postMessage(JSON.stringify({
          version: 1,
          requestId: identity.requestId,
          generation: identity.generation,
          nonce: identity.nonce,
          syncKind: identity.syncKind,
          event: event || 'tutoring_error',
          payload: event ? body : { message: 'Unknown Tutoring script event' }
        }));
      }
      ${baseHelpersWithoutPost}
      ${scriptBody}
    })();
    true;
  `;
}
```

Keep `baseHelpers` exported for the existing helper-expression tests, but export the version without the old `post` definition as `baseHelpersWithoutPost` so only one native post function is injected.

- [ ] **Step 4: Replace the interval wrapper with a one-shot readiness probe**

Move `getAjaxContextFromWindow`, `findCourseFpContext`, and `adoptCourseFpContext` from `buildWaitForCourseFpScript` into the generated one-shot probe:

```ts
export function buildTutoringCourseFpProbeScript<K extends TutoringSyncKind>(
  identity: WorkflowIdentity<K>,
  attempt: number,
): string {
  return createTutoringScript(identity, `
    var attempt = ${Math.max(1, Math.trunc(attempt))};
    var context = findCourseFpContext();
    var hasAjax = adoptCourseFpContext(context);
    var hasCourseFP = typeof window.CourseFP !== 'undefined';
    post({
      t: hasAjax ? 'coursefp_ready' : 'waiting',
      attempt: attempt,
      hasCourseFP: hasCourseFP,
      hasAjax: hasAjax,
      source: context ? context.source : ''
    });
  `);
}
```

There is no `setInterval`, no 60-attempt loop, and no callback script in this builder. The workflow schedules every probe and owns the limit.

- [ ] **Step 5: Move all extraction/file builders and change only their signatures/post boundary**

Preserve the current CourseFP methods, DOM selectors, progress fallbacks, attachment URL candidates, download response handling, and upload endpoints. Use these exact signatures:

```ts
export function buildTutoringOverviewScript(
  identity: WorkflowIdentity<'tutoring'>,
): string;
export function buildTutoringAllAssignmentsScript(
  identity: WorkflowIdentity<'tutoring'>,
): string;
export function buildTutoringPendingAssignmentsScript(
  identity: WorkflowIdentity<'tutoring'>,
): string;
export function buildTutoringSingleCourseScript(
  courseCode: CourseCode,
  identity: WorkflowIdentity<'tutoring-detail'>,
): string;
export function buildTutoringFileDownloadScript(
  request: TutoringDownloadCommand,
  identity: WorkflowIdentity<'tutoring-download'>,
): string;
export function buildTutoringFileUploadScript(
  request: TutoringUploadCommand,
  identity: WorkflowIdentity<'tutoring-upload'>,
): string;
```

Every builder calls `createTutoringScript(identity, body)`. Remove the unused private `buildWaitForCourseFpScriptLegacy`; do not copy it to the new path.

- [ ] **Step 6: Run the complete migrated script suite and typecheck**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/tutoring/infrastructure/sync/__tests__/tutoringScripts.test.ts
npm.cmd run typecheck
```

Expected: every prior script characterization passes at the new path; generated JavaScript parses; all four terminal scripts contain the active identity; the probe contains no interval; no new script emits an unversioned native message.

- [ ] **Step 7: Commit the identity-bound builders without deleting the old imports yet**

```powershell
git add src/features/tutoring/infrastructure/sync/scriptBuilder.ts src/features/tutoring/infrastructure/sync/tutoringScripts.ts src/features/tutoring/infrastructure/sync/__tests__/tutoringScripts.test.ts
git commit -m "refactor: version tutoring browser scripts"
```

### Task 4: Build the shared 1202 handoff and CourseFP bootstrap reducer

**Files:**
- Create: `src/features/tutoring/infrastructure/sync/tutoringWorkflowSupport.ts`
- Create: `src/features/tutoring/infrastructure/sync/__tests__/tutoringWorkflowSupport.test.ts`

- [ ] **Step 1: Write failing tests for handoff fallback and CourseFP limits**

Use fixed event timestamps and assert exact identity-bound effects:

```ts
it('ensures a PCCU session, opens 1202, and falls back from a stuck TransUrl once', () => {
  const first = reduceTutoringBootstrap(initial, started(1_000), deps);
  expect(first).toEqual(handled('ensuring-session', [
    effect(identity, { type: 'ensure-session', session: 'pccu' }),
  ]));

  const second = reduceTutoringBootstrap(first.state, sessionReady(1_100), deps);
  expect(second.effects).toEqual([
    effect(identity, { type: 'inject-java-script', script: 'open-1202;' }),
  ]);

  const third = reduceTutoringBootstrap(second.state, popup(TRANS_URL, 1_200), deps);
  expect(third.effects).toEqual([
    effect(identity, { type: 'navigate', url: TRANS_URL }),
    effect(identity, { type: 'schedule', token: 'tutoring-handoff-fallback', delayMs: 2_500 }),
  ]);

  const fallback = reduceTutoringBootstrap(
    third.state,
    timer('tutoring-handoff-fallback', 3_700),
    deps,
  );
  expect(fallback.effects).toEqual([
    effect(identity, { type: 'navigate', url: 'https://icas.pccu.edu.tw/cfp/' }),
  ]);
  expect(fallback.state.handoffFallbackUsed).toBe(true);
});

it('uses host schedule effects for at most sixty CourseFP probes', () => {
  let state = onIcasNavigationState(identity);
  for (let attempt = 1; attempt <= 59; attempt += 1) {
    const inject = reduceTutoringBootstrap(state, timer('tutoring-coursefp-probe', attempt * 500), deps);
    expect(inject.effects).toEqual([
      effect(identity, { type: 'inject-java-script', script: `coursefp-probe:${attempt};` }),
    ]);
    const waiting = reduceTutoringBootstrap(
      inject.state,
      courseFpWaiting(attempt, attempt * 500 + 1),
      deps,
    );
    expect(waiting.effects).toEqual([
      effect(identity, { type: 'heartbeat' }),
      effect(identity, { type: 'schedule', token: 'tutoring-coursefp-probe', delayMs: 500 }),
    ]);
    state = waiting.state;
  }

  const inject60 = reduceTutoringBootstrap(state, timer('tutoring-coursefp-probe', 30_000), deps);
  const terminal = reduceTutoringBootstrap(inject60.state, courseFpWaiting(60, 30_001), deps);
  expect(terminal.kind).toBe('failed');
  expect(terminal.error).toMatchObject({ code: 'timeout', timeoutKind: 'idle' });
});
```

Also assert: `tutoring_coursefp_ready` returns `kind: 'ready'`; an ICAS navigation schedules the first probe after 3,000 ms; a TransUrl load error uses the same one-time ICAS fallback; an unrelated load error returns `navigation`; late timers after `ready` produce no effects; and a `coursefp-waiting` attempt that does not equal the active attempt returns `protocol` rather than refreshing the request.

- [ ] **Step 2: Run the support suite to verify RED**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/tutoring/infrastructure/sync/__tests__/tutoringWorkflowSupport.test.ts
```

Expected: FAIL because the shared bootstrap reducer does not exist.

- [ ] **Step 3: Define the pure bootstrap state, events, and decisions**

```ts
export const TUTORING_ALLOWED_HOSTS = [
  'ecampus.pccu.edu.tw',
  'icas.pccu.edu.tw',
] as const;

export const TUTORING_HOME_URL = 'https://icas.pccu.edu.tw/cfp/';

export type TutoringBootstrapPhase =
  | 'idle'
  | 'ensuring-session'
  | 'opening-service'
  | 'waiting-icas'
  | 'probing-coursefp'
  | 'ready'
  | 'failed';

export type TutoringBootstrapState<K extends TutoringSyncKind> = {
  identity: WorkflowIdentity<K>;
  phase: TutoringBootstrapPhase;
  handoffFallbackUsed: boolean;
  courseFpAttempts: number;
};

export type TutoringBootstrapEvent<K extends TutoringSyncKind> =
  | Extract<ValidatedWorkflowEvent, {
      type: 'started' | 'session-ready' | 'session-error' | 'navigation' | 'load-error' | 'timer';
    }>
  | { type: 'popup'; identity: WorkflowIdentity<K>; url: string; now: number }
  | { type: 'coursefp-waiting'; identity: WorkflowIdentity<K>; attempt: number; now: number }
  | { type: 'coursefp-ready'; identity: WorkflowIdentity<K>; attempt: number; now: number }
  | { type: 'remote-error'; identity: WorkflowIdentity<K>; message: string; now: number };

export type TutoringNonTerminalEffect<K extends TutoringSyncKind> = Extract<
  WorkflowEffect<never>,
  { type: 'ensure-session' | 'navigate' | 'inject-java-script' | 'heartbeat' | 'schedule' }
> & WorkflowIdentity<K>;

export type TutoringBootstrapDecision<K extends TutoringSyncKind> =
  | { kind: 'handled'; state: TutoringBootstrapState<K>; effects: readonly TutoringNonTerminalEffect<K>[] }
  | { kind: 'ready'; state: TutoringBootstrapState<K>; effects: readonly TutoringNonTerminalEffect<K>[] }
  | { kind: 'unhandled'; state: TutoringBootstrapState<K>; effects: readonly [] }
  | { kind: 'failed'; state: TutoringBootstrapState<K>; effects: readonly []; error: SyncError };
```

Use a private `sameIdentity` guard even though the registry already filters host events. This makes the helper safe when tested directly and prevents a later workflow adapter from accidentally accepting an event for another kind.

- [ ] **Step 4: Implement the exact bootstrap dependencies and transition rules**

```ts
export type TutoringBootstrapDeps<K extends TutoringSyncKind> = {
  buildServiceScript(code: '1202', identity: WorkflowIdentity<K>): string;
  buildCourseFpProbeScript(identity: WorkflowIdentity<K>, attempt: number): string;
};

export const createTutoringBootstrapState = <K extends TutoringSyncKind>(
  identity: WorkflowIdentity<K>,
): TutoringBootstrapState<K> => ({
  identity,
  phase: 'idle',
  handoffFallbackUsed: false,
  courseFpAttempts: 0,
});

const isTutoringTransUrl = (url: string) =>
  /\/eCampus\/TransUrl\.aspx\?[^#]*\bPrjNo=1202\b/i.test(url);
const isIcasUrl = (url: string) => {
  try { return new URL(url).protocol === 'https:' && new URL(url).hostname === 'icas.pccu.edu.tw'; }
  catch { return false; }
};
```

Implement `reduceTutoringBootstrap(state, event, deps)` with this legal table:

1. `started/idle` → `ensuring-session` + `ensure-session`.
2. `session-ready/ensuring-session` → `opening-service` + identity-aware `buildServiceScript('1202', identity)` injection.
3. `popup/opening-service|waiting-icas` → navigate the HTTPS URL; when it is the 1202 TransUrl, also schedule `tutoring-handoff-fallback` for 2,500 ms.
4. ICAS `navigation` from `opening-service|waiting-icas|probing-coursefp` → `probing-coursefp` + heartbeat + a 3,000 ms first probe (500 ms for later ICAS navigations after fallback).
5. Handoff timer before ICAS → navigate `TUTORING_HOME_URL` once. If already used, return `navigation` failure.
6. Probe timer while `probing-coursefp` → increment `courseFpAttempts` and inject exactly one probe.
7. Matching `coursefp-waiting` attempts 1–59 → heartbeat + schedule next probe in 500 ms. Attempt 60 → `SyncError.timeout('idle', 'CourseFP was not ready after 60 probes.')`.
8. Matching `coursefp-ready` → `ready` + heartbeat.
9. A load error on the TransUrl uses the one fallback; another load/session error is a typed `navigation` or passed-through `session-error`.
10. Events after `ready` or `failed`, and host events not used by bootstrap, return `unhandled` with no effect.

No branch calls `Date.now`, `setTimeout`, WebView, or a feature store.

- [ ] **Step 5: Run support, host, and type tests to verify GREEN**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/tutoring/infrastructure/sync/__tests__/tutoringWorkflowSupport.test.ts src/core/sync/webview/__tests__/WebViewSessionHost.test.tsx
npm.cmd run typecheck
```

Expected: support and host tests pass; every scheduled action is an effect owned by the active identity; unmount/identity change leaves zero host timers.

- [ ] **Step 6: Commit the shared bootstrap machine**

```powershell
git add src/features/tutoring/infrastructure/sync/tutoringWorkflowSupport.ts src/features/tutoring/infrastructure/sync/__tests__/tutoringWorkflowSupport.test.ts
git commit -m "feat: add tutoring session bootstrap workflow"
```

### Task 5: Build and register the typed Tutoring overview workflow

**Files:**
- Create: `src/features/tutoring/infrastructure/sync/tutoringOverviewWorkflow.ts`
- Create: `src/features/tutoring/infrastructure/sync/__tests__/tutoringOverviewWorkflow.test.ts`
- Modify: `src/composition/sync.ts`

- [ ] **Step 1: Write the failing three-stage overview happy-path test**

Start from a bootstrap state that just became ready so the test isolates overview sequencing:

```ts
it('collects courses, all assignments, and pending assignments before completion', () => {
  const ready = overviewStateReady(context);
  const start = reduceTutoringOverviewWorkflow(ready, bootstrapReady(1_000), deps);
  expect(start.state.phase).toBe('fetching-courses');
  expect(start.effects).toEqual([
    effect(identity, { type: 'inject-java-script', script: 'overview-script;' }),
  ]);

  const coursesStep = reduceTutoringOverviewWorkflow(
    start.state,
    coursesMessage(courses, '1142', 'Welcome', 1_100),
    deps,
  );
  expect(coursesStep.state.phase).toBe('fetching-all-assignments');
  expect(coursesStep.effects).toEqual([
    effect(identity, { type: 'heartbeat' }),
    effect(identity, { type: 'inject-java-script', script: 'all-assignments-script;' }),
  ]);

  const assignmentsStep = reduceTutoringOverviewWorkflow(
    coursesStep.state,
    allAssignmentsMessage(allAssignments, 1_200),
    deps,
  );
  expect(assignmentsStep.effects).toEqual([
    effect(identity, { type: 'heartbeat' }),
    effect(identity, { type: 'inject-java-script', script: 'pending-script;' }),
  ]);

  const terminal = reduceTutoringOverviewWorkflow(
    assignmentsStep.state,
    pendingMessage(pendingAssignments, 1_300),
    deps,
  );
  expect(terminal.effects).toEqual([
    effect(identity, {
      type: 'complete',
      updatedAt: 1_300,
      data: {
        courses,
        allAssignments,
        pendingAssignments,
        semester: '1142',
        welcome: 'Welcome',
        updatedAt: 1_300,
      },
    }),
  ]);
});
```

- [ ] **Step 2: Add failing retry, illegal-event, and terminal tests**

```ts
it('restarts overview at courses twice and fails the third extraction error', () => {
  let state = fetchingPendingState(context);
  for (let retry = 1; retry <= 2; retry += 1) {
    const failedStage = reduceTutoringOverviewWorkflow(
      state,
      remoteError('CourseFP response failed', 2_000 + retry),
      deps,
    );
    expect(failedStage.state).toMatchObject({ phase: 'retry-wait', operationAttempts: retry });
    expect(failedStage.effects).toEqual([
      effect(identity, { type: 'schedule', token: 'tutoring-overview-retry', delayMs: 500 }),
    ]);
    const retried = reduceTutoringOverviewWorkflow(
      failedStage.state,
      timer('tutoring-overview-retry', 2_500 + retry),
      deps,
    );
    expect(retried.effects).toEqual([
      effect(identity, { type: 'inject-java-script', script: 'overview-script;' }),
    ]);
    state = { ...retried.state, phase: 'fetching-pending' };
  }
  const terminal = reduceTutoringOverviewWorkflow(state, remoteError('still bad', 4_000), deps);
  expect(terminal.effects[0]).toEqual(
    effect(identity, { type: 'fail', error: expect.objectContaining({ code: 'parse' }) }),
  );
});

it('fails closed when pending arrives before courses', () => {
  const result = reduceTutoringOverviewWorkflow(
    { ...overviewStateReady(context), phase: 'fetching-courses' },
    pendingMessage([], 1_100),
    deps,
  );
  expect(result.effects[0]).toEqual(
    effect(identity, { type: 'fail', error: expect.objectContaining({ code: 'protocol' }) }),
  );
});
```

Also assert terminal idempotence, stale bootstrap events produce no effects, malformed messages fail during `decodeEvent`, and all decoded status/waiting messages cause heartbeat or bootstrap effects without entering the output payload.

- [ ] **Step 3: Run the overview workflow suite to verify RED**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/tutoring/infrastructure/sync/__tests__/tutoringOverviewWorkflow.test.ts
```

Expected: FAIL because the overview workflow does not exist.

- [ ] **Step 4: Define the state, decoded events, and pure dependencies**

```ts
export type TutoringOverviewPhase =
  | 'bootstrapping'
  | 'fetching-courses'
  | 'fetching-all-assignments'
  | 'fetching-pending'
  | 'retry-wait'
  | 'succeeded'
  | 'failed';

export type TutoringOverviewState = {
  identity: WorkflowIdentity<'tutoring'>;
  bootstrap: TutoringBootstrapState<'tutoring'>;
  phase: TutoringOverviewPhase;
  courses: TutoringCourse[];
  allAssignments: TutoringAssignment[];
  semester: string;
  welcome: string;
  operationAttempts: number;
};

export type TutoringOverviewEvent =
  | TutoringBootstrapEvent<'tutoring'>
  | { type: 'courses'; identity: WorkflowIdentity<'tutoring'>; courses: TutoringCourse[]; semester: string; welcome: string; now: number }
  | { type: 'all-assignments'; identity: WorkflowIdentity<'tutoring'>; items: TutoringAssignment[]; now: number }
  | { type: 'pending'; identity: WorkflowIdentity<'tutoring'>; items: TutoringAssignment[]; now: number }
  | { type: 'progress'; identity: WorkflowIdentity<'tutoring'>; message: string; now: number };

export type TutoringOverviewWorkflowDeps = TutoringBootstrapDeps<'tutoring'> & {
  buildOverviewScript(identity: WorkflowIdentity<'tutoring'>): string;
  buildAllAssignmentsScript(identity: WorkflowIdentity<'tutoring'>): string;
  buildPendingAssignmentsScript(identity: WorkflowIdentity<'tutoring'>): string;
};
```

- [ ] **Step 5: Implement the reducer and message-decoding adapter**

While `phase === 'bootstrapping'`, delegate bootstrap events to `reduceTutoringBootstrap`. Convert `kind: 'failed'` into one identity-bound `fail`; on `kind: 'ready'`, inject the overview script and enter `fetching-courses`. Implement the exact three legal data transitions from Step 1. On retry, clear `courses`, `allAssignments`, `semester`, and `welcome` so a later terminal payload cannot mix generations.

```ts
export function createTutoringOverviewWorkflow(
  deps: TutoringOverviewWorkflowDeps,
): SyncWorkflow<'tutoring', TutoringOverviewState, TutoringOverviewEvent> {
  return {
    kind: 'tutoring',
    allowedHosts: TUTORING_ALLOWED_HOSTS,
    initialState(context) {
      return {
        identity: context,
        bootstrap: createTutoringBootstrapState(context),
        phase: 'bootstrapping',
        courses: [],
        allAssignments: [],
        semester: '',
        welcome: '',
        operationAttempts: 0,
      };
    },
    decodeEvent(state, event) {
      if (event.type !== 'message') return { ok: true, value: event };
      const decoded = decodeTutoringOverviewMessage(event.envelope);
      if (!decoded.ok) return decoded;
      return { ok: true, value: toOverviewEvent(state.identity, decoded.value, event.now) };
    },
    transition: (state, event) => reduceTutoringOverviewWorkflow(state, event, deps),
  };
}
```

- [ ] **Step 6: Register only overview and assert the inventory**

```ts
const overviewAdapter = webViewWorkflowRuntime.createAdapter(createTutoringOverviewWorkflow({
  buildServiceScript: (code, identity) => buildServiceOpenScript(code, identity),
  buildCourseFpProbeScript: buildTutoringCourseFpProbeScript,
  buildOverviewScript: buildTutoringOverviewScript,
  buildAllAssignmentsScript: buildTutoringAllAssignmentsScript,
  buildPendingAssignmentsScript: buildTutoringPendingAssignmentsScript,
}));
const previousOverview = registry.replace(overviewAdapter);
if (previousOverview !== legacyAdapters.get('tutoring')) {
  throw new Error('tutoring_legacy_adapter_missing');
}
```

Add a test asserting `traffic`, `grade`, `schedule`, and `tutoring` no longer equal their retained legacy adapters; detail/download/upload still equal theirs. This order ensures overview is accepted before detail production cutover.

- [ ] **Step 7: Run workflow, registry, protocol, support, and type tests**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/tutoring/infrastructure/sync/__tests__/tutoringOverviewWorkflow.test.ts src/features/tutoring/infrastructure/sync/__tests__/tutoringWorkflowSupport.test.ts src/features/tutoring/infrastructure/sync/__tests__/tutoringProtocol.test.ts src/core/sync/__tests__/WorkflowRegistry.test.ts
npm.cmd run typecheck
```

Expected: all suites pass; overview resolves through the registry; all later Tutoring kinds remain on the compatibility fallback; the workflow source contains no storage/store/native/clock import.

- [ ] **Step 8: Commit the overview workflow**

```powershell
git add src/features/tutoring/infrastructure/sync/tutoringOverviewWorkflow.ts src/features/tutoring/infrastructure/sync/__tests__/tutoringOverviewWorkflow.test.ts src/composition/sync.ts
git commit -m "feat: register tutoring overview workflow"
```

### Task 6: Commit overview output before publishing the compatibility store

**Files:**
- Create: `src/features/tutoring/application/runTutoringOverviewSync.ts`
- Create: `src/features/tutoring/application/__tests__/runTutoringOverviewSync.test.ts`
- Modify: `src/features/tutoring/storage/tutoringStorage.ts`
- Modify: `src/features/tutoring/hooks/useTutoringSync.ts`
- Modify: `src/features/tutoring/hooks/__tests__/useTutoringSync.test.tsx`
- Modify: `src/features/tutoring/__tests__/tutoringSync.test.ts`
- Modify: `src/features/tutoring/components/__tests__/TutoringBackgroundWarmup.test.tsx`

- [ ] **Step 1: Write failing commit-order and storage-failure tests**

```ts
it('persists a typed overview before returning success', async () => {
  const order: string[] = [];
  const requestSync = jest.fn(async () => {
    order.push('workflow');
    return payload;
  });
  const persist = jest.fn(async () => { order.push('persist'); });

  await expect(runTutoringOverviewSync({ requestSync, persist }, policy)).resolves.toEqual({
    success: true,
    data: payload,
    updatedAt: payload.updatedAt,
  });
  expect(order).toEqual(['workflow', 'persist']);
});

it('maps a rejected overview commit to storage and does not publish', async () => {
  const publish = jest.fn();
  const persist = jest.fn(async () => { throw new Error('quota'); });
  const result = await runTutoringOverviewSync({ requestSync: successfulRequest, persist }, policy);
  if (result.success) publish(result.data);
  expect(result).toEqual({
    success: false,
    message: '課業資料儲存失敗',
    error: expect.objectContaining({ code: 'storage', retryable: true }),
  });
  expect(publish).not.toHaveBeenCalled();
});
```

Update hook tests so manual sync expects `{ reason: 'user', force: true }`, warmup expects `{ reason: 'warmup', force: false }`, and `silent` never appears inside workflow input. Preserve tests for cross-hook deduplication, fresh-cache guards, priority, and presentation-only silent failures.

- [ ] **Step 2: Run application and hook tests to verify RED**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/tutoring/application/__tests__/runTutoringOverviewSync.test.ts src/features/tutoring/hooks/__tests__/useTutoringSync.test.tsx
```

Expected: FAIL because the application adapter and typed commit do not exist and the hook still calls the engine directly.

- [ ] **Step 3: Add one throwing temporary overview commit**

Remove write-side `try/catch` blocks from `setTutoringData`, `setAllAssignments`, `setPendingAssignments`, and the `setCourseDetail` calls they invoke. Move in-memory cache mutation after the corresponding AsyncStorage write resolves. Add:

```ts
export async function commitTutoringOverview(
  payload: TutoringOverviewPayload,
): Promise<void> {
  await setTutoringData({
    courses: payload.courses,
    pendingAssignmentCount: payload.pendingAssignments.length,
    updatedAt: payload.updatedAt,
    semester: payload.semester,
    welcome: payload.welcome,
  });
  await setAllAssignments(payload.allAssignments);
  await setPendingAssignments(payload.pendingAssignments);
}
```

Read-side stale-cache handling remains for Phase 2C. Do not claim this three-step legacy commit is atomic; Phase 3 replaces it with generation staging and active-manifest promotion.

- [ ] **Step 4: Implement the typed overview application adapter**

```ts
export type TutoringOverviewRunResult =
  | { success: true; data: TutoringOverviewPayload; updatedAt: number }
  | { success: false; message: string; error: SyncError };

export async function runTutoringOverviewSync(
  deps: {
    requestSync: Pick<LegacyPccuSyncEngineFacade, 'requestSync'>['requestSync'];
    persist(payload: TutoringOverviewPayload): Promise<void>;
  },
  policy: SyncPolicy,
): Promise<TutoringOverviewRunResult> {
  let payload: TutoringOverviewPayload;
  try {
    payload = await deps.requestSync('tutoring', policy.priority, {
      reason: policy.reason,
      force: policy.force,
    });
  } catch (cause) {
    const error = toSyncError(cause);
    return { success: false, message: error.message, error };
  }
  try {
    await deps.persist(payload);
    return { success: true, data: payload, updatedAt: payload.updatedAt };
  } catch {
    return {
      success: false,
      message: '課業資料儲存失敗',
      error: new SyncError('storage', 'Tutoring overview commit failed.', {
        retryable: true,
      }),
    };
  }
}
```

The caught storage value is intentionally not attached to this presentation-independent error because it may contain platform details. Report it only through the centrally redacted logger if the application adapter already receives that logger as a dependency; never change the stable `SyncError` constructor or add a feature-local error.

- [ ] **Step 5: Make the hook publish only committed typed data**

```ts
const policy: SyncPolicy = {
  priority,
  reason: silent ? 'warmup' : 'user',
  force: options?.force ?? !silent,
};
const result = await runTutoringOverviewSync(
  {
    requestSync: pccuSyncFacade.requestSync.bind(pccuSyncFacade),
    persist: tutoringStorage.commitTutoringOverview,
  },
  policy,
);

if (result.success) {
  const store = useTutoringStore.getState();
  store.setCourses(result.data.courses);
  store.setPendingAssignments(result.data.pendingAssignments);
  store.setSemester(result.data.semester);
  store.setWelcomeText(result.data.welcome);
  store.setLastSyncedAt(result.data.updatedAt);
  if (!silent) {
    store.setSyncStatus('idle');
    store.setSyncPhase('complete');
  }
} else if (!silent) {
  setError(result.message);
}
```

Keep the module-level overview promise only as a compatibility guard; coordinator coalescing is still authoritative across callers. `silent` changes UI and maps to `reason`, but is never placed in `SyncContractMap['tutoring']['input']`.

- [ ] **Step 6: Replace obsolete source assertions with application-boundary assertions**

In `tutoringSync.test.ts`, replace the test that looks for `persistCourseDetail` inside `GlobalScraperWebView` with assertions that `runTutoringOverviewSync` imports neither store nor WebView and that the hook publishes only after its mocked persistence promise resolves. Keep the no-WebView screen assertions and all warmup behavior tests.

- [ ] **Step 7: Run overview application, hook, warmup, storage, and type tests**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/tutoring/application/__tests__/runTutoringOverviewSync.test.ts src/features/tutoring/hooks/__tests__/useTutoringSync.test.tsx src/features/tutoring/__tests__/tutoringSync.test.ts src/features/tutoring/components/__tests__/TutoringBackgroundWarmup.test.tsx
npm.cmd run typecheck
```

Expected: success is visible only after persistence; rejected storage leaves previous store state and returns `storage`; silent warmup stays quiet; user sync remains ordered ahead of queued warmups.

- [ ] **Step 8: Commit the overview application cutover**

```powershell
git add src/features/tutoring/application/runTutoringOverviewSync.ts src/features/tutoring/application/__tests__/runTutoringOverviewSync.test.ts src/features/tutoring/storage/tutoringStorage.ts src/features/tutoring/hooks/useTutoringSync.ts src/features/tutoring/hooks/__tests__/useTutoringSync.test.tsx src/features/tutoring/__tests__/tutoringSync.test.ts src/features/tutoring/components/__tests__/TutoringBackgroundWarmup.test.tsx
git commit -m "refactor: commit tutoring overview before publication"
```

### Task 7: Accept overview before starting detail extraction

**Files:**
- Verify only; do not modify detail/download/upload production files.

- [ ] **Step 1: Run the automated overview slice**

```powershell
npm.cmd test -- --runInBand src/features/tutoring/domain src/features/tutoring/infrastructure/sync src/features/tutoring/application src/features/tutoring/hooks src/features/tutoring/components src/core/sync/webview src/features/pccu/engine
npm.cmd run typecheck
```

Expected: every focused suite passes; overview uses the registry; detail/download/upload remain callable through the compatibility fallback; Jest reports no pending timer/open-handle warning.

- [ ] **Step 2: Run an iOS export smoke before device testing**

```powershell
npx.cmd expo export --platform ios --output-dir dist/phase-2c-tutoring-overview-export
```

Expected: Expo exits 0 and produces the iOS bundle under the ignored `dist/phase-2c-tutoring-overview-export`; no module resolves from the future-deleted legacy Tutoring script path for the overview workflow.

- [ ] **Step 3: Start Expo Go with a clean Metro cache**

```powershell
npm.cmd start -- --clear
```

Expected: Metro displays an Expo Go QR code and the app cold-launches to Login or Home without a red screen.

- [ ] **Step 4: Verify Tutoring overview on the supported Expo Go device**

1. Sign in, open the Tutoring tab, and wait for the automatic overview refresh.
2. Verify course count, current semester, welcome text, and pending assignments match the previously accepted screen.
3. Pull to refresh and verify one visible user request runs ahead of any queued detail warmup.
4. Background the app during overview, foreground it, and refresh again; verify the cancelled generation cannot publish data after the later generation.
5. Disable network and refresh; verify the last committed overview remains visible with a sanitized failure.
6. Re-enable network and verify recovery without restarting.

Expected: all six checks pass. If any check fails, fix overview before Task 8; do not register detail to hide a shared handoff defect.

### Task 8: Build and register the typed course-detail workflow

**Files:**
- Create: `src/features/tutoring/infrastructure/sync/tutoringDetailWorkflow.ts`
- Create: `src/features/tutoring/infrastructure/sync/__tests__/tutoringDetailWorkflow.test.ts`
- Modify: `src/composition/sync.ts`

- [ ] **Step 1: Write the failing detail happy-path and course-identity tests**

```ts
it('waits for CourseFP, fetches one course, and completes the full detail payload', () => {
  const ready = detailStateReady({ ...context, input: { courseCode: 'CS101' } });
  const start = reduceTutoringDetailWorkflow(ready, bootstrapReady(1_000), deps);
  expect(start.state.phase).toBe('fetching-detail');
  expect(start.effects).toEqual([
    effect(identity, { type: 'inject-java-script', script: 'detail-script:CS101;' }),
  ]);

  const terminal = reduceTutoringDetailWorkflow(
    start.state,
    singleCourseMessage('CS101', detail, 1_500),
    deps,
  );
  expect(terminal.effects).toEqual([
    effect(identity, {
      type: 'complete',
      data: { courseCode: 'CS101', detail, updatedAt: 1_500 },
      updatedAt: 1_500,
    }),
  ]);
});

it('rejects a detail payload for a different course code', () => {
  const state = { ...detailStateReady(context), phase: 'fetching-detail' as const };
  const result = reduceTutoringDetailWorkflow(
    state,
    singleCourseMessage('CS999', detail, 1_500),
    deps,
  );
  expect(result.effects[0]).toEqual(
    effect(identity, { type: 'fail', error: expect.objectContaining({ code: 'protocol' }) }),
  );
});
```

- [ ] **Step 2: Add failing retry and terminal-idempotence tests**

Assert exactly two delayed `tutoring-detail-retry` effects, each reinjecting `buildDetailScript(state.courseCode, identity)` after 500 ms. The third remote error must emit one `parse` failure. A late `single-course`, retry timer, navigation, or CourseFP message after success/failure must return the same state and no effect.

- [ ] **Step 3: Run the detail workflow suite to verify RED**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/tutoring/infrastructure/sync/__tests__/tutoringDetailWorkflow.test.ts
```

Expected: FAIL because the detail workflow does not exist.

- [ ] **Step 4: Define the detail state and dependencies**

```ts
export type TutoringDetailPhase =
  | 'bootstrapping'
  | 'fetching-detail'
  | 'retry-wait'
  | 'succeeded'
  | 'failed';

export type TutoringDetailState = {
  identity: WorkflowIdentity<'tutoring-detail'>;
  bootstrap: TutoringBootstrapState<'tutoring-detail'>;
  phase: TutoringDetailPhase;
  courseCode: CourseCode;
  operationAttempts: number;
};

export type TutoringDetailEvent =
  | TutoringBootstrapEvent<'tutoring-detail'>
  | { type: 'single-course'; identity: WorkflowIdentity<'tutoring-detail'>; courseCode: CourseCode; detail: CourseDetail; now: number }
  | { type: 'progress'; identity: WorkflowIdentity<'tutoring-detail'>; message: string; now: number };

export type TutoringDetailWorkflowDeps = TutoringBootstrapDeps<'tutoring-detail'> & {
  buildDetailScript(
    courseCode: CourseCode,
    identity: WorkflowIdentity<'tutoring-detail'>,
  ): string;
};
```

- [ ] **Step 5: Implement the pure reducer and typed decoder bridge**

Delegate bootstrap exactly as overview does. When bootstrap becomes ready, inject one detail script. Treat decoded `progress` as heartbeat only. Accept `single-course` only in `fetching-detail` and only when its `courseCode` equals `state.courseCode`. On remote errors, schedule at most two retries; do not restart login unless the shared session driver emits `session-error`.

```ts
export function createTutoringDetailWorkflow(
  deps: TutoringDetailWorkflowDeps,
): SyncWorkflow<'tutoring-detail', TutoringDetailState, TutoringDetailEvent> {
  return {
    kind: 'tutoring-detail',
    allowedHosts: TUTORING_ALLOWED_HOSTS,
    initialState(context) {
      return {
        identity: context,
        bootstrap: createTutoringBootstrapState(context),
        phase: 'bootstrapping',
        courseCode: context.input.courseCode,
        operationAttempts: 0,
      };
    },
    decodeEvent(state, event) {
      if (event.type !== 'message') return { ok: true, value: event };
      const decoded = decodeTutoringDetailMessage(event.envelope);
      if (!decoded.ok) return decoded;
      return { ok: true, value: toDetailEvent(state.identity, decoded.value, event.now) };
    },
    transition: (state, event) => reduceTutoringDetailWorkflow(state, event, deps),
  };
}
```

- [ ] **Step 6: Register detail after the overview acceptance checkpoint**

```ts
const detailAdapter = webViewWorkflowRuntime.createAdapter(createTutoringDetailWorkflow({
  buildServiceScript: (code, identity) => buildServiceOpenScript(code, identity),
  buildCourseFpProbeScript: buildTutoringCourseFpProbeScript,
  buildDetailScript: buildTutoringSingleCourseScript,
}));
const previousDetail = registry.replace(detailAdapter);
if (previousDetail !== legacyAdapters.get('tutoring-detail')) {
  throw new Error('tutoring_detail_legacy_adapter_missing');
}
```

Assert registry inventory: Traffic, Grade, Schedule, overview, and detail differ from their legacy adapters; download/upload still equal theirs.

- [ ] **Step 7: Run detail, overview, support, registry, and type tests**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/tutoring/infrastructure/sync/__tests__/tutoringDetailWorkflow.test.ts src/features/tutoring/infrastructure/sync/__tests__/tutoringOverviewWorkflow.test.ts src/features/tutoring/infrastructure/sync/__tests__/tutoringWorkflowSupport.test.ts src/core/sync/__tests__/WorkflowRegistry.test.ts
npm.cmd run typecheck
```

Expected: all suites pass; the detail workflow is deterministic and storage-free; `courseCode` remains the route/resource identity; overview remains registered and unchanged.

- [ ] **Step 8: Commit the detail workflow**

```powershell
git add src/features/tutoring/infrastructure/sync/tutoringDetailWorkflow.ts src/features/tutoring/infrastructure/sync/__tests__/tutoringDetailWorkflow.test.ts src/composition/sync.ts
git commit -m "feat: register tutoring detail workflow"
```

### Task 9: Commit detail output before publishing the course-detail store entry

**Files:**
- Create: `src/features/tutoring/application/runTutoringDetailSync.ts`
- Create: `src/features/tutoring/application/__tests__/runTutoringDetailSync.test.ts`
- Modify: `src/features/tutoring/storage/tutoringStorage.ts`
- Modify: `src/features/tutoring/hooks/useTutoringSync.ts`
- Modify: `src/features/tutoring/hooks/__tests__/useTutoringSync.test.tsx`
- Modify: `src/features/tutoring/__tests__/tutoringSync.test.ts`

- [ ] **Step 1: Write failing detail commit-order and stale-store tests**

```ts
it('persists detail before returning typed success', async () => {
  const order: string[] = [];
  const requestSync = jest.fn(async () => {
    order.push('workflow');
    return { success: true as const, data: payload, updatedAt: payload.updatedAt };
  });
  const persist = jest.fn(async () => { order.push('persist'); });
  await expect(
    runTutoringDetailSync({ requestSync, persist }, 'CS101', policy),
  ).resolves.toEqual({ success: true, data: payload, updatedAt: 2_000 });
  expect(order).toEqual(['workflow', 'persist']);
});

it('preserves the previous detail projection when persistence rejects', async () => {
  const before = useTutoringStore.getState().courseDetails;
  const result = await runTutoringDetailSync(
    { requestSync: successfulRequest, persist: async () => { throw new Error('disk'); } },
    'CS101',
    policy,
  );
  expect(result).toEqual({
    success: false,
    message: '課程資料儲存失敗',
    error: expect.objectContaining({ code: 'storage' }),
  });
  expect(useTutoringStore.getState().courseDetails).toBe(before);
});
```

Keep tests proving that cached detail is skipped only when `courseInfo`, `progress`, and `classmates` have all been loaded; `force: true` bypasses the guard; silent prefetch does not surface loading/error UI; detail requests still deduplicate by normalized course code.

- [ ] **Step 2: Run detail application and hook tests to verify RED**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/tutoring/application/__tests__/runTutoringDetailSync.test.ts src/features/tutoring/hooks/__tests__/useTutoringSync.test.tsx
```

Expected: FAIL because `runTutoringDetailSync` and the centralized detail commit do not exist.

- [ ] **Step 3: Add one throwing temporary detail commit**

Remove write-side catches from `setCourseDetail` and `setCourseInfo`, and update their in-memory maps only after AsyncStorage resolves. Add:

```ts
export async function commitTutoringCourseDetail(
  payload: TutoringCourseDetailPayload,
): Promise<void> {
  const { courseCode, detail } = payload;
  await Promise.all([
    setCourseDetail(courseCode, 'announcements', detail.announcements),
    setCourseDetail(courseCode, 'materials', detail.materials),
    setCourseDetail(courseCode, 'assignments', detail.assignments),
    setCourseDetail(courseCode, 'progress', detail.progress ?? []),
    setCourseDetail(courseCode, 'classmates', detail.classmates ?? []),
    ...(detail.courseInfo ? [setCourseInfo(courseCode, detail.courseInfo)] : []),
  ]);
}
```

This preserves all current detail keys. Phase 3 replaces the `Promise.all` multi-key write with one generation commit; do not add another manifest scheme in Phase 2C.

- [ ] **Step 4: Implement the detail application adapter**

```ts
export type TutoringDetailRunResult =
  | { success: true; data: TutoringCourseDetailPayload; updatedAt: number }
  | { success: false; message: string; error: SyncError };

export async function runTutoringDetailSync(
  deps: {
    requestSync: Pick<LegacyPccuSyncEngineFacade, 'requestSync'>['requestSync'];
    persist(payload: TutoringCourseDetailPayload): Promise<void>;
  },
  courseCode: CourseCode,
  policy: SyncPolicy,
): Promise<TutoringDetailRunResult> {
  let payload: TutoringCourseDetailPayload;
  try {
    payload = await deps.requestSync('tutoring-detail', policy.priority, {
      courseCode,
      reason: policy.reason,
      force: policy.force,
    });
  } catch (cause) {
    const error = toSyncError(cause);
    return { success: false, message: error.message, error };
  }
  try {
    await deps.persist(payload);
    return { success: true, data: payload, updatedAt: payload.updatedAt };
  } catch {
    return {
      success: false,
      message: '課程資料儲存失敗',
      error: new SyncError('storage', 'Tutoring detail commit failed.', {
        retryable: true,
      }),
    };
  }
}
```

- [ ] **Step 5: Publish the store only from committed detail data**

The hook uses `{ reason: silent ? 'warmup' : 'user', force }`, passes no `silent` option to the workflow, and publishes exactly:

```ts
if (result.success) {
  useTutoringStore.getState().updateCourseDetail(
    result.data.courseCode,
    result.data.detail,
  );
  if (!silent) {
    setSyncStatus('idle');
    setSyncPhase('complete');
  }
} else if (!silent) {
  setError(result.message);
}
```

Normalize and validate a non-empty `courseCode` before calling the adapter. Keep the existing module-level detail-promise map as a compatibility guard until Phase 3 centralizes view-model state.

- [ ] **Step 6: Run detail application, hook, overview regression, and type tests**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/tutoring/application/__tests__/runTutoringDetailSync.test.ts src/features/tutoring/application/__tests__/runTutoringOverviewSync.test.ts src/features/tutoring/hooks/__tests__/useTutoringSync.test.tsx src/features/tutoring/__tests__/tutoringSync.test.ts
npm.cmd run typecheck
```

Expected: all pass; detail store publication follows persistence; silent detail warmup stays silent; overview behavior is unchanged.

- [ ] **Step 7: Commit the detail application cutover**

```powershell
git add src/features/tutoring/application/runTutoringDetailSync.ts src/features/tutoring/application/__tests__/runTutoringDetailSync.test.ts src/features/tutoring/storage/tutoringStorage.ts src/features/tutoring/hooks/useTutoringSync.ts src/features/tutoring/hooks/__tests__/useTutoringSync.test.tsx src/features/tutoring/__tests__/tutoringSync.test.ts
git commit -m "refactor: commit tutoring detail before publication"
```

### Task 10: Isolate document picking, cache I/O, and sharing behind a file capability

**Files:**
- Create: `src/features/tutoring/application/TutoringFileCapability.ts`
- Create: `src/features/tutoring/infrastructure/files/expoTutoringFileCapability.ts`
- Create: `src/features/tutoring/infrastructure/files/__tests__/expoTutoringFileCapability.test.ts`

- [ ] **Step 1: Write failing capability-available, unsupported, and cancellation tests**

```ts
it('reports unsupported when the native file module is incomplete', () => {
  const files = createExpoTutoringFileCapability({
    fileSystem: null,
    documentPicker,
    sharing,
  });
  expect(files.availability()).toEqual({
    available: false,
    error: expect.objectContaining({ code: 'unsupported', retryable: false }),
  });
});

it('returns picker cancellation without reading a file', async () => {
  documentPicker.getDocumentAsync.mockResolvedValue({ canceled: true, assets: null });
  const result = await availableFiles.pickSingleFile();
  expect(result).toEqual({ canceled: true });
  expect(fileSystem.readAsStringAsync).not.toHaveBeenCalled();
});

it('sanitizes, writes base64, and shares only when sharing is available', async () => {
  sharing.isAvailableAsync.mockResolvedValue(true);
  await expect(
    availableFiles.writeAndShare('week:/1?.pdf', 'application/pdf', 'Zm9v'),
  ).resolves.toBe('cache/week__1_.pdf');
  expect(fileSystem.writeAsStringAsync).toHaveBeenCalledWith(
    'cache/week__1_.pdf',
    'Zm9v',
    { encoding: 'base64' },
  );
  expect(sharing.shareAsync).toHaveBeenCalledWith(
    'cache/week__1_.pdf',
    { mimeType: 'application/pdf', UTI: 'application/pdf' },
  );
});
```

Also assert a picked asset maps to `{ uri, fileName, mimeType }`, `readBase64` passes `{ encoding: 'base64' }`, and neither the base64 nor URI is included in an error message.

- [ ] **Step 2: Run the capability suite to verify RED**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/tutoring/infrastructure/files/__tests__/expoTutoringFileCapability.test.ts
```

Expected: FAIL because the capability port and Expo adapter do not exist.

- [ ] **Step 3: Define the application port and pure filename sanitizer**

```ts
export type TutoringPickedFile = {
  uri: string;
  fileName: string;
  mimeType: string;
};

export type TutoringFileAvailability =
  | { available: true }
  | { available: false; error: SyncError };

export interface TutoringFileCapability {
  availability(): TutoringFileAvailability;
  pickSingleFile(): Promise<
    | { canceled: true }
    | { canceled: false; file: TutoringPickedFile }
  >;
  readBase64(uri: string): Promise<string>;
  writeAndShare(fileName: string, mimeType: string, base64: string): Promise<string>;
}

export function sanitizeTutoringFileName(value?: string | null): string {
  const cleaned = String(value || 'tutoring-file')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'tutoring-file';
}
```

- [ ] **Step 4: Implement the Expo adapter with injectable native dependencies**

```ts
type NativeFileSystemModule = {
  cacheDirectory?: string | null;
  readAsStringAsync?: (uri: string, options: { encoding: 'base64' }) => Promise<string>;
  writeAsStringAsync?: (
    uri: string,
    contents: string,
    options: { encoding: 'base64' },
  ) => Promise<void>;
};

export function createExpoTutoringFileCapability(deps: {
  fileSystem: NativeFileSystemModule | null;
  documentPicker: Pick<typeof DocumentPicker, 'getDocumentAsync'>;
  sharing: Pick<typeof Sharing, 'isAvailableAsync' | 'shareAsync'>;
}): TutoringFileCapability {
  const unsupported = () => new SyncError(
    'unsupported',
    'File actions are unavailable in this runtime. Use the MyCCU development build.',
  );

  const requireFileSystem = () => {
    const cacheDirectory = deps.fileSystem?.cacheDirectory;
    const read = deps.fileSystem?.readAsStringAsync;
    const write = deps.fileSystem?.writeAsStringAsync;
    if (!cacheDirectory || typeof read !== 'function' || typeof write !== 'function') {
      throw unsupported();
    }
    return { cacheDirectory, read, write };
  };

  const availability = (): TutoringFileAvailability => {
    try {
      requireFileSystem();
      return { available: true };
    } catch (error) {
      return {
        available: false,
        error: error instanceof SyncError ? error : unsupported(),
      };
    }
  };

  const pickSingleFile: TutoringFileCapability['pickSingleFile'] = async () => {
    requireFileSystem();
    const picked = await deps.documentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled) return { canceled: true };
    const asset = picked.assets[0];
    if (!asset?.uri) throw new SyncError('parse', 'The selected file has no readable URI.');
    return {
      canceled: false,
      file: {
        uri: asset.uri,
        fileName: sanitizeTutoringFileName(asset.name),
        mimeType: asset.mimeType || 'application/octet-stream',
      },
    };
  };

  const readBase64: TutoringFileCapability['readBase64'] = async (uri) => {
    const { read } = requireFileSystem();
    const base64 = await read(uri, { encoding: 'base64' });
    if (!base64) throw new SyncError('parse', 'The selected file was empty.');
    return base64;
  };

  const writeAndShare: TutoringFileCapability['writeAndShare'] = async (
    fileName,
    mimeType,
    base64,
  ) => {
    const { cacheDirectory, write } = requireFileSystem();
    const targetUri = `${cacheDirectory}${sanitizeTutoringFileName(fileName)}`;
    await write(targetUri, base64, { encoding: 'base64' });
    if (await deps.sharing.isAvailableAsync()) {
      await deps.sharing.shareAsync(targetUri, { mimeType, UTI: mimeType });
    }
    return targetUri;
  };

  return { availability, pickSingleFile, readBase64, writeAndShare };
}

export const expoTutoringFileCapability = createExpoTutoringFileCapability({
  fileSystem: requireOptionalNativeModule<NativeFileSystemModule>('ExponentFileSystem') ?? null,
  documentPicker: DocumentPicker,
  sharing: Sharing,
});
```

- [ ] **Step 5: Run capability and type tests to verify GREEN**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/tutoring/infrastructure/files/__tests__/expoTutoringFileCapability.test.ts
npm.cmd run typecheck
```

Expected: available, unavailable, picker-cancel, read, write, and optional-share cases pass; TypeScript exits 0; the application port imports no Expo module.

- [ ] **Step 6: Commit the file capability**

```powershell
git add src/features/tutoring/application/TutoringFileCapability.ts src/features/tutoring/infrastructure/files
git commit -m "refactor: isolate tutoring file capability"
```

### Task 11: Build the typed download workflow and application action

**Files:**
- Create: `src/features/tutoring/infrastructure/sync/tutoringDownloadWorkflow.ts`
- Create: `src/features/tutoring/infrastructure/sync/__tests__/tutoringDownloadWorkflow.test.ts`
- Create: `src/features/tutoring/application/runTutoringDownloadSync.ts`
- Create: `src/features/tutoring/application/__tests__/runTutoringDownloadSync.test.ts`
- Modify: `src/features/tutoring/services/tutoringFileActions.ts`
- Create: `src/features/tutoring/services/__tests__/tutoringFileActions.test.ts`
- Modify: `src/composition/sync.ts`

- [ ] **Step 1: Write failing download workflow tests**

```ts
it('injects one download after bootstrap and completes typed non-empty file data', () => {
  const state = downloadStateReady(context);
  const start = reduceTutoringDownloadWorkflow(state, bootstrapReady(1_000), deps);
  expect(start.effects).toEqual([
    effect(identity, { type: 'inject-java-script', script: 'download-script;' }),
  ]);
  const terminal = reduceTutoringDownloadWorkflow(
    start.state,
    fileDownloaded({ fileName: 'week.pdf', mimeType: 'application/pdf', base64: 'Zm9v' }, 1_500),
    deps,
  );
  expect(terminal.effects).toEqual([
    effect(identity, {
      type: 'complete',
      data: { fileName: 'week.pdf', mimeType: 'application/pdf', base64: 'Zm9v' },
      updatedAt: 1_500,
    }),
  ]);
});

it('fails once and does not schedule an automatic download retry', () => {
  const result = reduceTutoringDownloadWorkflow(
    { ...downloadStateReady(context), phase: 'downloading' },
    remoteError('HTTP 500', 1_500),
    deps,
  );
  expect(result.effects).toEqual([
    effect(identity, { type: 'fail', error: expect.objectContaining({ code: 'navigation' }) }),
  ]);
  expect(result.effects).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'schedule' }),
  ]));
});
```

Also assert wrong-kind messages fail protocol and terminal events are idempotent.

- [ ] **Step 2: Write failing application tests that check capability before network**

```ts
it('does not request a download when native file capability is unavailable', async () => {
  await expect(runTutoringDownloadSync({ requestSync, files: unsupportedFiles }, command, policy))
    .rejects.toMatchObject({ code: 'unsupported' });
  expect(requestSync).not.toHaveBeenCalled();
});

it('writes and shares the decoded file before returning its URI', async () => {
  const order: string[] = [];
  requestSync.mockImplementation(async () => {
    order.push('workflow');
    return downloadResult;
  });
  files.writeAndShare.mockImplementation(async () => {
    order.push('native');
    return 'cache/week.pdf';
  });
  await expect(runTutoringDownloadSync({ requestSync, files }, command, policy))
    .resolves.toBe('cache/week.pdf');
  expect(order).toEqual(['workflow', 'native']);
});
```

- [ ] **Step 3: Run workflow/application tests to verify RED**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/tutoring/infrastructure/sync/__tests__/tutoringDownloadWorkflow.test.ts src/features/tutoring/application/__tests__/runTutoringDownloadSync.test.ts
```

Expected: FAIL because neither download module exists.

- [ ] **Step 4: Implement the pure download workflow**

Use state `{ identity, bootstrap, phase: 'bootstrapping' | 'downloading' | 'succeeded' | 'failed', command }`. Delegate bootstrap; on ready inject `buildDownloadScript(command, identity)`; accept only `file-downloaded` in `downloading`; turn `remote-error` into a typed failure without a schedule effect.

```ts
export function createTutoringDownloadWorkflow(
  deps: TutoringBootstrapDeps<'tutoring-download'> & {
    buildDownloadScript(
      command: TutoringDownloadCommand,
      identity: WorkflowIdentity<'tutoring-download'>,
    ): string;
  },
): SyncWorkflow<'tutoring-download', TutoringDownloadState, TutoringDownloadEvent> {
  return {
    kind: 'tutoring-download',
    allowedHosts: TUTORING_ALLOWED_HOSTS,
    initialState: (context) => ({
      identity: context,
      bootstrap: createTutoringBootstrapState(context),
      phase: 'bootstrapping',
      command: context.input,
    }),
    decodeEvent: decodeDownloadWorkflowEvent,
    transition: (state, event) => reduceTutoringDownloadWorkflow(state, event, deps),
  };
}
```

- [ ] **Step 5: Implement `runTutoringDownloadSync` and retain the public service function**

```ts
export async function runTutoringDownloadSync(
  deps: { requestSync: Pick<LegacyPccuSyncEngineFacade, 'requestSync'>['requestSync']; files: TutoringFileCapability },
  command: TutoringDownloadCommand,
  policy: SyncPolicy,
): Promise<string> {
  const availability = deps.files.availability();
  if (!availability.available) throw availability.error;
  const result = await deps.requestSync('tutoring-download', policy.priority, {
    ...command,
    reason: policy.reason,
    force: policy.force,
  });
  return deps.files.writeAndShare(
    sanitizeTutoringFileName(result.fileName || command.fileName),
    result.mimeType || 'application/octet-stream',
    result.base64,
  );
}
```

`downloadTutoringFile(action)` keeps its current signature and calls this adapter with priority `3`, reason `user`, and `force: true`. It no longer imports `DocumentPicker`, `requireOptionalNativeModule`, Sharing, or the engine directly.

- [ ] **Step 6: Register download and test the service compatibility surface**

Create the runtime adapter with `webViewWorkflowRuntime.createAdapter(createTutoringDownloadWorkflow(...))`, replace `registry.resolve('tutoring-download')`, and assert the previous value equals `legacyAdapters.get('tutoring-download')`. Upload must still equal its legacy adapter. Service tests must assert the exact command mapping, returned cache URI, unsupported error propagation, and no base64/path logging.

- [ ] **Step 7: Run download, capability, service, registry, and type tests**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/tutoring/infrastructure/sync/__tests__/tutoringDownloadWorkflow.test.ts src/features/tutoring/application/__tests__/runTutoringDownloadSync.test.ts src/features/tutoring/infrastructure/files/__tests__/expoTutoringFileCapability.test.ts src/features/tutoring/services/__tests__/tutoringFileActions.test.ts src/core/sync/__tests__/WorkflowRegistry.test.ts
npm.cmd run typecheck
```

Expected: all pass; capability failure prevents network; valid base64 is written/shared; no automatic workflow retry exists; upload still uses the compatibility fallback.

- [ ] **Step 8: Commit the download path**

```powershell
git add src/features/tutoring/infrastructure/sync/tutoringDownloadWorkflow.ts src/features/tutoring/infrastructure/sync/__tests__/tutoringDownloadWorkflow.test.ts src/features/tutoring/application/runTutoringDownloadSync.ts src/features/tutoring/application/__tests__/runTutoringDownloadSync.test.ts src/features/tutoring/services/tutoringFileActions.ts src/features/tutoring/services/__tests__/tutoringFileActions.test.ts src/composition/sync.ts
git commit -m "feat: add typed tutoring download workflow"
```

### Task 12: Build the typed upload workflow and application action

**Files:**
- Create: `src/features/tutoring/infrastructure/sync/tutoringUploadWorkflow.ts`
- Create: `src/features/tutoring/infrastructure/sync/__tests__/tutoringUploadWorkflow.test.ts`
- Create: `src/features/tutoring/application/runTutoringUploadSync.ts`
- Create: `src/features/tutoring/application/__tests__/runTutoringUploadSync.test.ts`
- Modify: `src/features/tutoring/services/tutoringFileActions.ts`
- Modify: `src/features/tutoring/services/__tests__/tutoringFileActions.test.ts`
- Modify: `src/composition/sync.ts`

- [ ] **Step 1: Write failing upload workflow tests with duplicate-submit protection**

```ts
it('injects one upload and completes with the sanitized remote message', () => {
  const state = uploadStateReady(context);
  const start = reduceTutoringUploadWorkflow(state, bootstrapReady(1_000), deps);
  expect(start.effects).toEqual([
    effect(identity, { type: 'inject-java-script', script: 'upload-script;' }),
  ]);
  const terminal = reduceTutoringUploadWorkflow(
    start.state,
    fileUploaded({ message: 'uploaded' }, 1_500),
    deps,
  );
  expect(terminal.effects).toEqual([
    effect(identity, { type: 'complete', data: { message: 'uploaded' }, updatedAt: 1_500 }),
  ]);
});

it('never schedules an automatic retry after upload starts', () => {
  const result = reduceTutoringUploadWorkflow(
    { ...uploadStateReady(context), phase: 'uploading' },
    remoteError('unknown remote state', 1_500),
    deps,
  );
  expect(result.effects).toEqual([
    effect(identity, { type: 'fail', error: expect.objectContaining({ code: 'navigation' }) }),
  ]);
  expect(result.effects.some((effect) => effect.type === 'schedule')).toBe(false);
});
```

- [ ] **Step 2: Write failing picker, cancellation, and typed-command application tests**

```ts
it('returns cancellation and never reads or uploads', async () => {
  files.pickSingleFile.mockResolvedValue({ canceled: true });
  await expect(runTutoringUploadSync({ requestSync, files }, 'CS101', 42, policy))
    .resolves.toEqual({ canceled: true });
  expect(files.readBase64).not.toHaveBeenCalled();
  expect(requestSync).not.toHaveBeenCalled();
});

it('reads the selected file and sends one typed upload command', async () => {
  files.pickSingleFile.mockResolvedValue({
    canceled: false,
    file: { uri: 'cache/input.pdf', fileName: 'input.pdf', mimeType: 'application/pdf' },
  });
  files.readBase64.mockResolvedValue('Zm9v');
  requestSync.mockResolvedValue({ message: 'uploaded' });
  await expect(runTutoringUploadSync({ requestSync, files }, 'CS101', 42, policy))
    .resolves.toEqual({ canceled: false, result: { message: 'uploaded' } });
  expect(requestSync).toHaveBeenCalledWith('tutoring-upload', 2, {
    courseCode: 'CS101',
    homeSn: 42,
    fileName: 'input.pdf',
    mimeType: 'application/pdf',
    base64: 'Zm9v',
    reason: 'user',
    force: true,
  });
});
```

Add cases for `homeSn === null`, unsupported capability before picker, empty base64 read, workflow failure, and picker asset names requiring sanitization.

- [ ] **Step 3: Run upload workflow/application tests to verify RED**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/tutoring/infrastructure/sync/__tests__/tutoringUploadWorkflow.test.ts src/features/tutoring/application/__tests__/runTutoringUploadSync.test.ts
```

Expected: FAIL because the upload modules do not exist.

- [ ] **Step 4: Implement the upload workflow with no post-submit retry**

Use state `{ identity, bootstrap, phase: 'bootstrapping' | 'uploading' | 'succeeded' | 'failed', command }`. Delegate bootstrap; inject one upload script when ready; accept only `file-uploaded` in `uploading`; fail every remote error without a schedule effect. The adapter uses `decodeTutoringUploadMessage` and ignores all terminal-late events.

```ts
export function createTutoringUploadWorkflow(
  deps: TutoringBootstrapDeps<'tutoring-upload'> & {
    buildUploadScript(
      command: TutoringUploadCommand,
      identity: WorkflowIdentity<'tutoring-upload'>,
    ): string;
  },
): SyncWorkflow<'tutoring-upload', TutoringUploadState, TutoringUploadEvent> {
  return {
    kind: 'tutoring-upload',
    allowedHosts: TUTORING_ALLOWED_HOSTS,
    initialState: (context) => ({
      identity: context,
      bootstrap: createTutoringBootstrapState(context),
      phase: 'bootstrapping',
      command: context.input,
    }),
    decodeEvent: decodeUploadWorkflowEvent,
    transition: (state, event) => reduceTutoringUploadWorkflow(state, event, deps),
  };
}
```

- [ ] **Step 5: Implement the application adapter and public service delegation**

```ts
export type TutoringUploadActionResult =
  | { canceled: true }
  | { canceled: false; result: TutoringUploadResult };

export async function runTutoringUploadSync(
  deps: { requestSync: Pick<LegacyPccuSyncEngineFacade, 'requestSync'>['requestSync']; files: TutoringFileCapability },
  courseCode: CourseCode,
  homeSn: number | null,
  policy: SyncPolicy,
): Promise<TutoringUploadActionResult> {
  if (homeSn == null) throw new SyncError('unsupported', 'This assignment cannot accept a file upload.');
  const availability = deps.files.availability();
  if (!availability.available) throw availability.error;
  const picked = await deps.files.pickSingleFile();
  if (picked.canceled) return { canceled: true };
  const base64 = await deps.files.readBase64(picked.file.uri);
  if (!base64) throw new SyncError('parse', 'The selected file was empty.');
  const result = await deps.requestSync('tutoring-upload', policy.priority, {
    courseCode,
    homeSn,
    fileName: sanitizeTutoringFileName(picked.file.fileName),
    mimeType: picked.file.mimeType || 'application/octet-stream',
    base64,
    reason: policy.reason,
    force: policy.force,
  });
  return { canceled: false, result };
}
```

`uploadTutoringAssignmentFile(courseCode, homeSn)` retains its current public signature and delegates with priority `2`, reason `user`, and `force: true`.

- [ ] **Step 6: Register upload and assert all seven workflow kinds resolve**

Create the runtime adapter with `webViewWorkflowRuntime.createAdapter(createTutoringUploadWorkflow(...))`, replace `registry.resolve('tutoring-upload')`, and assert the previous value equals `legacyAdapters.get('tutoring-upload')`. The registry test now expects all seven kinds to differ from their retained legacy adapters. Do not delete the old branches until the complete file-operation slice passes.

- [ ] **Step 7: Run upload, download, capability, service, registry, and type tests**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/tutoring/infrastructure/sync/__tests__/tutoringUploadWorkflow.test.ts src/features/tutoring/infrastructure/sync/__tests__/tutoringDownloadWorkflow.test.ts src/features/tutoring/application/__tests__/runTutoringUploadSync.test.ts src/features/tutoring/application/__tests__/runTutoringDownloadSync.test.ts src/features/tutoring/infrastructure/files/__tests__/expoTutoringFileCapability.test.ts src/features/tutoring/services/__tests__/tutoringFileActions.test.ts src/core/sync/__tests__/WorkflowRegistry.test.ts
npm.cmd run typecheck
```

Expected: all pass; cancellation sends no request; valid selection sends one typed request; no upload error schedules a retry; all seven kinds are registered.

- [ ] **Step 8: Commit the upload path**

```powershell
git add src/features/tutoring/infrastructure/sync/tutoringUploadWorkflow.ts src/features/tutoring/infrastructure/sync/__tests__/tutoringUploadWorkflow.test.ts src/features/tutoring/application/runTutoringUploadSync.ts src/features/tutoring/application/__tests__/runTutoringUploadSync.test.ts src/features/tutoring/services/tutoringFileActions.ts src/features/tutoring/services/__tests__/tutoringFileActions.test.ts src/composition/sync.ts
git commit -m "feat: add typed tutoring upload workflow"
```

### Task 13: Remove every Tutoring branch and the final legacy workflow fallback

**Files:**
- Create: `src/composition/PccuWebViewHost.tsx`
- Create: `src/composition/__tests__/PccuWebViewHost.test.tsx`
- Delete: `src/features/pccu/engine/GlobalScraperWebView.tsx`
- Delete: `src/features/pccu/engine/__tests__/GlobalScraperWebView.test.tsx`
- Modify: `src/core/sync/webview/__tests__/WebViewSessionHost.test.tsx`
- Modify: `src/composition/sync.ts`
- Modify: `src/features/pccu/engine/compat/LegacyPccuSyncEngineFacade.ts`
- Delete: `src/features/pccu/engine/compat/LegacyPccuExecutionAdapter.ts`
- Modify: `src/features/tutoring/__tests__/tutoringSync.test.ts`
- Delete: `src/features/tutoring/sync/tutoringScripts.ts`
- Delete: `src/features/tutoring/sync/scriptBuilder.ts`
- Delete: `src/features/tutoring/sync/__tests__/tutoringScripts.test.ts`

- [ ] **Step 1: Write failing source-boundary tests before deletion**

```ts
it('contains no Tutoring implementation or unregistered workflow fallback', () => {
  expect(fs.existsSync(path.resolve(
    process.cwd(),
    'src/features/pccu/engine/GlobalScraperWebView.tsx',
  ))).toBe(false);
  const source = fs.readFileSync(
    path.resolve(process.cwd(), 'src/composition/PccuWebViewHost.tsx'),
    'utf8',
  );
  expect(source).not.toMatch(/TutoringPhase|pccu-tutoring|buildTutoring|tutoringStorage|useTutoringStore/);
  expect(source).not.toMatch(/legacy.*(?:execute|fallback)|executeLegacy/i);
});

it('routes every public kind through a registered workflow session', () => {
  for (const kind of SYNC_KINDS) {
    expect(syncComposition.registry.resolve(kind)).toBeDefined();
    expect(syncComposition.registry.resolve(kind)).not.toBe(syncComposition.legacyAdapters.get(kind));
  }
});
```

Add a generic controller/host test that starts one registered Tutoring workflow session, forwards a valid identity-bound event, settles one terminal effect exactly once, and ignores the same terminal event after completion. The test must not mock Tutoring storage or store because the controller no longer imports them.

- [ ] **Step 2: Run boundary and controller tests to verify RED**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/pccu/engine/__tests__/GlobalScraperWebView.test.tsx src/core/sync/webview/__tests__/WebViewSessionHost.test.tsx src/features/tutoring/__tests__/tutoringSync.test.ts
```

Expected: FAIL because the controller still contains the Tutoring phase/message/storage branch and the final unregistered-kind fallback.

- [ ] **Step 3: Delete Tutoring state, navigation, message, persistence, and error handling mechanically**

Remove all remaining items from `GlobalScraperWebView.tsx`:

- `TUTORING_HOME_URL`, `isTutoringTransUrl`, `TutoringPhase`, `pccu-tutoring`, and Tutoring refs.
- Tutoring script, storage, store, and domain imports.
- request classification for `tutoring`, `tutoring-detail`, `tutoring-download`, and `tutoring-upload`.
- 1202 `inside.aspx`, TransUrl fallback, ICAS, CourseFP, detail/download/upload navigation branches.
- `courses`, `all_assignments`, `pending`, `single_course`, `file_downloaded`, `file_uploaded`, Tutoring `err`, diagnostic, and waiting message branches.
- Tutoring-specific load-end, open-window phase labels, catch/error/HTTP-error, source initialization, debug phase, and store status mutation.

Do not move any of these branches elsewhere. Their behavior now lives in `tutoringWorkflowSupport`, the four feature workflows, application adapters, and file capability.

After every feature branch is gone, move the remaining runtime subscription, generic `WebViewSessionHost` props, PCCU session driver, and session-control registration into `src/composition/PccuWebViewHost.tsx`. It may import composition ports plus `src/core/sync/webview/**`; it may not import a feature parser, workflow, storage, store, or domain type. Replace the root import and delete `GlobalScraperWebView.tsx`. Move only generic host/session assertions to `PccuWebViewHost.test.tsx`; feature behavior already belongs to workflow suites.

- [ ] **Step 4: Delete the legacy execution adapter after proving every replacement**

Add a composition test that every `SyncKind` resolves to a `WebViewWorkflowRuntime` adapter and differs from `legacyAdapters.get(kind)`. Only after that test passes:

- delete `LegacyPccuExecutionAdapter.ts` and its executor-ready tests;
- remove `legacyAdapters`, `setExecutor`, `clearExecutor`, and `waitForExecutorReady` from production composition/facade;
- remove the engine-executor registration while moving the generic host/session wiring into `PccuWebViewHost`;
- keep `LegacyPccuSyncEngineFacade.requestSync` only as the typed caller-facing command adapter to `SyncCoordinator`;
- render `WebViewSessionHost` solely from `webViewWorkflowRuntime` snapshot/events.

An absent registration already fails typed `unsupported` inside `SyncCoordinator.request`; the WebView controller does not classify requests or start workflow sessions. Keep the typed facade only until Phase 4 migrates all callers to runtime application commands.

- [ ] **Step 5: Move all script imports to infrastructure and delete the old directory**

```powershell
rg -n "features/tutoring/sync|tutoring/sync|\.\./sync/tutoringScripts|\.\./sync/scriptBuilder" app src
```

Expected before deletion: only paths intentionally updated in this task appear. Change them to `features/tutoring/infrastructure/sync`, rerun the command, and expect no output. Then delete the three legacy files. The only `tutoringScripts.test.ts` remaining is under `infrastructure/sync/__tests__`.

- [ ] **Step 6: Move legacy behavior assertions to the owning workflow tests**

Delete old controller tests only after these equivalent feature tests are present and green:

| Former `GlobalScraperWebView` behavior | New owner |
|---|---|
| Login/session readiness before opening 1202 | `tutoringWorkflowSupport.test.ts` |
| 1202 `TransUrl` and ICAS fallback | `tutoringWorkflowSupport.test.ts` |
| CourseFP readiness guard and 60-probe limit | `tutoringWorkflowSupport.test.ts` |
| Overview courses → all assignments → pending | `tutoringOverviewWorkflow.test.ts` |
| Detail course identity and two retries | `tutoringDetailWorkflow.test.ts` |
| Download/upload terminal payload | corresponding workflow tests |
| Storage then store publication | application/hook tests |
| File module unavailable/canceled picker | capability/application tests |

Keep generic host identity, timer cleanup, debug preview, unmount cancellation, and exactly-once terminal tests at the core/controller path.

- [ ] **Step 7: Run the entire workflow/controller regression set**

```powershell
npm.cmd test -- --runInBand src/core/sync src/features/pccu/engine src/features/traffic src/features/grade src/features/schedule src/features/tutoring
npm.cmd run typecheck
```

Expected: all suites and TypeScript pass; every kind routes through the registry; no controller test mocks a feature storage/store; no pending host timer or unresolved request remains.

- [ ] **Step 8: Commit the final strangler deletion**

```powershell
git add src/composition/PccuWebViewHost.tsx src/composition/__tests__/PccuWebViewHost.test.tsx src/composition/AppCompositionRoot.tsx src/features/pccu/engine/compat/LegacyPccuSyncEngineFacade.ts src/core/sync/webview/__tests__/WebViewSessionHost.test.tsx src/features/tutoring src/composition/sync.ts
git rm src/features/pccu/engine/GlobalScraperWebView.tsx src/features/pccu/engine/__tests__/GlobalScraperWebView.test.tsx src/features/pccu/engine/compat/LegacyPccuExecutionAdapter.ts
git commit -m "refactor: remove tutoring legacy scraper fallback"
```

### Task 14: Enforce Phase 2C boundaries and run automated/export gates

**Files:**
- Modify: `src/__tests__/workflowBoundaries.test.ts`
- Modify: Phase 0 Jest coverage configuration only if the existing include list does not cover new modules.

- [ ] **Step 1: Add complete registry and source-boundary assertions**

```ts
it('registers every public sync workflow', () => {
  expect(SYNC_KINDS.every((kind) => !!syncComposition.registry.resolve(kind))).toBe(true);
  expect(fs.existsSync(path.resolve(
    process.cwd(),
    'src/features/pccu/engine/compat/LegacyPccuExecutionAdapter.ts',
  ))).toBe(false);
});

it.each([
  'src/features/tutoring/infrastructure/sync/tutoringOverviewWorkflow.ts',
  'src/features/tutoring/infrastructure/sync/tutoringDetailWorkflow.ts',
  'src/features/tutoring/infrastructure/sync/tutoringDownloadWorkflow.ts',
  'src/features/tutoring/infrastructure/sync/tutoringUploadWorkflow.ts',
])('%s is a pure feature workflow', (file) => {
  const source = read(file);
  expect(source).not.toMatch(/AsyncStorage|storage\/|store\/|zustand/);
  expect(source).not.toMatch(/react-native-webview|expo-document-picker|expo-file-system|expo-sharing/);
  expect(source).not.toMatch(/Date\.now\s*\(|setTimeout\s*\(/);
});

it('keeps native files behind the application capability', () => {
  const port = read('src/features/tutoring/application/TutoringFileCapability.ts');
  expect(port).not.toMatch(/expo-document-picker|expo-modules-core|expo-sharing/);
  const service = read('src/features/tutoring/services/tutoringFileActions.ts');
  expect(service).not.toMatch(/PccuSyncEngine|requireOptionalNativeModule/);
});

it('has no legacy Tutoring script path or global feature branch', () => {
  expect(fs.existsSync(path.resolve(process.cwd(), 'src/features/tutoring/sync'))).toBe(false);
  expect(fs.existsSync(path.resolve(process.cwd(), 'src/features/pccu/engine/GlobalScraperWebView.tsx'))).toBe(false);
  const host = read('src/composition/PccuWebViewHost.tsx');
  expect(host).not.toMatch(/TutoringPhase|pccu-tutoring|buildTutoring|tutoringStorage|useTutoringStore/);
});
```

- [ ] **Step 2: Run boundary tests and repair real dependency violations**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/__tests__/workflowBoundaries.test.ts
```

Expected: PASS. Move violations to the feature decoder, application adapter, concrete file adapter, or composition root named in this plan; do not weaken a regex to permit persistence/native work inside a workflow.

- [ ] **Step 3: Run focused Phase 2C coverage**

```powershell
npm.cmd test -- --runInBand --coverage --collectCoverageFrom="src/features/tutoring/{domain,application,infrastructure}/**/*.{ts,tsx}" --collectCoverageFrom="src/core/sync/webview/**/*.{ts,tsx}" src/features/tutoring src/core/sync/webview src/__tests__/workflowBoundaries.test.ts
```

Expected: all suites pass; new/changed modules reach at least 80% line coverage; protocol decoder and core host critical branches reach at least 90% branch coverage; global coverage does not fall below the Phase 0 ratchet.

- [ ] **Step 4: Run the repository verification pipeline**

```powershell
npm.cmd run verify
npm.cmd run coverage:ci
```

Expected: strict typecheck, lint/format steps included by `verify`, the complete Jest suite, and coverage ratchet all exit 0. There is no open-handle warning.

- [ ] **Step 5: Run the standard and explicit iOS export smoke**

```powershell
npm.cmd run export:smoke
npx.cmd expo export --platform ios --output-dir dist/phase-2c-tutoring-export
```

Expected: both commands exit 0; all configured bundles are generated; no unresolved legacy Tutoring path, optional native-module import error, or production syntax error appears. `dist` remains ignored and unstaged.

- [ ] **Step 6: Search for forbidden legacy protocol and controller ownership**

```powershell
rg -n "buildWaitForCourseFpScriptLegacy|pccu-tutoring|TutoringPhase|tutoringPhaseRef|tutoringCourseCodeRef|features/tutoring/sync" app src
rg -n "postMessage\(JSON\.stringify\(\{\s*t:|data\.t\s*===\s*'(courses|single_course|file_downloaded|file_uploaded)'" src/features/tutoring src/features/pccu/engine
```

Expected: both searches return no output. The versioned-script implementation may contain the local compatibility key `payload.t` inside `createTutoringScript`, but it must not post that object directly; if the second regex matches that mapping helper, narrow the source check to the native `postMessage` call rather than deleting the internal body adapter.

- [ ] **Step 7: Commit the boundary gate**

```powershell
git add src/__tests__/workflowBoundaries.test.ts jest.config.js package.json
git commit -m "test: enforce tutoring workflow boundaries"
```

Stage only files that actually changed; do not modify coverage thresholds downward.

### Task 15: Complete Expo Go and development-build file checkpoints

**Files:**
- Create after executing checks: `docs/verification/myccu-refactor-phase-2c.md`

- [ ] **Step 1: Start the accepted bundle in Expo Go**

```powershell
npm.cmd start -- --clear
```

Expected: cold launch reaches Login or Home; there is one shared WebView host; Metro shows no missing native module or deleted script import.

- [ ] **Step 2: Verify overview and detail end to end in Expo Go**

1. Sign in and open Tutoring; verify overview courses, semester, welcome text, and pending assignments.
2. Open a course by its stable `courseCode`; verify course info, announcements, materials, assignments, progress, and classmates.
3. Pull to refresh overview and detail separately; verify user requests run before queued warmup and exactly one result publishes.
4. Background during each operation, return, and retry; verify stale generations cannot replace later data.
5. Disable network during detail; verify the last committed detail remains visible with a sanitized error, then recover after network returns.
6. Open another course while a warmup detail is queued; verify each detail uses its own resource key and no course payload crosses keys.

Expected: all six checks pass and no raw course content/message payload appears in logs.

- [ ] **Step 3: Exercise the runtime file-capability branch in Expo Go**

Attempt one material/attachment download and one assignment upload:

- If `availability()` is true, verify picker cancellation sends no upload; a chosen file sends one upload; a downloaded file writes to cache and opens the share sheet when supported.
- If `availability()` is false, verify both actions show the stable development-build-required message, perform no workflow request, leave detail state intact, and do not crash.

Record which branch occurred, the Expo Go version, OS/device, and pass/fail. Expo Go support is observed at runtime; never hard-code “Expo Go always unsupported” into the adapter.

- [ ] **Step 4: Build the development client used for native file acceptance**

After confirming EAS credentials and receiving any required publication approval, run:

```powershell
npm.cmd run build:ios:development -- --non-interactive
```

Expected: EAS accepts the `development` profile, finishes successfully, and prints a build ID/install URL. If the organization uses a locally installed approved development client for the same commit, record its build ID instead of queuing a duplicate build.

- [ ] **Step 5: Verify file download/upload in the development build**

Install/open the development build for the exact tested commit, then:

1. Cancel the picker and verify no upload request starts.
2. Pick a small PDF and upload once; verify one success message and one silent detail refresh.
3. Trigger a remote upload failure and verify no automatic retry/duplicate submission occurs.
4. Download a material, announcement attachment, assignment attachment, and submitted file when each kind is present; verify filenames are sanitized, MIME type is preserved, cache write succeeds, and sharing opens when available.
5. Background during a download, return, and manually retry; verify only the later generation writes/shares.
6. Inspect sanitized runtime events; verify no base64, local URI, filename content, raw response, account, or full URL query is logged.

Expected: all available file kinds pass. A course lacking one attachment kind is recorded as “not present in the selected live course,” not fabricated as a pass.

- [ ] **Step 6: Regress the previously extracted workflows and session cleanup**

Refresh Traffic, Grade, Schedule, Tutoring overview, and Tutoring detail. Log out during an active Tutoring request, then sign in again.

Expected: every feature uses the registry; logout settles active/queued work with typed cancellation; the host/session resets; no prior-account Tutoring cache appears after login.

- [ ] **Step 7: Write the sanitized Phase 2C verification record**

Create `docs/verification/myccu-refactor-phase-2c.md` containing actual values for:

- tested commit SHA;
- `verify`, coverage, standard export, and explicit iOS export exit results;
- device OS/model and Expo Go version;
- overview/detail checklist result;
- Expo Go file-capability branch and result;
- development build ID/profile and six file-check results;
- cross-feature/logout regression result;
- remaining live-PCCU limitation, if an attachment kind was absent.

Do not include account, password, course names/content, raw HTML/message payloads, filenames, local URIs, base64, or full URLs.

- [ ] **Step 8: Commit the real verification record and inspect history**

```powershell
git add docs/verification/myccu-refactor-phase-2c.md
git commit -m "docs: record phase 2c tutoring verification"
git status --short
git log -14 --oneline
```

Expected: the verification record contains actual results; the worktree has no generated `dist` artifact staged; the last fourteen focused commits correspond to Tasks 1–6 and 8–15 (Task 7 is a no-code acceptance checkpoint).

## Completion criteria

- `tutoring`, `tutoring-detail`, `tutoring-download`, and `tutoring-upload` each have a registered `SyncWorkflow`, a hand-written protocol decoder path, a pure reducer, identity-bound scripts, and deterministic tests.
- Overview returns courses, all assignments, pending assignments, semester, welcome text, and event-derived `updatedAt`; detail returns the stable course code and complete detail payload.
- The shared bootstrap reducer owns session readiness, 1202 handoff, one ICAS fallback, CourseFP probing, heartbeat effects, and the 60-probe ceiling.
- Overview/detail use exactly two extraction retries after the initial attempt. Download/upload do not auto-retry; upload cannot duplicate a submission after an ambiguous failure.
- Overview/detail success is exposed only after the temporary storage commit resolves, and store publication uses the committed typed payload. Storage failures remain `storage` and preserve the previous projection.
- Document picking, base64 cache I/O, and sharing exist only behind `TutoringFileCapability`; unsupported Expo Go behavior is explicit and the native path is verified in a development build.
- The legacy `GlobalScraperWebView` is deleted; `PccuWebViewHost` is a composition-only adapter over the generic runtime/host and imports no feature implementation.
- Every `SyncKind` resolves through `WorkflowRegistry`; the unregistered-feature/legacy execution fallback is deleted while the typed caller-facing facade remains until its consumers migrate.
- The legacy `src/features/tutoring/sync` path and unversioned Tutoring native protocol are gone.
- Focused tests, full verification, coverage ratchet, standard export smoke, explicit iOS export, Expo Go overview/detail regression, development-build file checks, and logout/cross-feature regression all pass.

## Execution handoff

After this plan is approved, execute it in a fresh implementation worktree using `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Stop at Task 7 until overview is accepted on-device, and stop again before deleting the fallback if any of the four registered workflow slices is not green.
