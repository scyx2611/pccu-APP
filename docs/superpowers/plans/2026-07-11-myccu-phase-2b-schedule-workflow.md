# MyCCU Phase 2B Schedule Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract Schedule domain ownership, parsing, 1208 navigation, query/search extraction, retries, persistence handoff, and typed completion from `GlobalScraperWebView` into a registered Schedule workflow while preserving the accepted Schedule screen, cache, reminder, background, and Expo Go behavior.

**Architecture:** Phase 2B consumes the Phase 2A `SyncContractMap`, `SyncWorkflow`, `WorkflowRegistry`, and single `WebViewSessionHost` without adding a second coordinator, registry, host, or effect union. Schedule owns its domain types, parser, versioned protocol decoder, identity-bound extraction script, pure reducer, and application commit adapter; the existing storage and Zustand facades remain temporary Phase 3 inputs, and the four Tutoring operations remain on the legacy fallback for Phase 2C.

**Tech Stack:** Expo SDK 54, React Native 0.81, React 19, TypeScript 5.9, `react-native-webview`, Cheerio, Zustand 5, AsyncStorage 2, Expo Notifications, Jest 29 with `jest-expo`, React Native Testing Library, Expo Go.

---

## Phase boundary and prerequisites

Implement this plan only after Phase 2A is merged, its Traffic-before-Grade acceptance checkpoint is recorded, and its final Expo Go regression is green. Phase 2B relies on these exact established seams:

- `src/core/sync/contracts.ts` owns the single `SyncContractMap`, `SyncPolicy`, `SyncError`, `SyncOutcome`, and `SyncKind` definitions.
- `src/core/sync/workflow.ts` owns `WorkflowIdentity`, `WorkflowContext`, `ValidatedWorkflowEvent`, `WorkflowEffect`, `WorkflowTransition`, and `SyncWorkflow`.
- `src/core/sync/WorkflowRegistry.ts` owns registration, lookup, and `WorkflowSession`; do not create a Schedule-specific registry.
- `src/core/sync/webview/WebViewSessionHost.tsx` owns the single physical WebView and interprets only `ensure-session`, `navigate`, `inject-java-script`, `heartbeat`, `schedule`, `complete`, and `fail` effects.
- `src/composition/sync.ts` already replaces the Traffic and Grade legacy adapters with `WebViewWorkflowRuntime` adapters. This plan replaces Schedule and leaves the four Tutoring kinds on their retained Phase 1 legacy adapters.
- `src/features/pccu/engine/GlobalScraperWebView.tsx` already routes registered kinds through a generic workflow session and retains Schedule plus Tutoring as legacy fallbacks.
- Phase 1 cancellation, generation ownership, hard/idle deadlines, background retry-once behavior, and exactly-once settlement remain unchanged.

Run this pre-flight from the repository root:

```powershell
rg -n "interface SyncContractMap|interface SyncWorkflow|class WorkflowRegistry|class WebViewWorkflowRuntime|WebViewSessionHost" src/core/sync src/composition
npm.cmd test -- --runInBand src/core/sync src/core/sync/webview src/features/traffic src/features/grade src/features/pccu/engine/__tests__/GlobalScraperWebView.test.tsx
```

Expected: each contract has one owner, Traffic and Grade resolve through the registry, Schedule and all Tutoring kinds still use the legacy fallback, and every listed suite passes with no pending-timer or open-handle warning. If an established name is absent, finish Phase 2A instead of defining a duplicate in Phase 2B.

## Locked contracts and responsibility map

### Schedule public contract

Phase 2B expands the Phase 1 count-only Schedule output to the complete committed feature payload:

```ts
export interface CourseData {
  name: string;
  teacher: string;
  location: string;
  required: boolean;
  type: string;
  dayOfWeek: number;
  periodRange: string;
  startPeriod: number;
  endPeriod: number;
}

export interface ScheduleSyncPayload {
  courses: CourseData[];
  updatedAt: number;
}

export interface SyncContractMap {
  // Existing Traffic, Grade, and Tutoring entries remain byte-for-byte unchanged.
  schedule: { input: undefined; output: ScheduleSyncPayload };
}
```

Do not add a course ID in Phase 2B. Phase 3 normalizes the raw workflow payload into persisted `ScheduleCourse = CourseData & { id: CourseId }`, migrates legacy rows with IDs, and exposes ID selectors; Phase 4 consumes those stable IDs for routes. Phase 3 must wrap `ScheduleSyncPayload` without changing this workflow contract.

### Create

- `src/features/schedule/domain/types.ts` — `CourseData` and `ScheduleSyncPayload`.
- `src/features/schedule/domain/schedule.ts` — pure sanitization, suspicious-name detection, and direct-vs-HTML result selection.
- `src/features/schedule/domain/__tests__/schedule.test.ts` — pure domain contracts.
- `src/features/schedule/infrastructure/parser/scheduleParser.ts` — Cheerio Schedule parser moved out of PCCU transport.
- `src/features/schedule/infrastructure/parser/__tests__/scheduleParser.test.ts` — every current Schedule fixture/table/card parser assertion.
- `src/features/schedule/infrastructure/sync/scheduleProtocol.ts` — hand-written decoder for `popup`, redirect, progress/probe, courses, HTML, and error messages.
- `src/features/schedule/infrastructure/sync/scheduleScripts.ts` — identity-bound adaptive 1208/query/search extraction builder.
- `src/features/schedule/infrastructure/sync/scheduleWorkflow.ts` — pure Schedule reducer and `SyncWorkflow<'schedule', ...>` adapter.
- Focused protocol, script, and workflow tests under `src/features/schedule/infrastructure/sync/__tests__/`.
- `src/features/schedule/application/runScheduleSync.ts` and its tests — compatibility commit adapter.
- `src/features/schedule/storage/__tests__/scheduleStorage.test.ts` — rejected-write/cache ordering coverage.
- `src/features/schedule/index.ts` — stable Schedule public API.
- `__fixtures__/messages/schedule-courses-valid.json` — versioned valid decoder fixture.
- `src/__tests__/scheduleOwnership.test.ts` — dependency and legacy-removal boundary.
- `docs/verification/myccu-refactor-phase-2b.md` — sanitized Expo Go acceptance record created only after the device checkpoint passes.

### Modify

- `src/core/sync/contracts.ts` — bind `schedule.output` to feature-owned `ScheduleSyncPayload`; do not change another kind.
- `src/composition/sync.ts` — replace the Schedule legacy adapter after Traffic and Grade.
- `src/features/pccu/sync/pccuSyncScripts.ts` and its test — remove Schedule extraction builders after their feature-local tests pass; retain shared login and identity-aware `buildServiceOpenScript` for 1208/1202.
- `src/features/pccu/engine/GlobalScraperWebView.tsx` and its test — remove only the legacy Schedule controller after registry integration passes.
- `src/features/schedule/storage/scheduleStorage.ts` — propagate writes and update memory only after persistence.
- `src/features/schedule/hooks/useScheduleSync.ts` and its test — publish typed committed data without rereading storage.
- `src/features/schedule/store/useScheduleStore.ts`, screen/timeline files and tests — import feature-owned domain types.
- `src/features/home/screens/HomeScreen.tsx`, `src/features/notifications/services/courseReminderService.ts`, and `app/modal/courseDetails.tsx` — import Schedule through its public API.
- `src/__tests__/workflowBoundaries.test.ts` — assert Traffic, Grade, and Schedule are registered while all Tutoring kinds remain legacy.

### Delete after green replacements exist

- `src/features/pccu/parsers/pccuScraper.ts` and `src/features/pccu/parsers/__tests__/pccuScraper.test.ts` — Phase 2A has already moved Grade; Phase 2B moves the remaining Schedule contracts/parser.
- The `buildSchedulePageScript`, `buildRobustSchedulePageScript`, and `buildAdaptiveSchedulePageScript` exports and tests from `src/features/pccu/sync/pccuSyncScripts.ts`.
- Schedule navigation/message/retry/persistence branches and Schedule-only refs/imports from `GlobalScraperWebView.tsx`.

## Invariants that every task must preserve

- Schedule workflow, protocol, parser, and script modules import no storage, Zustand, React hook, notification service, or WebView ref.
- Runtime payload decoding starts from `unknown`; no `as CourseData[]` assertion stands in for field validation.
- Reducer timestamps come from `event.now`; reducer code contains no `Date.now`, timers, navigation calls, JSON parsing, storage, or store mutation.
- 1208 popup URLs are followed exactly after HTTPS/hostname validation. The workflow must not replace a valid TransUrl with a hard-coded query URL.
- `navigation` and `load-end` events for the same normalized handoff schedule one injection, not two.
- Search submission stays inside the identity-bound injected script; redirects become typed messages and then `navigate` effects; retry delays become `schedule` effects.
- Direct structured courses win unless the HTML parser returns at least as many courses or the direct names are suspicious. Empty/suspicious results retry twice and fail with `parse` on the third result.
- Relogin markers request a fresh PCCU session at most twice. Central hard/idle deadlines still bound the complete request.
- A storage rejection is `storage`, preserves the prior memory/store projection, and never reports success. Reminder refresh happens after the storage commit; a reminder-only failure is reported through the injected reporter and does not roll back committed Schedule data.
- Schedule is removed from the legacy controller only after registry, workflow, application, hook, and storage tests are green.

### Task 1: Move Schedule contracts and pure result rules into the feature domain

**Files:**

- Create: `src/features/schedule/domain/types.ts`
- Create: `src/features/schedule/domain/schedule.ts`
- Create: `src/features/schedule/domain/__tests__/schedule.test.ts`
- Modify: `src/core/sync/contracts.ts`

- [ ] **Step 1: Write failing domain selection and sanitization tests (2-5 minutes)**

Create `schedule.test.ts` with concrete direct-vs-HTML, suspicious-name, and cleanup cases:

```ts
import type { CourseData } from '../types';
import {
  hasSuspiciousCourseNames,
  sanitizeCourseData,
  selectScheduleCourses,
} from '../schedule';

const course = (overrides: Partial<CourseData> = {}): CourseData => ({
  name: '程式設計',
  teacher: '王老師',
  location: '大恩 302',
  required: true,
  type: '資訊管理學系',
  dayOfWeek: 3,
  periodRange: '星期三 第 2-3 節',
  startPeriod: 2,
  endPeriod: 3,
  ...overrides,
});

describe('schedule domain', () => {
  it('sanitizes enrollment suffixes and supplies an unknown location', () => {
    expect(sanitizeCourseData(course({ name: '程式設計 (42人)', location: '' }))).toEqual(
      expect.objectContaining({ name: '程式設計', location: '未知' }),
    );
  });

  it('uses a longer parsed HTML result over structured script rows', () => {
    const direct = [course()];
    const parsed = [course(), course({ name: '資料結構', startPeriod: 4, endPeriod: 5 })];
    expect(selectScheduleCourses(direct, parsed)).toEqual(parsed);
  });

  it('replaces suspicious structured names even when HTML has fewer rows', () => {
    const direct = [
      course({ name: '資管系', type: '資管系' }),
      course({ name: '通識', type: '通識' }),
    ];
    const parsed = [course({ name: '資料庫系統' })];
    expect(hasSuspiciousCourseNames(direct)).toBe(true);
    expect(selectScheduleCourses(direct, parsed)).toEqual(parsed);
  });

  it('returns an empty result when both candidates are unusable', () => {
    expect(selectScheduleCourses([], [
      course({ name: '資管系', type: '資管系' }),
      course({ name: '通識', type: '通識' }),
    ])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the domain test and verify RED (2-5 minutes)**

Run:

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/schedule/domain/__tests__/schedule.test.ts
```

Expected: FAIL because `domain/types.ts` and `domain/schedule.ts` do not exist.

- [ ] **Step 3: Create the complete feature-owned types (2-5 minutes)**

Create `domain/types.ts`:

```ts
export interface CourseData {
  name: string;
  teacher: string;
  location: string;
  required: boolean;
  type: string;
  dayOfWeek: number;
  periodRange: string;
  startPeriod: number;
  endPeriod: number;
}

export interface ScheduleSyncPayload {
  courses: CourseData[];
  updatedAt: number;
}
```

In `src/core/sync/contracts.ts`, import this type and replace only the count-only Schedule output:

```ts
import type { ScheduleSyncPayload } from '../../features/schedule/domain/types';

export interface SyncContractMap {
  grade: { input: undefined; output: GradeSyncPayload };
  schedule: { input: undefined; output: ScheduleSyncPayload };
  traffic: { input: undefined; output: TrafficSnapshot };
  tutoring: { input: undefined; output: TutoringOverviewPayload };
  'tutoring-detail': {
    input: { courseCode: CourseCode };
    output: TutoringCourseDetailPayload;
  };
  'tutoring-download': { input: TutoringDownloadCommand; output: TutoringDownloadResult };
  'tutoring-upload': { input: TutoringUploadCommand; output: TutoringUploadResult };
}
```

Use the actual Phase 2A feature-owned import paths for Grade/Traffic/Tutoring already present in that file; do not rewrite those entries.

- [ ] **Step 4: Implement the complete pure Schedule result rules (2-5 minutes)**

Create `domain/schedule.ts`:

```ts
import type { CourseData } from './types';

const normalize = (value: string) =>
  value.replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();

const cleanDisplayText = (value: string) =>
  normalize(
    String(value || '')
      .replace(/[\uE000-\uF8FF\uFFFD]/g, '')
      .replace(/\s*[（(]\d+\s*人[）)]/g, ' ')
      .replace(/\s*[（(]\d+\s*[）)]\s*$/g, ' '),
  );

const splitCourseDescriptor = (value: string) => {
  const cleaned = cleanDisplayText(value).replace(/^(?:\((?:必|選)\)|必修|選修)\s*/, '');
  const match = cleaned.match(/^(.{1,12}?)\s+([A-Z0-9]{3,8})\s+(.+)$/);
  if (!match) return { type: '', name: cleaned };
  const prefix = normalize(match[1]);
  const name = normalize(match[3]);
  if (!/[\u4e00-\u9fff]/.test(prefix) || !/[\u4e00-\u9fffA-Za-z]/.test(name)) {
    return { type: '', name: cleaned };
  }
  return { type: prefix, name };
};

export const sanitizeCourseData = (course: CourseData): CourseData => {
  const descriptor = splitCourseDescriptor(course.name);
  const teacher = cleanDisplayText(course.teacher);
  const location = cleanDisplayText(course.location);
  let name = descriptor.name || cleanDisplayText(course.name);

  if (teacher && name.indexOf(teacher) > 0) name = name.slice(0, name.indexOf(teacher));
  if (location && name.indexOf(location) > 0) name = name.slice(0, name.indexOf(location));

  return {
    ...course,
    name: cleanDisplayText(name) || normalize(course.name),
    teacher,
    location: location || '未知',
    type: cleanDisplayText(course.type) || descriptor.type,
  };
};

export const sanitizeCourseList = (courses: readonly CourseData[]): CourseData[] =>
  courses.map(sanitizeCourseData);

const suspiciousName = /^(?:[\u4e00-\u9fff]{1,8}(?:系|所|院)|中文|體育|通識|外文領域\d*|資管系|英文|國文)$/;

export const hasSuspiciousCourseNames = (courses: readonly CourseData[]): boolean => {
  if (courses.length === 0) return false;
  const suspiciousCount = courses.filter((course) => {
    const name = normalize(course.name);
    const type = normalize(course.type);
    if (!name || !suspiciousName.test(name)) return false;
    return (type && (type === name || type.startsWith(name) || name.startsWith(type))) || /(?:系|所|院)$/.test(name);
  }).length;
  return suspiciousCount >= Math.max(2, Math.ceil(courses.length * 0.5));
};

export const selectScheduleCourses = (
  structured: readonly CourseData[],
  parsedHtml: readonly CourseData[],
): CourseData[] => {
  const direct = sanitizeCourseList(structured);
  const parsed = sanitizeCourseList(parsedHtml);
  const selected =
    parsed.length > 0 && (parsed.length >= direct.length || hasSuspiciousCourseNames(direct))
      ? parsed
      : direct;
  return selected.length > 0 && !hasSuspiciousCourseNames(selected) ? selected : [];
};
```

- [ ] **Step 5: Run domain, contract, and strict type tests GREEN (2-5 minutes)**

Run:

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/schedule/domain/__tests__/schedule.test.ts src/core/sync/__tests__/contracts.test.ts
npm.cmd run typecheck
```

Expected: both suites pass; TypeScript proves `SyncOutput<'schedule'>` is `ScheduleSyncPayload`; the other six sync contracts are unchanged.

- [ ] **Step 6: Commit the Schedule domain contract (2-5 minutes)**

```powershell
git add src/features/schedule/domain src/core/sync/contracts.ts
git commit -m "refactor: own schedule domain contracts"
```

### Task 2: Move the Schedule parser out of PCCU transport

**Files:**

- Create: `src/features/schedule/infrastructure/parser/scheduleParser.ts`
- Create: `src/features/schedule/infrastructure/parser/__tests__/scheduleParser.test.ts`
- Modify temporarily: `src/features/pccu/parsers/pccuScraper.ts`
- Modify temporarily: `src/features/pccu/parsers/__tests__/pccuScraper.test.ts`

- [ ] **Step 1: Copy every current Schedule parser assertion to the new suite (2-5 minutes)**

Create the new suite with the fixture, consecutive-period, card, empty, malformed, and error-page cases:

```ts
import fs from 'fs';
import path from 'path';
import { parseScheduleFromHtml } from '../scheduleParser';

const fixture = (name: string) =>
  fs.readFileSync(path.resolve(__dirname, '../../../../../../__fixtures__/html', name), 'utf8');

describe('scheduleParser', () => {
  it('parses the current table fixture', () => {
    const courses = parseScheduleFromHtml(fixture('schedule-valid.html'));
    expect(courses.length).toBeGreaterThan(0);
    expect(courses[0]).toEqual(expect.objectContaining({ name: expect.any(String), startPeriod: 1 }));
  });

  it('merges consecutive periods and keeps teacher and location', () => {
    const html = `
      <table>
        <tr><th>節次</th><th>時間</th><th>星期一</th></tr>
        <tr><td>1</td><td>08:10</td><td class="pubContent">(必)<br/>資訊管理學系 CS9999 程式設計<br/>王老師 / B101</td></tr>
        <tr><td>2</td><td>09:10</td><td class="pubContent">(必)<br/>資訊管理學系 CS9999 程式設計<br/>王老師 / B101</td></tr>
      </table>`;
    expect(parseScheduleFromHtml(html)).toEqual([
      expect.objectContaining({
        name: '程式設計', teacher: '王老師', location: 'B101', required: true,
        type: '資訊管理學系', dayOfWeek: 1, startPeriod: 1, endPeriod: 2,
      }),
    ]);
  });

  it('parses card markup with an explicit weekday and period range', () => {
    const html = `<article>(選) 資訊管理學系 CS2000 資料結構<br/>星期四 第4-5節<br/>李老師 / 大恩402</article>`;
    expect(parseScheduleFromHtml(html)).toEqual([
      expect.objectContaining({
        name: '資料結構', required: false, dayOfWeek: 4, startPeriod: 4, endPeriod: 5,
      }),
    ]);
  });

  it('returns empty results safely for empty, malformed, and error pages', () => {
    expect(parseScheduleFromHtml('')).toEqual([]);
    expect(() => parseScheduleFromHtml(fixture('malformed.html'))).not.toThrow();
    expect(parseScheduleFromHtml(fixture('error-page.html'))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the new parser suite and verify RED (2-5 minutes)**

Run:

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/schedule/infrastructure/parser/__tests__/scheduleParser.test.ts
```

Expected: FAIL because `scheduleParser.ts` does not exist.

- [ ] **Step 3: Move the complete Schedule parser implementation (2-5 minutes)**

Move the complete Schedule portion of `pccuScraper.ts`—from `extractLinesFromCell` through `parseScheduleFromHtml`—to `scheduleParser.ts`. Preserve table/card selectors, weekday/period parsing, consecutive-period merging, teacher/location extraction, sorting, and fixture behavior. The destination imports the feature type/rule and exposes only this public function:

```ts
import * as cheerio from 'cheerio';
import type { CourseData } from '../../domain/types';
import { sanitizeCourseList } from '../../domain/schedule';

export function parseScheduleFromHtml(html: string): CourseData[] {
  if (!html) return [];
  const $ = cheerio.load(html);
  const fromTable = parseScheduleFromTable($);
  if (fromTable.length > 0) return sanitizeCourseList(fromTable);
  return sanitizeCourseList(parseScheduleFromCards($));
}
```

The comment above documents the private boundary; it is not omitted implementation. Copy every helper used by `parseScheduleFromTable` and `parseScheduleFromCards` from the existing source in the same change. No helper may import PCCU transport or storage.

- [ ] **Step 4: Keep a short compatibility re-export until consumers move (2-5 minutes)**

After deleting the moved implementation from `pccuScraper.ts`, leave exactly:

```ts
export type { CourseData } from '../../schedule/domain/types';
export {
  hasSuspiciousCourseNames,
  sanitizeCourseData,
  sanitizeCourseList,
} from '../../schedule/domain/schedule';
export { parseScheduleFromHtml } from '../../schedule/infrastructure/parser/scheduleParser';
```

Remove only Schedule cases from `pccuScraper.test.ts`; Phase 2A has already moved the Grade cases, so that old suite becomes empty and is deleted in Task 3.

- [ ] **Step 5: Run old and new parser paths GREEN (2-5 minutes)**

Run:

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/schedule/infrastructure/parser/__tests__/scheduleParser.test.ts
npm.cmd run typecheck
```

Expected: all table/card/error cases pass and strict typecheck exits 0 through the temporary compatibility export.

- [ ] **Step 6: Commit the parser ownership move (2-5 minutes)**

```powershell
git add src/features/schedule/infrastructure/parser src/features/pccu/parsers
git commit -m "refactor: move schedule parser into feature"
```

### Task 3: Establish the Schedule public API and remove PCCU parser ownership

**Files:**

- Create: `src/features/schedule/index.ts`
- Create: `src/__tests__/scheduleOwnership.test.ts`
- Modify: `src/features/schedule/storage/scheduleStorage.ts`
- Modify: `src/features/schedule/store/useScheduleStore.ts`
- Modify: `src/features/schedule/screens/ScheduleScreen.tsx`
- Modify: `src/features/schedule/utils/scheduleTimeline.ts`
- Modify: `src/features/schedule/utils/__tests__/scheduleTimeline.test.ts`
- Modify: `src/features/home/screens/HomeScreen.tsx`
- Modify: `src/features/notifications/services/courseReminderService.ts`
- Modify: `app/modal/courseDetails.tsx`
- Delete: `src/features/pccu/parsers/pccuScraper.ts`
- Delete: `src/features/pccu/parsers/__tests__/pccuScraper.test.ts`

- [ ] **Step 1: Write a failing source ownership test (2-5 minutes)**

Create `scheduleOwnership.test.ts`:

```ts
import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');

describe('Schedule ownership', () => {
  it.each([
    'src/features/home/screens/HomeScreen.tsx',
    'src/features/notifications/services/courseReminderService.ts',
    'app/modal/courseDetails.tsx',
  ])('%s imports Schedule through its public API', (file) => {
    const source = read(file);
    expect(source).not.toMatch(/pccu\/parsers\/pccuScraper/);
    expect(source).toMatch(/features\/schedule|\.\.\/\.\.\/schedule/);
  });

  it('has no remaining PCCU parser module after the feature move', () => {
    expect(fs.existsSync(path.resolve(process.cwd(), 'src/features/pccu/parsers/pccuScraper.ts'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the ownership suite and verify RED (2-5 minutes)**

Run:

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/__tests__/scheduleOwnership.test.ts
```

Expected: FAIL because production consumers still import `pccuScraper.ts` and the compatibility file still exists.

- [ ] **Step 3: Create the stable feature API (2-5 minutes)**

Create `src/features/schedule/index.ts`:

```ts
export type { CourseData, ScheduleSyncPayload } from './domain/types';
export {
  hasSuspiciousCourseNames,
  sanitizeCourseData,
  sanitizeCourseList,
  selectScheduleCourses,
} from './domain/schedule';
export { useScheduleStore } from './store/useScheduleStore';
```

Infrastructure parser/protocol/script/workflow modules stay private and are not exported here.

- [ ] **Step 4: Replace every production and test type import (2-5 minutes)**

Use these exact dependency directions:

```ts
// Inside src/features/schedule/**
import type { CourseData } from '../domain/types';

// src/features/home/screens/HomeScreen.tsx and notification service
import type { CourseData } from '../../schedule';

// app/modal/courseDetails.tsx
import type { CourseData } from '../../src/features/schedule';
```

Adjust the relative `../domain/types` prefix for each Schedule subdirectory. The Schedule storage module imports sanitizers from `../domain/schedule`; no production caller imports its former PCCU parser path.

- [ ] **Step 5: Delete the exhausted PCCU parser module and prove no import remains (2-5 minutes)**

Run before deletion:

```powershell
rg -n "pccu/parsers/pccuScraper|parsers/pccuScraper" app src --glob "*.ts" --glob "*.tsx"
```

Expected after Step 4: only the compatibility file path itself may appear. Delete `pccuScraper.ts` and its now-empty test file, then rerun the command; expected: no output.

- [ ] **Step 6: Run ownership, parser, timeline, notification, Home, and type tests GREEN (2-5 minutes)**

Run:

```powershell
npm.cmd test -- --runInBand src/__tests__/scheduleOwnership.test.ts src/features/schedule/infrastructure/parser src/features/schedule/utils src/features/notifications src/features/home
npm.cmd run typecheck
```

Expected: all focused suites pass; strict TypeScript finds no `CourseData` import under `src/features/pccu`.

- [ ] **Step 7: Commit the dependency move (2-5 minutes)**

```powershell
git add app/modal/courseDetails.tsx src/features/schedule src/features/home/screens/HomeScreen.tsx src/features/notifications/services/courseReminderService.ts src/features/pccu/parsers src/__tests__/scheduleOwnership.test.ts
git commit -m "refactor: expose schedule domain public api"
```

### Task 4: Add the hand-written Schedule runtime protocol

**Files:**

- Create: `__fixtures__/messages/schedule-courses-valid.json`
- Create: `src/features/schedule/infrastructure/sync/scheduleProtocol.ts`
- Create: `src/features/schedule/infrastructure/sync/__tests__/scheduleProtocol.test.ts`

- [ ] **Step 1: Add one exact valid versioned fixture (2-5 minutes)**

Create `schedule-courses-valid.json`:

```json
{
  "version": 1,
  "requestId": "schedule-1",
  "generation": 11,
  "nonce": "nonce-11",
  "syncKind": "schedule",
  "event": "schedule_courses",
  "payload": {
    "courses": [
      {
        "name": "程式設計",
        "teacher": "王老師",
        "location": "大恩 302",
        "required": true,
        "type": "資訊管理學系",
        "dayOfWeek": 3,
        "periodRange": "星期三 第 2-3 節",
        "startPeriod": 2,
        "endPeriod": 3
      }
    ],
    "html": "<table class=\"schedule\"></table>"
  }
}
```

- [ ] **Step 2: Write failing decoder coverage for every accepted event (2-5 minutes)**

Create tests for the valid fixture and the exact event matrix:

```ts
const validCourse = {
  name: '程式設計',
  teacher: '王老師',
  location: '大恩 302',
  required: true,
  type: '資訊管理學系',
  dayOfWeek: 3,
  periodRange: '星期三 第 2-3 節',
  startPeriod: 2,
  endPeriod: 3,
};

it.each([
  ['popup', { url: 'https://ecampus.pccu.edu.tw/eCampus/TransUrl.aspx?PrjNo=1208' }, 'popup'],
  ['schedule_redirect', { url: 'https://ap1.pccu.edu.tw/queryCourse/queryByStudent.asp?QuerySource=queryCourse' }, 'redirect'],
  ['status', { message: '查詢課表中' }, 'progress'],
  ['schedule_probe', { message: 'before-search forms=1' }, 'progress'],
  ['schedule_html', { html: '<table></table>' }, 'html'],
  ['error', { message: 'Schedule query timed out' }, 'error'],
])('decodes %s into %s', (event, payload, type) => {
  expect(decodeScheduleMessage(envelope({ event, payload }))).toEqual({
    ok: true,
    value: expect.objectContaining({ type }),
  });
});

it.each([
  ['schedule_courses', { courses: 'not-an-array', html: '' }],
  ['schedule_courses', { courses: [{ name: 42 }], html: '' }],
  ['schedule_courses', { courses: [{ ...validCourse, dayOfWeek: 8 }], html: '' }],
  ['schedule_courses', { courses: [{ ...validCourse, startPeriod: 5, endPeriod: 2 }], html: '' }],
  ['popup', { url: 'javascript:alert(1)' }],
  ['popup', { url: 'https://ecampus.pccu.edu.tw.evil.example/1208' }],
  ['unknown', {}],
])('rejects malformed %s payload %#', (event, payload) => {
  expect(decodeScheduleMessage(envelope({ event, payload }))).toEqual({
    ok: false,
    error: expect.objectContaining({ code: 'protocol' }),
  });
});
```

- [ ] **Step 3: Run the protocol suite and verify RED (2-5 minutes)**

Run:

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/schedule/infrastructure/sync/__tests__/scheduleProtocol.test.ts
```

Expected: FAIL because `scheduleProtocol.ts` does not exist.

- [ ] **Step 4: Implement structural decoding from `unknown` (2-5 minutes)**

Create `scheduleProtocol.ts`:

```ts
import { SyncError } from '../../../../core/sync/contracts';
import type {
  DecodeResult,
  ValidatedWebViewEnvelope,
} from '../../../../core/sync/webview/protocol';
import type { CourseData } from '../../domain/types';

export type ScheduleWorkflowMessage =
  | { type: 'popup'; url: string }
  | { type: 'redirect'; url: string }
  | { type: 'progress'; message: string }
  | { type: 'courses'; courses: CourseData[]; html: string }
  | { type: 'html'; html: string }
  | { type: 'error'; message: string };

const allowedTargetHosts = new Set(['ecampus.pccu.edu.tw', 'ap1.pccu.edu.tw']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const failure = <T>(message: string): DecodeResult<T> => ({
  ok: false,
  error: new SyncError('protocol', message),
});

const decodeTargetUrl = (value: unknown): DecodeResult<string> => {
  if (typeof value !== 'string') return failure('Schedule target URL must be a string.');
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || !allowedTargetHosts.has(parsed.hostname)) {
      return failure('Schedule target URL is not allowed.');
    }
    return { ok: true, value };
  } catch {
    return failure('Schedule target URL is invalid.');
  }
};

const decodeCourse = (value: unknown): DecodeResult<CourseData> => {
  if (!isRecord(value)) return failure('Schedule course must be an object.');
  const { name, teacher, location, required, type, dayOfWeek, periodRange, startPeriod, endPeriod } = value;
  if (
    typeof name !== 'string' ||
    typeof teacher !== 'string' ||
    typeof location !== 'string' ||
    typeof type !== 'string' ||
    typeof periodRange !== 'string'
  ) {
    return failure('Schedule course text fields are invalid.');
  }
  if (typeof required !== 'boolean') {
    return failure('Schedule course required flag is invalid.');
  }
  if (
    typeof dayOfWeek !== 'number' || !Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 7 ||
    typeof startPeriod !== 'number' || !Number.isInteger(startPeriod) || startPeriod < 1 || startPeriod > 16 ||
    typeof endPeriod !== 'number' || !Number.isInteger(endPeriod) || endPeriod < startPeriod || endPeriod > 16
  ) {
    return failure('Schedule course day or period fields are invalid.');
  }
  return {
    ok: true,
    value: {
      name,
      teacher,
      location,
      required,
      type,
      dayOfWeek,
      periodRange,
      startPeriod,
      endPeriod,
    },
  };
};

export function decodeScheduleMessage(
  envelope: ValidatedWebViewEnvelope,
): DecodeResult<ScheduleWorkflowMessage> {
  if (envelope.syncKind !== 'schedule' || !isRecord(envelope.payload)) {
    return failure('Invalid Schedule envelope.');
  }
  const payload = envelope.payload;

  if (envelope.event === 'popup' || envelope.event === 'schedule_redirect') {
    const decoded = decodeTargetUrl(payload.url);
    if (!decoded.ok) return decoded;
    return {
      ok: true,
      value: { type: envelope.event === 'popup' ? 'popup' : 'redirect', url: decoded.value },
    };
  }

  if (envelope.event === 'status' || envelope.event === 'schedule_probe') {
    return typeof payload.message === 'string'
      ? { ok: true, value: { type: 'progress', message: payload.message } }
      : failure('Schedule progress message must be a string.');
  }

  if (envelope.event === 'schedule_courses') {
    if (!Array.isArray(payload.courses) || typeof payload.html !== 'string') {
      return failure('Schedule courses payload is invalid.');
    }
    const courses: CourseData[] = [];
    for (const candidate of payload.courses) {
      const decoded = decodeCourse(candidate);
      if (!decoded.ok) return decoded;
      courses.push(decoded.value);
    }
    return { ok: true, value: { type: 'courses', courses, html: payload.html } };
  }

  if (envelope.event === 'schedule_html') {
    return typeof payload.html === 'string'
      ? { ok: true, value: { type: 'html', html: payload.html } }
      : failure('Schedule HTML must be a string.');
  }

  if (envelope.event === 'error') {
    return typeof payload.message === 'string'
      ? { ok: true, value: { type: 'error', message: payload.message } }
      : failure('Schedule error message must be a string.');
  }

  return failure('Unexpected Schedule event.');
}
```

Do not use a course-array assertion, field assertion, or envelope assertion anywhere in this decoder.

- [ ] **Step 5: Run protocol, core envelope, and type tests GREEN (2-5 minutes)**

Run:

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/schedule/infrastructure/sync/__tests__/scheduleProtocol.test.ts src/core/sync/webview/__tests__/protocol.test.ts
npm.cmd run typecheck
```

Expected: valid events decode, every malformed field fails with `protocol`, deceptive suffix and non-HTTPS URLs fail closed, and typecheck exits 0.

- [ ] **Step 6: Commit the Schedule protocol (2-5 minutes)**

```powershell
git add __fixtures__/messages/schedule-courses-valid.json src/features/schedule/infrastructure/sync/scheduleProtocol.ts src/features/schedule/infrastructure/sync/__tests__/scheduleProtocol.test.ts
git commit -m "feat: validate schedule workflow messages"
```

### Task 5: Move the adaptive Schedule extraction script behind an identity-bound builder

**Files:**

- Create: `src/features/schedule/infrastructure/sync/scheduleScripts.ts`
- Create: `src/features/schedule/infrastructure/sync/__tests__/scheduleScripts.test.ts`
- Test temporarily: `src/features/pccu/sync/__tests__/pccuSyncScripts.test.ts`

- [ ] **Step 1: Move every current adaptive-script assertion to the feature suite (2-5 minutes)**

The feature suite imports `buildScheduleExtractionScript` and keeps all current assertions for:

```ts
const identity = {
  requestId: 'schedule-1',
  generation: 11,
  nonce: 'nonce-11',
  syncKind: 'schedule' as const,
};

it('keeps queryByStudent form, search flag, and direct fallback behavior', () => {
  const script = buildScheduleExtractionScript(identity);
  expect(script).toContain('queryByStudent.asp?QuerySource=queryCourse');
  expect(script).toContain('function findQueryForm(doc)');
  expect(script).toContain('function submitQueryForm(doc, form, search)');
  expect(script).toContain("form.querySelector('[name=\"hidChkSearch\"]')");
  expect(script).toContain("var searchAction = 'searchByStudent';");
  expect(script).toContain('searchFlag.value = searchAction;');
  expect(script).not.toContain('gfOpenLink');
});

it('keeps fuzzy student-entry, work-document, and result-marker defenses', () => {
  const script = buildScheduleExtractionScript(identity);
  expect(script).toContain('function scheduleEntryTextMatches(text)');
  expect(script).toContain('function closestClickableAncestor(node)');
  expect(script).toContain('function findStudentScheduleEntryByText()');
  expect(script).toContain('function classifyScheduleState(doc, html)');
  expect(script).toContain('function findScheduleWorkDoc()');
  expect(script).toContain('/pubTdItem_Period|PrintTitle/.test(markup)');
  expect(script).not.toContain('/pubContent/.test(markup)');
});

it('embeds one versioned identity and posts no legacy envelope', () => {
  const script = buildScheduleExtractionScript(identity);
  expect(script).toContain('version: 1');
  expect(script).toContain('"requestId":"schedule-1"');
  expect(script).toContain('"generation":11');
  expect(script).toContain('"nonce":"nonce-11"');
  expect(script).toContain("syncKind: 'schedule'");
  expect(script.match(/ReactNativeWebView\.postMessage/g)).toHaveLength(1);
  expect(script).not.toContain('postMessage(JSON.stringify(payload))');
});

it('turns frame/menu redirects into workflow messages and keeps form search in-page', () => {
  const script = buildScheduleExtractionScript(identity);
  expect(script).toContain("post({ t: 'redirect', url: targetUrl })");
  expect(script).toContain("case 'redirect':");
  expect(script).toContain("postSchedule('schedule_redirect', { url: message.url })");
  expect(script).toContain('form.requestSubmit()');
  expect(script).toContain('form.submit()');
});
```

Also retain the current helper-definition order, relogin marker, no-data marker, probe, active-state reset, session search timestamp, 12-attempt limit, and regex-escape assertions from `pccuSyncScripts.test.ts`.

- [ ] **Step 2: Run the feature script suite and verify RED (2-5 minutes)**

Run:

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/schedule/infrastructure/sync/__tests__/scheduleScripts.test.ts
```

Expected: FAIL because the feature-local builder does not exist.

- [ ] **Step 3: Add the exact versioned post adapter (2-5 minutes)**

At the top of the generated script, replace the old raw `post` helper with this adapter:

```ts
import type { WorkflowIdentity } from '../../../../core/sync/workflow';

const buildPostPrelude = (identity: WorkflowIdentity<'schedule'>) => `
  var identity = ${JSON.stringify(identity)};
  function postSchedule(event, payload) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      version: 1,
      requestId: identity.requestId,
      generation: identity.generation,
      nonce: identity.nonce,
      syncKind: 'schedule',
      event: event,
      payload: payload
    }));
  }
  function post(message) {
    if (!message || typeof message.t !== 'string') {
      postSchedule('error', { message: 'Invalid Schedule script message' });
      return;
    }
    switch (message.t) {
      case 'courses':
        postSchedule('schedule_courses', {
          courses: Array.isArray(message.c) ? message.c : [],
          html: typeof message.h === 'string' ? message.h : ''
        });
        return;
      case 'html':
        postSchedule('schedule_html', { html: typeof message.h === 'string' ? message.h : '' });
        return;
      case 'popup':
        postSchedule('popup', { url: String(message.url || '') });
        return;
      case 'redirect':
        postSchedule('schedule_redirect', { url: String(message.url || '') });
        return;
      case 'status':
      case 'schedule_probe':
        postSchedule(message.t, { message: String(message.m || '') });
        return;
      case 'err':
        postSchedule('error', { message: String(message.m || 'Schedule sync script failed') });
        return;
      default:
        postSchedule('error', { message: 'Unsupported Schedule script event' });
    }
  }
`;
```

- [ ] **Step 4: Move the complete adaptive body and make redirects declarative (2-5 minutes)**

Create the builder with this exact public signature:

```ts
export function buildScheduleExtractionScript(
  identity: WorkflowIdentity<'schedule'>,
): string {
  return `
    (function() {
      ${buildPostPrelude(identity)}
      ${scheduleDomHelpers}
      ${scheduleAdaptiveBody}
    })();
    true;
  `;
}
```

`scheduleDomHelpers` is the complete set of helper functions currently interpolated through `baseHelpers` and referenced by `buildAdaptiveSchedulePageScript`; `scheduleAdaptiveBody` is the complete current adaptive body from its `try` block through its catch/release block. Move those exact existing statements into the two module-private string constants in this file. Make only these behavior changes during the move:

```js
// frame handoff
post({ t: 'redirect', url: frameLink.src });
return;

// navigateDoc replacement
function navigateDoc(doc, targetUrl) {
  if (!targetUrl) return false;
  post({ t: 'redirect', url: targetUrl });
  return true;
}
```

Keep `submitQueryForm` executing against its current document because form submission is the Schedule search action performed by the injected script. Keep every current selector, state marker, probe field, polling interval, and completion threshold unchanged.

- [ ] **Step 5: Run new and legacy script characterization GREEN (2-5 minutes)**

Run:

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/schedule/infrastructure/sync/__tests__/scheduleScripts.test.ts src/features/pccu/sync/__tests__/pccuSyncScripts.test.ts
npm.cmd run typecheck
```

Expected: both suites pass; the new builder posts only versioned envelopes with the active identity, and the old builder remains temporarily available to the legacy controller until Task 11.

- [ ] **Step 6: Commit the identity-bound builder (2-5 minutes)**

```powershell
git add src/features/schedule/infrastructure/sync/scheduleScripts.ts src/features/schedule/infrastructure/sync/__tests__/scheduleScripts.test.ts
git commit -m "feat: add identity bound schedule extraction script"
```

### Task 6: Build the pure Schedule reducer and workflow adapter

**Files:**

- Create: `src/features/schedule/infrastructure/sync/scheduleWorkflow.ts`
- Create: `src/features/schedule/infrastructure/sync/__tests__/scheduleWorkflow.test.ts`

- [ ] **Step 1: Write the failing 1208 happy-path and timer-deduplication tests (2-5 minutes)**

Cover the complete effect sequence:

```ts
it('ensures PCCU, opens 1208, follows TransUrl, injects once, and completes courses', () => {
  const step1 = reduceScheduleWorkflow(initial, started(1_000), deps);
  expect(step1.effects).toEqual([effect(identity, { type: 'ensure-session', session: 'pccu' })]);

  const step2 = reduceScheduleWorkflow(step1.state, sessionReady(1_100), deps);
  expect(step2.effects).toEqual([
    effect(identity, { type: 'inject-java-script', script: 'open-1208;' }),
  ]);

  const step3 = reduceScheduleWorkflow(step2.state, popup(TRANS_URL, 1_200), deps);
  expect(step3.effects).toEqual([effect(identity, { type: 'navigate', url: TRANS_URL })]);

  const nav = reduceScheduleWorkflow(step3.state, navigation(TRANS_URL, 1_300), deps);
  const loadEnd = reduceScheduleWorkflow(nav.state, loadEndEvent(TRANS_URL, 1_350), deps);
  expect(nav.effects).toEqual([
    effect(identity, { type: 'heartbeat' }),
    effect(identity, { type: 'schedule', token: 'inject-schedule-1', delayMs: 1_200 }),
  ]);
  expect(loadEnd.effects).toEqual([effect(identity, { type: 'heartbeat' })]);

  const injected = reduceScheduleWorkflow(
    loadEnd.state,
    timer('inject-schedule-1', 2_500),
    deps,
  );
  expect(injected.effects).toEqual([
    effect(identity, { type: 'inject-java-script', script: 'extract-schedule;' }),
  ]);

  const complete = reduceScheduleWorkflow(
    injected.state,
    courses([validCourse], '<table></table>', 3_000),
    deps,
  );
  expect(complete.effects).toEqual([
    effect(identity, {
      type: 'complete',
      data: { courses: [validCourse], updatedAt: 3_000 },
      updatedAt: 3_000,
    }),
  ]);
});
```

- [ ] **Step 2: Add failing redirect, direct-AP1, search heartbeat, retry, relogin, and terminal tests (2-5 minutes)**

Add separate cases that assert:

```ts
expect(reduceScheduleWorkflow(opening, redirect(AP1_QUERY_URL, 1_500), deps).effects)
  .toEqual([effect(identity, { type: 'navigate', url: AP1_QUERY_URL })]);

expect(reduceScheduleWorkflow(extracting, progress('before-search forms=1', 1_600), deps).effects)
  .toEqual([effect(identity, { type: 'heartbeat' })]);

const retry1 = reduceScheduleWorkflow(extracting, courses([], '', 2_000), deps);
expect(retry1.effects).toEqual([
  effect(identity, { type: 'heartbeat' }),
  effect(identity, { type: 'schedule', token: 'retry-schedule-1', delayMs: 500 }),
]);

const retry2 = reduceScheduleWorkflow(
  reduceScheduleWorkflow(retry1.state, timer('retry-schedule-1', 2_500), deps).state,
  html('<html></html>', 3_000),
  deps,
);
const terminal = reduceScheduleWorkflow(
  reduceScheduleWorkflow(retry2.state, timer('retry-schedule-2', 3_500), deps).state,
  html('<html></html>', 4_000),
  deps,
);
expect(terminal.effects[0]).toEqual(
  effect(identity, { type: 'fail', error: expect.objectContaining({ code: 'parse' }) }),
);

expect(reduceScheduleWorkflow(extracting, remoteError('Schedule query requires relogin', 2_000), deps).effects)
  .toEqual([effect(identity, { type: 'ensure-session', session: 'pccu' })]);

expect(reduceScheduleWorkflow(
  { ...initial, phase: 'succeeded' },
  navigation(AP1_QUERY_URL, 9_999),
  deps,
)).toEqual({ state: { ...initial, phase: 'succeeded' }, effects: [] });
```

Also assert the HTML parser wins when it returns more rows or replaces suspicious direct rows, a wrong timer token is ignored, two relogin attempts are allowed and the third fails `auth`, load errors fail `navigation`, and transient login-network messages produce only a heartbeat while the coordinator deadline remains active.

- [ ] **Step 3: Run the workflow suite and verify RED (2-5 minutes)**

Run:

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/schedule/infrastructure/sync/__tests__/scheduleWorkflow.test.ts
```

Expected: FAIL because `scheduleWorkflow.ts` does not exist.

- [ ] **Step 4: Define the complete state, event, and dependency surface (2-5 minutes)**

```ts
import { SyncError, type SyncErrorCode } from '../../../../core/sync/contracts';
import type {
  SyncWorkflow,
  ValidatedWorkflowEvent,
  WorkflowContext,
  WorkflowIdentity,
  WorkflowTransition,
} from '../../../../core/sync/workflow';
import { hasSuspiciousCourseNames, selectScheduleCourses } from '../../domain/schedule';
import type { CourseData, ScheduleSyncPayload } from '../../domain/types';
import { decodeScheduleMessage, type ScheduleWorkflowMessage } from './scheduleProtocol';

export type ScheduleWorkflowPhase =
  | 'idle'
  | 'ensuring-session'
  | 'opening-service'
  | 'waiting-handoff'
  | 'waiting-injection'
  | 'extracting'
  | 'retry-wait'
  | 'succeeded'
  | 'failed';

type ScheduleTimerKind = 'handoff' | 'retry';

export type ScheduleWorkflowState = {
  identity: WorkflowIdentity<'schedule'>;
  phase: ScheduleWorkflowPhase;
  activeUrl: string;
  timerSequence: number;
  pendingTimerToken: string | null;
  pendingTimerKind: ScheduleTimerKind | null;
  pendingUrlKey: string | null;
  injectedUrlKeys: string[];
  resultRetries: number;
  sessionRetries: number;
};

export type ScheduleWorkflowEvent =
  | Exclude<ValidatedWorkflowEvent, { type: 'message' }>
  | { type: 'popup'; identity: WorkflowIdentity<'schedule'>; url: string; now: number }
  | { type: 'redirect'; identity: WorkflowIdentity<'schedule'>; url: string; now: number }
  | { type: 'progress'; identity: WorkflowIdentity<'schedule'>; message: string; now: number }
  | { type: 'courses'; identity: WorkflowIdentity<'schedule'>; courses: CourseData[]; html: string; now: number }
  | { type: 'html'; identity: WorkflowIdentity<'schedule'>; html: string; now: number }
  | { type: 'remote-error'; identity: WorkflowIdentity<'schedule'>; message: string; now: number };

export type ScheduleWorkflowDeps = {
  buildServiceScript(identity: WorkflowIdentity<'schedule'>): string;
  buildExtractionScript(identity: WorkflowIdentity<'schedule'>): string;
  parse(html: string): CourseData[];
};

export const createScheduleInitialState = (
  context: WorkflowContext<'schedule'>,
): ScheduleWorkflowState => ({
  identity: context,
  phase: 'idle',
  activeUrl: '',
  timerSequence: 0,
  pendingTimerToken: null,
  pendingTimerKind: null,
  pendingUrlKey: null,
  injectedUrlKeys: [],
  resultRetries: 0,
  sessionRetries: 0,
});
```

- [ ] **Step 5: Implement identity-bound effect helpers and deterministic result handling (2-5 minutes)**

```ts
const withIdentity = <T extends object>(state: ScheduleWorkflowState, effect: T) => ({
  ...state.identity,
  ...effect,
});

const fail = (
  state: ScheduleWorkflowState,
  code: SyncErrorCode,
  message: string,
  retryable = false,
): WorkflowTransition<ScheduleWorkflowState, ScheduleSyncPayload> => ({
  state: { ...state, phase: 'failed', pendingTimerToken: null, pendingTimerKind: null },
  effects: [withIdentity(state, { type: 'fail' as const, error: new SyncError(code, message, { retryable }) })],
});

const normalizeScheduleUrl = (url: string) =>
  url
    .replace(/([?&])NoCache=[^&]+/gi, '$1')
    .replace(/([?&])lvMainMenuIndex=[^&]+/gi, '$1')
    .replace(/[?&]$/, '');

const isScheduleTarget = (url: string) =>
  /TransUrl\.aspx\?PrjNo=1208/i.test(url) ||
  /\/queryCourse\/(?:index|queryByCourse|queryByStudent)\.asp/i.test(url);

const requestInjection = (
  state: ScheduleWorkflowState,
  url: string,
  delayMs: number,
): WorkflowTransition<ScheduleWorkflowState, ScheduleSyncPayload> => {
  const key = normalizeScheduleUrl(url);
  if (state.pendingUrlKey === key || state.injectedUrlKeys.includes(key)) {
    return { state, effects: [withIdentity(state, { type: 'heartbeat' as const })] };
  }
  const timerSequence = state.timerSequence + 1;
  const token = `inject-schedule-${timerSequence}`;
  return {
    state: {
      ...state,
      phase: 'waiting-injection',
      activeUrl: url,
      timerSequence,
      pendingTimerToken: token,
      pendingTimerKind: 'handoff',
      pendingUrlKey: key,
    },
    effects: [
      withIdentity(state, { type: 'heartbeat' as const }),
      withIdentity(state, { type: 'schedule' as const, token, delayMs }),
    ],
  };
};

const retryResult = (
  state: ScheduleWorkflowState,
  message: string,
): WorkflowTransition<ScheduleWorkflowState, ScheduleSyncPayload> => {
  if (state.resultRetries >= 2) return fail(state, 'parse', message, true);
  const nextRetry = state.resultRetries + 1;
  const token = `retry-schedule-${nextRetry}`;
  return {
    state: {
      ...state,
      phase: 'retry-wait',
      resultRetries: nextRetry,
      pendingTimerToken: token,
      pendingTimerKind: 'retry',
      pendingUrlKey: null,
    },
    effects: [
      withIdentity(state, { type: 'heartbeat' as const }),
      withIdentity(state, { type: 'schedule' as const, token, delayMs: 500 }),
    ],
  };
};

const completeResult = (
  state: ScheduleWorkflowState,
  structured: CourseData[],
  html: string,
  now: number,
  deps: ScheduleWorkflowDeps,
): WorkflowTransition<ScheduleWorkflowState, ScheduleSyncPayload> => {
  const parsed = html ? deps.parse(html) : [];
  const courses = selectScheduleCourses(structured, parsed);
  if (courses.length === 0 || hasSuspiciousCourseNames(courses)) {
    return retryResult(state, 'Schedule result was empty or suspicious.');
  }
  const data = { courses, updatedAt: now };
  return {
    state: { ...state, phase: 'succeeded', pendingTimerToken: null, pendingTimerKind: null },
    effects: [withIdentity(state, { type: 'complete' as const, data, updatedAt: now })],
  };
};
```

- [ ] **Step 6: Implement the complete pure transition function (2-5 minutes)**

```ts
export function reduceScheduleWorkflow(
  state: ScheduleWorkflowState,
  event: ScheduleWorkflowEvent,
  deps: ScheduleWorkflowDeps,
): WorkflowTransition<ScheduleWorkflowState, ScheduleSyncPayload> {
  if (state.phase === 'succeeded' || state.phase === 'failed') return { state, effects: [] };

  if (event.type === 'started' && state.phase === 'idle') {
    return {
      state: { ...state, phase: 'ensuring-session' },
      effects: [withIdentity(state, { type: 'ensure-session' as const, session: 'pccu' as const })],
    };
  }

  if (event.type === 'session-ready' && state.phase === 'ensuring-session') {
    return {
      state: { ...state, phase: 'opening-service' },
      effects: [withIdentity(state, {
        type: 'inject-java-script' as const,
        script: deps.buildServiceScript(state.identity),
      })],
    };
  }

  if (event.type === 'session-error') {
    return fail(state, 'auth', event.error.message, event.error.retryable);
  }

  if (event.type === 'popup' || event.type === 'redirect') {
    return {
      state: { ...state, phase: 'waiting-handoff', activeUrl: event.url },
      effects: [withIdentity(state, { type: 'navigate' as const, url: event.url })],
    };
  }

  if (event.type === 'navigation' || event.type === 'load-end') {
    if (!isScheduleTarget(event.url)) return { state, effects: [] };
    return requestInjection(state, event.url, event.type === 'load-end' ? 400 : 1_200);
  }

  if (event.type === 'timer') {
    if (event.token !== state.pendingTimerToken || !state.pendingTimerKind) {
      return { state, effects: [] };
    }
    const injectedUrlKeys =
      state.pendingTimerKind === 'handoff' && state.pendingUrlKey
        ? [...state.injectedUrlKeys, state.pendingUrlKey]
        : state.injectedUrlKeys;
    return {
      state: {
        ...state,
        phase: 'extracting',
        pendingTimerToken: null,
        pendingTimerKind: null,
        pendingUrlKey: null,
        injectedUrlKeys,
      },
      effects: [withIdentity(state, {
        type: 'inject-java-script' as const,
        script: deps.buildExtractionScript(state.identity),
      })],
    };
  }

  if (event.type === 'progress') {
    return { state, effects: [withIdentity(state, { type: 'heartbeat' as const })] };
  }

  if (event.type === 'courses') {
    return completeResult(state, event.courses, event.html, event.now, deps);
  }

  if (event.type === 'html') {
    return completeResult(state, [], event.html, event.now, deps);
  }

  if (event.type === 'remote-error') {
    if (/requires relogin|session expired|please login again|請重新登入|請先登入|逾時過期/i.test(event.message)) {
      if (state.sessionRetries >= 2) return fail(state, 'auth', event.message, false);
      return {
        state: {
          ...state,
          phase: 'ensuring-session',
          sessionRetries: state.sessionRetries + 1,
          pendingTimerToken: null,
          pendingTimerKind: null,
          pendingUrlKey: null,
          injectedUrlKeys: [],
        },
        effects: [withIdentity(state, { type: 'ensure-session' as const, session: 'pccu' as const })],
      };
    }
    if (/Network request failed|Login request timed out|Login request aborted/i.test(event.message)) {
      return { state, effects: [withIdentity(state, { type: 'heartbeat' as const })] };
    }
    return retryResult(state, event.message || 'Schedule extraction failed.');
  }

  if (event.type === 'load-error') {
    return fail(state, 'navigation', event.description || 'Schedule page failed to load.', true);
  }

  return { state, effects: [] };
}
```

- [ ] **Step 7: Add the decoder bridge and `SyncWorkflow` adapter (2-5 minutes)**

```ts
const toWorkflowEvent = (
  identity: WorkflowIdentity<'schedule'>,
  message: ScheduleWorkflowMessage,
  now: number,
): ScheduleWorkflowEvent => {
  switch (message.type) {
    case 'popup': return { type: 'popup', identity, url: message.url, now };
    case 'redirect': return { type: 'redirect', identity, url: message.url, now };
    case 'progress': return { type: 'progress', identity, message: message.message, now };
    case 'courses': return { type: 'courses', identity, courses: message.courses, html: message.html, now };
    case 'html': return { type: 'html', identity, html: message.html, now };
    case 'error': return { type: 'remote-error', identity, message: message.message, now };
  }
};

export const createScheduleWorkflow = (
  deps: ScheduleWorkflowDeps,
): SyncWorkflow<'schedule', ScheduleWorkflowState, ScheduleWorkflowEvent> => ({
  kind: 'schedule',
  allowedHosts: ['ecampus.pccu.edu.tw', 'ap1.pccu.edu.tw'],
  initialState: createScheduleInitialState,
  decodeEvent(state, event) {
    if (event.type !== 'message') return { ok: true, value: event };
    const decoded = decodeScheduleMessage(event.envelope);
    if (!decoded.ok) return decoded;
    return { ok: true, value: toWorkflowEvent(state.identity, decoded.value, event.now) };
  },
  transition: (state, event) => reduceScheduleWorkflow(state, event, deps),
});
```

- [ ] **Step 8: Run workflow, protocol, domain, and type tests GREEN (2-5 minutes)**

Run:

```powershell
npm.cmd test -- --runInBand src/features/schedule/domain src/features/schedule/infrastructure/parser src/features/schedule/infrastructure/sync
npm.cmd run typecheck
```

Expected: all Schedule suites pass; reducer tests use fixed `now`; source inspection finds no `Date.now`, storage, store, notification, React, or WebView import in `scheduleWorkflow.ts`.

- [ ] **Step 9: Commit the pure workflow (2-5 minutes)**

```powershell
git add src/features/schedule/infrastructure/sync/scheduleWorkflow.ts src/features/schedule/infrastructure/sync/__tests__/scheduleWorkflow.test.ts
git commit -m "feat: add schedule sync workflow"
```

### Task 7: Register Schedule and prove existing host execution needs no new effect

**Files:**

- Modify: `src/composition/sync.ts`
- Modify: `src/core/sync/__tests__/WorkflowRegistry.test.ts`
- Modify: `src/core/sync/webview/__tests__/WebViewWorkflowRuntime.test.ts`
- Modify: `src/core/sync/webview/__tests__/WebViewSessionHost.test.tsx`
- Modify: `src/features/schedule/infrastructure/sync/__tests__/scheduleWorkflow.test.ts`

- [ ] **Step 1: Write a failing registry inventory test (2-5 minutes)**

```ts
it('registers Traffic, Grade, and Schedule while Tutoring remains legacy', () => {
  expect(syncComposition.registry.resolve('traffic')).not.toBe(syncComposition.legacyAdapters.get('traffic'));
  expect(syncComposition.registry.resolve('grade')).not.toBe(syncComposition.legacyAdapters.get('grade'));
  expect(syncComposition.registry.resolve('schedule')).not.toBe(syncComposition.legacyAdapters.get('schedule'));
  expect(syncComposition.registry.resolve('tutoring')).toBe(syncComposition.legacyAdapters.get('tutoring'));
  expect(syncComposition.registry.resolve('tutoring-detail')).toBe(syncComposition.legacyAdapters.get('tutoring-detail'));
  expect(syncComposition.registry.resolve('tutoring-download')).toBe(syncComposition.legacyAdapters.get('tutoring-download'));
  expect(syncComposition.registry.resolve('tutoring-upload')).toBe(syncComposition.legacyAdapters.get('tutoring-upload'));
});
```

- [ ] **Step 2: Add a failing runtime-adapter effect sequence test (2-5 minutes)**

```ts
it('starts the registered Schedule session with the workflow identity intact', () => {
  const runtime = new WebViewWorkflowRuntime({ createNonce: () => 'nonce-12', now: () => 1_000 });
  const adapter = runtime.createAdapter(createScheduleWorkflow(deps));
  const pending = adapter.execute(undefined, executionContext({ requestId: 'schedule-1', generation: 12 }));
  runtime.dispatch({
    type: 'started',
    identity: runtime.getSnapshot().identity!,
    now: 1_000,
  });
  expect(runtime.getSnapshot()).toMatchObject({
    identity: { requestId: 'schedule-1', generation: 12, nonce: 'nonce-12', syncKind: 'schedule' },
    effects: [{ type: 'ensure-session', session: 'pccu' }],
  });
  pending.catch(() => undefined);
});
```

- [ ] **Step 3: Run registry tests and verify RED (2-5 minutes)**

Run:

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/core/sync/__tests__/WorkflowRegistry.test.ts src/features/schedule/infrastructure/sync/__tests__/scheduleWorkflow.test.ts
```

Expected: FAIL because composition still resolves Schedule to its Phase 1 legacy adapter.

- [ ] **Step 4: Register Schedule after the two accepted workflows (2-5 minutes)**

Replace only the Phase 1 Schedule adapter in the existing composition:

```ts
const scheduleAdapter = webViewWorkflowRuntime.createAdapter(createScheduleWorkflow({
  buildServiceScript: (identity) => buildServiceOpenScript('1208', identity),
  buildExtractionScript: buildScheduleExtractionScript,
  parse: parseScheduleFromHtml,
}));
const previous = registry.replace(scheduleAdapter);
if (previous !== legacyAdapters.get('schedule')) {
  throw new Error('schedule_legacy_adapter_missing');
}
```

The cutover order in `createSyncComposition()` is Traffic, Grade, Schedule. Use the Phase 2A identity-aware `buildServiceOpenScript` signature; keep its `1202` branch for the Phase 2C fallback. Do not construct another registry or runtime.

- [ ] **Step 5: Prove Schedule `navigate`, `schedule`, and injection effects use the generic host (2-5 minutes)**

Add one host test using a Schedule identity:

```tsx
it('executes Schedule navigate and delayed injection through the generic host', () => {
  jest.useFakeTimers();
  const onEvent = jest.fn();
  const scheduleIdentity = {
    requestId: 'schedule-host-1', generation: 12, nonce: 'nonce-12', syncKind: 'schedule' as const,
  };
  const rendered = render(
    <WebViewSessionHost
      identity={scheduleIdentity}
      effects={[
        { ...scheduleIdentity, type: 'navigate', url: TRANS_URL },
        { ...scheduleIdentity, type: 'schedule', token: 'inject-schedule-1', delayMs: 400 },
      ]}
      initialUrl="about:blank"
      onEvent={onEvent}
      onHeartbeat={jest.fn()}
      onTerminalEffect={jest.fn()}
      sessionDriver={{ ensure: jest.fn(async () => undefined) }}
    />,
  );
  expect(webViewPropsRef.current?.source).toEqual({ uri: TRANS_URL });
  jest.advanceTimersByTime(400);
  expect(onEvent).toHaveBeenCalledWith({
    type: 'timer', identity: scheduleIdentity, token: 'inject-schedule-1', now: expect.any(Number),
  });
  rendered.unmount();
  expect(jest.getTimerCount()).toBe(0);
});
```

Do not add a Schedule-specific host prop, callback, or effect variant.

- [ ] **Step 6: Run registry, host, all three workflows, and type tests GREEN (2-5 minutes)**

Run:

```powershell
npm.cmd test -- --runInBand src/core/sync/__tests__/WorkflowRegistry.test.ts src/core/sync/webview src/features/traffic/infrastructure/sync src/features/grade/infrastructure/sync src/features/schedule/infrastructure/sync
npm.cmd run typecheck
```

Expected: all suites pass; the host executes Schedule with the existing effect union, and all four Tutoring kinds still resolve to their retained legacy adapters.

- [ ] **Step 7: Commit the Schedule registration (2-5 minutes)**

```powershell
git add src/composition/sync.ts src/core/sync/__tests__/WorkflowRegistry.test.ts src/core/sync/webview/__tests__/WebViewWorkflowRuntime.test.ts src/core/sync/webview/__tests__/WebViewSessionHost.test.tsx src/features/schedule/infrastructure/sync/__tests__/scheduleWorkflow.test.ts
git commit -m "feat: register schedule sync workflow"
```

### Task 8: Commit Schedule output through storage before refreshing reminders

**Files:**

- Create: `src/features/schedule/application/runScheduleSync.ts`
- Create: `src/features/schedule/application/__tests__/runScheduleSync.test.ts`
- Create: `src/features/schedule/storage/__tests__/scheduleStorage.test.ts`
- Modify: `src/features/schedule/storage/scheduleStorage.ts`

- [ ] **Step 1: Write failing commit-order and storage-failure tests (2-5 minutes)**

Create application tests with an explicit operation log:

```ts
it('commits typed courses before refreshing reminders and returning success', async () => {
  const order: string[] = [];
  const requestSync = jest.fn(async () => {
    order.push('workflow');
    return payload;
  });
  const persist = jest.fn(async () => { order.push('storage'); });
  const refreshReminders = jest.fn(async () => { order.push('reminders'); });

  await expect(runScheduleSync({
    requestSync,
    persist,
    refreshReminders,
    reportReminderError: jest.fn(),
  }, policy)).resolves.toEqual({
    success: true,
    data: payload,
    updatedAt: payload.updatedAt,
  });
  expect(order).toEqual(['workflow', 'storage', 'reminders']);
  expect(persist).toHaveBeenCalledWith(payload.courses, false, payload.updatedAt);
});

it('returns storage and never refreshes reminders when the commit rejects', async () => {
  const refreshReminders = jest.fn(async () => undefined);
  await expect(runScheduleSync({
    requestSync: successfulRequest,
    persist: jest.fn(async () => { throw new Error('quota'); }),
    refreshReminders,
    reportReminderError: jest.fn(),
  }, policy)).resolves.toEqual({
    success: false,
    message: '課表儲存失敗',
    error: expect.objectContaining({ code: 'storage', retryable: true }),
  });
  expect(refreshReminders).not.toHaveBeenCalled();
});

it('reports a reminder-only failure without rolling back committed Schedule data', async () => {
  const reportReminderError = jest.fn();
  await expect(runScheduleSync({
    requestSync: successfulRequest,
    persist: jest.fn(async () => undefined),
    refreshReminders: jest.fn(async () => { throw new Error('permission API unavailable'); }),
    reportReminderError,
  }, policy)).resolves.toEqual({
    success: true,
    data: payload,
    updatedAt: payload.updatedAt,
  });
  expect(reportReminderError).toHaveBeenCalledWith(expect.any(Error));
});
```

- [ ] **Step 2: Write the failing storage cache-order test (2-5 minutes)**

Mock `AsyncStorage.multiSet` and assert a rejected write does not replace the last successful in-memory snapshot:

```ts
it('updates memory only after both legacy keys persist', async () => {
  mockMultiSet.mockResolvedValueOnce(undefined);
  await setCourses([previousCourse], false, 100);

  mockMultiSet.mockRejectedValueOnce(new Error('disk full'));
  await expect(setCourses([nextCourse], false, 200)).rejects.toThrow('disk full');

  await expect(getCourses()).resolves.toEqual({
    courses: [previousCourse],
    mock: false,
    updatedAt: 100,
  });
});
```

Use `jest.resetModules()` between tests so the module-level cache begins from a known state.

- [ ] **Step 3: Run both suites and verify RED (2-5 minutes)**

Run:

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/schedule/application/__tests__/runScheduleSync.test.ts src/features/schedule/storage/__tests__/scheduleStorage.test.ts
```

Expected: application test fails because `runScheduleSync.ts` is absent; storage test fails because writes are swallowed and memory changes before persistence.

- [ ] **Step 4: Make the legacy Schedule storage facade propagate writes (2-5 minutes)**

Replace `setCourses` with:

```ts
export async function setCourses(
  courses: CourseData[],
  mock = false,
  updatedAt = Date.now(),
): Promise<void> {
  const normalizedCourses = sanitizeCourseList(courses);
  const payload = JSON.stringify({ courses: normalizedCourses, mock, updatedAt });
  await AsyncStorage.multiSet([
    [STORAGE_KEY, payload],
    [LAST_STORAGE_KEY, payload],
  ]);
  cachedCourses = normalizedCourses;
  cachedUpdatedAt = updatedAt;
  isMockData = mock;
}
```

Read-side stale fallback remains for Phase 2B. Phase 3 replaces both legacy keys with the account-scoped generation repository.

- [ ] **Step 5: Implement the complete compatibility application adapter (2-5 minutes)**

Create `runScheduleSync.ts`:

```ts
import { SyncError, type SyncPolicy } from '../../../core/sync/contracts';
import type { LegacyPccuSyncEngineFacade } from '../../pccu/engine/compat/LegacyPccuSyncEngineFacade';
import type { CourseData, ScheduleSyncPayload } from '../domain/types';

export type RunScheduleSyncDeps = {
  requestSync: Pick<LegacyPccuSyncEngineFacade, 'requestSync'>['requestSync'];
  persist(courses: CourseData[], mock: boolean, updatedAt: number): Promise<void>;
  refreshReminders(courses: CourseData[]): Promise<void>;
  reportReminderError(cause: unknown): void;
};

export type ScheduleHookSyncResult =
  | { success: true; data: ScheduleSyncPayload; updatedAt: number }
  | { success: false; message: string; error: SyncError };

export async function runScheduleSync(
  deps: RunScheduleSyncDeps,
  policy: SyncPolicy,
): Promise<ScheduleHookSyncResult> {
  let payload: ScheduleSyncPayload;
  try {
    payload = await deps.requestSync('schedule', policy.priority, {
      reason: policy.reason,
      force: policy.force,
    });
  } catch (cause) {
    const error = toSyncError(cause);
    return { success: false, message: error.message, error };
  }

  try {
    await deps.persist(payload.courses, false, payload.updatedAt);
  } catch {
    return {
      success: false,
      message: '課表儲存失敗',
      error: new SyncError('storage', 'Schedule commit failed.', { retryable: true }),
    };
  }

  try {
    await deps.refreshReminders(payload.courses);
  } catch (cause) {
    deps.reportReminderError(cause);
  }

  return { success: true, data: payload, updatedAt: payload.updatedAt };
}
```

- [ ] **Step 6: Run application, storage, and type tests GREEN (2-5 minutes)**

Run:

```powershell
npm.cmd test -- --runInBand src/features/schedule/application src/features/schedule/storage
npm.cmd run typecheck
```

Expected: success order is workflow → storage → reminders; rejected writes remain failures with the prior memory snapshot; reminder-only failure is reported once and committed data remains successful.

- [ ] **Step 7: Commit the Schedule commit adapter (2-5 minutes)**

```powershell
git add src/features/schedule/application src/features/schedule/storage
git commit -m "refactor: commit schedule output before publication"
```

### Task 9: Publish typed committed courses from `useScheduleSync`

**Files:**

- Modify: `src/features/schedule/hooks/useScheduleSync.ts`
- Modify: `src/features/schedule/hooks/__tests__/useScheduleSync.test.tsx`
- Modify: `src/features/auth/screens/__tests__/bootstrapSync.test.tsx`
- Modify: `src/features/schedule/index.ts`

- [ ] **Step 1: Replace the old storage-rehydrate mock with failing typed-output assertions (2-5 minutes)**

Update `useScheduleSync.test.tsx` so `requestSync` returns the complete payload and assert:

```ts
expect(mockRequestSync).toHaveBeenCalledWith('schedule', 5, {
  reason: 'user',
  force: true,
});
expect(mockSetCourses).toHaveBeenCalledWith(payload.courses, false, payload.updatedAt);
expect(mockRefreshScheduledCourseReminders).toHaveBeenCalledWith(payload.courses);
expect(mockGetCourses).not.toHaveBeenCalled();
expect(useScheduleStore.getState()).toMatchObject({
  courses: payload.courses,
  lastSyncedAt: payload.updatedAt,
  syncStatus: 'idle',
  error: null,
});
```

Add cases for rejected persistence preserving the previous store, same-hook duplicate suppression, and a silent warmup failure leaving the visible courses/error/status unchanged.

- [ ] **Step 2: Run hook and bootstrap suites and verify RED (2-5 minutes)**

Run:

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/schedule/hooks/__tests__/useScheduleSync.test.tsx src/features/auth/screens/__tests__/bootstrapSync.test.tsx
```

Expected: FAIL because the hook still rereads `scheduleStorage.getCourses()` and does not pass reason/force intent.

- [ ] **Step 3: Route the hook through `runScheduleSync` (2-5 minutes)**

Use this complete callback shape while retaining the existing same-hook ref guard and `Promise<void>` behavior:

```ts
const logger = createLogger('schedule-sync');

export type ScheduleSyncOptions = {
  priority?: number;
  silent?: boolean;
  reason?: SyncPolicy['reason'];
  force?: boolean;
};

const sync = useCallback(async (options: ScheduleSyncOptions = {}): Promise<void> => {
  if (syncInProgressRef.current) return;
  const silent = options.silent ?? false;
  const reason = options.reason ?? (silent ? 'warmup' : 'user');
  const policy: SyncPolicy = {
    priority: options.priority ?? (reason === 'warmup' ? 8 : 5),
    reason,
    force: options.force ?? reason === 'user',
  };

  try {
    syncInProgressRef.current = true;
    if (!silent) {
      setError(null);
      setSyncStatus('syncing');
    }

    const engine = PccuSyncEngine.getInstance();
    await engine.waitForExecutorReady();
    const result = await runScheduleSync({
      requestSync: engine.requestSync.bind(engine),
      persist: scheduleStorage.setCourses,
      refreshReminders: refreshScheduledCourseReminders,
      reportReminderError: () => logger.warn('reminder_refresh_failed'),
    }, policy);

    if (result.success) {
      setCourses(result.data.courses);
      setLastSyncedAt(result.data.updatedAt);
      setError(null);
      setSyncStatus('idle');
    } else if (!silent) {
      setError(result.message);
    }
  } catch (error) {
    if (!silent) {
      setError(error instanceof Error ? error.message : '課表同步失敗');
    }
  } finally {
    syncInProgressRef.current = false;
  }
}, [setCourses, setError, setLastSyncedAt, setSyncStatus]);
```

Import `SyncPolicy`, `runScheduleSync`, `refreshScheduledCourseReminders`, and the existing redacting logger from their established modules. Remove the hook's `scheduleStorage.getCourses()` call; hydration remains owned by `useScheduleStore.hydrate()` during bootstrap.

- [ ] **Step 4: Update bootstrap mocks to return the typed Schedule payload (2-5 minutes)**

Use:

```ts
mockRequestSync.mockResolvedValue({
  success: true,
  data: { courses: bootstrapCourses, updatedAt: 456 },
  updatedAt: 456,
});
```

Assert `scheduleStorage.setCourses` resolves before the Schedule store receives `bootstrapCourses`; a rejected write keeps the hydrated stale courses and ends in the existing error presentation for non-silent bootstrap.

- [ ] **Step 5: Export the stable application surface (2-5 minutes)**

Append to `src/features/schedule/index.ts`:

```ts
export {
  runScheduleSync,
  type RunScheduleSyncDeps,
  type ScheduleHookSyncResult,
} from './application/runScheduleSync';
```

- [ ] **Step 6: Run hook, bootstrap, application, and type tests GREEN (2-5 minutes)**

Run:

```powershell
npm.cmd test -- --runInBand src/features/schedule/hooks src/features/schedule/application src/features/auth/screens/__tests__/bootstrapSync.test.tsx
npm.cmd run typecheck
```

Expected: tests pass; the store publishes only after storage resolves; no successful hook path rereads AsyncStorage; `silent` remains presentation intent and never enters `SyncContractMap['schedule']['input']`.

- [ ] **Step 7: Commit the hook cutover (2-5 minutes)**

```powershell
git add src/features/schedule/hooks src/features/schedule/index.ts src/features/auth/screens/__tests__/bootstrapSync.test.tsx
git commit -m "refactor: publish committed schedule payload"
```

### Task 10: Accept the registered Schedule path in Expo Go before legacy deletion

**Files:**

- Verify only; do not remove a legacy Schedule line until this checkpoint passes.

- [ ] **Step 1: Run the registered-path automated checkpoint (2-5 minutes)**

Run:

```powershell
npm.cmd test -- --runInBand src/features/schedule src/core/sync/webview src/core/sync/__tests__/WorkflowRegistry.test.ts src/features/pccu/engine/__tests__/GlobalScraperWebView.test.tsx
npm.cmd run typecheck
```

Expected: all tests pass; registry inventory is Traffic/Grade/Schedule true and all Tutoring kinds false; the registered Schedule workflow reaches typed completion while the old controller remains unreachable fallback code.

- [ ] **Step 2: Export the pre-deletion cutover bundle (2-5 minutes)**

Run:

```powershell
npx.cmd expo export --platform ios --output-dir dist/phase-2b-schedule-checkpoint
```

Expected: Expo exits 0 with no unresolved Schedule domain/parser/protocol/script/workflow import, and the ignored export directory is not staged.

- [ ] **Step 3: Start Expo Go and verify one live registered Schedule refresh (2-5 minutes)**

Run:

```powershell
npm.cmd start -- --clear
```

Open `/(tabs)/schedule`, trigger one refresh, and inspect the sanitized debug phase stream.

Expected: the request uses a Schedule workflow identity, reaches `ensure-session` → 1208 service injection → validated handoff → extraction → typed completion, writes the cache before store publication, and does not enter a legacy `pccu` Schedule phase.

- [ ] **Step 4: Exercise cancellation and stale-data behavior on device (2-5 minutes)**

Background one refresh and retry after foreground; then disable network for one refresh and restore it for the next.

Expected: cancelled generation messages are ignored, the previous committed courses stay visible during failure, and the online retry commits once without duplicate reminders.

- [ ] **Step 5: Smoke the workflows that still share the host (2-5 minutes)**

Refresh Traffic, Grade, Tutoring overview, and one Tutoring detail.

Expected: Traffic/Grade still use registered sessions, Tutoring still uses its legacy fallback, and the host mounts one physical WebView. Any failure blocks Task 11 and is repaired at the owning workflow/host boundary before deletion.

### Task 11: Delete the legacy Schedule controller and old extraction builders

**Files:**

- Modify: `src/features/pccu/engine/GlobalScraperWebView.tsx`
- Modify: `src/features/pccu/engine/__tests__/GlobalScraperWebView.test.tsx`
- Modify: `src/features/pccu/sync/pccuSyncScripts.ts`
- Modify: `src/features/pccu/sync/__tests__/pccuSyncScripts.test.ts`
- Modify: `src/features/schedule/infrastructure/sync/__tests__/scheduleWorkflow.test.ts`

- [ ] **Step 1: Move the remaining legacy Schedule handoff assertions to the workflow suite (2-5 minutes)**

Preserve these characterized behaviors with real workflow-session events:

```ts
it.each([
  'https://ecampus.pccu.edu.tw/eCampus/TransUrl.aspx?PrjNo=1208&Area=service',
  'https://ap1.pccu.edu.tw/queryCourse/queryByStudent.asp?QuerySource=queryCourse',
])('follows the observed 1208 handoff %s exactly', (url) => {
  const opening = reduceScheduleWorkflow(
    reduceScheduleWorkflow(initial, started(1_000), deps).state,
    sessionReady(1_100),
    deps,
  ).state;
  expect(reduceScheduleWorkflow(opening, popup(url, 1_200), deps).effects).toEqual([
    effect(identity, { type: 'navigate', url }),
  ]);
});

it('resets extraction through an identity-bound retry timer', () => {
  const first = reduceScheduleWorkflow(extracting, html('', 2_000), deps);
  const token = first.state.pendingTimerToken;
  expect(token).toBe('retry-schedule-1');
  if (!token) throw new Error('Expected a retry token.');
  expect(reduceScheduleWorkflow(first.state, timer(token, 2_500), deps).effects).toEqual([
    effect(identity, { type: 'inject-java-script', script: 'extract-schedule;' }),
  ]);
});
```

These replace the old controller tests for TransUrl preservation, direct AP1 popup, converged navigation/load-end injection, query-state reset, and relogin.

- [ ] **Step 2: Write a failing legacy-removal source test (2-5 minutes)**

Add to the shared-scraper suite:

```ts
it('contains no Schedule implementation after registry cutover', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../GlobalScraperWebView.tsx'), 'utf8');
  expect(source).not.toMatch(/PccuPhase|pccuPhaseRef|normalizeScheduleUrl|isScheduleQueryUrl/);
  expect(source).not.toMatch(/buildAdaptiveSchedulePageScript|parseScheduleFromHtml|persistCourses|retryPccu|restartPccuLogin/);
  expect(source).not.toMatch(/saveCourses|refreshScheduledCourseReminders|hasSuspiciousCourseNames/);
  expect(source).not.toContain("type === 'schedule'");
});
```

Also assert the registry inventory still reports all four Tutoring kinds as false.

- [ ] **Step 3: Run workflow and source tests and verify RED (2-5 minutes)**

Run:

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/schedule/infrastructure/sync/__tests__/scheduleWorkflow.test.ts src/features/pccu/engine/__tests__/GlobalScraperWebView.test.tsx
```

Expected: workflow assertions pass; the source assertion fails because the controller still owns Schedule.

- [ ] **Step 4: Remove the Schedule-only controller responsibilities in one mechanical pass (2-5 minutes)**

Delete from `GlobalScraperWebView.tsx`:

- Schedule parser/domain/storage/reminder/script imports.
- `PccuPhase`, the `'pccu'` `ActiveMode` member, `pccuPhaseRef`, and Schedule fields that are no longer used in `PendingRequest`.
- `normalizeScheduleUrl`, `isScheduleQueryUrl`, and `isTransUrlForType`.
- `injectPccuScript`, `openPccuTarget`, `persistCourses`, `retryPccu`, and `restartPccuLogin` after confirming Phase 2A already removed their Grade callers.
- Every `mode === 'pccu'` navigation, message, load-end, catch, and load-error branch.
- Schedule-specific debug phase/type selection.

Keep the generic registered-workflow session branch and `WebViewSessionHost`. Keep the PCCU credential/session driver, login helpers, completion helper, and all `pccu-tutoring` state until Phase 2C. A request for `schedule` must now be caught by `workflowRegistry.get(request.type)` before the legacy Tutoring fallback.

- [ ] **Step 5: Delete only the old Schedule extraction builders (2-5 minutes)**

Remove `buildSchedulePageScript`, `buildRobustSchedulePageScript`, and `buildAdaptiveSchedulePageScript` from `pccuSyncScripts.ts`. Remove their describe blocks/imports from `pccuSyncScripts.test.ts`.

Retain and keep testing the identity-aware shared call:

```ts
buildServiceOpenScript('1208', identity)
```

It is the Schedule workflow's service-entry dependency. Retain `buildLoginScript`, the 1208/1220/1202 service target logic, and the 1202 Tutoring fallback.

- [ ] **Step 6: Prove no legacy Schedule controller/script reference remains (2-5 minutes)**

Run:

```powershell
rg -n "buildAdaptiveSchedulePageScript|buildRobustSchedulePageScript|buildSchedulePageScript|parseScheduleFromHtml|persistCourses|type === 'schedule'" src/features/pccu
```

Expected: no output. A `buildServiceOpenScript('1208', identity)` import in composition is outside `src/features/pccu/engine` and remains intentional.

- [ ] **Step 7: Run Schedule, host, PCCU, and Tutoring regression tests GREEN (2-5 minutes)**

Run:

```powershell
npm.cmd test -- --runInBand src/features/schedule src/core/sync/webview src/features/pccu/engine src/features/pccu/sync src/features/tutoring
npm.cmd run typecheck
```

Expected: Schedule resolves exactly once through the registry; the old controller contains no Schedule branch; all four Tutoring operations remain callable through the unchanged legacy fallback.

- [ ] **Step 8: Commit the Schedule strangler cutover (2-5 minutes)**

```powershell
git add src/features/pccu/engine src/features/pccu/sync src/features/schedule/infrastructure/sync/__tests__/scheduleWorkflow.test.ts
git commit -m "refactor: extract schedule from global scraper"
```

### Task 12: Enforce Schedule workflow ownership and Phase 2C fallback boundaries

**Files:**

- Modify: `src/__tests__/scheduleOwnership.test.ts`
- Modify: `src/__tests__/workflowBoundaries.test.ts`
- Modify: `src/features/schedule/index.ts`
- Modify: `src/composition/sync.ts`

- [ ] **Step 1: Add failing source-boundary assertions (2-5 minutes)**

Extend `scheduleOwnership.test.ts`:

```ts
it.each([
  'src/features/schedule/infrastructure/parser/scheduleParser.ts',
  'src/features/schedule/infrastructure/sync/scheduleProtocol.ts',
  'src/features/schedule/infrastructure/sync/scheduleScripts.ts',
  'src/features/schedule/infrastructure/sync/scheduleWorkflow.ts',
])('%s has no persistence, store, React hook, notification, or WebView dependency', (file) => {
  const source = read(file);
  expect(source).not.toMatch(/AsyncStorage|storage\/|store\/|zustand|use[A-Z]|expo-notifications|react-native-webview/);
});

it('keeps the Schedule reducer deterministic', () => {
  const source = read('src/features/schedule/infrastructure/sync/scheduleWorkflow.ts');
  expect(source).not.toMatch(/Date\.now\s*\(|setTimeout\s*\(|JSON\.parse\s*\(/);
});

it('keeps the core host feature-agnostic', () => {
  const source = read('src/core/sync/webview/WebViewSessionHost.tsx');
  expect(source).not.toMatch(/src\/features|\.\.\/\.\.\/features/);
  expect(source).not.toMatch(/AsyncStorage|expo-secure-store|zustand/);
});

it('removes Schedule parsing and orchestration from PCCU transport', () => {
  expect(fs.existsSync(path.resolve(process.cwd(), 'src/features/pccu/parsers/pccuScraper.ts'))).toBe(false);
  const scraper = read('src/features/pccu/engine/GlobalScraperWebView.tsx');
  expect(scraper).not.toMatch(/schedule|1208|queryByStudent|CourseData|parseScheduleFromHtml/i);
});
```

The last assertion is intentionally scoped to the legacy controller. The shared identity-aware service builder and composition registration may still contain 1208/queryByStudent because the registered Schedule workflow consumes them.

- [ ] **Step 2: Update the concrete workflow inventory assertion (2-5 minutes)**

```ts
it('registers the three extracted workflows and leaves Phase 2C kinds legacy', () => {
  expect(syncComposition.registry.resolve('traffic')).not.toBe(syncComposition.legacyAdapters.get('traffic'));
  expect(syncComposition.registry.resolve('grade')).not.toBe(syncComposition.legacyAdapters.get('grade'));
  expect(syncComposition.registry.resolve('schedule')).not.toBe(syncComposition.legacyAdapters.get('schedule'));
  for (const kind of ['tutoring', 'tutoring-detail', 'tutoring-download', 'tutoring-upload'] as const) {
    expect(syncComposition.registry.resolve(kind)).toBe(syncComposition.legacyAdapters.get(kind));
  }
});
```

- [ ] **Step 3: Run the ownership tests and verify RED on any remaining leak (2-5 minutes)**

Run:

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/__tests__/scheduleOwnership.test.ts src/__tests__/workflowBoundaries.test.ts
```

Expected before cleanup: at least the registry inventory or a remaining legacy Schedule import fails. Do not weaken the assertion; move the dependency to the domain, application adapter, composition root, or generic host boundary named above.

- [ ] **Step 4: Repair the exact boundary failures and finalize the public API (2-5 minutes)**

The final `src/features/schedule/index.ts` is:

```ts
export type { CourseData, ScheduleSyncPayload } from './domain/types';
export {
  hasSuspiciousCourseNames,
  sanitizeCourseData,
  sanitizeCourseList,
  selectScheduleCourses,
} from './domain/schedule';
export {
  runScheduleSync,
  type RunScheduleSyncDeps,
  type ScheduleHookSyncResult,
} from './application/runScheduleSync';
export { useScheduleStore } from './store/useScheduleStore';
```

Do not export the Cheerio parser, protocol decoder, script builder, or workflow from the feature root.

- [ ] **Step 5: Run boundary lint, ownership, and strict type tests GREEN (2-5 minutes)**

Run:

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/__tests__/scheduleOwnership.test.ts src/__tests__/workflowBoundaries.test.ts
npm.cmd run lint:boundaries
npm.cmd run typecheck
```

Expected: all commands exit 0; the sync core has no Schedule import except the type-only contract-map edge already permitted by the Phase 1 boundary rule; Tutoring fallback remains intact.

- [ ] **Step 6: Commit the Phase 2B boundary gate (2-5 minutes)**

```powershell
git add src/__tests__/scheduleOwnership.test.ts src/__tests__/workflowBoundaries.test.ts src/features/schedule/index.ts src/composition/sync.ts
git commit -m "test: enforce schedule workflow boundaries"
```

### Task 13: Run focused coverage, full verification, and Expo export smoke

**Files:**

- Verify only; generated `dist/phase-2b-schedule-export` must remain ignored and unstaged.

- [ ] **Step 1: Run the complete focused Phase 2B test set (2-5 minutes)**

Run:

```powershell
npm.cmd test -- --runInBand src/features/schedule src/core/sync/webview src/core/sync/__tests__/WorkflowRegistry.test.ts src/features/pccu/engine src/features/pccu/sync src/features/auth/screens/__tests__/bootstrapSync.test.tsx src/features/notifications src/__tests__/scheduleOwnership.test.ts src/__tests__/workflowBoundaries.test.ts
```

Expected: all suites pass, every terminal workflow test settles once, fake timer count returns to zero, and the four Tutoring kinds still pass through the legacy path.

- [ ] **Step 2: Measure the new critical modules with focused coverage (2-5 minutes)**

Run:

```powershell
npm.cmd test -- --runInBand --coverage --collectCoverageFrom="src/features/schedule/domain/**/*.ts" --collectCoverageFrom="src/features/schedule/infrastructure/**/*.ts" --collectCoverageFrom="src/features/schedule/application/**/*.ts" src/features/schedule src/__tests__/scheduleOwnership.test.ts
```

Expected: Schedule domain/parser/script/workflow/application modules reach at least 80% line coverage; `scheduleProtocol.ts` and `scheduleWorkflow.ts` reach at least 90% branch coverage. Add concrete malformed-event or transition cases for uncovered branches instead of excluding files.

- [ ] **Step 3: Run the repository quality gates (2-5 minutes)**

Run:

```powershell
npm.cmd run verify
npm.cmd run lint:boundaries
npm.cmd run format:check
npm.cmd run coverage:ci
```

Expected: strict typecheck, the complete Jest suite, lint, formatting, and the global coverage ratchet all exit 0; no suite reports an open handle or pending timer.

- [ ] **Step 4: Build the Phase 2B iOS export artifact (2-5 minutes)**

Run:

```powershell
npx.cmd expo export --platform ios --output-dir dist/phase-2b-schedule-export
```

Expected: Expo exits 0 and writes the iOS bundle/assets under `dist/phase-2b-schedule-export`; there is no unresolved PCCU parser or old Schedule script import.

- [ ] **Step 5: Confirm the export is ignored and review the focused history (2-5 minutes)**

Run:

```powershell
git status --short
git diff --stat HEAD~11..HEAD
git log -11 --oneline
```

Expected: `dist/phase-2b-schedule-export` is not listed; only Schedule domain/parser/protocol/script/workflow/application/hook/storage, composition/core contract wiring, focused PCCU deletions, fixtures, tests, and consumer import changes appear across eleven focused commits.

### Task 14: Complete the Expo Go Schedule regression and record the checkpoint

**Files:**

- Create after all checks pass: `docs/verification/myccu-refactor-phase-2b.md`

- [ ] **Step 1: Start the accepted build with a clean Metro cache (2-5 minutes)**

Run:

```powershell
npm.cmd start -- --clear
```

Expected: Metro displays an Expo Go QR code; the supported device cold-launches to Login or Home with no red error screen and no duplicate WebView mount.

- [ ] **Step 2: Verify cold hydration and a normal Schedule refresh (2-5 minutes)**

On the supported Expo Go device:

1. Open `/(tabs)/schedule` after a cold launch and confirm the last committed courses and timestamp hydrate before remote sync finishes.
2. Trigger a manual refresh and observe the 1208 handoff.
3. Confirm course names, required/elective state, teacher, location, weekday, and consecutive period range match the previously accepted Schedule screen.

Expected: one refresh runs, cached courses remain visible while it runs, and the committed result replaces courses and timestamp together.

- [ ] **Step 3: Verify both observed 1208 handoff routes (2-5 minutes)**

Perform one refresh that follows the ecampus `TransUrl.aspx?PrjNo=1208` path and, when the PCCU service returns the direct fallback, one refresh that reaches `https://ap1.pccu.edu.tw/queryCourse/queryByStudent.asp?QuerySource=queryCourse`.

Expected: each validated URL is followed exactly, the student-schedule form submits once, navigation/load-end convergence injects once per normalized URL, and no hard-coded replacement skips a valid TransUrl.

- [ ] **Step 4: Verify cancellation, foreground retry, and stale-generation defense (2-5 minutes)**

Start a bootstrap/warmup Schedule sync, background the app before extraction completes, return to foreground, and let the retained retry finish. Then start a manual refresh, background it, return, and manually retry.

Expected: bootstrap/warmup retries once with a larger generation; manual work reports `cancelled/app_background`; late messages from either aborted generation do not replace the later committed courses or timers.

- [ ] **Step 5: Verify offline stale-data and recovery behavior (2-5 minutes)**

Disable network, refresh Schedule, then re-enable network and refresh again.

Expected: the failed refresh preserves the last committed courses/timestamp and shows the existing sanitized manual error; the next online refresh recovers without app restart. A silent warmup failure does not replace visible data or interrupt the active screen.

- [ ] **Step 6: Verify reminders run after the committed snapshot (2-5 minutes)**

With notifications and course reminders enabled, refresh Schedule and inspect the scheduled reminder list through the existing Settings/Notifications screen. Repeat once with reminder permission denied.

Expected: reminder refresh uses the newly committed courses; permission denial does not roll back or hide the committed Schedule snapshot; no duplicate course-reminder entries remain after refresh.

- [ ] **Step 7: Run cross-feature and session regressions (2-5 minutes)**

Refresh Traffic and Grade, then Tutoring overview, one Tutoring detail, and each Expo Go-supported Tutoring file action. Log out during an active Schedule sync and sign in again.

Expected: Traffic/Grade remain registered, all Tutoring operations retain their Phase 2C legacy fallback, logout settles Schedule as typed cancellation, the WebView session resets, and the next login cannot display the previous account's Schedule cache.

- [ ] **Step 8: Inspect sanitized runtime events (2-5 minutes)**

Enable the developer debug stream for one Schedule refresh.

Expected: events contain request ID, `schedule`, generation, phase, attempt, duration, outcome, and stable error code only. They contain no account, password, raw HTML, full URL query string, course content, decoded message payload, or notification content.

- [ ] **Step 9: Record the actual checkpoint evidence (2-5 minutes)**

Run:

```powershell
git rev-parse HEAD
```

Create `docs/verification/myccu-refactor-phase-2b.md` with these exact sections, filled with observed values rather than sample text:

```markdown
# MyCCU Refactor Phase 2B Verification

## Environment

- Commit SHA
- Device model and OS version
- Expo Go version
- Verification date and timezone

## Automated gates

- Focused Schedule suites and coverage
- Full verify, boundaries, format, and coverage ratchet
- iOS Expo export smoke

## Expo Go results

- Cold hydration and manual refresh
- 1208 TransUrl and direct AP1 handoffs
- Background/foreground and stale-generation behavior
- Offline stale-data preservation and recovery
- Reminder refresh after commit
- Traffic, Grade, and Tutoring regression
- Logout and account isolation
- Sanitized observability inspection

## Deviations

- State `None` when every check matches this plan; otherwise state the approved deviation and its tracking issue without secrets or PCCU content.
```

- [ ] **Step 10: Commit the verified checkpoint and create the local phase tag (2-5 minutes)**

```powershell
git add docs/verification/myccu-refactor-phase-2b.md
git commit -m "docs: record phase 2b expo go verification"
git tag -a myccu-refactor-phase-2b -m "MyCCU refactor phase 2b verified"
```

Expected: the verification document contains actual pass/fail evidence and no secret, raw PCCU content, or full query URL; the annotated tag points to that commit. Do not push the tag unless the user explicitly requests publication.

## Completion criteria

- `CourseData` and `ScheduleSyncPayload` are owned by `src/features/schedule/domain`, and no PCCU parser module owns Schedule types or parsing.
- `scheduleProtocol.ts` rejects malformed fields, non-HTTPS targets, deceptive host suffixes, wrong event kinds, and invalid course periods before transition.
- The identity-bound extraction script preserves the accepted 1208/query/search/card/table behavior while posting only versioned Schedule envelopes.
- The pure Schedule reducer owns redirects, injection timers, retry delays, result selection, relogin limits, terminal idempotence, and typed completion without storage, Zustand, React, WebView refs, or wall-clock reads.
- Composition registers Traffic, Grade, and Schedule; all four Tutoring workflows remain on the legacy fallback for Phase 2C.
- `runScheduleSync` exposes success only after storage commit; storage failures preserve the prior projection; reminder refresh occurs after commit and cannot roll back it.
- `useScheduleSync` publishes typed committed courses directly and performs no successful-path storage reread.
- `GlobalScraperWebView` contains no Schedule state, navigation, message, parser, retry, persistence, load-end, or error branch.
- Focused coverage, full verification, boundary lint, formatting, global coverage ratchet, iOS export, Expo Go Schedule checks, cross-feature regression, logout/account isolation, and sanitized observability all pass.
- The Phase 2B verification document is committed and `myccu-refactor-phase-2b` is tagged locally before Phase 2C begins.
