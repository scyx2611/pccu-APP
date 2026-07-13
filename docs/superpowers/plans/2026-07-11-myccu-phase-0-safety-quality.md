# MyCCU Phase 0 Safety and Quality Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a strict, reproducible quality gate and close the current credential, WebView trust-boundary, session-cleanup, and root-crash safety gaps without extracting the Phase 1 typed coordinator or any Phase 2 feature workflow.

**Architecture:** Phase 0 wraps the existing `PccuSyncEngine` and `GlobalScraperWebView` with small compatibility ports. Credentials move behind a SecureStore-only vault; the legacy WebView gains an exact HTTPS host policy and a versioned request identity envelope; an injected `AppSessionCoordinator` serializes logout/account-switch cleanup. Root composition adds centrally redacted structured logging and a safe ErrorBoundary while all current feature hooks, parsers, stores, routes, and Expo Go flows remain intact.

**Tech Stack:** Expo SDK 54, React Native 0.81.5, React 19.1, TypeScript 5.9 strict mode, `expo-secure-store`, `expo-crypto`, `react-native-webview`, Zustand 5, AsyncStorage 2.2, Jest 29 with `jest-expo`, ESLint 9 with `eslint-config-expo` 10, Prettier 3, GitHub Actions.

---

## Scope guardrails

This plan implements only Phase 0 from `docs/superpowers/specs/2026-07-11-myccu-refactor-architecture-design.md`.

- Keep `PccuSyncEngine.requestSync(type, priority, options)` and every current hook result shape callable.
- Keep grade, schedule, traffic, and tutoring parsing/orchestration inside the legacy WebView; only validate its URL and message edges.
- Introduce `SyncKind` solely so protocol identity has one shared union. The contract map, reducer, coordinator, registry, queue generation semantics, coalescing, and background retry policy belong to Phase 1.
- Keep legacy AsyncStorage feature keys until Phase 3. Phase 0 only makes their destructive clear operations observable and idempotent for logout/account switching.
- Keep route decomposition and screen redesign out of this phase.
- Live PCCU availability is not a pull-request gate. The blocking pipeline ends at deterministic Jest coverage plus offline Expo export.
- Every automated slice is followed by an Expo Go acceptance checkpoint before Phase 0 exits.

## Verified starting baseline

Run these from the repository root before Task 1 and save the command output in the implementation task log:

```powershell
npm.cmd run verify
npm.cmd exec tsc -- --noEmit --strict
npm.cmd ls react react-dom --all
npm.cmd test -- --runInBand --coverage --coverageReporters=text-summary --collectCoverageFrom='src/**/*.{ts,tsx}'
```

Expected baseline:

- Jest: `22 passed, 22 total`; `153 passed, 153 total`.
- Full `src` coverage: `34.08%` lines and `24.64%` branches.
- Strict TypeScript: exactly three `TS2349` errors in `src/features/pccu/engine/__tests__/PccuSyncEngine.test.ts` at the deferred resolver calls and one `TS2345` error in `src/features/traffic/__tests__/trafficSync.test.ts` at `mockGetTrafficSnapshot.mockResolvedValue(fakeSnapshot)`.
- Dependency tree: React is `19.1.0`, while the transitive `react-dom@19.2.5` declares React `^19.2.5`; `npm ls --all` ends with `ELSPROBLEMS`.
- Production audit snapshot on 2026-07-11: 201 findings (`96 low`, `57 moderate`, `46 high`, `2 critical`); the critical path is `shell-quote@1.8.3` through `react-devtools-core`.

## Phase 0 file map

### Tooling and delivery gates

- Create `.nvmrc` and `.node-version` — Node `20.19.4` pin.
- Modify `package.json` and `package-lock.json` — npm pin, Expo-compatible dependencies, quality scripts, safe audit override.
- Modify `tsconfig.json` — explicit strict maintained-source scope.
- Create `eslint.config.js`, `.prettierrc.json`, and `.prettierignore` — root lint, formatting, and target-boundary rules.
- Modify `jest.config.js` — full-source collection and coverage ratchet.
- Modify `.gitignore` — coverage, secret-bearing env files, and generated verification output.
- Create `.github/workflows/ci.yml` — deterministic pull-request pipeline.
- Create `docs/security/dependency-audit-triage.md` — reviewed production audit disposition.
- Create `docs/testing/phase-0-expo-go-checklist.md` — exact device acceptance procedure.

### Security and session boundaries

- Create `src/core/sync/contracts.ts` — only `SYNC_KINDS` and `SyncKind` for Phase 0.
- Create `src/core/sync/webview/hostPolicy.ts` — exact HTTPS URL policy.
- Create `src/core/sync/webview/protocol.ts` — v1 envelope decoder and legacy-script wrapper.
- Create `src/core/sync/webview/webViewSessionControl.ts` — registered imperative session-clear port.
- Create `src/features/auth/application/CredentialVault.ts` — credential contract and migration result.
- Create `src/features/auth/infrastructure/SecureStoreCredentialVault.ts` — SecureStore-only implementation and mirror deletion.
- Modify `src/features/auth/services/authService.ts` — legacy compatibility facade over the vault.
- Modify `src/features/pccu/engine/PccuSyncEngine.ts` — session-transition block/abort compatibility methods.
- Modify `src/features/pccu/engine/GlobalScraperWebView.tsx` — host/protocol guard, isolated WebView session, credential-ref clear.
- Create `src/core/session/AppSessionCoordinator.ts` — dependency-injected ordered cleanup transaction.
- Create `src/composition/appSession.ts` — concrete legacy adapters and singleton.
- Modify feature storage/store modules — explicit throwing persistence clear plus in-memory reset.
- Modify `LoginScreen`, `SettingsScreen`, `SecurityScreen`, and bootstrap entry — account-switch/logout orchestration.

### Observability and root safety

- Create `src/shared/observability/redaction.ts`, `logger.ts`, and `errorReporting.ts` — structured, centrally sanitized events.
- Modify `src/shared/utils/logger.ts` — compatibility re-export.
- Modify `src/shared/components/ErrorBoundary.tsx` — sanitized report and retry UI.
- Create `src/composition/AppCompositionRoot.tsx` and `src/composition/RootNavigation.tsx` — providers, root boundary, and current navigation composition.
- Modify `app/_layout.tsx` — thin composition-root export.

### Tests

- Fix the four strict errors in the two existing test files.
- Create focused tests beside each new vault, host-policy, protocol, session-control, coordinator, redaction, and ErrorBoundary module.
- Extend `GlobalScraperWebView.test.tsx` and `PccuSyncEngine.test.ts` with fail-closed and session-transition characterizations.
- Retain and explicitly run current grade, schedule, traffic, tutoring, and bootstrap characterization suites.

## Stable handoff to Phase 1

Phase 1 extends these names rather than creating parallel types:

```ts
// src/core/sync/contracts.ts
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
```

```ts
// src/core/session/AppSessionCoordinator.ts
export type SessionTransitionReason = 'logout' | 'account_switch';

export interface SessionSyncPort {
  blockNewRequests(reason: SessionTransitionReason): void;
  abortActiveAndRejectQueue(reason: SessionTransitionReason): void;
  resetAfterSessionChange(): void;
  allowNewRequests(): void;
}
```

`GlobalScraperWebView` stores protocol identity in `PendingRequest.protocolIdentity`, and its temporary counter is named `protocolGenerationRef`. Phase 1 replaces only the counter expression with `request.generation`.

---

### Task 1: Pin the runtime and repair the Expo/React peer baseline

**Files:**
- Create: `.nvmrc`
- Create: `.node-version`
- Modify: `package.json:1-52`
- Modify: `package-lock.json`

- [ ] **Step 1: Capture the failing dependency baseline (2-5 minutes)**

Run:

```powershell
node --version
npm.cmd --version
npm.cmd ls react react-dom --all
$env:EXPO_OFFLINE='1'; npx.cmd expo install --check
```

Expected: local shell reports Node `v24.14.0` and npm `11.9.0`; the full dependency tree reports React `19.1.0` invalid against `react-dom@19.2.5`; Expo reports the three React Navigation packages outside its SDK 54 recommendations.

- [ ] **Step 2: Add exact Node/npm and SDK-compatible package declarations (2-5 minutes)**

Create both version files with the same one-line content:

```text
20.19.4
```

Update the relevant `package.json` fields to this exact shape, preserving all unrelated dependencies:

```json
{
  "engines": {
    "node": ">=20.19.4 <21",
    "npm": ">=10.8.2 <11"
  },
  "packageManager": "npm@10.8.2",
  "dependencies": {
    "@react-navigation/bottom-tabs": "^7.4.0",
    "@react-navigation/native": "^7.1.8",
    "@react-navigation/native-stack": "^7.3.16",
    "expo-crypto": "~15.0.8",
    "react": "19.1.0",
    "react-dom": "19.1.0",
    "react-native": "0.81.5"
  }
}
```

Use the pinned runtime, then let Expo write its official compatible ranges and npm 10 regenerate the lock:

```powershell
nvm use 20.19.4
npm.cmd install --global npm@10.8.2
npx.cmd expo install react-dom expo-crypto @react-navigation/bottom-tabs @react-navigation/native @react-navigation/native-stack
```

Expected: `package-lock.json` records root `react-dom@19.1.0` and `expo-crypto@15.0.8`; it no longer installs `react-dom@19.2.5` solely to satisfy Expo Router.

- [ ] **Step 3: Prove a clean install works without legacy-peer flags (2-5 minutes)**

Run:

```powershell
npm.cmd ci
npm.cmd ls react react-dom --all
npx.cmd expo install --check
```

Expected: plain `npm ci` exits 0 without `--legacy-peer-deps`; React and React DOM are both `19.1.0` with no invalid peer; Expo prints `Dependencies are up to date`.

- [ ] **Step 4: Re-run the existing deterministic baseline (2-5 minutes)**

Run:

```powershell
npm.cmd run typecheck
npm.cmd run test:ci
```

Expected: the current non-strict typecheck exits 0; all 22 suites and 153 tests pass. Do not continue if a navigation dependency downgrade changes a route test.

- [ ] **Step 5: Commit the reproducible toolchain slice (2-5 minutes)**

```bash
git add .nvmrc .node-version package.json package-lock.json
git commit -m "build: pin phase zero runtime and Expo peers"
```

### Task 2: Enable strict maintained-source scope and fix all four known errors

**Files:**
- Modify: `tsconfig.json:1-4`
- Modify: `src/features/pccu/engine/__tests__/PccuSyncEngine.test.ts:29-49,104-145`
- Modify: `src/features/traffic/__tests__/trafficSync.test.ts:23-63`

- [ ] **Step 1: Run strict TypeScript and preserve the exact red result (2-5 minutes)**

Run:

```powershell
npm.cmd exec tsc -- --noEmit --strict
```

Expected: four errors only: `TS2349` at the three optional deferred resolver calls in `PccuSyncEngine.test.ts`, plus `TS2345` at traffic snapshot `mockResolvedValue`.

- [ ] **Step 2: Replace closure-assigned nullable resolvers with a typed deferred helper (2-5 minutes)**

Add this helper near the top of `PccuSyncEngine.test.ts`:

```ts
type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

const createDeferred = <T,>(): Deferred<T> => {
  let resolve!: Deferred<T>['resolve'];
  let reject!: Deferred<T>['reject'];
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};
```

Replace the first nullable resolver pattern with:

```ts
const executor = createDeferred<unknown>();
const executorId = engine.setExecutor(() => executor.promise);

const requestPromise = engine.requestSync('schedule');
await Promise.resolve();
engine.clearExecutor(executorId!);

await expect(requestPromise).rejects.toThrow(
  'Sync executor became unavailable. Shared scraper was unmounted.',
);
executor.resolve({ success: true });
```

Replace the grade/schedule pair in the pause/resume test with two `createDeferred<unknown>()` values, return their `.promise` values from the executor, and invoke `.resolve(...)` directly at the current line 135 and 142 positions.

- [ ] **Step 3: Give the traffic storage mock its real nullable result type (2-5 minutes)**

Add the type import and replace the inferred `Promise<null>` mock:

```ts
import type { TrafficSnapshot } from '../types';

const mockGetTrafficSnapshot = jest.fn<Promise<TrafficSnapshot | null>, []>(
  async () => null,
);
```

Keep `fakeSnapshot` structurally typed as `TrafficSnapshot` so a future storage-shape change fails compilation:

```ts
const fakeSnapshot: TrafficSnapshot = {
  downhill: [{ stopName: 'A', etaText: '3 分' }],
  uphill: [],
  updatedAt: 12345,
  sourceUrl: 'https://ebus.gov.taipei',
};
```

- [ ] **Step 4: Make root strictness and scope explicit, then run green (2-5 minutes)**

Replace `tsconfig.json` with:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noEmit": true,
    "allowJs": true,
    "checkJs": false,
    "forceConsistentCasingInFileNames": true
  },
  "include": [
    "app/**/*.ts",
    "app/**/*.tsx",
    "src/**/*.ts",
    "src/**/*.tsx",
    "scripts/**/*.js",
    "scripts/**/*.cjs",
    "scripts/**/*.mjs",
    "scripts/**/*.ts"
  ],
  "exclude": [
    "node_modules",
    "expo-ios26-app-demo-master",
    ".expo",
    ".expo-export-*",
    "dist",
    "coverage",
    ".codex",
    ".agents",
    ".superpowers",
    ".worktrees",
    "**/backups/**"
  ]
}
```

Run:

```powershell
npm.cmd run typecheck
npm.cmd test -- --runInBand src/features/pccu/engine/__tests__/PccuSyncEngine.test.ts src/features/traffic/__tests__/trafficSync.test.ts
```

Expected: TypeScript exits 0 with no diagnostics; both suites pass.

- [ ] **Step 5: Commit the strict baseline (2-5 minutes)**

```bash
git add tsconfig.json src/features/pccu/engine/__tests__/PccuSyncEngine.test.ts src/features/traffic/__tests__/trafficSync.test.ts
git commit -m "test: make the maintained source tree strict"
```

### Task 3: Add root lint, formatting, and incremental architecture boundaries

**Files:**
- Create: `eslint.config.js`
- Create: `.prettierrc.json`
- Create: `.prettierignore`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: maintained files changed by the one-time formatter under `app/`, `src/`, `scripts/`, and root configuration

- [ ] **Step 1: Add the scripts first and verify they are red without tooling (2-5 minutes)**

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "lint": "eslint app src scripts --max-warnings=0",
    "lint:boundaries": "eslint \"src/core/**/*.{ts,tsx}\" \"src/features/*/{domain,application,infrastructure,state,presentation}/**/*.{ts,tsx}\" --no-error-on-unmatched-pattern --max-warnings=0",
    "format": "prettier --write .",
    "format:check": "prettier --check ."
  }
}
```

Run `npm.cmd run lint` and `npm.cmd run format:check`.

Expected: both fail because ESLint and Prettier are not direct project tools yet.

- [ ] **Step 2: Install the pinned quality tools and add formatting policy (2-5 minutes)**

Run:

```powershell
npm.cmd install --save-dev eslint@9.38.0 eslint-config-expo@10.0.0 prettier@3.6.2
```

Create `.prettierrc.json`:

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "semi": true
}
```

Create `.prettierignore`:

```text
node_modules/
.expo/
.expo-export-*/
dist/
coverage/
expo-ios26-app-demo-master/
scripts/schedule-1208-debug/
__fixtures__/html/
.codex/
.agents/
.superpowers/
.worktrees/
package-lock.json
```

- [ ] **Step 3: Add exact target-architecture lint boundaries (2-5 minutes)**

Create `eslint.config.js`:

```js
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const features = ['auth', 'grade', 'schedule', 'traffic', 'tutoring'];

const crossFeatureOverrides = features.map((feature) => ({
  files: [
    `src/features/${feature}/{domain,application,infrastructure,state,presentation}/**/*.{ts,tsx}`,
  ],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: features
          .filter((candidate) => candidate !== feature)
          .map((candidate) => ({
            group: [
              `@/features/${candidate}/**`,
              `../../${candidate}/**`,
              `../../../${candidate}/**`,
              `../../../../features/${candidate}/**`,
            ],
            message: `Cross-feature imports must use @/features/${candidate}.`,
          })),
      },
    ],
  },
}));

module.exports = defineConfig([
  globalIgnores([
    'node_modules/**',
    'expo-ios26-app-demo-master/**',
    '.expo/**',
    '.expo-export-*/**',
    'dist/**',
    'coverage/**',
    'scripts/schedule-1208-debug/**',
    '.codex/**',
    '.agents/**',
    '.superpowers/**',
    '.worktrees/**',
  ]),
  expoConfig,
  {
    files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  {
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-console': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/features/**', '../../features/**', '../../../features/**'],
              message: 'Core modules cannot import feature implementations.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/*/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'react', message: 'Domain code must stay framework-free.' },
            { name: 'react-native', message: 'Domain code must stay framework-free.' },
            { name: 'zustand', message: 'Domain code must stay state-library-free.' },
            {
              name: '@react-native-async-storage/async-storage',
              message: 'Domain code cannot persist data.',
            },
            { name: 'react-native-webview', message: 'Domain code cannot own transport.' },
          ],
          patterns: [
            { group: ['expo-*'], message: 'Domain code cannot import Expo APIs.' },
            {
              group: ['../application/**', '../infrastructure/**', '../state/**', '../presentation/**'],
              message: 'Domain dependencies point inward only.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/*/application/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            '@react-native-async-storage/async-storage',
            'expo-secure-store',
            'react-native-webview',
            'zustand',
          ],
          patterns: [
            { group: ['expo-*'], message: 'Application code depends on ports, not Expo APIs.' },
            {
              group: ['../infrastructure/**', '../state/**', '../presentation/**'],
              message: 'Application code cannot depend on outer feature layers.',
            },
          ],
        },
      ],
    },
  },
  ...crossFeatureOverrides,
]);
```

- [ ] **Step 4: Apply one mechanical format pass and run both lint gates (2-5 minutes)**

Run:

```powershell
npm.cmd run format
npm.cmd run format:check
npm.cmd run lint
npm.cmd run lint:boundaries
```

Expected: Prettier reports every maintained file unchanged on the second run; both ESLint commands exit 0. Confirm the formatter did not change string-template contents by running `npm.cmd test -- --runInBand src/features/pccu/sync/__tests__/pccuSyncScripts.test.ts src/features/tutoring/sync/__tests__/tutoringScripts.test.ts` and expecting both suites to pass.

- [ ] **Step 5: Commit policy separately from behavior changes (2-5 minutes)**

```bash
git add eslint.config.js .prettierrc.json .prettierignore package.json package-lock.json app src scripts
git commit -m "chore: add lint format and module boundary gates"
```

### Task 4: Ratchet full-source coverage at the verified baseline

**Files:**
- Modify: `jest.config.js:1-18`
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Demonstrate the existing Jest config is not a global ratchet (2-5 minutes)**

Run:

```powershell
npm.cmd test -- --runInBand --coverage --coverageReporters=text-summary
```

Expected: Jest only collects `src/features/pccu/parsers/**/*.ts` because of the current `collectCoverageFrom`, so the output cannot enforce the architecture specification's 34.08/24.64 full-source baseline.

- [ ] **Step 2: Replace parser-only collection with maintained production source (2-5 minutes)**

Update the coverage section of `jest.config.js` to:

```js
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/*.test.{ts,tsx}',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'text-summary', 'json-summary', 'lcov'],
  coverageThreshold: {
    global: {
      lines: 34.08,
      branches: 24.64,
    },
  },
```

Do not set statement/function thresholds in Phase 0 because the approved architecture baseline specifies only lines and branches.

- [ ] **Step 3: Add the named CI command and ignore generated output (2-5 minutes)**

Add this script:

```json
{
  "scripts": {
    "coverage:ci": "jest --runInBand --coverage"
  }
}
```

Add these `.gitignore` entries:

```text
coverage/
.superpowers/
.env
.env.*
!.env.example
playwright-report/
test-results/
```

- [ ] **Step 4: Run the coverage gate twice to prove determinism (2-5 minutes)**

Run:

```powershell
npm.cmd run coverage:ci
npm.cmd run coverage:ci
```

Expected on both runs: 22 suites and 153 tests pass; lines are at least `34.08%`; branches are at least `24.64%`; Jest exits 0. A drop of `0.01` percentage point is a failure, not a rounding waiver.

- [ ] **Step 5: Commit the ratchet (2-5 minutes)**

```bash
git add jest.config.js package.json .gitignore
git commit -m "test: ratchet full source coverage"
```

### Task 5: Add GitHub CI and an offline Expo export smoke

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `package.json`

- [ ] **Step 1: Add the export command and observe the missing-script red state (2-5 minutes)**

Run `npm.cmd run export:smoke` before adding the script.

Expected: npm exits non-zero with `Missing script: "export:smoke"`.

- [ ] **Step 2: Add the exact export and aggregate verification scripts (2-5 minutes)**

Update `package.json`:

```json
{
  "scripts": {
    "export:smoke": "expo export --platform ios --output-dir .expo-export-smoke",
    "verify": "npm run lint && npm run lint:boundaries && npm run format:check && npm run typecheck && npm run coverage:ci && npm run export:smoke"
  }
}
```

Run `npm.cmd run export:smoke`.

Expected: Expo creates `.expo-export-smoke/` and exits 0 without contacting PCCU. The directory remains ignored by the existing `.expo-export-*` rule.

- [ ] **Step 3: Create the deterministic pull-request workflow (2-5 minutes)**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    env:
      CI: '1'
      EXPO_NO_TELEMETRY: '1'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - name: Pin npm
        run: npm install --global npm@10.8.2
      - name: Show toolchain
        run: node --version && npm --version
      - name: Install locked dependencies
        run: npm ci
      - name: Validate Expo dependency compatibility
        run: npx expo install --check
      - name: Lint
        run: npm run lint
      - name: Enforce module boundaries
        run: npm run lint:boundaries
      - name: Check formatting
        run: npm run format:check
      - name: Strict typecheck
        run: npm run typecheck
      - name: Test with coverage ratchet
        run: npm run coverage:ci
      - name: Export iOS bundle
        run: npm run export:smoke
```

- [ ] **Step 4: Reproduce the workflow locally from a clean install (2-5 minutes)**

Run:

```powershell
npm.cmd ci
npx.cmd expo install --check
npm.cmd run verify
```

Expected: every command exits 0; `verify` ends after a successful Expo iOS export; no live PCCU request appears in the log.

- [ ] **Step 5: Commit the delivery gate (2-5 minutes)**

```bash
git add .github/workflows/ci.yml package.json
git commit -m "ci: gate strict checks coverage and Expo export"
```

### Task 6: Triage the production audit without force-upgrading Expo

**Files:**
- Create: `docs/security/dependency-audit-triage.md`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Reproduce and classify the audit baseline (2-5 minutes)**

Run:

```powershell
npm.cmd audit --omit=dev --json
npm.cmd explain shell-quote
npm.cmd explain ws
npm.cmd explain undici
```

Expected before remediation: 201 findings, including two critical aggregate entries rooted in `shell-quote@1.8.3`. `ws` and `undici` are transitive through React Native/Metro/Expo CLI rather than app imports.

- [ ] **Step 2: Apply the narrow non-breaking critical fix (2-5 minutes)**

Add this root override and audit script:

```json
{
  "scripts": {
    "audit:prod": "npm audit --omit=dev --audit-level=critical"
  },
  "overrides": {
    "shell-quote": "1.8.4"
  }
}
```

Run `npm.cmd install --package-lock-only`, followed by `npm.cmd ci`. Do not run `npm audit fix --force`; it may replace the Expo/React Native dependency line with incompatible majors.

- [ ] **Step 3: Record the reviewed disposition with concrete evidence (2-5 minutes)**

Create `docs/security/dependency-audit-triage.md` with this content:

```markdown
# Production Dependency Audit Triage

**Baseline date:** 2026-07-11

**Command:** `npm audit --omit=dev --json`
**Baseline lock:** 201 findings: 96 low, 57 moderate, 46 high, 2 critical.

| Finding | Runtime path | Phase 0 decision |
|---|---|---|
| `GHSA-w7jw-789q-3m8p` in `shell-quote<=1.8.3` | `react-native -> react-devtools-core -> shell-quote` | Override to patched `1.8.4`; verify Jest, Expo dependency check, and export. |
| `ws` high-severity advisories | Metro, Expo CLI, React DevTools development transports | Retain the Expo SDK 54 compatible tree; no compatible root fix is published in this lock. These servers are development tooling, not a MyCCU app network endpoint. Recheck on every Expo SDK patch. |
| `undici` advisories | nested `@expo/cli` HTTP client | Retain the Expo-managed version and update only through a compatible Expo patch. The app uses React Native networking, not this CLI copy. |
| `@babel/core` low advisory | build/test transformation | No fixed version is available in the SDK 54 lock; do not override Babel independently of Expo/Metro. |

## Enforcement

`npm run audit:prod` must report zero critical findings. High findings remain visible and reviewed; they are not hidden by a count allowlist. Dependency remediation never uses `npm audit fix --force`.
```

- [ ] **Step 4: Verify critical removal and runtime compatibility (2-5 minutes)**

Run:

```powershell
npm.cmd explain shell-quote
npm.cmd run audit:prod
npx.cmd expo install --check
npm.cmd run test:ci
npm.cmd run export:smoke
```

Expected: `shell-quote@1.8.4`; audit exits 0 at the critical threshold; Expo dependency validation, all 153 baseline tests, and export pass. The audit may still print the documented high/moderate/low transitive findings.

- [ ] **Step 5: Commit the reviewed audit state (2-5 minutes)**

```bash
git add package.json package-lock.json docs/security/dependency-audit-triage.md
git commit -m "chore: triage production dependency audit"
```

### Task 7: Freeze legacy feature persistence and bootstrap behavior

**Files:**
- Create: `src/features/__tests__/phase0LegacyBehavior.test.ts`
- Test: `src/features/pccu/parsers/__tests__/pccuScraper.test.ts`
- Test: `src/features/auth/screens/__tests__/bootstrapSync.test.tsx`
- Test: `src/features/traffic/__tests__/trafficSync.test.ts`
- Test: `src/features/tutoring/hooks/__tests__/useTutoringSync.test.tsx`

- [ ] **Step 1: Write one storage characterization per current feature (2-5 minutes)**

Create `src/features/__tests__/phase0LegacyBehavior.test.ts`:

```ts
const values = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => values.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    values.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    values.delete(key);
  }),
  getAllKeys: jest.fn(async () => [...values.keys()]),
  multiRemove: jest.fn(async (keys: string[]) => {
    keys.forEach((key) => values.delete(key));
  }),
}));

import { getGrades, setGrades, clearGrades } from '../grade/storage/gradeStorage';
import { getCourses as getSchedule, setCourses, clearCourses } from '../schedule/storage/scheduleStorage';
import { getTrafficSnapshot, setTrafficSnapshot, clearTrafficSnapshot } from '../traffic/storage/trafficStorage';
import { getCourses as getTutoringCourses, setCourses as setTutoringCourses, clearAll } from '../tutoring/storage/tutoringStorage';
import type { SemesterGrade, CourseData } from '../pccu/parsers/pccuScraper';
import type { TrafficSnapshot } from '../traffic/types';
import type { TutoringCourse } from '../tutoring/types';

describe('Phase 0 legacy persistence characterization', () => {
  beforeEach(async () => {
    values.clear();
    await Promise.all([clearGrades(), clearCourses(), clearTrafficSnapshot(), clearAll()]);
  });

  it('round-trips grade and schedule snapshots with their timestamps', async () => {
    const grades = [{ title: '113-1', stats: {}, courses: [] }] as SemesterGrade[];
    const courses = [{ id: 'course-1', name: '資料結構' }] as CourseData[];
    await setGrades(grades, [], 101);
    await setCourses(courses, false, 202);
    await expect(getGrades()).resolves.toMatchObject({ grades, updatedAt: 101 });
    await expect(getSchedule()).resolves.toMatchObject({ courses, updatedAt: 202 });
  });

  it('round-trips traffic and tutoring data used by current hooks', async () => {
    const traffic: TrafficSnapshot = {
      downhill: [],
      uphill: [],
      updatedAt: 303,
      sourceUrl: 'https://ebus.gov.taipei',
    };
    const tutoring = [{ courseCode: 'CS101', courseName: '程式設計' }] as TutoringCourse[];
    await setTrafficSnapshot(traffic);
    await setTutoringCourses(tutoring);
    await expect(getTrafficSnapshot()).resolves.toEqual(traffic);
    await expect(getTutoringCourses()).resolves.toEqual(tutoring);
  });
});
```

- [ ] **Step 2: Run the new file once before adjusting its fixtures (2-5 minutes)**

Run `npm.cmd test -- --runInBand src/features/__tests__/phase0LegacyBehavior.test.ts`.

Expected: if an asserted fixture omits a required current domain field, strict compilation/test fails at that field; add the real required values from the exported type rather than casting the assertion to `any`. Final result is two passing tests.

- [ ] **Step 3: Run the complete characterization matrix (2-5 minutes)**

Run:

```powershell
npm.cmd test -- --runInBand src/features/pccu/parsers/__tests__/pccuScraper.test.ts src/features/auth/screens/__tests__/bootstrapSync.test.tsx src/features/traffic/__tests__/trafficSync.test.ts src/features/tutoring/hooks/__tests__/useTutoringSync.test.tsx src/features/__tests__/phase0LegacyBehavior.test.ts
```

Expected: valid schedule and grade HTML fixtures remain non-empty; bootstrap rehydrates schedule/grade after a late executor; traffic and tutoring hooks retain their current request options/results; both persistence round trips pass.

- [ ] **Step 4: Record the non-regression command in the test file header (2-5 minutes)**

Add this exact comment above the `describe` block:

```ts
// Phase 0 keeps these legacy keys/shapes until account-scoped repositories replace them in Phase 3.
```

Run `npm.cmd run typecheck` and the matrix command again. Expected: no TypeScript diagnostics and all selected suites pass.

- [ ] **Step 5: Commit the characterization lock (2-5 minutes)**

```bash
git add src/features/__tests__/phase0LegacyBehavior.test.ts
git commit -m "test: characterize phase zero legacy feature data"
```

### Task 8: Introduce a SecureStore-only CredentialVault and delete the plaintext mirror

**Files:**
- Create: `src/features/auth/application/CredentialVault.ts`
- Create: `src/features/auth/infrastructure/SecureStoreCredentialVault.ts`
- Create: `src/features/auth/infrastructure/__tests__/SecureStoreCredentialVault.test.ts`
- Create: `src/features/auth/__tests__/credentialPersistenceBoundary.test.ts`

- [ ] **Step 1: Write migration and persistence tests that fail against the current service (2-5 minutes)**

Cover these cases in `SecureStoreCredentialVault.test.ts` with mocked `expo-secure-store` and AsyncStorage:

```ts
it.each([
  [null, 'secret'],
  ['B4123456', null],
])('clears both secure values when one half is missing', async (account, password) => {
  mockGetItemAsync.mockImplementation(async (key: string) =>
    key === 'user_account' ? account : password,
  );
  const result = await vault.migrateV2();
  expect(result).toEqual({ status: 'requires_sign_in' });
  expect(mockDeleteItemAsync).toHaveBeenCalledWith('user_account');
  expect(mockDeleteItemAsync).toHaveBeenCalledWith('user_password');
  expect(AsyncStorage.removeItem).toHaveBeenCalledWith('user_credentials_cache_v1');
});

it('preserves complete SecureStore credentials and never reads the mirror', async () => {
  mockGetItemAsync.mockImplementation(async (key: string) =>
    key === 'user_account' ? 'B4123456' : 'secret',
  );
  await expect(vault.migrateV2()).resolves.toEqual({
    status: 'ready',
    credentials: { account: 'B4123456', password: 'secret' },
  });
  expect(AsyncStorage.getItem).not.toHaveBeenCalled();
  expect(AsyncStorage.removeItem).toHaveBeenCalledWith('user_credentials_cache_v1');
});
```

Also test `save`, `getActive`, `clearActive`, failed partial save rollback, and idempotent repeated migration.

- [ ] **Step 2: Define the feature application contract (2-5 minutes)**

Create `src/features/auth/application/CredentialVault.ts`:

```ts
export type PCCUCredentials = Readonly<{
  account: string;
  password: string;
}>;

export type CredentialMigrationResult =
  | { status: 'ready'; credentials: PCCUCredentials }
  | { status: 'requires_sign_in' };

export interface CredentialVault {
  migrateV2(): Promise<CredentialMigrationResult>;
  getSaved(): Promise<PCCUCredentials | null>;
  getActive(): PCCUCredentials | null;
  save(credentials: PCCUCredentials): Promise<void>;
  setActive(credentials: PCCUCredentials): void;
  clearActive(): void;
  clearPersisted(): Promise<void>;
  clearProfile(): Promise<void>;
}
```

- [ ] **Step 3: Implement complete-secure-or-signed-out migration semantics (2-5 minutes)**

Create `SecureStoreCredentialVault.ts` with these keys and the following core behavior:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type {
  CredentialMigrationResult,
  CredentialVault,
  PCCUCredentials,
} from '../application/CredentialVault';

export const ACCOUNT_KEY = 'user_account';
export const PASSWORD_KEY = 'user_password';
export const LEGACY_CREDENTIALS_MIRROR_KEY = 'user_credentials_cache_v1';
const PROFILE_KEYS = ['session_cookie', 'user_name'] as const;

const normalize = (value: string | null) => (value ?? '').trim();

export class SecureStoreCredentialVault implements CredentialVault {
  private active: PCCUCredentials | null = null;
  private migration: Promise<CredentialMigrationResult> | null = null;

  migrateV2(): Promise<CredentialMigrationResult> {
    this.migration ??= this.runMigration();
    return this.migration;
  }

  private async runMigration(): Promise<CredentialMigrationResult> {
    const [mirrorDeletion, accountRead, passwordRead] = await Promise.allSettled([
      AsyncStorage.removeItem(LEGACY_CREDENTIALS_MIRROR_KEY),
      SecureStore.getItemAsync(ACCOUNT_KEY),
      SecureStore.getItemAsync(PASSWORD_KEY),
    ]);
    if (mirrorDeletion.status === 'rejected') throw mirrorDeletion.reason;
    if (accountRead.status === 'rejected' || passwordRead.status === 'rejected') {
      await this.clearPersisted();
      throw new Error('credential_vault_read_failed');
    }
    const account = normalize(accountRead.value);
    const password = normalize(passwordRead.value);
    if (!account || !password) {
      await this.clearPersisted();
      return { status: 'requires_sign_in' };
    }
    this.active = { account, password };
    return { status: 'ready', credentials: this.active };
  }

  async getSaved(): Promise<PCCUCredentials | null> {
    const result = await this.migrateV2();
    return result.status === 'ready' ? result.credentials : null;
  }

  getActive(): PCCUCredentials | null {
    return this.active;
  }

  setActive(credentials: PCCUCredentials): void {
    this.active = { account: normalize(credentials.account), password: normalize(credentials.password) };
  }

  async save(credentials: PCCUCredentials): Promise<void> {
    this.setActive(credentials);
    const writes = await Promise.allSettled([
      SecureStore.setItemAsync(ACCOUNT_KEY, this.active!.account),
      SecureStore.setItemAsync(PASSWORD_KEY, this.active!.password),
    ]);
    if (writes.some((result) => result.status === 'rejected')) {
      await this.clearPersisted();
      throw new Error('credential_vault_write_failed');
    }
    this.migration = Promise.resolve({ status: 'ready', credentials: this.active! });
  }

  clearActive(): void {
    this.active = null;
  }

  async clearPersisted(): Promise<void> {
    this.clearActive();
    this.migration = null;
    const results = await Promise.allSettled([
      SecureStore.deleteItemAsync(ACCOUNT_KEY),
      SecureStore.deleteItemAsync(PASSWORD_KEY),
      AsyncStorage.removeItem(LEGACY_CREDENTIALS_MIRROR_KEY),
    ]);
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length) throw new AggregateError(failures, 'credential_vault_clear_failed');
  }

  async clearProfile(): Promise<void> {
    const results = await Promise.allSettled(
      PROFILE_KEYS.map((key) => SecureStore.deleteItemAsync(key)),
    );
    const failures = results.filter((result) => result.status === 'rejected');
    if (failures.length) throw new AggregateError(failures, 'profile_clear_failed');
  }
}

export const credentialVault = new SecureStoreCredentialVault();
```

- [ ] **Step 4: Add a source-level regression test and run green (2-5 minutes)**

Create `credentialPersistenceBoundary.test.ts` to assert the mirror literal appears only in `SecureStoreCredentialVault.ts`, that the file calls `AsyncStorage.removeItem`, and that neither vault nor `authService.ts` calls `AsyncStorage.setItem` for credentials.

Run:

```powershell
npm.cmd test -- --runInBand src/features/auth/infrastructure/__tests__/SecureStoreCredentialVault.test.ts src/features/auth/__tests__/credentialPersistenceBoundary.test.ts
npm.cmd run typecheck
```

Expected: all vault branches pass; the source boundary test proves the legacy mirror can only be deleted; strict typecheck passes.

- [ ] **Step 5: Commit the vault independently (2-5 minutes)**

```bash
git add src/features/auth/application/CredentialVault.ts src/features/auth/infrastructure/SecureStoreCredentialVault.ts src/features/auth/infrastructure/__tests__/SecureStoreCredentialVault.test.ts src/features/auth/__tests__/credentialPersistenceBoundary.test.ts
git commit -m "feat: add SecureStore only credential vault"
```

### Task 9: Route the legacy auth facade and bootstrap through CredentialVault

**Files:**
- Modify: `src/features/auth/services/authService.ts:1-268`
- Create: `src/features/auth/services/__tests__/authService.test.ts`
- Modify: `app/index.tsx:88-109`
- Modify: `src/features/auth/screens/LoginScreen.tsx:77-155`

- [ ] **Step 1: Write facade tests before deleting mirror code (2-5 minutes)**

Mock `credentialVault` and `fetch` in `authService.test.ts`; assert:

```ts
it('keeps a successful non-remembered login in memory only', async () => {
  mockFetch.mockResolvedValue(loginResponse(false));
  await expect(loginPCCU(' B4123456 ', ' secret ', { persistCredentials: false })).resolves.toEqual({ success: true });
  expect(credentialVault.setActive).toHaveBeenCalledWith({ account: 'B4123456', password: 'secret' });
  expect(credentialVault.save).not.toHaveBeenCalled();
});

it('persists a remembered successful login only through the vault', async () => {
  mockFetch.mockResolvedValue(loginResponse(false));
  await loginPCCU('B4123456', 'secret', { persistCredentials: true });
  expect(credentialVault.save).toHaveBeenCalledWith({ account: 'B4123456', password: 'secret' });
});
```

Expected red: current `authService` imports AsyncStorage, writes `user_credentials_cache_v1`, and does not delegate to the vault.

- [ ] **Step 2: Replace credential caches/mirror helpers with vault delegation (2-5 minutes)**

Delete `writeCredentialsMirror`, `readCredentialsMirror`, all saved-credential module caches, and the AsyncStorage import. Keep the current login request/response mapping, but replace credential operations with:

```ts
export const clearSessionPCCUCredentials = () => credentialVault.clearActive();

export const savePCCUCredentials = async (account: string, password: string) => {
  const credentials = { account: normalizeCredential(account), password: normalizeCredential(password) };
  if (!credentials.account || !credentials.password) return;
  await credentialVault.save(credentials);
};

export const clearPersistedPCCUCredentials = () => credentialVault.clearPersisted();
export const clearSavedPCCUCredentials = async () => {
  credentialVault.clearActive();
  await credentialVault.clearPersisted();
};

export const getSavedPCCUCredentials = () =>
  credentialVault.getActive()
    ? Promise.resolve(credentialVault.getActive())
    : credentialVault.getSaved();
```

On successful `loginPCCU`, call `credentialVault.setActive(credentials)` before the optional `credentialVault.save(credentials)`. Remove its old post-login `previousAccount` cache clearing; Task 15 moves account switching before login.

- [ ] **Step 3: Make bootstrap migration failure sign out safely (2-5 minutes)**

Wrap saved credential reads in `app/index.tsx` and `LoginScreen.tsx` so a vault read/deletion error never proceeds with a partial session:

```ts
let savedCredentials = null;
try {
  savedCredentials = await getSavedPCCUCredentials();
} catch {
  await clearSavedPCCUCredentials().catch(() => undefined);
}
```

The normal complete SecureStore path still proceeds to biometric/cache bootstrap. An incomplete pair produces `null` and shows the normal login entry; plaintext mirror content is never consulted.

- [ ] **Step 4: Run auth, bootstrap, source-boundary, and full tests (2-5 minutes)**

Run:

```powershell
npm.cmd test -- --runInBand src/features/auth/services/__tests__/authService.test.ts src/features/auth/screens/__tests__/bootstrapSync.test.tsx src/features/auth/__tests__/credentialPersistenceBoundary.test.ts
npm.cmd run typecheck
npm.cmd run test:ci
```

Expected: new auth tests pass, bootstrap characterizations pass, strict typecheck passes, and the expanded full suite has no regression.

- [ ] **Step 5: Commit the compatibility migration (2-5 minutes)**

```bash
git add src/features/auth/services/authService.ts src/features/auth/services/__tests__/authService.test.ts app/index.tsx src/features/auth/screens/LoginScreen.tsx
git commit -m "refactor: route legacy auth through credential vault"
```

### Task 10: Add the exact HTTPS WebView host policy

**Files:**

- Create: `src/core/sync/webview/hostPolicy.ts`
- Create: `src/core/sync/webview/__tests__/hostPolicy.test.ts`
- Modify: `src/features/pccu/engine/GlobalScraperWebView.tsx`
- Modify: `src/features/pccu/engine/__tests__/GlobalScraperWebView.test.tsx`

- [ ] **Step 1: Write the fail-closed policy tests first (2-5 minutes)**

Create a table-driven suite that accepts only the five observed HTTPS hosts and rejects HTTP, credentials in URLs, deceptive suffixes, arbitrary subdomains, invalid URLs, and unsupported schemes:

```ts
import { isAllowedWebViewUrl } from '../hostPolicy';

describe('isAllowedWebViewUrl', () => {
  it.each([
    'https://ecampus.pccu.edu.tw/eCampus/inside.aspx',
    'https://ap1.pccu.edu.tw/queryCourse/index.asp',
    'https://ap2.pccu.edu.tw/studentscore/student/index.asp',
    'https://icas.pccu.edu.tw/cfp/',
    'https://ebus.gov.taipei/Route/StopsOfRoute?routeid=0161000900',
  ])('allows an observed exact HTTPS host: %s', (url) => {
    expect(isAllowedWebViewUrl(url)).toBe(true);
  });

  it.each([
    'http://ecampus.pccu.edu.tw/eCampus/inside.aspx',
    'https://ecampus.pccu.edu.tw.evil.example/inside.aspx',
    'https://evil.ecampus.pccu.edu.tw/inside.aspx',
    'https://student:secret@ecampus.pccu.edu.tw/inside.aspx',
    'javascript:alert(1)',
    'not-a-url',
  ])('rejects an untrusted URL: %s', (url) => {
    expect(isAllowedWebViewUrl(url)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the host-policy test to verify red (2-5 minutes)**

Run `npm.cmd test -- --runInBand --runTestsByPath src/core/sync/webview/__tests__/hostPolicy.test.ts`.

Expected: FAIL because `hostPolicy.ts` does not exist.

- [ ] **Step 3: Implement the single authoritative policy (2-5 minutes)**

```ts
export const ALLOWED_WEBVIEW_HOSTS = [
  'ecampus.pccu.edu.tw',
  'ap1.pccu.edu.tw',
  'ap2.pccu.edu.tw',
  'icas.pccu.edu.tw',
  'ebus.gov.taipei',
] as const;

const hostSet = new Set<string>(ALLOWED_WEBVIEW_HOSTS);

export const ALLOWED_WEBVIEW_ORIGINS = ALLOWED_WEBVIEW_HOSTS.map(
  (hostname) => `https://${hostname}`,
);

export function isAllowedWebViewUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      hostSet.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}
```

Do not accept host suffixes and do not add a host merely to make a test green. A new host requires a captured sanitized navigation example, an explicit test row, and Expo Go verification.

- [ ] **Step 4: Apply the policy to every legacy navigation edge (2-5 minutes)**

Set `originWhitelist={ALLOWED_WEBVIEW_ORIGINS}` and use the same `isAllowedWebViewUrl` check for initial source assignment, `onShouldStartLoadWithRequest`, popup/redirect messages, download URLs, and any code that assigns `webViewUrl`. On rejection call `webViewRef.current?.stopLoading()`, fail the active request with a sanitized `webview_host_rejected` error, and never include the query string in logs.

Extend `GlobalScraperWebView.test.tsx` with one allowed redirect, one deceptive suffix, and one HTTP redirect. Expected: allowed navigation continues; rejected navigation stops and settles the request once.

- [ ] **Step 5: Run focused verification and commit (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/core/sync/webview/__tests__/hostPolicy.test.ts src/features/pccu/engine/__tests__/GlobalScraperWebView.test.tsx
npm.cmd run typecheck
git add src/core/sync/webview/hostPolicy.ts src/core/sync/webview/__tests__/hostPolicy.test.ts src/features/pccu/engine/GlobalScraperWebView.tsx src/features/pccu/engine/__tests__/GlobalScraperWebView.test.tsx
git commit -m "security: enforce exact WebView host policy"
```

Expected: both suites pass, strict typecheck exits 0, and `rg -n "originWhitelist=\{\['\*'\]\}" src app` returns no matches.

### Task 11: Bind legacy WebView messages to a validated request identity

**Files:**

- Create: `src/core/sync/webview/protocol.ts`
- Create: `src/core/sync/webview/__tests__/protocol.test.ts`
- Modify: `src/features/pccu/engine/GlobalScraperWebView.tsx`
- Modify: `src/features/pccu/engine/__tests__/GlobalScraperWebView.test.tsx`

- [ ] **Step 1: Write decoder and stale-message tests first (2-5 minutes)**

Test malformed JSON, unknown versions, missing identity fields, wrong request ID, wrong generation, wrong nonce, wrong kind, disallowed current URL, and a valid legacy event. Add a component test proving that a message from generation 4 cannot settle generation 5.

```ts
const expected = {
  requestId: 'request-7',
  generation: 5,
  nonce: 'nonce-5',
  syncKind: 'schedule' as const,
};

expect(decodeWebViewEnvelope(JSON.stringify({
  version: 1,
  ...expected,
  event: 'legacy-message',
  payload: { type: 'SCHEDULE_RESULT', data: [] },
}), expected)).toEqual({ ok: true, value: expect.objectContaining(expected) });
```

- [ ] **Step 2: Run the protocol suites to verify red (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/core/sync/webview/__tests__/protocol.test.ts src/features/pccu/engine/__tests__/GlobalScraperWebView.test.tsx
```

Expected: the decoder import fails and the legacy component accepts an unbound message.

- [ ] **Step 3: Implement the Phase 0 envelope and decoder (2-5 minutes)**

Create `protocol.ts` with these public names. The decoder must inspect `unknown` field-by-field; JSON parsing and a type assertion alone are not validation.

```ts
import type { SyncKind } from '../contracts';

export type WebViewProtocolIdentity<K extends SyncKind = SyncKind> = Readonly<{
  requestId: string;
  generation: number;
  nonce: string;
  syncKind: K;
}>;

export type WebViewEnvelope = WebViewProtocolIdentity & Readonly<{
  version: 1;
  event: string;
  payload: unknown;
}>;

export type DecodeResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'malformed' | 'unsupported_version' | 'identity_mismatch' };

export function decodeWebViewEnvelope(
  raw: string,
  expected: WebViewProtocolIdentity,
): DecodeResult<WebViewEnvelope>;

export function buildLegacyProtocolPrelude(identity: WebViewProtocolIdentity): string;
```

`buildLegacyProtocolPrelude` must serialize the identity with `JSON.stringify` at build time and replace `window.ReactNativeWebView.postMessage` with a wrapper that emits `{ version: 1, ...identity, event: 'legacy-message', payload }`. Preserve the original bound function and install the wrapper once per generation.

- [ ] **Step 4: Wire identity creation and validation into the legacy host (2-5 minutes)**

When an engine request becomes active, create exactly one identity with `request.id`, `++protocolGenerationRef.current`, `Crypto.randomUUID()`, and `request.type`; store it on `PendingRequest.protocolIdentity`. Prefix every injected legacy script with `buildLegacyProtocolPrelude(identity)`. Before the existing message switch, require:

1. the current page URL passes `isAllowedWebViewUrl`;
2. `decodeWebViewEnvelope(event.nativeEvent.data, pending.protocolIdentity)` succeeds;
3. the decoded payload passes the existing event-specific field checks.

Rejected messages refresh no timer, mutate no state, write no storage, and settle no request. Log only `{ event: 'webview_message_rejected', reason, syncKind }`.

- [ ] **Step 5: Run the security regression set and commit (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/core/sync/webview/__tests__/protocol.test.ts src/core/sync/webview/__tests__/hostPolicy.test.ts src/features/pccu/engine/__tests__/GlobalScraperWebView.test.tsx
npm.cmd run typecheck
git add src/core/sync/webview/protocol.ts src/core/sync/webview/__tests__/protocol.test.ts src/features/pccu/engine/GlobalScraperWebView.tsx src/features/pccu/engine/__tests__/GlobalScraperWebView.test.tsx
git commit -m "security: validate legacy WebView message identity"
```

### Task 12: Add session-transition controls to the engine and WebView

**Files:**

- Create: `src/core/sync/webview/webViewSessionControl.ts`
- Create: `src/core/sync/webview/__tests__/webViewSessionControl.test.ts`
- Modify: `src/features/pccu/engine/PccuSyncEngine.ts`
- Modify: `src/features/pccu/engine/__tests__/PccuSyncEngine.test.ts`
- Modify: `src/features/pccu/engine/GlobalScraperWebView.tsx`

- [ ] **Step 1: Characterize blocked, active, and queued settlement (2-5 minutes)**

Add engine tests asserting that `blockNewRequests('logout')` rejects new work immediately, `abortActiveAndRejectQueue('account_switch')` rejects the active caller and every queued caller exactly once, and `allowNewRequests()` is ineffective until `resetAfterSessionChange()` completes. Add session-control tests for registration replacement, idempotent unregister, and a missing-host no-op.

- [ ] **Step 2: Run the tests to verify red (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/pccu/engine/__tests__/PccuSyncEngine.test.ts src/core/sync/webview/__tests__/webViewSessionControl.test.ts
```

Expected: all new methods/modules are missing.

- [ ] **Step 3: Implement the temporary imperative ports (2-5 minutes)**

```ts
export type WebViewSessionClearReason = 'logout' | 'account_switch';

export interface WebViewSessionControl {
  clearSession(reason: WebViewSessionClearReason): Promise<void>;
}

let activeControl: WebViewSessionControl | null = null;

export function registerWebViewSessionControl(control: WebViewSessionControl): () => void {
  activeControl = control;
  return () => {
    if (activeControl === control) activeControl = null;
  };
}

export const clearRegisteredWebViewSession = (reason: WebViewSessionClearReason) =>
  activeControl?.clearSession(reason) ?? Promise.resolve();
```

Implement the four `SessionSyncPort` methods in `PccuSyncEngine`. Store a transition state of `'open' | 'blocked' | 'reset'`; create sanitized `SessionTransitionError` values; drain the heap into a local array before rejecting callers so re-entrant callbacks cannot corrupt iteration.

- [ ] **Step 4: Register an isolated, resettable WebView session (2-5 minutes)**

In `GlobalScraperWebView`, enable `incognito` and `cacheEnabled={false}` for the hidden scraper. The registered `clearSession` implementation must stop loading, clear the active timer/pending request, blank the credential ref, clear local/session storage through injected JavaScript, call `clearCache(true)` and `clearHistory()` when available, increment a `sessionEpoch` key to remount the WebView, and await the next blank-page `onLoadEnd`. Repeating the operation must resolve without error.

- [ ] **Step 5: Verify lifecycle behavior and commit (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/pccu/engine/__tests__/PccuSyncEngine.test.ts src/core/sync/webview/__tests__/webViewSessionControl.test.ts src/features/pccu/engine/__tests__/GlobalScraperWebView.test.tsx
npm.cmd run typecheck
git add src/core/sync/webview/webViewSessionControl.ts src/core/sync/webview/__tests__/webViewSessionControl.test.ts src/features/pccu/engine/PccuSyncEngine.ts src/features/pccu/engine/__tests__/PccuSyncEngine.test.ts src/features/pccu/engine/GlobalScraperWebView.tsx
git commit -m "feat: add session transition controls"
```

### Task 13: Make logout and account switching one ordered cleanup transaction

**Files:**

- Create: `src/core/session/AppSessionCoordinator.ts`
- Create: `src/core/session/__tests__/AppSessionCoordinator.test.ts`
- Create: `src/composition/appSession.ts`
- Modify: `src/features/schedule/storage/scheduleStorage.ts`
- Modify: `src/features/grade/storage/gradeStorage.ts`
- Modify: `src/features/traffic/storage/trafficStorage.ts`
- Modify: `src/features/tutoring/storage/tutoringStorage.ts`
- Modify: `src/features/schedule/store/useScheduleStore.ts`
- Modify: `src/features/grade/store/useGradeStore.ts`
- Modify: `src/features/tutoring/store/useTutoringStore.ts`

- [ ] **Step 1: Write ordered cleanup and all-settled tests (2-5 minutes)**

Use injected fake ports and record call order. Assert: sync blocks first; active/queue abort precedes WebView reset; all persistent clear targets run even when one rejects; every store reset runs; failed persistent cleanup leaves synchronization blocked and returns a retryable `SessionCleanupError`; a successful retry resets and reopens sync; two concurrent transitions share one promise.

- [ ] **Step 2: Run the coordinator test to verify red (2-5 minutes)**

Run `npm.cmd test -- --runInBand --runTestsByPath src/core/session/__tests__/AppSessionCoordinator.test.ts`.

Expected: FAIL because the coordinator does not exist.

- [ ] **Step 3: Implement explicit ports and transition semantics (2-5 minutes)**

```ts
export type SessionTransitionReason = 'logout' | 'account_switch';

export interface SessionSyncPort {
  blockNewRequests(reason: SessionTransitionReason): void;
  abortActiveAndRejectQueue(reason: SessionTransitionReason): void;
  resetAfterSessionChange(): void;
  allowNewRequests(): void;
}

export interface SessionCleanupPorts {
  sync: SessionSyncPort;
  clearWebView(reason: SessionTransitionReason): Promise<void>;
  clearActiveCredentials(): void;
  clearPersistentCredentials(): Promise<void>;
  clearProfile(): Promise<void>;
  clearFeatureCaches(): Promise<void>;
  resetFeatureStores(): void;
}

export class AppSessionCoordinator {
  constructor(private readonly ports: SessionCleanupPorts) {}
  transition(reason: SessionTransitionReason): Promise<void>;
}
```

`transition` must memoize one in-flight promise. In the transaction call `blockNewRequests`, `abortActiveAndRejectQueue`, then `clearActiveCredentials`. Run WebView, persistent credential, profile, and feature-cache clears with `Promise.allSettled`; always call `resetFeatureStores`. If any clear rejected, throw a sanitized `SessionCleanupError` and keep requests blocked. Otherwise call `resetAfterSessionChange` followed by `allowNewRequests`. Clear the memoized promise in `finally` so retry is possible.

- [ ] **Step 4: Build the concrete legacy composition (2-5 minutes)**

`src/composition/appSession.ts` must adapt only public functions: `PccuSyncEngine.getInstance()`, `clearRegisteredWebViewSession`, `credentialVault`, `clearCourses`, `clearGrades`, `clearTrafficSnapshot`, and tutoring `clearAll`. Add `resetData()` actions to schedule, grade, and tutoring stores that return data plus sync state to initial values; call them through `useXStore.getState().resetData()`. Change every storage clear to propagate deletion failures rather than logging-and-resolving.

- [ ] **Step 5: Run session, storage, and boundary tests and commit (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/core/session/__tests__/AppSessionCoordinator.test.ts src/features/auth/infrastructure/__tests__/SecureStoreCredentialVault.test.ts src/features/pccu/engine/__tests__/PccuSyncEngine.test.ts
npm.cmd run lint:boundaries
npm.cmd run typecheck
git add src/core/session src/composition/appSession.ts src/features/schedule/storage/scheduleStorage.ts src/features/grade/storage/gradeStorage.ts src/features/traffic/storage/trafficStorage.ts src/features/tutoring/storage/tutoringStorage.ts src/features/schedule/store/useScheduleStore.ts src/features/grade/store/useGradeStore.ts src/features/tutoring/store/useTutoringStore.ts
git commit -m "feat: coordinate account session cleanup"
```

### Task 14: Centralize redacted logging and root crash recovery

**Files:**

- Create: `src/shared/observability/redaction.ts`
- Create: `src/shared/observability/logger.ts`
- Create: `src/shared/observability/errorReporting.ts`
- Create: `src/shared/observability/__tests__/redaction.test.ts`
- Modify: `src/shared/utils/logger.ts`
- Modify: `src/shared/utils/__tests__/logger.test.ts`
- Modify: `src/shared/components/ErrorBoundary.tsx`
- Create: `src/shared/components/__tests__/ErrorBoundary.test.tsx`
- Create: `src/composition/AppCompositionRoot.tsx`
- Create: `src/composition/RootNavigation.tsx`
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Write redaction and recovery tests first (2-5 minutes)**

Assert recursive objects redact keys matching `account`, `password`, `credential`, `cookie`, `html`, `payload`, and `messagePayload`; URLs retain only scheme plus hostname; arrays are traversed; circular values become `[Circular]`. Render an ErrorBoundary child that throws and assert the UI shows `畫面暫時無法顯示` plus `重試`, never the thrown secret or component stack; pressing retry remounts the child.

- [ ] **Step 2: Run the new suites to verify red (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/shared/observability/__tests__/redaction.test.ts src/shared/components/__tests__/ErrorBoundary.test.tsx
```

Expected: missing modules and current secret-bearing fallback output cause failure.

- [ ] **Step 3: Implement structured, sanitized observability (2-5 minutes)**

Expose this surface from `src/shared/observability/logger.ts`:

```ts
export type LogLevel = 'debug' | 'warn' | 'error';
export type LogEvent = Readonly<{
  event: string;
  scope: string;
  fields?: Readonly<Record<string, unknown>>;
}>;

export interface AppLogger {
  debug(event: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(event: string, fields?: Readonly<Record<string, unknown>>): void;
  error(event: string, fields?: Readonly<Record<string, unknown>>): void;
}
```

Every sink receives `redactLogValue(event)` first. `errorReporting.ts` accepts `{ errorName, boundary, retryCount }`, never raw error messages/stacks. Keep `src/shared/utils/logger.ts` as a temporary named re-export so current imports remain green; migrate raw console calls encountered in the touched files.

- [ ] **Step 4: Make the root export composition-only (2-5 minutes)**

Move the current notification handler, theme/navigation providers, Stack configuration, hidden scraper, and tutoring warmup into `RootNavigation.tsx`. `AppCompositionRoot.tsx` renders `ThemeProvider`, the root ErrorBoundary, and `RootNavigation`. Reduce `app/_layout.tsx` to:

```ts
export { default } from '../src/composition/AppCompositionRoot';
```

The ErrorBoundary fallback has a local retry counter/key, invokes the sanitized reporter in `componentDidCatch`, and shows no stack in production or development UI.

- [ ] **Step 5: Run root/observability verification and commit (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/shared/observability/__tests__/redaction.test.ts src/shared/components/__tests__/ErrorBoundary.test.tsx src/shared/utils/__tests__/logger.test.ts
npm.cmd run typecheck
npm.cmd run export:smoke
git add src/shared/observability src/shared/utils/logger.ts src/shared/utils/__tests__/logger.test.ts src/shared/components/ErrorBoundary.tsx src/shared/components/__tests__/ErrorBoundary.test.tsx src/composition/AppCompositionRoot.tsx src/composition/RootNavigation.tsx app/_layout.tsx
git commit -m "feat: add redacted root error handling"
```

### Task 15: Cut every session entry point over and pass Phase 0 acceptance

**Files:**

- Modify: `src/features/settings/screens/SettingsScreen.tsx`
- Modify: `src/features/settings/screens/SecurityScreen.tsx`
- Modify: `src/features/auth/screens/LoginScreen.tsx`
- Modify: `src/features/auth/services/authService.ts`
- Create: `src/features/auth/__tests__/sessionEntryPoints.test.tsx`
- Create: `docs/testing/phase-0-expo-go-checklist.md`
- Create: `docs/verification/myccu-refactor-phase-0.md`

- [ ] **Step 1: Write the session-entry integration tests first (2-5 minutes)**

Mock `appSessionCoordinator`, the vault, router, and login request. Assert both logout buttons await `transition('logout')` before navigating; failed cleanup stays on screen with a retry action; logging into a different saved account awaits `transition('account_switch')` before the network login; same-account login does not transition; no test snapshot or log contains the account/password.

- [ ] **Step 2: Run the integration test to verify red (2-5 minutes)**

Run `npm.cmd test -- --runInBand --runTestsByPath src/features/auth/__tests__/sessionEntryPoints.test.tsx`.

Expected: current screens call `logoutPCCU` directly and login has no pre-auth account-switch transaction.

- [ ] **Step 3: Route UI entry points through the coordinator (2-5 minutes)**

In both settings screens, call `await appSessionCoordinator.transition('logout')`, then `router.replace('/login')`. Keep the button disabled while the transition is in flight and show the existing sanitized error style with `重試清除` on `SessionCleanupError`.

Before `loginPCCU`, normalize the typed account, compare it with `credentialVault.getActive()?.account ?? (await credentialVault.getSaved())?.account`, and await `transition('account_switch')` only when both accounts exist and differ. `authService.logoutPCCU` remains a deprecated compatibility wrapper that delegates to the coordinator; add a removal comment naming Phase 4, and forbid new screen imports with a source-boundary test.

- [ ] **Step 4: Run the full automated Phase 0 gate (5-15 minutes)**

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run lint:boundaries
npm.cmd run format:check
npm.cmd run coverage:ci
npm.cmd run export:smoke
npm.cmd run verify
npm.cmd audit --omit=dev
```

Expected: plain install succeeds; every gate exits 0; coverage meets the committed ratchet; export completes offline; the audit output matches the reviewed triage document with no unreviewed reachable critical issue. Do not use `npm audit fix --force`.

- [ ] **Step 5: Complete the Expo Go checklist (10-20 minutes)**

Write and execute `docs/testing/phase-0-expo-go-checklist.md` with these exact checks on iOS or Android: cold remembered login; fresh login without remember; fresh login with remember; Grade/Schedule/Traffic/Tutoring sync; background/foreground during active sync; blocked HTTP/deceptive redirect using the test switch; logout during queued sync; relaunch after logout; account A to account B switch; cleanup-failure retry; dark/light ErrorBoundary recovery test switch. Expo Go must remain the development acceptance target; notification delivery limitations and production signing remain EAS preview checks.

- [ ] **Step 6: Record sanitized evidence and commit (2-5 minutes)**

Create `docs/verification/myccu-refactor-phase-0.md` with commit SHA, command results, coverage, reviewed audit counts, device OS, Expo Go version, and checklist pass/fail. Include no account, password, HTML, course content, full URL query, or message payload.

```powershell
git add src/features/settings/screens/SettingsScreen.tsx src/features/settings/screens/SecurityScreen.tsx src/features/auth/screens/LoginScreen.tsx src/features/auth/services/authService.ts src/features/auth/__tests__/sessionEntryPoints.test.tsx docs/testing/phase-0-expo-go-checklist.md docs/verification/myccu-refactor-phase-0.md
git commit -m "docs: record Phase 0 security acceptance"
```

## Completion criteria

- Plain `npm.cmd ci` is reproducible and the strict, lint, boundary, formatting, coverage, CI, and offline export gates pass.
- Credentials are written only to SecureStore; the legacy AsyncStorage mirror can only be deleted.
- The hidden WebView allows only the five explicit HTTPS hosts and rejects unbound/stale messages before timers, state, persistence, or settlement.
- Logout and account switching block new work, settle all callers, reset the isolated WebView session, clear credentials/caches/stores with retryable all-settled semantics, and only then navigate.
- Logs and root crash UI expose no credentials, HTML, payloads, query strings, or component stacks.
- The complete Phase 0 Expo Go checklist passes without introducing a custom-development-client-only dependency.
