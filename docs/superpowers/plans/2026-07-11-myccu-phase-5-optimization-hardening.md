# MyCCU Phase 5 Optimization and Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the refactor by measuring local performance, removing verified dead weight, cleaning repository artifacts, completing operational documentation, and passing Expo Go, live PCCU, EAS preview, and architecture gates.

**Architecture:** Add a small in-memory performance recorder at stable application boundaries and compare same-device medians rather than remote network timing. Remove only dependencies and files whose absence is proven by code search plus Expo/export verification; keep Expo/Router peer dependencies documented. Finish with a clean, reproducible release pipeline and no legacy architecture escape hatches.

**Tech Stack:** TypeScript, React Native Performance API, Jest, Node.js scripts, npm, Expo CLI, Expo Go, EAS CLI, Playwright, Git.

---

## Preconditions and file map

Do not start this plan until Phase 4 is complete and these commands pass:

```powershell
npm.cmd run verify
npm.cmd run coverage:ci
npm.cmd run export:smoke
npm.cmd run lint:boundaries
```

Expected: all commands exit 0; the application no longer uses the legacy untyped engine or direct screen/storage coupling.

Files introduced or finalized by this plan:

- Create: `src/shared/observability/performanceMetrics.ts` — bounded in-memory samples and median summaries.
- Create: `src/shared/observability/__tests__/performanceMetrics.test.ts` — deterministic recorder behavior.
- Create: `scripts/performance/summarize-baseline.cjs` — summarize sanitized device metric JSON.
- Create: `scripts/performance/__tests__/summarize-baseline.test.ts` — Node-side summary contract.
- Create: `docs/development.md` — environment, Expo Go, tests, and live verifier.
- Create: `docs/release.md` — preview/production release checklist and rollback.
- Create: `docs/verification/performance-baseline.md` — approved five-run measurement record.
- Modify: `src/composition/AppCompositionRoot.tsx` — record cold composition/bootstrap readiness.
- Modify: `src/features/home/application/useHomeViewModel.ts` — record Home readiness without direct storage reads.
- Create: `src/test/createTickClock.ts` — deterministic monotonic clock helper.
- Modify: `src/features/grade/infrastructure/repository/AsyncStorageGradeRepository.ts` — record local read/commit duration.
- Modify: `src/features/schedule/infrastructure/repository/AsyncStorageScheduleRepository.ts` — record local read/commit duration.
- Modify: `src/features/traffic/infrastructure/repository/AsyncStorageTrafficRepository.ts` — record local read/commit duration.
- Modify: `src/features/tutoring/infrastructure/repository/AsyncStorageTutoringRepository.ts` — record local read/replace duration.
- Modify: `src/features/grade/infrastructure/sync/gradeWorkflow.ts` — record pure decode duration.
- Modify: `src/features/schedule/infrastructure/sync/scheduleWorkflow.ts` — record pure decode duration.
- Modify: `src/features/traffic/infrastructure/sync/trafficWorkflow.ts` — record pure decode duration.
- Modify: `src/features/tutoring/infrastructure/sync/tutoringOverviewWorkflow.ts` — record pure decode duration.
- Modify: `src/features/tutoring/infrastructure/sync/tutoringDetailWorkflow.ts` — record pure decode duration.
- Modify: `src/features/tutoring/infrastructure/sync/tutoringDownloadWorkflow.ts` — record pure decode duration.
- Modify: `src/features/tutoring/infrastructure/sync/tutoringUploadWorkflow.ts` — record pure decode duration.
- Modify: `src/features/settings/screens/DeveloperScreen.tsx` — render sanitized in-memory metric summary in development.
- Modify: `scripts/inspect-schedule-1208.cjs` — write captures below ignored `artifacts/pccu-debug/`.
- Modify: `src/__tests__/legacyCleanup.test.ts` — permanent repository and dependency guards.
- Modify: `.gitignore`, `package.json`, `package-lock.json`, `README.md`.
- Delete: `expo-ios26-app-demo-master/`, `scripts/schedule-1208-debug/`, `fix.js`, `replace_icons.js`, and `test js/`.

### Task 1: Add a bounded performance recorder

**Files:**
- Create: `src/shared/observability/performanceMetrics.ts`
- Create: `src/shared/observability/__tests__/performanceMetrics.test.ts`

- [ ] **Step 1: Write the failing recorder tests**

Create `src/shared/observability/__tests__/performanceMetrics.test.ts`:

```ts
import { createPerformanceRecorder } from '../performanceMetrics';

describe('performance metrics', () => {
  it('measures a synchronous operation with an injected monotonic clock', () => {
    const ticks = [10, 26];
    const recorder = createPerformanceRecorder({
      now: () => ticks.shift() ?? 26,
      maxSamplesPerMetric: 5,
    });

    expect(recorder.measure('parser.schedule', () => 'parsed')).toBe('parsed');
    expect(recorder.getSummary()).toEqual([
      { name: 'parser.schedule', count: 1, medianMs: 16, minMs: 16, maxMs: 16 },
    ]);
  });

  it('measures an asynchronous operation and preserves its return value', async () => {
    const ticks = [100, 145];
    const recorder = createPerformanceRecorder({
      now: () => ticks.shift() ?? 145,
      maxSamplesPerMetric: 5,
    });

    await expect(recorder.measureAsync('repository.grade.hydrate', async () => 7)).resolves.toBe(7);
    expect(recorder.getSummary()[0]?.medianMs).toBe(45);
  });

  it('keeps only the newest bounded samples and returns a numeric median', () => {
    const recorder = createPerformanceRecorder({ now: () => 0, maxSamplesPerMetric: 3 });
    recorder.record('app.home.ready', 50);
    recorder.record('app.home.ready', 10);
    recorder.record('app.home.ready', 30);
    recorder.record('app.home.ready', 20);

    expect(recorder.getSamples('app.home.ready')).toEqual([10, 30, 20]);
    expect(recorder.getSummary()[0]?.medianMs).toBe(20);
  });

  it('exports only metric names and numbers', () => {
    const recorder = createPerformanceRecorder({ now: () => 0, maxSamplesPerMetric: 5 });
    recorder.record('sync.schedule.local-parse', 12.25);

    expect(JSON.parse(recorder.exportJson())).toEqual({
      version: 1,
      metrics: { 'sync.schedule.local-parse': [12.25] },
    });
  });
});
```

- [ ] **Step 2: Run the focused test and verify the missing-module failure**

Run:

```powershell
npm.cmd test -- --runInBand src/shared/observability/__tests__/performanceMetrics.test.ts
```

Expected: FAIL because `../performanceMetrics` does not exist.

- [ ] **Step 3: Implement the recorder**

Create `src/shared/observability/performanceMetrics.ts`:

```ts
export type PerformanceMetricName =
  | 'app.composition.ready'
  | 'app.bootstrap.hydrate'
  | 'app.home.ready'
  | `parser.${string}`
  | `repository.${string}.hydrate`
  | `repository.${string}.commit`;

export type PerformanceSummary = {
  name: PerformanceMetricName;
  count: number;
  medianMs: number;
  minMs: number;
  maxMs: number;
};

type RecorderOptions = {
  now?: () => number;
  maxSamplesPerMetric?: number;
};

const median = (values: number[]) => {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
};

export function createPerformanceRecorder(options: RecorderOptions = {}) {
  const now = options.now ?? (() => performance.now());
  const maxSamples = options.maxSamplesPerMetric ?? 20;
  const samples = new Map<PerformanceMetricName, number[]>();

  const record = (name: PerformanceMetricName, durationMs: number) => {
    if (!Number.isFinite(durationMs) || durationMs < 0) return;
    const current = samples.get(name) ?? [];
    samples.set(name, [...current, durationMs].slice(-maxSamples));
  };

  const measure = <T>(name: PerformanceMetricName, operation: () => T): T => {
    const startedAt = now();
    try {
      return operation();
    } finally {
      record(name, now() - startedAt);
    }
  };

  const measureAsync = async <T>(
    name: PerformanceMetricName,
    operation: () => Promise<T>,
  ): Promise<T> => {
    const startedAt = now();
    try {
      return await operation();
    } finally {
      record(name, now() - startedAt);
    }
  };

  const getSamples = (name: PerformanceMetricName) => [...(samples.get(name) ?? [])];

  const getSummary = (): PerformanceSummary[] =>
    [...samples.entries()]
      .filter(([, values]) => values.length > 0)
      .map(([name, values]) => ({
        name,
        count: values.length,
        medianMs: median(values),
        minMs: Math.min(...values),
        maxMs: Math.max(...values),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

  const exportJson = () =>
    JSON.stringify({ version: 1, metrics: Object.fromEntries(samples.entries()) }, null, 2);

  return { record, measure, measureAsync, getSamples, getSummary, exportJson };
}

export const performanceMetrics = createPerformanceRecorder();
```

- [ ] **Step 4: Run the focused tests**

Run the Step 2 command.

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit the recorder**

```powershell
git add src/shared/observability/performanceMetrics.ts src/shared/observability/__tests__/performanceMetrics.test.ts
git commit -m "feat: add bounded performance metrics"
```

### Task 2: Instrument stable local boundaries

**Files:**
- Create: `src/test/createTickClock.ts`
- Modify: `src/composition/AppCompositionRoot.tsx`
- Modify: `src/features/home/application/useHomeViewModel.ts`
- Modify: `src/features/grade/infrastructure/repository/AsyncStorageGradeRepository.ts`
- Modify: `src/features/schedule/infrastructure/repository/AsyncStorageScheduleRepository.ts`
- Modify: `src/features/traffic/infrastructure/repository/AsyncStorageTrafficRepository.ts`
- Modify: `src/features/tutoring/infrastructure/repository/AsyncStorageTutoringRepository.ts`
- Modify: `src/features/grade/infrastructure/sync/gradeWorkflow.ts`
- Modify: `src/features/schedule/infrastructure/sync/scheduleWorkflow.ts`
- Modify: `src/features/traffic/infrastructure/sync/trafficWorkflow.ts`
- Modify: `src/features/tutoring/infrastructure/sync/tutoringOverviewWorkflow.ts`
- Modify: `src/features/tutoring/infrastructure/sync/tutoringDetailWorkflow.ts`
- Modify: `src/features/tutoring/infrastructure/sync/tutoringDownloadWorkflow.ts`
- Modify: `src/features/tutoring/infrastructure/sync/tutoringUploadWorkflow.ts`
- Test: the matching `__tests__` file beside each implementation

- [ ] **Step 1: Add assertions that one operation emits one local metric**

In each Phase 3 `AsyncStorage*Repository.test.ts`, inject a recorder and assert exactly one feature-specific hydrate/commit sample. In `useHomeViewModel.test.tsx`, inject a recorder and assert `app.home.ready` after all public selectors are ready. Use the literal names `repository.grade.hydrate`, `repository.schedule.hydrate`, `repository.traffic.hydrate`, and `repository.tutoring.hydrate` for repository reads:

```ts
const recorder = createPerformanceRecorder({ now: createTickClock([0, 12]) });
const repository = new AsyncStorageScheduleRepository({ storage, recorder });

await repository.read(accountScope);

expect(recorder.getSamples('repository.schedule.hydrate')).toEqual([12]);
```

Create `src/test/createTickClock.ts`:

```ts
export const createTickClock = (ticks: number[]) => () => ticks.shift() ?? ticks.at(-1) ?? 0;
```

- [ ] **Step 2: Run the exact focused tests**

```powershell
npm.cmd test -- --runInBand src/features/grade/infrastructure/repository/__tests__/AsyncStorageGradeRepository.test.ts src/features/schedule/infrastructure/repository/__tests__/AsyncStorageScheduleRepository.test.ts src/features/traffic/infrastructure/repository/__tests__/AsyncStorageTrafficRepository.test.ts src/features/tutoring/infrastructure/repository/__tests__/AsyncStorageTutoringRepository.test.ts src/features/home/application/__tests__/useHomeViewModel.test.tsx
```

Expected: FAIL because constructors/use cases do not yet accept a recorder.

- [ ] **Step 3: Inject the recorder and wrap only local work**

Use dependency injection with `performanceMetrics` as the production default. Wrap repository AsyncStorage reads/writes and pure parser execution. Do not time the remote WebView wait as a performance gate. Example repository shape:

```ts
type ScheduleRepositoryDependencies = {
  storage: KeyValueStorage;
  recorder?: Pick<typeof performanceMetrics, 'measureAsync'>;
};

export class AsyncStorageScheduleRepository implements ScheduleRepository {
  constructor(private readonly deps: ScheduleRepositoryDependencies) {}

  read(accountScope: AccountScope) {
    const recorder = this.deps.recorder ?? performanceMetrics;
    return recorder.measureAsync('repository.schedule.hydrate', () =>
      this.generations(accountScope).read(),
    );
  }

  commit(accountScope: AccountScope, payload: ScheduleSyncPayload, source: SnapshotSource = 'remote') {
    const recorder = this.deps.recorder ?? performanceMetrics;
    return recorder.measureAsync('repository.schedule.commit', () =>
      this.commitNormalized(accountScope, payload, source),
    );
  }
}
```

Extract the existing commit body into the private `commitNormalized` method shown above; do not recursively call the public measured method. Apply the same constructor pattern to Grade and Traffic. Tutoring measures `read` as `hydrate` and `replace` as `commit`. Wrap only pure `decodeEvent`/parser calls in each workflow; never include WebView navigation, remote wait, file picker, or sharing time.

- [ ] **Step 4: Run focused tests and then the full suite**

```powershell
npm.cmd run verify
```

Expected: typecheck passes and all suites pass; no test relies on wall-clock sleep.

- [ ] **Step 5: Commit instrumentation**

```powershell
git add src/test/createTickClock.ts src/composition/AppCompositionRoot.tsx src/features/home/application/useHomeViewModel.ts src/features/grade/infrastructure src/features/schedule/infrastructure src/features/traffic/infrastructure src/features/tutoring/infrastructure
git commit -m "perf: measure stable local boundaries"
```

### Task 3: Add sanitized baseline summarization

**Files:**
- Create: `scripts/performance/summarize-baseline.cjs`
- Create: `scripts/performance/__tests__/summarize-baseline.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write a failing Node summary test**

Create `scripts/performance/__tests__/summarize-baseline.test.ts`:

```js
const { summarizeMetrics } = require('../summarize-baseline.cjs');

describe('performance baseline summary', () => {
  it('computes count and median for each metric', () => {
    expect(summarizeMetrics({
      version: 1,
      metrics: {
        'app.home.ready': [30, 10, 20, 40, 50],
      },
    })).toEqual([
      { name: 'app.home.ready', count: 5, medianMs: 30, minMs: 10, maxMs: 50 },
    ]);
  });

  it('rejects keys that could contain user data', () => {
    expect(() => summarizeMetrics({ version: 1, metrics: { account: [1] } }))
      .toThrow('Unsupported performance metric: account');
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

```powershell
npm.cmd test -- --runInBand scripts/performance/__tests__/summarize-baseline.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the CLI and exported function**

Create `scripts/performance/summarize-baseline.cjs` with an allowlist of `app.`, `parser.`, and `repository.` prefixes, numeric validation, median calculation, and CLI JSON output. The CLI accepts exactly one input path and exits nonzero for malformed or disallowed content:

```js
const fs = require('fs');

const ALLOWED_PREFIXES = ['app.', 'parser.', 'repository.'];

function summarizeMetrics(input) {
  if (input?.version !== 1 || !input.metrics || typeof input.metrics !== 'object') {
    throw new Error('Unsupported performance export');
  }

  return Object.entries(input.metrics).map(([name, values]) => {
    if (!ALLOWED_PREFIXES.some((prefix) => name.startsWith(prefix))) {
      throw new Error(`Unsupported performance metric: ${name}`);
    }
    if (!Array.isArray(values) || values.some((value) => !Number.isFinite(value) || value < 0)) {
      throw new Error(`Invalid samples for metric: ${name}`);
    }
    const ordered = [...values].sort((a, b) => a - b);
    const middle = Math.floor(ordered.length / 2);
    const medianMs = ordered.length % 2
      ? ordered[middle]
      : (ordered[middle - 1] + ordered[middle]) / 2;
    return {
      name,
      count: ordered.length,
      medianMs,
      minMs: ordered[0],
      maxMs: ordered.at(-1),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

if (require.main === module) {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error('Usage: node summarize-baseline.cjs artifacts/performance/run.json');
  const summary = summarizeMetrics(JSON.parse(fs.readFileSync(inputPath, 'utf8')));
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

module.exports = { summarizeMetrics };
```

- [ ] **Step 4: Add the package script and run tests**

Add:

```json
"perf:summarize": "node scripts/performance/summarize-baseline.cjs"
```

Run the Step 2 command, then `npm.cmd run verify`.

Expected: focused tests and full verification pass.

- [ ] **Step 5: Commit the baseline tool**

```powershell
git add scripts/performance package.json package-lock.json
git commit -m "chore: add sanitized performance baseline tool"
```

### Task 4: Capture and approve five-run local baselines

**Files:**
- Create: `docs/verification/performance-baseline.md`
- Modify: `src/features/settings/screens/DeveloperScreen.tsx`
- Test: `src/features/settings/screens/__tests__/DeveloperScreen.test.tsx`

- [ ] **Step 1: Add a failing developer-screen metric summary test**

Render `DeveloperScreen` with an injected metric summary and assert metric names, counts, and medians appear while individual samples do not.

```tsx
render(<DeveloperScreen performanceSummary={[
  { name: 'app.home.ready', count: 5, medianMs: 120, minMs: 105, maxMs: 140 },
]} />);

expect(screen.getByText('app.home.ready')).toBeTruthy();
expect(screen.getByText('5 次 · 中位數 120 ms')).toBeTruthy();
expect(screen.queryByText('105')).toBeNull();
```

- [ ] **Step 2: Run the focused test and verify failure**

Expected: FAIL because the screen does not accept/render the summary.

- [ ] **Step 3: Render development-only summaries**

Add the imports and prop contract:

```tsx
import { performanceMetrics, type PerformanceSummary } from '../../../shared/observability/performanceMetrics';

type DeveloperScreenProps = {
  performanceSummary?: PerformanceSummary[];
};

export default function DeveloperScreen({
  performanceSummary = performanceMetrics.getSummary(),
}: DeveloperScreenProps) {
```

After the existing developer tools group, render only sanitized aggregates:

```tsx
{__DEV__ && developerDebugEnabled && performanceSummary.length > 0 ? (
  <>
    <Text style={[styles.sectionTitle, { color: theme.textSub }]}>效能摘要</Text>
    <View style={[styles.insetGroup, { backgroundColor: theme.card }]}>
      {performanceSummary.map((metric, index) => (
        <View key={metric.name}>
          {index > 0 ? <View style={[styles.separator, { backgroundColor: theme.border }]} /> : null}
          <View style={styles.metricRow}>
            <Text style={[styles.cellTitle, { color: theme.text }]}>{metric.name}</Text>
            <Text style={[styles.cellSubtitle, { color: theme.textSub }]}>
              {`${metric.count} 次 · 中位數 ${Math.round(metric.medianMs)} ms`}
            </Text>
          </View>
        </View>
      ))}
    </View>
  </>
) : null}
```

Add the focused style:

```ts
metricRow: {
  paddingVertical: 12,
  paddingHorizontal: 16,
},
```

Do not add an automatic filesystem export; the user copies the sanitized `exportJson()` output from the existing debug workflow.

- [ ] **Step 4: Record five runs on the same Expo Go device**

For each run: force-close Expo Go, reopen the project, wait for Home readiness, open schedule/grade/tutoring once, then copy the sanitized metric JSON. Store raw sanitized captures under ignored `artifacts/performance/phase5-run-1.json` through `phase5-run-5.json`.

Run:

```powershell
npm.cmd run perf:summarize -- artifacts/performance/phase5-run-1.json
```

Expected: JSON summary containing only allowed metric names and numeric values.

- [ ] **Step 5: Write the approved baseline document**

Create `docs/verification/performance-baseline.md` with device OS/model, Expo Go version, commit SHA, the five run summaries, and one approved median per metric. This is the first instrumented pre-cleanup baseline; Phase 0 has no comparable performance samples. Record the final allowed ceiling as `baseline median × 1.15` for each metric. Do not include student/account data.

- [ ] **Step 6: Run tests and commit**

```powershell
npm.cmd run verify
git add src/features/settings/screens docs/verification/performance-baseline.md
git commit -m "docs: record verified performance baseline"
```

### Task 5: Remove four proven-unused direct dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/__tests__/legacyCleanup.test.ts`

The code search at planning time found no production or script imports for `axios`, `buffer`, `iconv-lite`, or `string_decoder`. This task removes only those four. Keep `expo-file-system` because tutoring loads its native module by name. Keep `expo-asset`, `expo-linking`, masked-view, bottom-tabs, and screens until Expo's dependency check confirms their runtime/peer role.

- [ ] **Step 1: Add failing manifest guards**

In `legacyCleanup.test.ts`, read `package.json` and assert:

```ts
for (const name of ['axios', 'buffer', 'iconv-lite', 'string_decoder']) {
  expect(packageJson.dependencies).not.toHaveProperty(name);
}
```

- [ ] **Step 2: Run the focused test and verify four failures**

```powershell
npm.cmd test -- --runInBand src/__tests__/legacyCleanup.test.ts
```

Expected: FAIL because all four dependencies are still declared.

- [ ] **Step 3: Remove only the guarded dependencies**

```powershell
npm.cmd uninstall axios buffer iconv-lite string_decoder
```

Expected: `package.json` and lockfile change; no production source file changes.

- [ ] **Step 4: Verify dependency and Expo health**

```powershell
npm.cmd ls --depth=0
npx.cmd expo install --check
npm.cmd run verify
npm.cmd run export:smoke
```

Expected: no missing dependency, Expo check reports no incompatible installed package, automated checks pass.

- [ ] **Step 5: Run the full Expo Go checklist**

Exercise login plus schedule, grade, traffic, tutoring download/upload, and logout. Expected: all pass; the native file-system module remains available.

- [ ] **Step 6: Commit dependency removal**

```powershell
git add package.json package-lock.json src/__tests__/legacyCleanup.test.ts
git commit -m "chore: remove verified unused dependencies"
```

### Task 6: Remove tracked samples, captures, and obsolete scripts

**Files:**
- Modify: `src/__tests__/legacyCleanup.test.ts`
- Delete: `expo-ios26-app-demo-master/`
- Delete: `scripts/schedule-1208-debug/`
- Delete: `fix.js`
- Delete: `replace_icons.js`
- Delete: `test js/`

- [ ] **Step 1: Add failing repository guards**

Add `const resolveRoot = (...segments: string[]) => path.join(PROJECT_ROOT, ...segments);` beside the existing `PROJECT_ROOT` declaration, then add a table-driven test:

```ts
for (const path of [
  'expo-ios26-app-demo-master',
  'scripts/schedule-1208-debug',
  'fix.js',
  'replace_icons.js',
  'test js',
]) {
  expect(fs.existsSync(resolveRoot(path))).toBe(false);
}
```

Also assert `tsc --showConfig` file names do not contain `expo-ios26-app-demo-master`.

- [ ] **Step 2: Run the focused test and verify failure**

Expected: FAIL for each tracked artifact that exists.

- [ ] **Step 3: Confirm there are no production references**

```powershell
rg -n "expo-ios26-app-demo-master|schedule-1208-debug|fix\.js|replace_icons\.js|test js" app src scripts README.md package.json
```

Expected: only `scripts/inspect-schedule-1208.cjs` references the old output directory; update it in Task 7 before deletion if the search finds additional maintained references.

- [ ] **Step 4: Delete tracked artifacts**

```powershell
git rm -r -- expo-ios26-app-demo-master scripts/schedule-1208-debug "test js"
git rm -- fix.js replace_icons.js
```

- [ ] **Step 5: Run focused and full checks**

```powershell
npm.cmd test -- --runInBand src/__tests__/legacyCleanup.test.ts
npm.cmd run verify
```

Expected: all guards and full verification pass.

- [ ] **Step 6: Commit repository cleanup**

```powershell
git add src/__tests__/legacyCleanup.test.ts
git commit -m "chore: remove obsolete samples and debug captures"
```

### Task 7: Redirect maintained debug output and harden ignore rules

**Files:**
- Modify: `scripts/inspect-schedule-1208.cjs`
- Modify: `.gitignore`
- Modify: `src/__tests__/legacyCleanup.test.ts`

- [ ] **Step 1: Write failing output-path and ignore-rule guards**

Assert the script contains `artifacts/pccu-debug/schedule-1208` and `.gitignore` contains exact lines:

```text
coverage/
artifacts/
.superpowers/
.env
.env.*
!.env.example
```

- [ ] **Step 2: Run the focused guard and verify failure**

Expected: FAIL because the script still writes below `scripts/` and ignore rules are incomplete.

- [ ] **Step 3: Change the capture path**

Replace the output declaration with:

```js
const outDir = path.join(__dirname, '..', 'artifacts', 'pccu-debug', 'schedule-1208');
```

Keep credential loading from environment variables and never write them into the summary.

- [ ] **Step 4: Add exact ignore rules**

Append the listed lines under generated/debug and local environment sections. Keep `.env.example` trackable.

- [ ] **Step 5: Verify and commit**

```powershell
npm.cmd test -- --runInBand src/__tests__/legacyCleanup.test.ts
git check-ignore -v artifacts/pccu-debug/check.json coverage/index.html .superpowers/check .env
git add scripts/inspect-schedule-1208.cjs .gitignore src/__tests__/legacyCleanup.test.ts
git commit -m "chore: isolate generated verification artifacts"
```

Expected: every generated path is ignored by the intended rule.

### Task 8: Complete developer and release documentation

**Files:**
- Modify: `README.md`
- Create: `docs/development.md`
- Create: `docs/release.md`
- Test: `src/__tests__/legacyCleanup.test.ts`

- [ ] **Step 1: Add failing documentation guards**

Assert the files exist and contain these literal anchors:

```text
README.md: Node.js, Expo Go, npm run verify
docs/development.md: npm ci, Expo Go acceptance, verify:pccu-login, Redaction rules
docs/release.md: EAS preview, EAS production, Rollback, Live PCCU verification
```

- [ ] **Step 2: Run the focused test and verify failure**

Expected: FAIL because the two docs do not exist and README lacks the complete environment contract.

- [ ] **Step 3: Write `docs/development.md`**

Create the document with this complete content, keeping `package.json` as the single source of version numbers:

````markdown
# MyCCU Development Guide

## Requirements

Use the Node.js and npm ranges declared by `engines` and `packageManager` in `package.json`.

```powershell
npm.cmd ci
```

Plain `npm ci` must succeed. Do not use `--force` or `--legacy-peer-deps` after Phase 0.

## Run in Expo Go

```powershell
npm.cmd run start
```

Open the QR code in Expo Go. Expo Go is the required development smoke environment. A feature unavailable in Expo Go must be guarded by the runtime capability adapter and verified in an EAS preview build.

## Quality gates

```powershell
npm.cmd run lint
npm.cmd run format:check
npm.cmd run typecheck
npm.cmd run coverage:ci
npm.cmd run export:smoke
npm.cmd run lint:boundaries
npm.cmd run verify
```

## Live PCCU verification

Set `PCCU_ACCOUNT` and `PCCU_PASSWORD` only in the current terminal process, then run:

```powershell
npm.cmd run verify:pccu-login
```

The verifier records only sanitized selector/request outcomes. Generated captures belong under `artifacts/`, which is ignored by Git.

## Redaction rules

Never place an account, password, raw HTML, full URL query, course content, WebView message payload, SecureStore value, or unredacted screenshot in source control, logs, fixtures, issues, or review text. Structured logs may contain request ID, sync kind, generation, phase, attempt, duration, outcome, and stable error code only.
````

- [ ] **Step 4: Write `docs/release.md`**

Create:

````markdown
# MyCCU Release Guide

## Preconditions

1. Use a clean branch and record the release commit SHA.
2. Confirm CI, coverage, boundary lint, and export smoke are green.
3. Complete the phase Expo Go checklist and live PCCU verification.
4. Confirm `app.json` version/build number and EAS project/owner values.

## Preview

```powershell
npm.cmd run build:ios:preview
```

Install the EAS preview and verify login, saved login, schedule, grade, traffic, tutoring overview/detail/download/upload, background cancellation, stale cache, biometric fallback, canonical routes, logout, and second-account isolation.

## Production

```powershell
npm.cmd run build:ios:production
npm.cmd run submit:ios:production
```

Submit only the artifact whose commit SHA and build number match the accepted preview evidence.

## Rollback

Stop submission if preview evidence fails. For an already distributed regression, restore the last accepted release branch/build, rerun the full gate, and publish through the normal preview-before-production path. Never bypass cache schema downgrade protection; a rollback that cannot read a newer schema must discard and resynchronize that feature cache.

## Credential incident

If credentials or raw student data are exposed, remove public access, revoke/rotate affected credentials, purge artifacts and logs, preserve a sanitized incident timeline, and require a fresh login after cleanup. Do not paste the exposed value into the incident record.
````

- [ ] **Step 5: Update README navigation**

Add this section after the existing verification commands:

```markdown
## Developer documentation

- [Development and Expo Go](docs/development.md)
- [Preview, production, and rollback](docs/release.md)

Use `npm ci` for a reproducible install. Expo export, EAS, dependency checks, and live PCCU verification require network access; the live verifier also requires credentials supplied only through the current terminal environment.
```

- [ ] **Step 6: Run checks and commit**

```powershell
npm.cmd test -- --runInBand src/__tests__/legacyCleanup.test.ts
npm.cmd run verify
git add README.md docs/development.md docs/release.md src/__tests__/legacyCleanup.test.ts
git commit -m "docs: add development and release runbooks"
```

### Task 9: Run final architecture and release verification

**Files:**
- Create: `docs/verification/myccu-refactor-phase-5.md`

- [ ] **Step 1: Run the complete automated gate**

```powershell
npm.cmd ci
npm.cmd run lint
npm.cmd run format:check
npm.cmd run typecheck
npm.cmd run coverage:ci
npm.cmd run export:smoke
npm.cmd run lint:boundaries
```

Expected: every command exits 0; install no longer requires legacy peer mode; coverage meets the ratchet and critical thresholds.

- [ ] **Step 2: Run architecture residue scans**

```powershell
rg -n "GlobalScraperWebView|PccuSyncEngine|Promise<any>|Record<string, unknown>|originWhitelist=\{\['\*'\]\}|user_credentials_cache_v1" src app
rg -n "AsyncStorage" app src/features/*/presentation src/features/*/application
rg -n "console\.(log|warn|error)" app src
```

Expected: no legacy engine/component, untyped protocol, wildcard origin, plaintext credential mirror, presentation/application storage access, or direct production console call remains. A credential migration test may name `user_credentials_cache_v1`.

- [ ] **Step 3: Run Expo Go acceptance**

Verify cold start, saved login, every feature sync/file flow, backgrounding mid-sync, offline stale data, canonical routes/modals, theme, biometric fallback, logout, and a second login. Expected: all pass with no previous-account data.

- [ ] **Step 4: Re-run five same-device performance samples**

Repeat the exact Task 4 Expo Go sequence five times on the same device/OS/Expo Go version, summarize each sanitized capture, and compare every final median with its recorded `baseline × 1.15` ceiling in `performance-baseline.md`. Any metric above its ceiling is blocking: diagnose the local boundary, fix it, rerun automated tests, and capture a new complete five-run set. Do not compare remote WebView/network duration.

- [ ] **Step 5: Run live PCCU verification**

```powershell
npm.cmd run verify:pccu-login
```

Expected: selectors match, login request is sent, and no regression error is reported. Do not save credentials or raw page content.

- [ ] **Step 6: Build and inspect EAS preview**

```powershell
npm.cmd run build:ios:preview
```

Expected: EAS build succeeds. Install the preview and repeat login/sync/logout smoke for native capabilities not represented in Expo Go.

- [ ] **Step 7: Record the sanitized phase evidence**

Create `docs/verification/myccu-refactor-phase-5.md` containing commit SHA, automated command summaries, coverage, performance comparison, device/Expo Go version, live verifier result, EAS build ID, and pass/fail checklist. Include no PII or payload content.

- [ ] **Step 8: Commit final evidence**

```powershell
git add docs/verification/myccu-refactor-phase-5.md
git commit -m "docs: record MyCCU refactor release verification"
```

- [ ] **Step 9: Request final review**

Use `superpowers:requesting-code-review` to compare the branch against the architecture spec and all eight plan exit criteria. Do not merge or publish until review findings are resolved.

## Completion criteria

- Local repository hydrate/commit, parser, and Home readiness metrics have sanitized five-run Expo Go baselines and blocking 15% median ceilings.
- Coverage ratchets, dependency audit policy, repository hygiene, boundary scans, Expo export, live PCCU verification, and EAS preview all pass.
- No removed legacy engine/scraper, wildcard WebView origin, untyped production option bag, plaintext credential cache, generated artifact, or obsolete dependency remains.
- Expo Go remains the development smoke target; the EAS preview confirms native capabilities and release parity.
- Phase 5 evidence contains no credentials, account identifiers, payloads, raw HTML, or sensitive URLs, and final architecture review findings are resolved.
