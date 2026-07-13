# MyCCU Phase 3 Repositories and Reactive State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make versioned, account-scoped repositories the only persistence owners, publish reactive feature state only after a promoted commit, and eliminate cross-account cache leakage and repeat hydration.

**Architecture:** Phase 3 keeps the Phase 1 `SyncCoordinator`/`SyncOutcome` and every Phase 2 workflow payload intact, then inserts a typed commit registry between workflow completion and coordinator success. Feature committers normalize stable IDs, promote repository generations, publish one Zustand snapshot, and run post-commit effects; bootstrap migrates legacy keys and hydrates every repository once for the active opaque account scope.

**Tech Stack:** Expo SDK 54, TypeScript 5.9 strict mode, `expo-crypto`, `@react-native-async-storage/async-storage`, Zustand 5, React 19 `useSyncExternalStore`, Jest 29, React Native Testing Library, Expo Go.

---

## Phase boundary and authoritative handoff

Implement this plan only after Phases 0, 1, 2A, 2B, and 2C are merged and their automated plus Expo Go checkpoints pass.

- Phase 0 supplies the SecureStore-only `CredentialVault`, `AppSessionCoordinator`, structured logger, strict CI scripts, and `expo-crypto` installed with the Expo SDK-compatible range.
- Phase 1 supplies `SyncContractMap`, `SyncPolicy`, `SyncOutcome`, `SyncError`, `SyncCoordinator`, `requestReducer`, immutable request snapshots/selectors, cancellation, coalescing, generation safety, and background semantics. Extend those modules; do not create a second queue or result union.
- Phase 2A supplies `GradeSyncPayload`, `TrafficSnapshot`, the Traffic/Grade workflows, and `runGradeSync`/`runTrafficSync` compatibility application functions.
- Phase 2B supplies `CourseData`, `ScheduleSyncPayload = { courses: CourseData[]; updatedAt: number }`, `runScheduleSync(deps, policy)`, the Schedule workflow, and `src/features/schedule/index.ts`.
- Phase 2C supplies `CourseCode`, `TutoringOverviewPayload = { courses; allAssignments; pendingAssignments; semester; welcome; updatedAt }`, `TutoringCourseDetailPayload = { courseCode; detail; updatedAt }`, `runTutoringOverviewSync(deps, policy)`, `runTutoringDetailSync(deps, courseCode, policy)`, and the download/upload workflow outputs. Download and upload remain non-persistent commands.
- Keep all Phase 2 workflow/protocol/parser modules free of AsyncStorage and Zustand. This phase changes the application commit boundary, repositories, state projection, bootstrap, and consumers only.
- `CourseId` and `SemesterId` are created in this phase. Phase 2 workflow payloads remain raw remote data; repository normalization adds the stable IDs before persistence and store publication. Phase 4 routes consume those IDs and must not add a second migration.

Run this pre-flight after merging Phase 2C:

```powershell
npm.cmd run verify
rg -n "interface ScheduleSyncPayload|interface TutoringOverviewPayload|interface TutoringCourseDetailPayload|type SyncOutcome|class SyncCoordinator" src
rg -n "run(Grade|Schedule|Traffic|TutoringOverview|TutoringDetail)Sync" src/features
```

Expected: `verify` exits 0; each payload/result/coordinator name has one authoritative definition; all five application sync functions are present; no workflow imports a feature storage or store module.

## Locked ownership rules

1. Raw account text is normalized, hashed with Expo Crypto SHA-256, truncated to 32 lowercase hexadecimal characters, and then discarded at the cache boundary. Raw account text never appears in cache keys, logs, Zustand, route params, or debug events.
2. `CourseId` hashes normalized `{ name, teacher, dayOfWeek, startPeriod, endPeriod }`; `SemesterId` hashes the normalized semester title. Both are the first 32 lowercase hex characters of SHA-256.
3. Grade, Schedule, and Traffic use one `SnapshotEnvelope<T>` per generation. Tutoring uses generation-scoped chunks plus a promoted generation manifest.
4. Staging writes happen before the `active` pointer. A failed stage or failed pointer promotion leaves the prior active generation readable and returns a `storage` outcome.
5. The coordinator does not enter `succeeded` until its registered feature committer has validated, committed, read back the promoted generation, published the store, and returned.
6. Feature stores contain data projection only. They do not import repositories and do not own `syncStatus`, `syncPhase`, request deduplication, or refresh errors.
7. Sync lifecycle derives from the Phase 1 request snapshot. Background/warmup failures remain observable there but do not become the foreground screen's user error.
8. Bootstrap runs legacy migration and repository hydration once per `accountScope` per app process. Screens, Home focus, hooks, and warmup components never rehydrate storage.
9. Logout and account switching abort browser work first, then purge every repository for the old scope and reset every store before credentials are deleted and a new scope can activate.

## File responsibility map

### Core storage, identity, and coordinator

- Create `src/core/crypto/sha256.ts` — Expo Go-compatible lowercase SHA-256/32 helper.
- Create `src/core/session/accountScope.ts` — account normalization, branded `AccountScope`, and active-scope session.
- Create `src/core/storage/generationStorage.ts` — injected key-value port, envelope/pointer validation, stage/promote/readback/GC/purge.
- Create `src/core/sync/SyncCommitterRegistry.ts` — typed kind-to-committer registry.
- Modify `src/core/sync/SyncCoordinator.ts`, `requestReducer.ts`, and `requestSelectors.ts` — delay terminal success through commit, retain request reason, and expose presentation selectors.
- Create `src/core/sync/useSyncStatus.ts` — React subscription to the existing coordinator snapshot source.

### Feature repositories and state

- Create `src/features/{grade,schedule,traffic,tutoring}/application/*Repository.ts` — feature-owned repository ports and snapshot payloads.
- Create `src/features/{grade,schedule,traffic}/infrastructure/repository/AsyncStorage*Repository.ts` — simple generation repositories.
- Create `src/features/tutoring/infrastructure/repository/AsyncStorageTutoringRepository.ts` — chunk/manifest repository.
- Create `src/features/grade/domain/semesterId.ts` and `src/features/schedule/domain/courseId.ts` — pure normalization plus injected hash derivation.
- Create `src/features/{grade,schedule,traffic,tutoring}/state/*Store.ts` — data-only Zustand projection and public selectors.
- Modify each feature `index.ts`, application sync use case, hook, and screen consumer to use the public state/use-case surface.
- Delete `src/features/{grade,schedule,traffic,tutoring}/storage/*Storage.ts` and the old `store/use*Store.ts` files after every caller has moved.

### Composition, migration, bootstrap, and session cleanup

- Create `src/composition/AppRuntimeContext.tsx` and `src/composition/createAppRuntime.ts` — concrete repositories, committers, coordinator, account-scope session, and application use cases.
- Create `src/composition/legacyCacheMigration.ts` — one-shot valid/invalid legacy-key migration.
- Create `src/composition/appDataBootstrap.ts` — coalesced once-per-scope hydration and store publication.
- Modify `src/composition/AppCompositionRoot.tsx`, `src/composition/appSession.ts`, and `src/core/session/AppSessionCoordinator.ts` — provide runtime and purge old-scope data in the ordered session transaction.
- Modify `app/index.tsx`, `LoadingScreen.tsx`, `LoginScreen.tsx`, Home, feature screens, Tutoring warmup, Settings, and notification scheduling to consume runtime/public selectors without storage reads.

### Tests

- Add unit tests beside every identity, generation-storage, repository, store, committer, migration, and bootstrap module.
- Add integration tests for workflow → committing → repository promotion → store publication, notification post-commit ordering, account isolation, interrupted tutoring promotion, and logout all-settled purge.
- Add source-boundary tests proving only repository/migration infrastructure imports feature AsyncStorage data.

### Task 1: Derive opaque account scopes and stable domain IDs with Expo Crypto

**Files:**
- Create: `src/core/crypto/sha256.ts`
- Create: `src/core/crypto/__tests__/sha256.test.ts`
- Create: `src/core/session/accountScope.ts`
- Create: `src/core/session/__tests__/accountScope.test.ts`
- Modify: `src/features/grade/domain/types.ts`
- Create: `src/features/grade/domain/semesterId.ts`
- Create: `src/features/grade/domain/__tests__/semesterId.test.ts`
- Modify: `src/features/schedule/domain/types.ts`
- Create: `src/features/schedule/domain/courseId.ts`
- Create: `src/features/schedule/domain/__tests__/courseId.test.ts`

- [ ] **Step 1: Write failing normalization and SHA-256 contract tests (2-5 minutes)**

Use an injected hasher for domain tests and mock only the Expo call at the core boundary:

```ts
import * as Crypto from 'expo-crypto';
import { deriveAccountScope, normalizeAccount } from '../accountScope';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  CryptoEncoding: { HEX: 'hex' },
  digestStringAsync: jest.fn(async () =>
    '217765c87a49f91b4b4a4854ed5351f2a5db92b5a503dcea42ebcf1e0d7d8523'),
  randomUUID: jest.fn(() => '00000000-0000-4000-8000-000000000001'),
}));

it('normalizes the account and keeps only 32 lowercase SHA-256 hex characters', async () => {
  expect(normalizeAccount('  ｂ４１２３４５６  ')).toBe('B4123456');
  await expect(deriveAccountScope('  ｂ４１２３４５６  ')).resolves.toBe(
    '217765c87a49f91b4b4a4854ed5351f2',
  );
  expect(Crypto.digestStringAsync).toHaveBeenCalledWith(
    Crypto.CryptoDigestAlgorithm.SHA256,
    'B4123456',
    { encoding: Crypto.CryptoEncoding.HEX },
  );
});
```

```ts
const hash = jest.fn(async (canonical: string) =>
  canonical.includes('dayOfWeek')
    ? '70f6d1d3594d424c92f87657abe1d0d0'
    : '246583c1eb37a6dd1746a77ee91eef76',
);

it('hashes only the normalized stable course fields', async () => {
  const id = await deriveCourseId({
    name: '  計算機概論 ', teacher: '王老師', location: '大恩 305', required: true,
    type: '必修', dayOfWeek: 1, periodRange: '星期一 第 1-2 節', startPeriod: 1, endPeriod: 2,
  }, hash);
  expect(hash).toHaveBeenCalledWith(JSON.stringify({
    name: '計算機概論', teacher: '王老師', dayOfWeek: 1, startPeriod: 1, endPeriod: 2,
  }));
  expect(id).toBe('70f6d1d3594d424c92f87657abe1d0d0');
});

it('normalizes a semester title before hashing it', async () => {
  await expect(deriveSemesterId('  １１３學年度 第１學期 ', hash)).resolves.toBe(
    '246583c1eb37a6dd1746a77ee91eef76',
  );
  expect(hash).toHaveBeenCalledWith('113學年度 第1學期');
});
```

- [ ] **Step 2: Run the focused suites and verify RED (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/core/session/__tests__/accountScope.test.ts src/features/schedule/domain/__tests__/courseId.test.ts src/features/grade/domain/__tests__/semesterId.test.ts
```

Expected: FAIL with missing-module errors for `accountScope`, `courseId`, and `semesterId`.

- [ ] **Step 3: Add the Expo Crypto helper and branded active-scope session (2-5 minutes)**

```ts
// src/core/crypto/sha256.ts
import * as Crypto from 'expo-crypto';

export type Hash32 = (canonical: string) => Promise<string>;

export const isHex32 = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);

export const sha256Hex32: Hash32 = async (canonical) => {
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    canonical,
    { encoding: Crypto.CryptoEncoding.HEX },
  );
  return digest.toLowerCase().slice(0, 32);
};

export const createStorageGeneration = (updatedAt: number): string =>
  `${updatedAt}-${Crypto.randomUUID()}`;
```

```ts
// src/core/session/accountScope.ts
import { isHex32, sha256Hex32, type Hash32 } from '../crypto/sha256';

declare const accountScopeBrand: unique symbol;
export type AccountScope = string & { readonly [accountScopeBrand]: 'AccountScope' };

export const normalizeAccount = (account: string): string =>
  account.normalize('NFKC').replace(/\s+/g, '').trim().toUpperCase();

export const toAccountScope = (value: string): AccountScope => {
  if (!isHex32(value)) throw new Error('invalid_account_scope');
  return value as AccountScope;
};

export const deriveAccountScope = async (
  account: string,
  hash: Hash32 = sha256Hex32,
): Promise<AccountScope> => {
  const normalized = normalizeAccount(account);
  if (!normalized) throw new Error('empty_account');
  return toAccountScope(await hash(normalized));
};

export class AccountScopeSession {
  private active: AccountScope | null = null;

  async activate(account: string): Promise<AccountScope> {
    this.active = await deriveAccountScope(account);
    return this.active;
  }

  getActive(): AccountScope | null {
    return this.active;
  }

  requireActive(): AccountScope {
    if (!this.active) throw new Error('account_scope_unavailable');
    return this.active;
  }

  clear(): void {
    this.active = null;
  }
}
```

- [ ] **Step 4: Add CourseId/SemesterId normalization without changing Phase 2 payloads (2-5 minutes)**

Append these types to the feature domain contracts:

```ts
// schedule/domain/types.ts
declare const courseIdBrand: unique symbol;
export type CourseId = string & { readonly [courseIdBrand]: 'CourseId' };
export type ScheduleCourse = CourseData & { id: CourseId };

// grade/domain/types.ts
declare const semesterIdBrand: unique symbol;
export type SemesterId = string & { readonly [semesterIdBrand]: 'SemesterId' };
export type IdentifiedSemesterGrade = SemesterGrade & { id: SemesterId };
```

Create the derivation modules:

```ts
// schedule/domain/courseId.ts
import { isHex32, sha256Hex32, type Hash32 } from '../../../core/crypto/sha256';
import type { CourseData, CourseId } from './types';

const normalize = (value: string) => value.normalize('NFKC').replace(/\s+/g, ' ').trim();

export const courseIdentityCanonical = (course: CourseData): string => JSON.stringify({
  name: normalize(course.name),
  teacher: normalize(course.teacher),
  dayOfWeek: course.dayOfWeek,
  startPeriod: course.startPeriod,
  endPeriod: course.endPeriod,
});

export const deriveCourseId = async (
  course: CourseData,
  hash: Hash32 = sha256Hex32,
): Promise<CourseId> => {
  const value = await hash(courseIdentityCanonical(course));
  if (!isHex32(value)) throw new Error('invalid_course_id');
  return value as CourseId;
};

export const parseCourseId = (value: string): CourseId | null =>
  /^[0-9a-f]{32}$/.test(value) ? value as CourseId : null;
```

```ts
// grade/domain/semesterId.ts
import { isHex32, sha256Hex32, type Hash32 } from '../../../core/crypto/sha256';
import type { SemesterId } from './types';

export const normalizeSemesterTitle = (title: string): string =>
  title.normalize('NFKC').replace(/\s+/g, ' ').trim();

export const deriveSemesterId = async (
  title: string,
  hash: Hash32 = sha256Hex32,
): Promise<SemesterId> => {
  const value = await hash(normalizeSemesterTitle(title));
  if (!isHex32(value)) throw new Error('invalid_semester_id');
  return value as SemesterId;
};

export const parseSemesterId = (value: string): SemesterId | null =>
  /^[0-9a-f]{32}$/.test(value) ? value as SemesterId : null;
```

- [ ] **Step 5: Run identity tests, strict typecheck, and commit (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/core/crypto/__tests__/sha256.test.ts src/core/session/__tests__/accountScope.test.ts src/features/schedule/domain/__tests__/courseId.test.ts src/features/grade/domain/__tests__/semesterId.test.ts
npm.cmd run typecheck
git add src/core/crypto src/core/session/accountScope.ts src/core/session/__tests__/accountScope.test.ts src/features/grade/domain src/features/schedule/domain
git commit -m "feat(data): derive opaque account and domain ids"
```

Expected: all four suites pass; TypeScript exits 0; IDs are 32 lowercase hex characters; raw Phase 2 `ScheduleSyncPayload` and `GradeSyncPayload` remain source-compatible.

### Task 2: Build the generic generation storage primitive

**Files:**
- Create: `src/core/storage/generationStorage.ts`
- Create: `src/core/storage/__tests__/generationStorage.test.ts`

- [ ] **Step 1: Write failing promotion, isolation, corruption, and GC tests (2-5 minutes)**

Use a Map-backed `KeyValueStorage` fake with configurable failures. Cover these exact behaviors:

```ts
it('writes the generation before promoting active and reads the promoted envelope back', async () => {
  const committed = await subject('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa').commit({
    payload: { value: 'new' }, source: 'remote', updatedAt: 100,
  });
  expect(writes.map(([key]) => key)).toEqual([
    'myccu:v2:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:grade:generation:100-g1',
    'myccu:v2:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:grade:active',
  ]);
  expect(committed).toMatchObject({
    schemaVersion: 2, generation: '100-g1', payload: { value: 'new' },
  });
});

it('preserves the previous active pointer when promotion rejects', async () => {
  await subject(scope).commit({ payload: { value: 'old' }, source: 'remote', updatedAt: 10 });
  storage.failSetKey = `myccu:v2:${scope}:grade:active`;
  await expect(subject(scope).commit({
    payload: { value: 'new' }, source: 'remote', updatedAt: 20,
  })).rejects.toMatchObject({ code: 'storage' });
  storage.failSetKey = null;
  await expect(subject(scope).read()).resolves.toMatchObject({ payload: { value: 'old' } });
});

it('never reads another account scope and clears a corrupt active pointer', async () => {
  await subject(scopeA).commit({ payload: { value: 'A' }, source: 'remote', updatedAt: 10 });
  await expect(subject(scopeB).read()).resolves.toBeNull();
  values.set(`myccu:v2:${scopeA}:grade:active`, '{bad-json');
  await expect(subject(scopeA).read()).resolves.toBeNull();
  expect(values.has(`myccu:v2:${scopeA}:grade:active`)).toBe(false);
});
```

Also assert staging failure never writes `active`, successful promotion removes non-active generation keys, purge removes only the selected scope/feature prefix, and no generated key contains `B4123456`.

- [ ] **Step 2: Run the storage suite and verify RED (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/core/storage/__tests__/generationStorage.test.ts
```

Expected: FAIL because `generationStorage.ts` does not exist.

- [ ] **Step 3: Define the envelope, pointer, key-value port, and validated key builder (2-5 minutes)**

```ts
import { SyncError } from '../sync/contracts';
import { isHex32 } from '../crypto/sha256';
import type { AccountScope } from '../session/accountScope';

export type SnapshotSource = 'remote' | 'legacy-migration';

export type SnapshotEnvelope<T> = Readonly<{
  schemaVersion: 2;
  accountScope: AccountScope;
  generation: string;
  source: SnapshotSource;
  updatedAt: number;
  payload: T;
}>;

export type ActiveGenerationPointer = Readonly<{
  schemaVersion: 2;
  accountScope: AccountScope;
  feature: string;
  generation: string;
}>;

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
  multiRemove(keys: readonly string[]): Promise<void>;
}

export type PayloadDecoder<T> = (value: unknown) => T | null;

const parseJson = (raw: string): unknown => {
  try { return JSON.parse(raw) as unknown; } catch { return null; }
};

const storageFailure = (message: string) =>
  new SyncError('storage', message, { retryable: true });

export const featurePrefix = (scope: AccountScope, feature: string): string => {
  if (!isHex32(scope) || !/^[a-z][a-z0-9-]*$/.test(feature)) {
    throw storageFailure('Invalid repository key identity.');
  }
  return `myccu:v2:${scope}:${feature}`;
};
```

- [ ] **Step 4: Implement stage → promote → readback → best-effort GC (2-5 minutes)**

Add the complete generic class:

```ts
export class GenerationStorage<T> {
  constructor(private readonly options: {
    storage: KeyValueStorage;
    accountScope: AccountScope;
    feature: string;
    decodePayload: PayloadDecoder<T>;
    createGeneration(updatedAt: number): string;
    reportGarbageCollectionError?(error: unknown): void;
  }) {}

  private get prefix() { return featurePrefix(this.options.accountScope, this.options.feature); }
  private get activeKey() { return `${this.prefix}:active`; }
  private generationKey(generation: string) { return `${this.prefix}:generation:${generation}`; }

  private decodePointer(value: unknown): ActiveGenerationPointer | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const item = value as Partial<ActiveGenerationPointer>;
    return item.schemaVersion === 2 &&
      item.accountScope === this.options.accountScope &&
      item.feature === this.options.feature &&
      typeof item.generation === 'string' && item.generation.length > 0
      ? item as ActiveGenerationPointer
      : null;
  }

  private decodeEnvelope(value: unknown, generation: string): SnapshotEnvelope<T> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const item = value as Partial<SnapshotEnvelope<unknown>>;
    const payload = this.options.decodePayload(item.payload);
    return item.schemaVersion === 2 &&
      item.accountScope === this.options.accountScope &&
      item.generation === generation &&
      (item.source === 'remote' || item.source === 'legacy-migration') &&
      typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt) &&
      payload !== null
      ? { ...item, payload } as SnapshotEnvelope<T>
      : null;
  }

  async read(): Promise<SnapshotEnvelope<T> | null> {
    let rawPointer: string | null;
    try { rawPointer = await this.options.storage.getItem(this.activeKey); }
    catch { throw storageFailure(`${this.options.feature} active pointer read failed.`); }
    if (!rawPointer) return null;

    const pointer = this.decodePointer(parseJson(rawPointer));
    if (!pointer) {
      await this.options.storage.removeItem(this.activeKey).catch(() => {
        throw storageFailure(`${this.options.feature} corrupt pointer cleanup failed.`);
      });
      return null;
    }

    let rawEnvelope: string | null;
    try { rawEnvelope = await this.options.storage.getItem(this.generationKey(pointer.generation)); }
    catch { throw storageFailure(`${this.options.feature} generation read failed.`); }
    const envelope = rawEnvelope
      ? this.decodeEnvelope(parseJson(rawEnvelope), pointer.generation)
      : null;
    if (envelope) return envelope;

    await this.options.storage.removeItem(this.activeKey).catch(() => {
      throw storageFailure(`${this.options.feature} corrupt generation cleanup failed.`);
    });
    return null;
  }

  async commit(input: {
    payload: T;
    source: SnapshotSource;
    updatedAt: number;
  }): Promise<SnapshotEnvelope<T>> {
    const payload = this.options.decodePayload(input.payload);
    if (payload === null || !Number.isFinite(input.updatedAt)) {
      throw storageFailure(`${this.options.feature} payload validation failed.`);
    }
    const generation = this.options.createGeneration(input.updatedAt);
    const envelope: SnapshotEnvelope<T> = {
      schemaVersion: 2,
      accountScope: this.options.accountScope,
      generation,
      source: input.source,
      updatedAt: input.updatedAt,
      payload,
    };
    const pointer: ActiveGenerationPointer = {
      schemaVersion: 2,
      accountScope: this.options.accountScope,
      feature: this.options.feature,
      generation,
    };

    try {
      await this.options.storage.setItem(this.generationKey(generation), JSON.stringify(envelope));
      await this.options.storage.setItem(this.activeKey, JSON.stringify(pointer));
    } catch {
      throw storageFailure(`${this.options.feature} generation promotion failed.`);
    }

    const promoted = await this.read();
    if (!promoted || promoted.generation !== generation) {
      throw storageFailure(`${this.options.feature} promoted generation readback failed.`);
    }
    await this.garbageCollect(generation).catch(
      this.options.reportGarbageCollectionError ?? (() => undefined),
    );
    return promoted;
  }

  private async garbageCollect(activeGeneration: string): Promise<void> {
    const keys = await this.options.storage.getAllKeys();
    const generationPrefix = `${this.prefix}:generation:`;
    const stale = keys.filter(
      (key) => key.startsWith(generationPrefix) && key !== this.generationKey(activeGeneration),
    );
    if (stale.length) await this.options.storage.multiRemove(stale);
  }

  async purge(): Promise<void> {
    const keys = await this.options.storage.getAllKeys();
    const targets = keys.filter(
      (key) => key === this.activeKey || key.startsWith(`${this.prefix}:generation:`),
    );
    if (targets.length) await this.options.storage.multiRemove(targets);
  }
}
```

- [ ] **Step 5: Run the focused suite, typecheck, and commit (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/core/storage/__tests__/generationStorage.test.ts
npm.cmd run typecheck
git add src/core/storage
git commit -m "feat(data): add atomic generation storage"
```

Expected: all storage tests pass; a failed promotion reads the previous envelope; corrupt pointers return `null`; account A and account B never share keys.

### Task 3: Delay coordinator success through a typed commit registry

**Files:**
- Create: `src/core/sync/SyncCommitterRegistry.ts`
- Create: `src/core/sync/__tests__/SyncCommitterRegistry.test.ts`
- Modify: `src/core/sync/SyncCoordinator.ts`
- Modify: `src/core/sync/requestReducer.ts`
- Modify: `src/core/sync/requestSelectors.ts`
- Create: `src/core/sync/useSyncStatus.ts`
- Create: `src/core/sync/__tests__/SyncCoordinator.commit.test.ts`
- Create: `src/core/sync/__tests__/syncPresentationSelectors.test.ts`

- [ ] **Step 1: Write failing commit-order and storage-failure tests (2-5 minutes)**

```ts
it('enters committing and settles success only after the committer resolves', async () => {
  const order: string[] = [];
  registry.resolve('grade')!.execute = jest.fn(async () => {
    order.push('workflow');
    return { data: gradePayload, updatedAt: 100 };
  });
  committers.register({
    kind: 'grade',
    commit: jest.fn(async () => {
      order.push('commit-start');
      await commitGate.promise;
      order.push('commit-end');
    }),
  });

  const pending = coordinator.request(gradeCommand);
  await flushMicrotasks();
  expect(selectLatestRequestForKind(coordinator.getSnapshot(), 'grade')?.phase).toBe('committing');
  expect(order).toEqual(['workflow', 'commit-start']);

  commitGate.resolve();
  await expect(pending).resolves.toEqual({ ok: true, data: gradePayload, updatedAt: 100 });
  expect(order).toEqual(['workflow', 'commit-start', 'commit-end']);
});

it('maps commit rejection to storage and never publishes coordinator success', async () => {
  committers.register({ kind: 'schedule', commit: async () => { throw new Error('quota'); } });
  await expect(coordinator.request(scheduleCommand)).resolves.toMatchObject({
    ok: false, error: { code: 'storage' },
  });
  expect(selectLatestRequestForKind(coordinator.getSnapshot(), 'schedule')?.phase).toBe('failed');
});
```

Add tests that a stale generation's committer cannot settle the next request, cancellation while committing rejects once, download/upload succeed without a committer, duplicate registrations throw, and the request snapshot retains `reason` for presentation.

- [ ] **Step 2: Run the new suites and verify RED (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/core/sync/__tests__/SyncCommitterRegistry.test.ts src/core/sync/__tests__/SyncCoordinator.commit.test.ts src/core/sync/__tests__/syncPresentationSelectors.test.ts
```

Expected: FAIL because the committer registry and presentation selector do not exist and coordinator currently settles before commit.

- [ ] **Step 3: Add the feature-agnostic typed commit port (2-5 minutes)**

```ts
// src/core/sync/SyncCommitterRegistry.ts
import type { SyncCommand, SyncKind, SyncOutput } from './contracts';

export type SyncCommitContext<K extends SyncKind> = Readonly<{
  command: SyncCommand<K>;
  requestId: string;
  generation: number;
  updatedAt: number;
}>;

export interface SyncCommitter<K extends SyncKind> {
  readonly kind: K;
  commit(data: SyncOutput<K>, context: SyncCommitContext<K>): Promise<void>;
}

export class SyncCommitterRegistry {
  private readonly entries = new Map<SyncKind, SyncCommitter<SyncKind>>();

  register<K extends SyncKind>(committer: SyncCommitter<K>): void {
    if (this.entries.has(committer.kind)) {
      throw new Error(`Sync committer already registered: ${committer.kind}`);
    }
    this.entries.set(committer.kind, committer as SyncCommitter<SyncKind>);
  }

  get<K extends SyncKind>(kind: K): SyncCommitter<K> | null {
    return (this.entries.get(kind) as SyncCommitter<K> | undefined) ?? null;
  }
}
```

- [ ] **Step 4: Carry request reason and await commit before `finishSuccess` (2-5 minutes)**

Add `reason: SyncReason` to `SyncRequestState`, add it to the `queued` event, and dispatch it from `SyncCoordinator.request(command)`. Extend `SyncCoordinatorOptions` with `committers?: SyncCommitterRegistry` and insert this guarded block after workflow execution but before success:

```ts
private async finishExecution(
  active: ActiveExecution,
  execution: WorkflowExecutionResult<unknown>,
): Promise<void> {
  if (!this.isCurrent(active)) return;
  const committer = this.committers.get(active.entry.kind);
  if (committer) {
    this.dispatch(active.entry.requestId, {
      type: 'progress', generation: active.generation, phase: 'committing', at: this.now(),
    });
    try {
      await active.entry.commit(committer, {
        requestId: active.entry.requestId,
        generation: active.generation,
        updatedAt: execution.updatedAt,
      }, execution.data);
    } catch (error) {
      if (!this.isCurrent(active)) return;
      this.finishFailure(active, toSyncError(error, 'storage'));
      return;
    }
  }
  if (!this.isCurrent(active)) return;
  this.finishSuccess(active, execution);
}
```

Create the typed erased closure with each queue entry, beside its existing `run` closure:

```ts
commit: async (committer, identity, data) => {
  await (committer as SyncCommitter<K>).commit(data as SyncOutput<K>, {
    command,
    ...identity,
  });
},
```

Do not catch commit errors inside feature committers. `SyncError` passes through; an unknown commit exception becomes `storage`. Existing timeout, cancellation, background, and coalescing guards remain unchanged.

- [ ] **Step 5: Add central presentation selectors and React subscription (2-5 minutes)**

```ts
// requestSelectors.ts
export type SyncPresentationState = Readonly<{
  phase: SyncRequestPhase | 'idle';
  isRunning: boolean;
  errorCode: SyncErrorCode | null;
}>;

export const selectSyncPresentationState = (
  snapshot: SyncRequestSnapshot,
  kind: SyncKind,
): SyncPresentationState => {
  const requests = [...snapshot.requests.values()]
    .filter((request) => request.kind === kind)
    .sort((left, right) => right.sequence - left.sequence);
  const latest = requests[0];
  const latestUser = requests.find((request) => request.reason === 'user');
  const running = requests.find((request) =>
    ['queued', 'active', 'navigating', 'extracting', 'validating', 'committing'].includes(request.phase),
  );
  return {
    phase: running?.phase ?? latest?.phase ?? 'idle',
    isRunning: !!running,
    errorCode:
      latestUser?.phase === 'failed' || latestUser?.phase === 'cancelled'
        ? latestUser.errorCode
        : null,
  };
};
```

```ts
// useSyncStatus.ts
import { useSyncExternalStore } from 'react';
import type { SyncKind } from './contracts';
import { selectSyncPresentationState, type SyncRequestStateSource } from './requestSelectors';

export const useSyncStatus = (source: SyncRequestStateSource, kind: SyncKind) =>
  useSyncExternalStore(
    source.subscribe.bind(source),
    () => selectSyncPresentationState(source.getSnapshot(), kind),
    () => selectSyncPresentationState(source.getSnapshot(), kind),
  );
```

- [ ] **Step 6: Run every coordinator suite, typecheck, and commit (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand src/core/sync
npm.cmd run typecheck
git add src/core/sync
git commit -m "feat(sync): commit data before coordinator success"
```

Expected: all Phase 1 lifecycle/timeout/background tests remain green; commit tests pass; `committing` is centrally visible; warmup failure does not become the foreground user error.

### Task 4: Add the Grade repository and normalize SemesterId at commit

**Files:**
- Create: `src/features/grade/application/GradeRepository.ts`
- Create: `src/features/grade/infrastructure/repository/AsyncStorageGradeRepository.ts`
- Create: `src/features/grade/infrastructure/repository/__tests__/AsyncStorageGradeRepository.test.ts`

- [ ] **Step 1: Write failing repository normalization and promotion tests (2-5 minutes)**

```ts
it('adds SemesterId to regular and pre-admission semesters before persistence', async () => {
  const snapshot = await repository.commit(scopeA, gradePayload, 'remote');
  expect(snapshot.payload.grades[0]).toMatchObject({
    id: '246583c1eb37a6dd1746a77ee91eef76',
    title: '113學年度 第1學期',
  });
  expect(snapshot.payload.preAdmission[0].id).toMatch(/^[0-9a-f]{32}$/);
  await expect(repository.read(scopeA)).resolves.toEqual(snapshot);
});

it('does not replace the active Grade snapshot when promotion fails', async () => {
  const previous = await repository.commit(scopeA, gradePayload, 'remote');
  storage.failSetKey = `myccu:v2:${scopeA}:grade:active`;
  await expect(repository.commit(scopeA, nextPayload, 'remote')).rejects.toMatchObject({
    code: 'storage',
  });
  storage.failSetKey = null;
  await expect(repository.read(scopeA)).resolves.toEqual(previous);
});
```

Also assert malformed persisted semester IDs invalidate the active snapshot, migration source is preserved, `updatedAt` comes from the Phase 2 payload, and `purge(scopeA)` leaves scope B untouched.

- [ ] **Step 2: Run the Grade repository suite and verify RED (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/grade/infrastructure/repository/__tests__/AsyncStorageGradeRepository.test.ts
```

Expected: FAIL because the repository port and implementation do not exist.

- [ ] **Step 3: Define the feature-owned repository contract (2-5 minutes)**

```ts
// GradeRepository.ts
import type { AccountScope } from '../../../core/session/accountScope';
import type { SnapshotEnvelope, SnapshotSource } from '../../../core/storage/generationStorage';
import type { GradeSyncPayload, IdentifiedSemesterGrade } from '../domain/types';

export type GradeRepositoryPayload = Readonly<{
  grades: readonly IdentifiedSemesterGrade[];
  preAdmission: readonly IdentifiedSemesterGrade[];
}>;

export type GradeSnapshot = SnapshotEnvelope<GradeRepositoryPayload>;

export interface GradeRepository {
  read(accountScope: AccountScope): Promise<GradeSnapshot | null>;
  commit(
    accountScope: AccountScope,
    payload: GradeSyncPayload,
    source?: SnapshotSource,
  ): Promise<GradeSnapshot>;
  purge(accountScope: AccountScope): Promise<void>;
}
```

- [ ] **Step 4: Implement runtime decoding, ID normalization, and generic promotion (2-5 minutes)**

```ts
import type { Hash32 } from '../../../../core/crypto/sha256';
import { createStorageGeneration, sha256Hex32, isHex32 } from '../../../../core/crypto/sha256';
import { GenerationStorage, type KeyValueStorage } from '../../../../core/storage/generationStorage';
import { deriveSemesterId } from '../../domain/semesterId';
import type { GradeSyncPayload, IdentifiedSemesterGrade, SemesterGrade } from '../../domain/types';
import type { GradeRepository, GradeRepositoryPayload, GradeSnapshot } from '../../application/GradeRepository';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const decodeSemester = (value: unknown): IdentifiedSemesterGrade | null => {
  if (!isRecord(value) || !isHex32(value.id) || typeof value.title !== 'string' ||
      !Array.isArray(value.courses) || !isRecord(value.stats)) return null;
  return value as IdentifiedSemesterGrade;
};

export const decodeGradeRepositoryPayload = (value: unknown): GradeRepositoryPayload | null => {
  if (!isRecord(value) || !Array.isArray(value.grades) || !Array.isArray(value.preAdmission)) {
    return null;
  }
  const grades = value.grades.map(decodeSemester);
  const preAdmission = value.preAdmission.map(decodeSemester);
  if (grades.some((item) => !item) || preAdmission.some((item) => !item)) return null;
  return {
    grades: grades as IdentifiedSemesterGrade[],
    preAdmission: preAdmission as IdentifiedSemesterGrade[],
  };
};

const identify = async (items: readonly SemesterGrade[], hash: Hash32) =>
  Promise.all(items.map(async (semester) => ({
    ...semester,
    id: await deriveSemesterId(semester.title, hash),
  })));

export class AsyncStorageGradeRepository implements GradeRepository {
  constructor(private readonly deps: {
    storage: KeyValueStorage;
    hash?: Hash32;
    createGeneration?(updatedAt: number): string;
    reportGarbageCollectionError?(error: unknown): void;
  }) {}

  private generations(accountScope: AccountScope) {
    return new GenerationStorage<GradeRepositoryPayload>({
      storage: this.deps.storage,
      accountScope,
      feature: 'grade',
      decodePayload: decodeGradeRepositoryPayload,
      createGeneration: this.deps.createGeneration ?? createStorageGeneration,
      reportGarbageCollectionError: this.deps.reportGarbageCollectionError,
    });
  }

  read(accountScope: AccountScope): Promise<GradeSnapshot | null> {
    return this.generations(accountScope).read();
  }

  async commit(
    accountScope: AccountScope,
    payload: GradeSyncPayload,
    source: SnapshotSource = 'remote',
  ): Promise<GradeSnapshot> {
    const hash = this.deps.hash ?? sha256Hex32;
    return this.generations(accountScope).commit({
      payload: {
        grades: await identify(payload.grades, hash),
        preAdmission: await identify(payload.preAdmission, hash),
      },
      source,
      updatedAt: payload.updatedAt,
    });
  }

  purge(accountScope: AccountScope): Promise<void> {
    return this.generations(accountScope).purge();
  }
}
```

- [ ] **Step 5: Run the Grade repository and domain suites, then commit (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand src/features/grade/domain src/features/grade/infrastructure/repository
npm.cmd run typecheck
git add src/features/grade/application/GradeRepository.ts src/features/grade/infrastructure/repository
git commit -m "feat(grade): add account scoped repository"
```

Expected: Grade repository tests pass; regular and pre-admission semesters have stable IDs; storage failures preserve the previous snapshot.

### Task 5: Add the Schedule repository and normalize CourseId at commit

**Files:**
- Create: `src/features/schedule/application/ScheduleRepository.ts`
- Create: `src/features/schedule/infrastructure/repository/AsyncStorageScheduleRepository.ts`
- Create: `src/features/schedule/infrastructure/repository/__tests__/AsyncStorageScheduleRepository.test.ts`

- [ ] **Step 1: Write failing CourseId, identity-collision, and account-isolation tests (2-5 minutes)**

```ts
it('normalizes remote courses into stable identified repository data', async () => {
  const snapshot = await repository.commit(scopeA, schedulePayload, 'remote');
  expect(snapshot.payload.courses[0]).toMatchObject({
    id: '70f6d1d3594d424c92f87657abe1d0d0',
    name: '計算機概論',
  });
  expect(snapshot.updatedAt).toBe(schedulePayload.updatedAt);
});

it('changes CourseId only when an identity field changes', async () => {
  const first = await repository.commit(scopeA, schedulePayload, 'remote');
  const sameIdentity = await repository.commit(scopeA, {
    ...schedulePayload,
    courses: [{ ...schedulePayload.courses[0], location: '大義 402', periodRange: '週一 1-2' }],
  }, 'remote');
  expect(sameIdentity.payload.courses[0].id).toBe(first.payload.courses[0].id);

  const changedTeacher = await repository.commit(scopeA, {
    ...schedulePayload,
    courses: [{ ...schedulePayload.courses[0], teacher: '李老師' }],
  }, 'remote');
  expect(changedTeacher.payload.courses[0].id).not.toBe(first.payload.courses[0].id);
});
```

Also assert malformed course ranges are rejected as `storage`, scope B reads `null`, failed active promotion preserves scope A's previous courses, and migrated snapshots retain `source: 'legacy-migration'`.

- [ ] **Step 2: Run the Schedule repository suite and verify RED (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/schedule/infrastructure/repository/__tests__/AsyncStorageScheduleRepository.test.ts
```

Expected: FAIL because `ScheduleRepository` and its implementation do not exist.

- [ ] **Step 3: Define the Schedule repository port (2-5 minutes)**

```ts
import type { AccountScope } from '../../../core/session/accountScope';
import type { SnapshotEnvelope, SnapshotSource } from '../../../core/storage/generationStorage';
import type { ScheduleCourse, ScheduleSyncPayload } from '../domain/types';

export type ScheduleRepositoryPayload = Readonly<{
  courses: readonly ScheduleCourse[];
}>;

export type ScheduleSnapshot = SnapshotEnvelope<ScheduleRepositoryPayload>;

export interface ScheduleRepository {
  read(accountScope: AccountScope): Promise<ScheduleSnapshot | null>;
  commit(
    accountScope: AccountScope,
    payload: ScheduleSyncPayload,
    source?: SnapshotSource,
  ): Promise<ScheduleSnapshot>;
  purge(accountScope: AccountScope): Promise<void>;
}
```

- [ ] **Step 4: Implement sanitized CourseId normalization and generation promotion (2-5 minutes)**

Use the Phase 2B `sanitizeCourseList` before hashing, then identify every course:

```ts
const normalizeSchedule = async (
  payload: ScheduleSyncPayload,
  hash: Hash32,
): Promise<ScheduleRepositoryPayload> => ({
  courses: await Promise.all(
    sanitizeCourseList(payload.courses).map(async (course) => ({
      ...course,
      id: await deriveCourseId(course, hash),
    })),
  ),
});

const decodeSchedulePayload = (value: unknown): ScheduleRepositoryPayload | null => {
  if (!isRecord(value) || !Array.isArray(value.courses)) return null;
  const courses = value.courses.filter((course): course is ScheduleCourse =>
    isRecord(course) && isHex32(course.id) && typeof course.name === 'string' &&
    typeof course.teacher === 'string' && Number.isInteger(course.dayOfWeek) &&
    Number.isInteger(course.startPeriod) && Number.isInteger(course.endPeriod) &&
    Number(course.startPeriod) > 0 && Number(course.endPeriod) >= Number(course.startPeriod),
  );
  return courses.length === value.courses.length ? { courses } : null;
};
```

Implement `AsyncStorageScheduleRepository` with the same constructor and `GenerationStorage` delegation as Grade, using feature name `schedule`, `normalizeSchedule`, and `payload.updatedAt`. Do not persist the old `mock` flag: Phase 3 rejects legacy mock data and remote Schedule payloads are real data.

- [ ] **Step 5: Run repository/domain tests, typecheck, and commit (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand src/features/schedule/domain src/features/schedule/infrastructure/repository
npm.cmd run typecheck
git add src/features/schedule/application/ScheduleRepository.ts src/features/schedule/infrastructure/repository
git commit -m "feat(schedule): add identified schedule repository"
```

Expected: Schedule tests pass; non-identity display fields do not change CourseId; account scopes and failed promotions remain isolated.

### Task 6: Add the Traffic repository without duplicating `updatedAt`

**Files:**
- Create: `src/features/traffic/application/TrafficRepository.ts`
- Create: `src/features/traffic/infrastructure/repository/AsyncStorageTrafficRepository.ts`
- Create: `src/features/traffic/infrastructure/repository/__tests__/AsyncStorageTrafficRepository.test.ts`

- [ ] **Step 1: Write failing envelope and stale-preservation tests (2-5 minutes)**

```ts
it('stores Traffic data once and keeps updatedAt in the envelope', async () => {
  const snapshot = await repository.commit(scopeA, trafficSnapshot, 'remote');
  expect(snapshot.updatedAt).toBe(trafficSnapshot.updatedAt);
  expect(snapshot.payload).toEqual({
    downhill: trafficSnapshot.downhill,
    uphill: trafficSnapshot.uphill,
    sourceUrl: trafficSnapshot.sourceUrl,
  });
  expect(snapshot.payload).not.toHaveProperty('updatedAt');
});

it('returns storage and preserves the previous Traffic snapshot on promotion failure', async () => {
  const previous = await repository.commit(scopeA, trafficSnapshot, 'remote');
  storage.failSetKey = `myccu:v2:${scopeA}:traffic:active`;
  await expect(repository.commit(scopeA, nextTrafficSnapshot, 'remote')).rejects.toMatchObject({
    code: 'storage',
  });
  storage.failSetKey = null;
  await expect(repository.read(scopeA)).resolves.toEqual(previous);
});
```

Also cover invalid directions/rows, corrupt active generation, migration source, scope isolation, GC, and purge.

- [ ] **Step 2: Run the Traffic repository suite and verify RED (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/traffic/infrastructure/repository/__tests__/AsyncStorageTrafficRepository.test.ts
```

Expected: FAIL because the repository files do not exist.

- [ ] **Step 3: Define the Traffic repository port and payload (2-5 minutes)**

```ts
import type { AccountScope } from '../../../core/session/accountScope';
import type { SnapshotEnvelope, SnapshotSource } from '../../../core/storage/generationStorage';
import type { TrafficSnapshot, TrafficStopArrival } from '../domain/types';

export type TrafficRepositoryPayload = Readonly<{
  downhill: readonly TrafficStopArrival[];
  uphill: readonly TrafficStopArrival[];
  sourceUrl: string;
}>;

export type TrafficRepositorySnapshot = SnapshotEnvelope<TrafficRepositoryPayload>;

export interface TrafficRepository {
  read(accountScope: AccountScope): Promise<TrafficRepositorySnapshot | null>;
  commit(
    accountScope: AccountScope,
    payload: TrafficSnapshot,
    source?: SnapshotSource,
  ): Promise<TrafficRepositorySnapshot>;
  purge(accountScope: AccountScope): Promise<void>;
}
```

- [ ] **Step 4: Implement the Traffic decoder and generation wrapper (2-5 minutes)**

```ts
const decodeArrival = (value: unknown): TrafficStopArrival | null => {
  if (!isRecord(value) ||
      (value.direction !== 'downhill' && value.direction !== 'uphill') ||
      typeof value.stopName !== 'string' || typeof value.etaText !== 'string' ||
      typeof value.directionLabel !== 'string' || typeof value.branchLabel !== 'string' ||
      (value.etaMinutes !== null && typeof value.etaMinutes !== 'number') ||
      typeof value.isDue !== 'boolean') return null;
  return value as TrafficStopArrival;
};

export const decodeTrafficRepositoryPayload = (value: unknown): TrafficRepositoryPayload | null => {
  if (!isRecord(value) || !Array.isArray(value.downhill) || !Array.isArray(value.uphill) ||
      typeof value.sourceUrl !== 'string') return null;
  const downhill = value.downhill.map(decodeArrival);
  const uphill = value.uphill.map(decodeArrival);
  if (downhill.some((item) => !item) || uphill.some((item) => !item)) return null;
  return {
    downhill: downhill as TrafficStopArrival[],
    uphill: uphill as TrafficStopArrival[],
    sourceUrl: value.sourceUrl,
  };
};
```

Implement `AsyncStorageTrafficRepository` with `GenerationStorage<TrafficRepositoryPayload>`, feature `traffic`, `payload.updatedAt`, and the payload `{ downhill, uphill, sourceUrl }`. It has no module-level cache.

- [ ] **Step 5: Run the repository suite, typecheck, and commit (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand src/features/traffic/infrastructure/repository
npm.cmd run typecheck
git add src/features/traffic/application/TrafficRepository.ts src/features/traffic/infrastructure/repository
git commit -m "feat(traffic): add account scoped repository"
```

Expected: Traffic tests pass; `updatedAt` exists only on the snapshot envelope; failed writes preserve the last valid generation.

### Task 7: Replace Tutoring's multi-key writes with chunked manifest promotion

**Files:**
- Create: `src/features/tutoring/application/TutoringRepository.ts`
- Create: `src/features/tutoring/infrastructure/repository/AsyncStorageTutoringRepository.ts`
- Create: `src/features/tutoring/infrastructure/repository/__tests__/AsyncStorageTutoringRepository.test.ts`

- [ ] **Step 1: Write failing chunk, manifest, interruption, and merge tests (2-5 minutes)**

```ts
it('stages overview and detail chunks, then manifest, then active pointer', async () => {
  await repository.replace(scopeA, {
    overview: overviewPayload,
    details: { CS101: detailPayload.detail },
  }, overviewPayload.updatedAt, 'remote');

  expect(writes.map(([key]) => key)).toEqual([
    `myccu:v2:${scopeA}:tutoring:generation:100-g1:chunk:overview`,
    `myccu:v2:${scopeA}:tutoring:generation:100-g1:chunk:detail:CS101`,
    `myccu:v2:${scopeA}:tutoring:generation:100-g1:manifest`,
    `myccu:v2:${scopeA}:tutoring:active`,
  ]);
});

it('merges one detail into a complete new generation', async () => {
  await repository.commitOverview(scopeA, overviewPayload, 'remote');
  const committed = await repository.commitDetail(scopeA, detailPayload, 'remote');
  expect(committed.payload.overview?.courses).toEqual(overviewPayload.courses);
  expect(committed.payload.details.CS101).toEqual(detailPayload.detail);
  expect(committed.generation).not.toBe(initialGeneration);
});

it.each(['chunk:detail:CS101', 'manifest', 'active'])(
  'keeps the old active generation when %s write fails',
  async (failedSuffix) => {
    const previous = await repository.commitOverview(scopeA, overviewPayload, 'remote');
    storage.failSetSuffix = failedSuffix;
    await expect(repository.commitDetail(scopeA, detailPayload, 'remote')).rejects.toMatchObject({
      code: 'storage',
    });
    storage.failSetSuffix = null;
    await expect(repository.read(scopeA)).resolves.toEqual(previous);
  },
);
```

Also test corrupt active pointers, missing manifest, missing referenced chunk, malformed detail payload, two account scopes, `replace(..., 'legacy-migration')`, garbage collection after a later successful promotion, and purge. The interrupted test must assert no partially staged detail is returned.

- [ ] **Step 2: Run the Tutoring repository suite and verify RED (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand --runTestsByPath src/features/tutoring/infrastructure/repository/__tests__/AsyncStorageTutoringRepository.test.ts
```

Expected: FAIL because the Tutoring repository files do not exist.

- [ ] **Step 3: Define the repository snapshot and explicit overview/detail operations (2-5 minutes)**

```ts
import type { AccountScope } from '../../../core/session/accountScope';
import type { SnapshotEnvelope, SnapshotSource } from '../../../core/storage/generationStorage';
import type {
  CourseCode,
  CourseDetail,
  TutoringOverviewPayload,
  TutoringCourseDetailPayload,
} from '../domain/types';

export type TutoringOverviewData = Omit<TutoringOverviewPayload, 'updatedAt'>;

export type TutoringRepositoryPayload = Readonly<{
  overview: TutoringOverviewData | null;
  details: Readonly<Record<CourseCode, CourseDetail>>;
}>;

export type TutoringRepositorySnapshot = SnapshotEnvelope<TutoringRepositoryPayload>;

export interface TutoringRepository {
  read(accountScope: AccountScope): Promise<TutoringRepositorySnapshot | null>;
  commitOverview(
    accountScope: AccountScope,
    payload: TutoringOverviewPayload,
    source?: SnapshotSource,
  ): Promise<TutoringRepositorySnapshot>;
  commitDetail(
    accountScope: AccountScope,
    payload: TutoringCourseDetailPayload,
    source?: SnapshotSource,
  ): Promise<TutoringRepositorySnapshot>;
  replace(
    accountScope: AccountScope,
    payload: TutoringRepositoryPayload,
    updatedAt: number,
    source: SnapshotSource,
  ): Promise<TutoringRepositorySnapshot>;
  purge(accountScope: AccountScope): Promise<void>;
}
```

- [ ] **Step 4: Define generation-scoped chunk and manifest records (2-5 minutes)**

```ts
type TutoringChunkKind = 'overview' | `detail:${string}`;

type TutoringChunkEnvelope = Readonly<{
  schemaVersion: 2;
  accountScope: AccountScope;
  generation: string;
  source: SnapshotSource;
  updatedAt: number;
  kind: TutoringChunkKind;
  payload: unknown;
}>;

type TutoringGenerationManifest = Readonly<{
  schemaVersion: 2;
  accountScope: AccountScope;
  generation: string;
  source: SnapshotSource;
  updatedAt: number;
  chunks: {
    overview: string | null;
    details: Readonly<Record<CourseCode, string>>;
  };
}>;

const prefix = (scope: AccountScope) => featurePrefix(scope, 'tutoring');
const activeKey = (scope: AccountScope) => `${prefix(scope)}:active`;
const generationPrefix = (scope: AccountScope, generation: string) =>
  `${prefix(scope)}:generation:${generation}`;
const overviewKey = (scope: AccountScope, generation: string) =>
  `${generationPrefix(scope, generation)}:chunk:overview`;
const detailKey = (scope: AccountScope, generation: string, courseCode: CourseCode) =>
  `${generationPrefix(scope, generation)}:chunk:detail:${encodeURIComponent(courseCode)}`;
const manifestKey = (scope: AccountScope, generation: string) =>
  `${generationPrefix(scope, generation)}:manifest`;
```

Runtime decoders must validate every layer before returning it. Use the Phase 2C domain guards for overview/detail items and these structural checks:

```ts
const decodeOverview = (value: unknown): TutoringOverviewData | null => {
  if (!isRecord(value) || !Array.isArray(value.courses) ||
      !Array.isArray(value.allAssignments) || !Array.isArray(value.pendingAssignments) ||
      typeof value.semester !== 'string' || typeof value.welcome !== 'string') return null;
  return value as TutoringOverviewData;
};

const decodeDetails = (value: unknown): Readonly<Record<CourseCode, CourseDetail>> | null => {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.some(([courseCode, detail]) => !courseCode.trim() || !decodeCourseDetail(detail))) {
    return null;
  }
  return value as Readonly<Record<CourseCode, CourseDetail>>;
};
```

`decodeCourseDetail` is the field-by-field decoder moved from the accepted Phase 2C `tutoringDetailProtocol.ts`; export that decoder from the protocol module and reuse it here rather than adding an assertion-only validator.

- [ ] **Step 5: Implement full-generation staging and active promotion (2-5 minutes)**

Use a complete new generation for every Tutoring mutation. This deliberately trades write volume for simple atomicity; Phase 5 may optimize only with measurements.

```ts
private async stage(
  accountScope: AccountScope,
  payload: TutoringRepositoryPayload,
  updatedAt: number,
  source: SnapshotSource,
): Promise<TutoringRepositorySnapshot> {
  const overview = payload.overview ? decodeOverview(payload.overview) : null;
  const details = decodeDetails(payload.details);
  if ((!overview && Object.keys(payload.details).length === 0) || !details || !Number.isFinite(updatedAt)) {
    throw storageFailure('Tutoring repository payload validation failed.');
  }

  const generation = (this.deps.createGeneration ?? createStorageGeneration)(updatedAt);
  const detailEntries = Object.entries(details).sort(([left], [right]) => left.localeCompare(right));
  const detailChunks = Object.fromEntries(
    detailEntries.map(([courseCode]) => [courseCode, detailKey(accountScope, generation, courseCode)]),
  );
  const manifest: TutoringGenerationManifest = {
    schemaVersion: 2,
    accountScope,
    generation,
    source,
    updatedAt,
    chunks: {
      overview: overview ? overviewKey(accountScope, generation) : null,
      details: detailChunks,
    },
  };

  const writes: Array<[string, string]> = [];
  if (overview) {
    writes.push([overviewKey(accountScope, generation), JSON.stringify({
      schemaVersion: 2, accountScope, generation, source, updatedAt,
      kind: 'overview', payload: overview,
    } satisfies TutoringChunkEnvelope)]);
  }
  for (const [courseCode, detail] of detailEntries) {
    writes.push([detailKey(accountScope, generation, courseCode), JSON.stringify({
      schemaVersion: 2, accountScope, generation, source, updatedAt,
      kind: `detail:${courseCode}`, payload: detail,
    } satisfies TutoringChunkEnvelope)]);
  }

  try {
    for (const [key, value] of writes) await this.deps.storage.setItem(key, value);
    await this.deps.storage.setItem(manifestKey(accountScope, generation), JSON.stringify(manifest));
    await this.deps.storage.setItem(activeKey(accountScope), JSON.stringify({
      schemaVersion: 2, accountScope, feature: 'tutoring', generation,
    } satisfies ActiveGenerationPointer));
  } catch {
    throw storageFailure('Tutoring generation promotion failed.');
  }

  const promoted = await this.read(accountScope);
  if (!promoted || promoted.generation !== generation) {
    throw storageFailure('Tutoring promoted manifest readback failed.');
  }
  await this.garbageCollect(accountScope, generation).catch(
    this.deps.reportGarbageCollectionError ?? (() => undefined),
  );
  return promoted;
}
```

Implement `read(accountScope)` by validating the active pointer and manifest identity, loading exactly the referenced overview/detail chunk keys, validating each chunk's account/generation/kind, and returning:

```ts
return {
  schemaVersion: 2,
  accountScope,
  generation: manifest.generation,
  source: manifest.source,
  updatedAt: manifest.updatedAt,
  payload: { overview, details },
};
```

If pointer, manifest, or referenced chunk content is corrupt, remove only the `active` pointer and return `null`. I/O failures throw `SyncError('storage')`.

- [ ] **Step 6: Implement merge operations, GC, and purge (2-5 minutes)**

```ts
async commitOverview(
  accountScope: AccountScope,
  payload: TutoringOverviewPayload,
  source: SnapshotSource = 'remote',
) {
  const current = await this.read(accountScope);
  const { updatedAt, ...overview } = payload;
  return this.stage(accountScope, {
    overview,
    details: current?.payload.details ?? {},
  }, updatedAt, source);
}

async commitDetail(
  accountScope: AccountScope,
  payload: TutoringCourseDetailPayload,
  source: SnapshotSource = 'remote',
) {
  const current = await this.read(accountScope);
  return this.stage(accountScope, {
    overview: current?.payload.overview ?? null,
    details: {
      ...(current?.payload.details ?? {}),
      [payload.courseCode]: payload.detail,
    },
  }, payload.updatedAt, source);
}

replace(accountScope, payload, updatedAt, source) {
  return this.stage(accountScope, payload, updatedAt, source);
}
```

`garbageCollect` removes every `myccu:v2:<scope>:tutoring:generation:*` key not starting with the active generation prefix. `purge` removes that full generation prefix plus `active`; neither method touches another scope.

- [ ] **Step 7: Run Tutoring repository tests, typecheck, and commit (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand src/features/tutoring/infrastructure/repository
npm.cmd run typecheck
git add src/features/tutoring/application/TutoringRepository.ts src/features/tutoring/infrastructure/repository src/features/tutoring/infrastructure/sync/tutoringDetailProtocol.ts
git commit -m "feat(tutoring): promote chunked repository manifests"
```

Expected: all chunk/manifest tests pass; an interrupted stage never becomes active; overview/detail merges read as one complete snapshot; account scopes remain isolated.

### Task 8: Replace lifecycle-bearing stores with data-only reactive projections

**Files:**

- Create: `src/features/grade/state/gradeStore.ts`
- Create: `src/features/grade/state/__tests__/gradeStore.test.ts`
- Create: `src/features/schedule/state/scheduleStore.ts`
- Create: `src/features/schedule/state/__tests__/scheduleStore.test.ts`
- Create: `src/features/traffic/state/trafficStore.ts`
- Create: `src/features/traffic/state/__tests__/trafficStore.test.ts`
- Create: `src/features/tutoring/state/tutoringStore.ts`
- Create: `src/features/tutoring/state/__tests__/tutoringStore.test.ts`
- Modify: `src/features/grade/index.ts`
- Modify: `src/features/schedule/index.ts`
- Modify: `src/features/traffic/index.ts`
- Modify: `src/features/tutoring/index.ts`

- [ ] **Step 1: Write projection and selector tests first (2-5 minutes)**

For each store, assert `publish(snapshot)` replaces the full data projection once, `reset()` returns the exact initial object, and selecting the same data preserves selector equality. Add stable-ID tests:

```ts
gradeStore.getState().publish(gradeSnapshot);
expect(selectSemesterById(gradeStore.getState(), semesterId)).toBe(
  gradeSnapshot.payload.grades[0],
);
expect(selectSemesterById(gradeStore.getState(), 'missing' as SemesterId)).toBeNull();

scheduleStore.getState().publish(scheduleSnapshot);
expect(selectCourseById(scheduleStore.getState(), courseId)).toBe(
  scheduleSnapshot.payload.courses[0],
);
```

Traffic selectors return a snapshot with the envelope `updatedAt` reattached for presentation. Tutoring selectors expose overview, pending assignments, a course by `CourseCode`, and a detail by `CourseCode`. No store test may set or assert `syncStatus`, `syncPhase`, `loading`, `refreshing`, or errors.

- [ ] **Step 2: Run all state suites to verify red (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand src/features/grade/state src/features/schedule/state src/features/traffic/state src/features/tutoring/state
```

Expected: FAIL because the data-only stores do not exist.

- [ ] **Step 3: Implement minimal store contracts (2-5 minutes)**

Use this exact Grade shape and mirror it for the other features:

```ts
export type GradeState = Readonly<{
  snapshot: GradeSnapshot | null;
  publish(snapshot: GradeSnapshot): void;
  reset(): void;
}>;

const initialGradeData = { snapshot: null } as const;

export const gradeStore = create<GradeState>()((set) => ({
  ...initialGradeData,
  publish: (snapshot) => set({ snapshot }),
  reset: () => set(initialGradeData),
}));

export const useGradeStore = gradeStore;

export const selectSemesterById = (
  state: Pick<GradeState, 'snapshot'>,
  semesterId: SemesterId,
): IdentifiedSemesterGrade | null =>
  [...(state.snapshot?.payload.grades ?? []), ...(state.snapshot?.payload.preAdmission ?? [])]
    .find((semester) => semester.id === semesterId) ?? null;
```

Schedule mirrors this with `ScheduleSnapshot` and `selectCourseById`. Traffic has `TrafficRepositorySnapshot`; Tutoring has `TutoringSnapshot`. Actions are the only functions stored in Zustand. Repository, AsyncStorage, sync-coordinator, and router imports are forbidden.

- [ ] **Step 4: Export only public types, selectors, hooks, and use cases (2-5 minutes)**

Each feature `index.ts` exports its branded IDs, identified data, repository snapshot type, `useXStore`, pure selectors, and application commands. Do not export `AsyncStorage*Repository`, decoder helpers, raw storage keys, or writable repository instances.

- [ ] **Step 5: Run state/boundary tests and commit (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand src/features/grade/state src/features/schedule/state src/features/traffic/state src/features/tutoring/state
npm.cmd run lint:boundaries
npm.cmd run typecheck
git add src/features/grade/state src/features/schedule/state src/features/traffic/state src/features/tutoring/state src/features/grade/index.ts src/features/schedule/index.ts src/features/traffic/index.ts src/features/tutoring/index.ts
git commit -m "refactor(state): publish data only feature projections"
```

### Task 9: Register feature committers and remove the temporary double-write path

**Files:**

- Create: `src/features/grade/application/createGradeCommitter.ts`
- Create: `src/features/grade/application/__tests__/createGradeCommitter.test.ts`
- Create: `src/features/schedule/application/createScheduleCommitter.ts`
- Create: `src/features/schedule/application/__tests__/createScheduleCommitter.test.ts`
- Create: `src/features/traffic/application/createTrafficCommitter.ts`
- Create: `src/features/traffic/application/__tests__/createTrafficCommitter.test.ts`
- Create: `src/features/tutoring/application/createTutoringCommitters.ts`
- Create: `src/features/tutoring/application/__tests__/createTutoringCommitters.test.ts`
- Modify: `src/features/grade/application/runGradeSync.ts`
- Modify: `src/features/schedule/application/runScheduleSync.ts`
- Modify: `src/features/traffic/application/runTrafficSync.ts`
- Modify: `src/features/tutoring/application/runTutoringOverviewSync.ts`
- Modify: `src/features/tutoring/application/runTutoringDetailSync.ts`
- Create: `src/composition/createSyncCommitterRegistry.ts`
- Create: `src/composition/__tests__/createSyncCommitterRegistry.test.ts`

- [ ] **Step 1: Write commit-order tests for all persistent kinds (2-5 minutes)**

Use fake repositories and real data-only stores. Assert every committer calls repository commit/replace before store publication, publishes the repository readback rather than the raw workflow payload, and exposes neither success nor store changes when promotion rejects. Schedule additionally calls the reminder-refresh port only after publication; a reminder failure is logged as `schedule_post_commit_effect_failed` and does not roll back committed data or convert coordinator success into storage failure.

Tutoring overview and detail committers must merge rather than overwrite:

```ts
await overviewCommitter.commit(overviewPayload, context);
await detailCommitter.commit(detailPayload, detailContext);
expect(repository.replace).toHaveBeenLastCalledWith(
  scope,
  expect.objectContaining({
    overview: overviewPayload,
    details: { [detailPayload.courseCode]: detailPayload.detail },
  }),
  detailPayload.updatedAt,
  'remote',
);
```

- [ ] **Step 2: Run committer suites to verify red (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand src/features/grade/application/__tests__/createGradeCommitter.test.ts src/features/schedule/application/__tests__/createScheduleCommitter.test.ts src/features/traffic/application/__tests__/createTrafficCommitter.test.ts src/features/tutoring/application/__tests__/createTutoringCommitters.test.ts
```

Expected: FAIL because the committer factories are missing and Phase 2 application functions still write temporary storage.

- [ ] **Step 3: Implement one typed committer per persistent contract (2-5 minutes)**

Grade, Schedule, and Traffic use this pattern:

```ts
export const createGradeCommitter = (deps: {
  repository: GradeRepository;
  activeScope(): AccountScope;
  publish(snapshot: GradeSnapshot): void;
}): SyncCommitter<'grade'> => ({
  kind: 'grade',
  async commit(payload) {
    const snapshot = await deps.repository.commit(deps.activeScope(), payload, 'remote');
    deps.publish(snapshot);
  },
});
```

Tutoring exports `createTutoringOverviewCommitter` for `tutoring` and `createTutoringDetailCommitter` for `tutoring-detail`. Each reads the currently promoted snapshot, merges its slice into a complete `{ overview, details }` object, calls `replace`, then publishes the promoted readback. Register no committer for `tutoring-download` or `tutoring-upload`.

- [ ] **Step 4: Remove persistence dependencies from Phase 2 application functions (2-5 minutes)**

The coordinator now awaits the registered committer. Reduce each persistent `run*Sync` function to policy/input mapping and typed outcome-to-presentation mapping; delete `persist` from its dependency type and delete every successful-path storage call or reread. Keep download/upload actions unchanged.

```ts
export async function runGradeSync(
  deps: { requestSync: Pick<LegacyPccuSyncEngineFacade, 'requestSync'>['requestSync'] },
  policy: SyncPolicy,
): Promise<GradeHookSyncResult> {
  try {
    const data = await deps.requestSync('grade', policy.priority, {
      reason: policy.reason,
      force: policy.force,
    });
    return { success: true, data, updatedAt: data.updatedAt };
  } catch (cause) {
    const error = toSyncError(cause);
    return { success: false, message: error.message, error };
  }
}
```

Success implies repository promotion and store publication have already completed. Add regression tests that the five use cases expose no `persist` argument and do not import the deleted storage path.

- [ ] **Step 5: Build the exact committer registry factory for the runtime (2-5 minutes)**

Create `createSyncCommitterRegistry(deps)` to own one `SyncCommitterRegistry` and register Grade, Schedule, Traffic, Tutoring overview, and Tutoring detail factories. Assert the exact inventory; download/upload return `null` and workflow execution adapters remain unrelated in `WorkflowRegistry`. Task 11 passes this factory result into the existing coordinator construction.

- [ ] **Step 6: Run core/feature suites and commit (5-10 minutes)**

```powershell
npm.cmd test -- --runInBand src/core/sync src/features/grade/application src/features/schedule/application src/features/traffic/application src/features/tutoring/application
npm.cmd run typecheck
git add src/features/grade/application src/features/schedule/application src/features/traffic/application src/features/tutoring/application src/composition/createSyncCommitterRegistry.ts src/composition/__tests__/createSyncCommitterRegistry.test.ts
git commit -m "refactor(data): commit workflow output through repositories"
```

### Task 10: Migrate valid legacy caches once and delete invalid or stale keys

**Files:**

- Create: `src/composition/legacyCacheMigration.ts`
- Create: `src/composition/__tests__/legacyCacheMigration.test.ts`

- [ ] **Step 1: Write migration matrix tests first (2-5 minutes)**

Cover the exact legacy roots `cached_grades`, `cached_schedule`, `cached_schedule_last`, `cached_traffic_red5`, `cached_tutoring`, `cached_tutoring_last`, and every key beginning `cached_tutoring_`. Assert:

1. valid Grade/Schedule/Traffic payloads commit with `source: 'legacy-migration'`;
2. a valid Tutoring root plus per-course keys becomes one chunk/manifest generation;
3. invalid JSON, mock Schedule payloads, missing `updatedAt`, malformed IDs/data, and partial Tutoring sets are deleted but never promoted;
4. legacy keys are removed only after a successful repository promotion, except invalid values which are removed immediately;
5. a repository failure preserves the legacy key for retry;
6. marker `myccu:v2:<scope>:migration:legacy-cache-v1` prevents a second read after success;
7. migration for scope A never reads/writes a scope B v2 key.

- [ ] **Step 2: Run the migration suite to verify red (2-5 minutes)**

Run `npm.cmd test -- --runInBand --runTestsByPath src/composition/__tests__/legacyCacheMigration.test.ts`.

Expected: FAIL because the migration module does not exist.

- [ ] **Step 3: Implement dependency-injected migration (2-5 minutes)**

```ts
export type LegacyCacheMigrationDeps = Readonly<{
  storage: KeyValueStorage & Pick<AsyncStorageStatic, 'getAllKeys' | 'multiRemove'>;
  grade: GradeRepository;
  schedule: ScheduleRepository;
  traffic: TrafficRepository;
  tutoring: TutoringRepository;
  logger: Pick<AppLogger, 'warn'>;
}>;

export async function migrateLegacyCachesOnce(
  accountScope: AccountScope,
  deps: LegacyCacheMigrationDeps,
): Promise<void>;
```

Use the repository decoders/normalizers through exported migration-only factory functions; do not cast parsed JSON to domain types. Process features independently with all-settled semantics, but write the migration marker only when every present legacy feature either promoted successfully or was proven invalid and removed. Throw one sanitized `LegacyCacheMigrationError` with failed feature names so bootstrap can retry. Never log payloads or raw keys containing a course code.

- [ ] **Step 4: Prove no general production code reads legacy keys (2-5 minutes)**

Add a source test asserting the legacy literals appear only in `legacyCacheMigration.ts`, its tests, and the soon-to-be-deleted legacy storage files. No repository, store, hook, screen, or Home module may import a legacy storage function.

- [ ] **Step 5: Run tests, typecheck, and commit (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand src/composition/__tests__/legacyCacheMigration.test.ts src/features/grade/infrastructure/repository src/features/schedule/infrastructure/repository src/features/traffic/infrastructure/repository src/features/tutoring/infrastructure/repository
npm.cmd run typecheck
git add src/composition/legacyCacheMigration.ts src/composition/__tests__/legacyCacheMigration.test.ts
git commit -m "feat(data): migrate legacy caches once"
```

### Task 11: Compose one account runtime and hydrate repositories once per scope

**Files:**

- Create: `src/composition/AppRuntimeContext.tsx`
- Create: `src/composition/createAppRuntime.ts`
- Create: `src/composition/appDataBootstrap.ts`
- Create: `src/composition/__tests__/createAppRuntime.test.ts`
- Create: `src/composition/__tests__/appDataBootstrap.test.ts`
- Modify: `src/composition/sync.ts`
- Modify: `src/composition/AppCompositionRoot.tsx`

- [ ] **Step 1: Write runtime singleton and hydration-coalescing tests (2-5 minutes)**

Assert one runtime contains one workflow registry, coordinator, WebView workflow runtime, committer registry, repository instance per feature, active-scope session, and application command set. `bootstrap(scope)` called concurrently from auth entry and loading returns the same promise; repeated calls after success perform zero repository reads; a failed migration/read clears the memoized promise and retries; switching scopes creates a distinct once-key and resets projections before publishing the new scope.

- [ ] **Step 2: Run composition tests to verify red (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand src/composition/__tests__/createAppRuntime.test.ts src/composition/__tests__/appDataBootstrap.test.ts
```

Expected: FAIL because the runtime/context/bootstrap modules do not exist.

- [ ] **Step 3: Implement the coalesced bootstrap service (2-5 minutes)**

```ts
export class AppDataBootstrap {
  private readonly completed = new Set<AccountScope>();
  private readonly inFlight = new Map<AccountScope, Promise<AppDataBootstrapResult>>();

  constructor(private readonly deps: AppDataBootstrapDeps) {}

  bootstrap(scope: AccountScope): Promise<AppDataBootstrapResult> {
    if (this.completed.has(scope)) return Promise.resolve(this.currentResult(scope));
    const running = this.inFlight.get(scope);
    if (running) return running;
    const operation = this.run(scope)
      .then((result) => { this.completed.add(scope); return result; })
      .finally(() => this.inFlight.delete(scope));
    this.inFlight.set(scope, operation);
    return operation;
  }
}
```

`run` resets all four stores, awaits `migrateLegacyCachesOnce`, reads all repositories with `Promise.all`, publishes non-null snapshots once, and returns `{ hasAnyCache }`. A failed migration/read publishes nothing from a partial scope and leaves the previous scope already reset. `currentResult` derives from repository-backed store snapshots, not AsyncStorage.

- [ ] **Step 4: Consolidate Phase 1 composition into `createAppRuntime` (2-5 minutes)**

Move the construction currently in `src/composition/sync.ts` into `createAppRuntime`; keep `sync.ts` as compatibility exports that point to the runtime's same objects. `AppRuntimeContext` provides the runtime through a required hook. `AppCompositionRoot` creates exactly one runtime with `useState(createAppRuntime)`, renders its provider, and destroys it on unmount. A source-level test must find exactly one `new SyncCoordinator`, one `new WorkflowRegistry`, and one `new WebViewWorkflowRuntime` in production composition.

- [ ] **Step 5: Run full composition/core tests and commit (5-10 minutes)**

```powershell
npm.cmd test -- --runInBand src/composition src/core/sync
npm.cmd run lint:boundaries
npm.cmd run typecheck
git add src/composition/AppRuntimeContext.tsx src/composition/createAppRuntime.ts src/composition/appDataBootstrap.ts src/composition/__tests__ src/composition/sync.ts src/composition/AppCompositionRoot.tsx
git commit -m "refactor(runtime): compose account scoped data once"
```

### Task 12: Move consumers to public selectors and make session purge scope-aware

**Files:**

- Create: `src/features/home/application/useHomeViewModel.ts`
- Create: `src/features/home/application/__tests__/useHomeViewModel.test.tsx`
- Create: `src/features/schedule/application/useScheduleViewModel.ts`
- Create: `src/features/grade/application/useGradeViewModel.ts`
- Create: `src/features/tutoring/application/useTutoringCourseDetailViewModel.ts`
- Modify: feature sync/data hooks and screens
- Modify: `src/features/auth/screens/LoadingScreen.tsx`
- Modify: `src/features/auth/screens/LoginScreen.tsx`
- Modify: `src/features/tutoring/components/TutoringBackgroundWarmup.tsx`
- Modify: `src/features/notifications/services/courseReminderRuntime.ts`
- Modify: `src/core/session/AppSessionCoordinator.ts`
- Modify: `src/core/session/__tests__/AppSessionCoordinator.test.ts`
- Modify: `src/composition/appSession.ts`

- [ ] **Step 1: Write public-consumer and old-scope purge tests first (2-5 minutes)**

Assert Home derives current/upcoming course, grade summary/privacy, traffic card, and Tutoring counts from public store selectors without importing storage or repositories. Schedule/Grade/Tutoring view-model tests cover stable-ID selection and typed commands. Session tests capture `oldScope` before active credentials/scope are cleared, then assert all four repositories purge that exact scope with all-settled semantics before store reset; a purge failure keeps sync blocked and retries the same old scope.

- [ ] **Step 2: Run consumer/session tests to verify red (2-5 minutes)**

```powershell
npm.cmd test -- --runInBand src/features/home/application src/features/schedule/application src/features/grade/application src/features/tutoring/application src/core/session
```

Expected: current consumers still read storage or lifecycle-bearing stores, and session cleanup has no repository scope port.

- [ ] **Step 3: Add the exact Phase 4 view-model handoff (2-5 minutes)**

Export these hooks from feature public APIs:

```ts
export function useHomeViewModel(): HomeViewModel;
export function useScheduleViewModel(): ScheduleViewModel;
export function useGradeViewModel(): GradeViewModel;
export function useTutoringCourseDetailViewModel(courseCode: CourseCode): TutoringCourseDetailViewModel;
```

View-models combine data-only selectors, `useSyncStatus(runtime.syncRequestSource, kind)`, and application commands. They own date math, privacy masking, display strings, and route-command callbacks. They import no repository or AsyncStorage implementation. `HomeViewModel` exposes `header`, `course`, `metrics`, `openSchedule`, `openGrade`, `openTraffic`, and `openTutoring`; Schedule/Grade models expose `CourseId`/`SemesterId` for navigation.

- [ ] **Step 4: Remove repeated hydration and storage rereads from consumers (2-5 minutes)**

Auth entry/loading call only `runtime.dataBootstrap.bootstrap(activeScope)`. Feature screens and data hooks read stores; sync hooks call application commands and read lifecycle through `useSyncStatus`. Tutoring warmup checks repository-backed selectors. Reminder runtime receives committed identified courses from the Schedule committer and never calls `getCourses`. Search after edits:

```powershell
rg -n "get(Courses|Grades|TrafficSnapshot|TutoringData)|hydrate\(" src/features src/composition --glob '!**/infrastructure/**' --glob '!**/__tests__/**'
```

Expected: no production presentation/hook/Home match.

- [ ] **Step 5: Extend session cleanup with an old-scope data port (2-5 minutes)**

Add this dependency to `AppSessionCoordinator`:

```ts
export interface SessionDataPort {
  captureActiveScope(): AccountScope | null;
  purge(scope: AccountScope): Promise<void>;
  resetStores(): void;
  clearActiveScope(): void;
}
```

At transition start capture `oldScope` exactly once. Preserve the Phase 0 order: block and abort sync, clear WebView session, then all-settled credential/profile plus `data.purge(oldScope)`; always reset stores; clear the active scope only after purge attempts. Any failure keeps admission blocked and retains the captured scope in retry state. `appSession.ts` implements `purge` by calling all four repositories with `Promise.allSettled` and throws one sanitized aggregate after every target was attempted.

- [ ] **Step 6: Run consumers/session tests and commit (5-10 minutes)**

```powershell
npm.cmd test -- --runInBand src/features/home/application src/features/schedule/application src/features/grade/application src/features/tutoring/application src/core/session src/composition
npm.cmd run typecheck
git add src/features/home/application src/features/schedule/application src/features/grade/application src/features/tutoring/application src/features/auth/screens/LoadingScreen.tsx src/features/auth/screens/LoginScreen.tsx src/features/tutoring/components/TutoringBackgroundWarmup.tsx src/features/notifications/services/courseReminderRuntime.ts src/core/session/AppSessionCoordinator.ts src/core/session/__tests__/AppSessionCoordinator.test.ts src/composition/appSession.ts
git commit -m "refactor(data): consume scoped reactive state"
```

### Task 13: Delete legacy persistence owners and pass Phase 3 acceptance

**Files:**

- Delete: `src/features/grade/storage/gradeStorage.ts`
- Delete: `src/features/schedule/storage/scheduleStorage.ts`
- Delete: `src/features/traffic/storage/trafficStorage.ts`
- Delete: `src/features/tutoring/storage/tutoringStorage.ts`
- Delete: `src/features/grade/store/useGradeStore.ts`
- Delete: `src/features/schedule/store/useScheduleStore.ts`
- Delete: `src/features/tutoring/store/useTutoringStore.ts`
- Create: `src/__tests__/repositoryBoundaries.test.ts`
- Create: `docs/testing/phase-3-expo-go-checklist.md`
- Create: `docs/verification/myccu-refactor-phase-3.md`

- [ ] **Step 1: Add permanent repository/state boundary tests (2-5 minutes)**

Assert only `src/core/storage`, `src/features/*/infrastructure/repository`, and `src/composition/legacyCacheMigration.ts` import AsyncStorage for feature data; stores import no repository/sync/storage module; screens/Home/hooks import no `infrastructure/repository` or deleted storage path; every persistent `SyncKind` has one committer; download/upload have none; raw account values cannot appear in `myccu:v2` keys; public `CourseId`/`SemesterId` selectors exist; there is one bootstrap hydration owner.

- [ ] **Step 2: Prove all old imports are gone before deletion (2-5 minutes)**

```powershell
rg -n "features/(grade|schedule|traffic|tutoring)/(storage|store)|gradeStorage|scheduleStorage|trafficStorage|tutoringStorage" app src --glob '!src/composition/legacyCacheMigration.ts' --glob '!**/__tests__/**'
```

Expected: no production consumer match. If a match remains, migrate it through a public selector/use case; do not add a compatibility re-export.

- [ ] **Step 3: Delete old owners and run every automated gate (5-15 minutes)**

```powershell
git rm src/features/grade/storage/gradeStorage.ts src/features/schedule/storage/scheduleStorage.ts src/features/traffic/storage/trafficStorage.ts src/features/tutoring/storage/tutoringStorage.ts src/features/grade/store/useGradeStore.ts src/features/schedule/store/useScheduleStore.ts src/features/tutoring/store/useTutoringStore.ts
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run lint:boundaries
npm.cmd run format:check
npm.cmd run coverage:ci
npm.cmd run export:smoke
npm.cmd run verify
```

Expected: all commands exit 0; global coverage ratchet holds; repository, generation-storage, migration, bootstrap, committer, and state critical branches meet the architecture target.

- [ ] **Step 4: Complete the Expo Go account/data checklist (10-25 minutes)**

Write and execute `docs/testing/phase-3-expo-go-checklist.md`: upgrade from valid legacy cache; corrupt legacy cache fallback; cold remembered login with cache; cold login without cache; Grade/Schedule/Traffic/Tutoring refresh and immediate reactive update; relaunch persistence; deep navigation using stable IDs; simultaneous screen/Home reads without repeat hydration; logout while committing; relaunch after logout; account A to B to A isolation; interrupted network/foreground recovery; Schedule reminder refresh after commit. Expo Go remains the blocking development checkpoint.

- [ ] **Step 5: Record sanitized evidence and commit (2-5 minutes)**

Create `docs/verification/myccu-refactor-phase-3.md` with commit SHA, automated results, coverage, migration cases, device OS, Expo Go version, and checklist. Include no account, raw cache key containing a course code, course content, HTML, URL query, or payload.

```powershell
git add src/__tests__/repositoryBoundaries.test.ts docs/testing/phase-3-expo-go-checklist.md docs/verification/myccu-refactor-phase-3.md
git commit -m "docs: record Phase 3 repository acceptance"
```

## Completion criteria

- Account scopes, Course IDs, and Semester IDs are deterministic 32-character lowercase SHA-256 values; raw account values reach no key, state, route, or log.
- Generation promotion and Tutoring manifests preserve the previous active data across interrupted or failed writes.
- Coordinator success occurs only after the typed feature committer promotes, reads back, and publishes repository data.
- Grade, Schedule, Traffic, and Tutoring stores contain data only; sync lifecycle comes from the Phase 1 request snapshot.
- Legacy caches migrate at most once per scope and only validated data is promoted.
- Bootstrap hydrates repositories once per scope per process; screens, hooks, Home, warmup, and notifications perform no storage hydration.
- Logout/account switch purges every old-scope repository and resets stores with retryable all-settled semantics before a new scope activates.
- Feature public APIs expose stable-ID selectors and the Home/Schedule/Grade/Tutoring view-models required by Phase 4.
- Old feature storage and lifecycle-bearing store modules are deleted.
- Full automated, export, Expo Go, account-isolation, migration, and sanitized-evidence gates pass.
