# MyCCU Phase 4 Routes and UI Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Expo Router files thin, use canonical routes and stable IDs, and split the largest screens into testable route gates, view-models, compositions, and focused section components without redesigning the app.

**Architecture:** Phase 3 already owns account-scoped data, stable `CourseId`/`SemesterId`, public selectors, and view-model commands. This phase makes routes consume those APIs, preserves existing visual output, and moves render blocks into feature-local sections before promoting only proven settings primitives to `shared/ui`.

**Tech Stack:** Expo Router, React Native, TypeScript, Zustand selectors, Expo Local Authentication, Testing Library, Jest, Expo Go.

---

## Preconditions and file map

Run before editing:

```powershell
npm.cmd run verify
npm.cmd run coverage:ci
npm.cmd run lint:boundaries
```

Expected: Phase 3 is green; Home and screens do not read AsyncStorage directly; feature public APIs expose stable ID selectors.

Primary files:

- Create: `src/navigation/routes.ts`, `src/navigation/__tests__/routes.test.ts`.
- Create: `src/features/auth/presentation/AuthEntryRouteScreen.tsx` and test.
- Create: `src/features/grade/presentation/GradeRouteScreen.tsx`, `GradeAccessGate.tsx`, and tests.
- Create: `src/features/schedule/presentation/CourseDetailsRouteScreen.tsx` and test.
- Create: `src/features/grade/presentation/GradeDetailsRouteScreen.tsx` and test.
- Create: `src/features/home/presentation/HomeScreen.tsx` plus `sections/` and tests.
- Create: `src/features/schedule/presentation/ScheduleScreen.tsx` plus `sections/` and tests.
- Create: `src/features/grade/presentation/GradeScreen.tsx` plus `sections/` and tests.
- Create: `src/features/tutoring/presentation/TutoringCourseDetailScreen.tsx` plus `sections/` and tests.
- Create: `src/shared/ui/settings/InsetGroup.tsx`, `SettingRow.tsx`, `SettingNote.tsx`, and tests.
- Modify: affected `app/**/*.tsx` routes to re-export or redirect only.
- Delete: superseded `src/features/*/screens` implementations after every caller migrates.

### Task 1: Define canonical route builders

**Files:**
- Create: `src/navigation/routes.ts`
- Create: `src/navigation/__tests__/routes.test.ts`
- Modify: `src/navigation/mainTabs.ts`

- [ ] **Step 1: Write failing route contract tests**

```ts
import { parseSemesterId } from '../../features/grade';
import { parseCourseId } from '../../features/schedule';
import { ROUTES, courseDetailsHref, gradeDetailsHref, tutoringCourseHref } from '../routes';

describe('canonical routes', () => {
  it('keeps one canonical schedule path', () => {
    expect(ROUTES.schedule).toBe('/(tabs)/schedule');
    expect(ROUTES.grade).toBe('/(tabs)/home/grade');
  });

  it('builds ID-only modal params', () => {
    const courseId = parseCourseId('70f6d1d3594d424c92f87657abe1d0d0')!;
    const semesterId = parseSemesterId('246583c1eb37a6dd1746a77ee91eef76')!;
    expect(courseDetailsHref(courseId)).toEqual({
      pathname: '/modal/courseDetails',
      params: { courseId: '70f6d1d3594d424c92f87657abe1d0d0' },
    });
    expect(gradeDetailsHref(semesterId)).toEqual({
      pathname: '/modal/gradeDetails',
      params: { semesterId: '246583c1eb37a6dd1746a77ee91eef76' },
    });
  });

  it('encodes tutoring course codes without payload JSON', () => {
    expect(tutoringCourseHref('A/B 01')).toBe('/tutoring/A%2FB%2001');
  });
});
```

- [ ] **Step 2: Run the focused test**

```powershell
npm.cmd test -- --runInBand src/navigation/__tests__/routes.test.ts
```

Expected: FAIL because `routes.ts` does not exist.

- [ ] **Step 3: Implement route constants and builders**

```ts
import type { CourseId } from '../features/schedule';
import type { SemesterId } from '../features/grade';

export const ROUTES = {
  root: '/',
  login: '/login',
  loading: '/loading',
  home: '/(tabs)/home',
  schedule: '/(tabs)/schedule',
  grade: '/(tabs)/home/grade',
  traffic: '/(tabs)/home/traffic',
  tutoring: '/(tabs)/tutoring',
  settings: '/(tabs)/settings',
} as const;

export const courseDetailsHref = (courseId: CourseId) => ({
  pathname: '/modal/courseDetails' as const,
  params: { courseId: String(courseId) },
});

export const gradeDetailsHref = (semesterId: SemesterId) => ({
  pathname: '/modal/gradeDetails' as const,
  params: { semesterId: String(semesterId) },
});

export const tutoringCourseHref = (courseCode: string) =>
  `/tutoring/${encodeURIComponent(courseCode)}` as const;
```

Update tab definitions to import `ROUTES` rather than duplicating path text.

- [ ] **Step 4: Run route tests and typecheck**

Expected: PASS and `npm.cmd run typecheck` exits 0.

- [ ] **Step 5: Commit**

```powershell
git add src/navigation/routes.ts src/navigation/__tests__/routes.test.ts src/navigation/mainTabs.ts
git commit -m "refactor: define canonical application routes"
```

### Task 2: Move authentication entry behavior behind a feature route screen

**Files:**
- Create: `src/features/auth/presentation/AuthEntryRouteScreen.tsx`
- Create: `src/features/auth/presentation/__tests__/AuthEntryRouteScreen.test.tsx`
- Create: `src/features/auth/application/resolveAuthEntry.ts`
- Create: `src/features/auth/application/__tests__/resolveAuthEntry.test.ts`
- Create: `src/composition/authEntry.ts`
- Modify: `app/index.tsx`

- [ ] **Step 1: Write failing navigation behavior tests**

Mock the Phase 3 session selector/use case rather than SecureStore directly:

```tsx
it('routes a saved authenticated session with cache to Home', async () => {
  const resolver = createFakeResolver('home');
  render(<AuthEntryRouteScreen resolver={resolver} />);
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(ROUTES.home));
});

it('routes a saved session without cache through loading', async () => {
  const resolver = createFakeResolver('loading');
  render(<AuthEntryRouteScreen resolver={resolver} />);
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(ROUTES.loading));
});

it('shows Welcome when credentials are absent or biometric access is cancelled', async () => {
  const resolver = createFakeResolver('welcome');
  render(<AuthEntryRouteScreen resolver={resolver} />);
  expect(await screen.findByText('開始使用')).toBeTruthy();
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Expected: FAIL because `AuthEntryRouteScreen` and the injectable session port do not exist.

- [ ] **Step 3: Implement the thin route screen**

```tsx
type AuthEntryRouteScreenProps = {
  resolver?: AuthEntryResolver;
};

export default function AuthEntryRouteScreen({
  resolver = authEntryResolver,
}: AuthEntryRouteScreenProps) {
  const { theme } = useTheme();
  const [entry, setEntry] = useState<'checking' | 'welcome'>('checking');

  useEffect(() => {
    let active = true;
    void resolver.resolve().then((result) => {
      if (!active) return;
      if (result === 'home') router.replace(ROUTES.home);
      else if (result === 'loading') router.replace(ROUTES.loading);
      else setEntry('welcome');
    });
    return () => { active = false; };
  }, [resolver]);

  if (entry === 'checking') {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg }}>
      <ActivityIndicator size="large" color={theme.primary} />
    </View>;
  }

  return <WelcomeScreen onStart={() => router.push(ROUTES.login)} />;
}
```

Define `AuthEntryDestination = 'home' | 'loading' | 'welcome'` and `AuthEntryResolver = { resolve(): Promise<AuthEntryDestination> }` in `resolveAuthEntry.ts`. The use case receives the credential vault, active-scope activator, Phase 3 `AppDataBootstrap`, and existing biometric policy as injected ports. Missing/invalid credentials or cancelled/unavailable biometric returns `welcome`; valid credentials activate the hashed scope, bootstrap it once, and return `home` when `hasAnyCache` is true or `loading` otherwise. `src/composition/authEntry.ts` wires those ports. Session cleanup remains in `AppSessionCoordinator`; auth-entry policy does not belong there.

- [ ] **Step 4: Re-export from `app/index.tsx` and run tests**

```ts
export { default } from '../src/features/auth/presentation/AuthEntryRouteScreen';
```

Run the focused suite and `npm.cmd run typecheck`.

- [ ] **Step 5: Commit**

```powershell
git add app/index.tsx src/features/auth/application/resolveAuthEntry.ts src/features/auth/application/__tests__/resolveAuthEntry.test.ts src/features/auth/presentation src/composition/authEntry.ts
git commit -m "refactor: move auth entry into feature route"
```

### Task 3: Extract the Grade route and biometric access gate

**Files:**
- Create: `src/features/grade/presentation/GradeAccessGate.tsx`
- Create: `src/features/grade/presentation/GradeRouteScreen.tsx`
- Create: `src/features/grade/application/GradeAccessPort.ts`
- Create: `src/composition/gradeAccess.ts`
- Create: `src/features/grade/presentation/__tests__/GradeAccessGate.test.tsx`
- Create: `src/features/grade/presentation/__tests__/GradeRouteScreen.test.tsx`
- Modify: `app/(tabs)/home/grade.tsx`

- [ ] **Step 1: Write failing access-state tests**

Cover protection disabled, biometric success, cancel, unavailable, and retry. Inject this port:

```ts
export type GradeAccessPort = {
  isProtectionEnabled(): Promise<boolean>;
  authenticate(): Promise<
    | { kind: 'passed' }
    | { kind: 'cancelled'; message: string }
    | { kind: 'unavailable'; message: string }
  >;
};
```

Store this interface in `src/features/grade/application/GradeAccessPort.ts`. `src/composition/gradeAccess.ts` adapts the existing security-setting reader and `expo-local-authentication`, maps native results into the three typed outcomes, and exports `gradeAccessPort`. Expo Go unavailable/cancelled results remain normal typed states, never thrown raw native errors.

Assert `children` renders only for `passed`/disabled and retry calls `authenticate` exactly once.

- [ ] **Step 2: Run focused tests and verify failure**

Expected: FAIL because the gate does not exist.

- [ ] **Step 3: Implement `GradeAccessGate`**

Use a discriminated local state (`checking | unlocking | locked | unavailable | unlocked`), `useFocusEffect`, and the existing lock-card JSX moved without visual changes. The component accepts `port`, `children`, `theme`, and `biometricLabel`; no router or grade data dependency is allowed.

```tsx
export function GradeAccessGate({ port = gradeAccessPort, children }: Props) {
  const [state, setState] = useState<AccessState>({ kind: 'checking' });
  const verify = useCallback(async () => {
    if (!(await port.isProtectionEnabled())) return setState({ kind: 'unlocked' });
    setState({ kind: 'unlocking' });
    const result = await port.authenticate();
    setState(result.kind === 'passed' ? { kind: 'unlocked' } : result);
  }, [port]);
  useFocusEffect(useCallback(() => { void verify(); }, [verify]));
  return state.kind === 'unlocked' ? <>{children}</> : <GradeLockCard state={state} onRetry={verify} />;
}
```

- [ ] **Step 4: Implement `GradeRouteScreen` and use the platform entry**

```tsx
export default function GradeRouteScreen() {
  return (
    <>
      <Stack.Screen options={{ title: '歷年成績' }} />
      <GradeAccessGate>
        <GradeScreen />
      </GradeAccessGate>
    </>
  );
}
```

Move the existing header menu into a focused `GradeHeaderActions` component in the same file; retain Expo Go fallback behavior. Never import `GradeScreenV2` from the route.

- [ ] **Step 5: Re-export, run tests, and commit**

```ts
export { default } from '../../../src/features/grade/presentation/GradeRouteScreen';
```

```powershell
npm.cmd test -- --runInBand src/features/grade/presentation
npm.cmd run typecheck
git add "app/(tabs)/home/grade.tsx" src/features/grade/application/GradeAccessPort.ts src/features/grade/presentation src/composition/gradeAccess.ts
git commit -m "refactor: isolate grade route access gate"
```

### Task 4: Replace serialized modal payloads with stable selectors

**Files:**
- Create: `src/features/schedule/presentation/CourseDetailsRouteScreen.tsx`
- Create: `src/features/schedule/presentation/__tests__/CourseDetailsRouteScreen.test.tsx`
- Create: `src/features/grade/presentation/GradeDetailsRouteScreen.tsx`
- Create: `src/features/grade/presentation/__tests__/GradeDetailsRouteScreen.test.tsx`
- Modify: `app/modal/courseDetails.tsx`
- Modify: `app/modal/gradeDetails.tsx`
- Modify: schedule/grade card press handlers

- [ ] **Step 1: Write failing ID selection tests**

```tsx
mockParams({ courseId: '70f6d1d3594d424c92f87657abe1d0d0' });
mockSelectCourseById.mockReturnValue(courseFixture);
render(<CourseDetailsRouteScreen />);
expect(mockSelectCourseById).toHaveBeenCalledWith(expect.anything(), '70f6d1d3594d424c92f87657abe1d0d0');
expect(screen.getByText(courseFixture.name)).toBeTruthy();

mockParams({ semesterId: '246583c1eb37a6dd1746a77ee91eef76' });
mockSelectSemesterById.mockReturnValue(semesterFixture);
render(<GradeDetailsRouteScreen />);
expect(screen.getByText(semesterFixture.title)).toBeTruthy();
```

Also test missing/unknown IDs render the existing load-failure copy.

- [ ] **Step 2: Run focused tests and verify failure**

Expected: FAIL because routes still parse JSON.

- [ ] **Step 3: Implement ID-only route screens**

```tsx
export default function CourseDetailsRouteScreen() {
  const { courseId } = useLocalSearchParams<{ courseId?: string }>();
  const parsedId = parseCourseId(String(courseId ?? ''));
  const course = useScheduleStore((state) =>
    parsedId ? selectCourseById(state, parsedId) : null,
  );
  return <CourseDetailsView course={course} />;
}

export default function GradeDetailsRouteScreen() {
  const { semesterId } = useLocalSearchParams<{ semesterId?: string }>();
  const parsedId = parseSemesterId(String(semesterId ?? ''));
  const semester = useGradeStore((state) =>
    parsedId ? selectSemesterById(state, parsedId) : null,
  );
  return <GradeDetailsView semester={semester} />;
}
```

Move existing detail markup into `CourseDetailsView`/`GradeDetailsView` props-only components in the same feature folder.

- [ ] **Step 4: Change card navigation and app re-exports**

Replace every `JSON.stringify` route payload with `courseDetailsHref(course.id)` or `gradeDetailsHref(semester.id)`. App modal files become one-line re-exports.

- [ ] **Step 5: Verify no serialized domain route remains and commit**

```powershell
rg -n "JSON\.stringify.*(course|semester)|params:.*data" app src
npm.cmd test -- --runInBand src/features/schedule/presentation src/features/grade/presentation
npm.cmd run typecheck
git add app/modal src/features/schedule/presentation src/features/grade/presentation src/navigation
git commit -m "refactor: route detail modals by stable id"
```

Expected: `rg` returns no modal payload match; tests pass.

### Task 5: Make schedule navigation canonical

**Files:**
- Modify: `src/features/home/application/useHomeViewModel.ts`
- Modify: `app/(tabs)/home/schedule.tsx`
- Modify: `app/schedule.tsx`
- Test: `src/navigation/__tests__/routes.test.ts`

- [ ] **Step 1: Add failing canonical navigation assertions**

Assert Home's schedule command pushes `ROUTES.schedule` and both compatibility route files contain `Redirect href={ROUTES.schedule}`.

- [ ] **Step 2: Run tests and verify the old nested path failure**

- [ ] **Step 3: Update Home and compatibility redirects**

```tsx
export default function ScheduleCompatibilityRoute() {
  return <Redirect href={ROUTES.schedule} />;
}
```

Keep `app/(tabs)/schedule/index.tsx` as the sole screen re-export.

- [ ] **Step 4: Run route, Home view-model, and navigation tests**

Expected: all pass; no production push to `/(tabs)/home/schedule` remains.

- [ ] **Step 5: Commit**

```powershell
git add app/schedule.tsx "app/(tabs)/home/schedule.tsx" src/features/home/application/useHomeViewModel.ts src/navigation
git commit -m "refactor: canonicalize schedule navigation"
```

### Task 6: Split Home into a view-model-driven composition

**Files:**
- Create: `src/features/home/presentation/HomeScreen.tsx`
- Create: `src/features/home/presentation/sections/HomeHeaderSection.tsx`
- Create: `src/features/home/presentation/sections/CurrentCourseSection.tsx`
- Create: `src/features/home/presentation/sections/DashboardGridSection.tsx`
- Create: `src/features/home/presentation/__tests__/HomeScreen.test.tsx`
- Modify: `app/(tabs)/home/index.tsx`
- Delete after migration: `src/features/home/screens/HomeScreen.tsx`

- [ ] **Step 1: Write composition behavior tests**

Inject a complete `HomeViewModel` and assert greeting, current/upcoming course, weather, grade privacy mask, traffic, tutoring count, and four navigation commands. Assert the screen itself invokes no storage/network function.

- [ ] **Step 2: Run the test and verify missing presentation failure**

- [ ] **Step 3: Create props-only sections**

Use these exact public props:

```ts
export type HomeHeaderSectionProps = { greeting: string; userName: string; weatherText: string };
export type CurrentCourseSectionProps = { current: CourseCardModel | null; upcoming: CourseCardModel | null; onPress(): void };
export type DashboardGridSectionProps = {
  grade: DashboardMetricModel;
  traffic: DashboardMetricModel;
  tutoring: DashboardMetricModel;
  onGradePress(): void;
  onTrafficPress(): void;
  onTutoringPress(): void;
};
```

Move the corresponding existing JSX and styles unchanged into each file. Sections receive display-ready models; no date, storage, router, or fetch import is allowed.

- [ ] **Step 4: Compose the screen from `useHomeViewModel`**

```tsx
export default function HomeScreen() {
  const model = useHomeViewModel();
  return <ScrollView contentInsetAdjustmentBehavior="automatic">
    <HomeHeaderSection {...model.header} />
    <CurrentCourseSection {...model.course} onPress={model.openSchedule} />
    <DashboardGridSection grade={model.metrics.grade} traffic={model.metrics.traffic}
      tutoring={model.metrics.tutoring} onGradePress={model.openGrade}
      onTrafficPress={model.openTraffic} onTutoringPress={model.openTutoring} />
  </ScrollView>;
}
```

- [ ] **Step 5: Re-export, verify, delete old screen, and commit**

Run Home tests plus full typecheck, confirm old screen has no import, then `git rm` it.

```powershell
git add "app/(tabs)/home/index.tsx" src/features/home/presentation
git rm src/features/home/screens/HomeScreen.tsx
git commit -m "refactor: split Home presentation sections"
```

### Task 7: Split Schedule calendar and timeline sections

**Files:**
- Create: `src/features/schedule/presentation/ScheduleScreen.tsx`
- Create: `src/features/schedule/presentation/sections/ScheduleDateStrip.tsx`
- Create: `src/features/schedule/presentation/sections/ScheduleTimeline.tsx`
- Create: `src/features/schedule/presentation/sections/ScheduleCalendarModal.tsx`
- Create: `src/features/schedule/presentation/sections/ScheduleStatusSection.tsx`
- Create: `src/features/schedule/presentation/__tests__/ScheduleScreen.test.tsx`
- Modify: `src/features/schedule/screens/ScheduleRouteScreen.tsx` to import the new presentation entry
- Delete: `src/features/schedule/screens/ScheduleScreen.tsx`

- [ ] **Step 1: Write tests for composition and commands**

Test selected date, active/completed/upcoming timeline models, calendar open/month move/date selection, refresh, stale/error, and empty state through a fake `ScheduleViewModel`.

- [ ] **Step 2: Run focused tests and verify failure**

- [ ] **Step 3: Extract pure props contracts and existing markup**

```ts
type ScheduleDateStripProps = { dates: ScheduleDateChipModel[]; selectedId: string; onSelect(id: string): void };
type ScheduleTimelineProps = { items: ScheduleTimelineItemModel[]; onCoursePress(courseId: CourseId): void };
type ScheduleCalendarModalProps = { visible: boolean; month: CalendarMonthModel; onMove(offset: -1 | 1): void; onSelect(dateId: string): void; onClose(): void };
type ScheduleStatusSectionProps = { refreshing: boolean; error: string | null; updatedAtText: string; onRefresh(): void };
```

All date math stays in Phase 3 view-model/domain functions. Move existing visual markup/styles without changing labels, animation, or accessibility text.

- [ ] **Step 4: Compose and verify**

The new `ScheduleScreen` calls one `useScheduleViewModel()` and passes display models/actions to sections. Run focused tests, `scheduleTimeline.test.ts`, and typecheck.

- [ ] **Step 5: Remove the old implementation and commit**

```powershell
git add src/features/schedule/presentation src/features/schedule/screens/ScheduleRouteScreen.tsx
git rm src/features/schedule/screens/ScheduleScreen.tsx
git commit -m "refactor: split schedule presentation sections"
```

### Task 8: Split Grade summary and semester sections

**Files:**
- Create: `src/features/grade/presentation/GradeScreen.tsx`
- Create: `src/features/grade/presentation/sections/GradeSummarySection.tsx`
- Create: `src/features/grade/presentation/sections/GradeSemesterSection.tsx`
- Create: `src/features/grade/presentation/sections/GradeStatusSection.tsx`
- Create: `src/features/grade/presentation/__tests__/GradeScreen.test.tsx`
- Modify: stable platform entry files
- Delete: `src/features/grade/screens/GradeScreenV2.tsx` after callers migrate

- [ ] **Step 1: Write display-model tests**

Cover cumulative credits, pass summary, pre-enrollment ordering, fail color, rank/average privacy output, refresh, stale/error, and semester navigation by `SemesterId`.

- [ ] **Step 2: Run focused tests and verify failure**

- [ ] **Step 3: Extract props-only sections**

```ts
type GradeSummarySectionProps = { items: readonly SummaryMetricModel[] };
type GradeSemesterSectionProps = { semester: SemesterCardModel; onPress(id: SemesterId): void };
type GradeStatusSectionProps = { loading: boolean; refreshing: boolean; error: string | null; updatedAtText: string; onRefresh(): void };
```

Move the existing Grade V2 markup and styles into these sections. Score/credit/pass calculations remain in the grade domain/view-model.

- [ ] **Step 4: Keep platform files stable**

Native `GradeScreen.tsx` re-exports the new presentation entry; `GradeScreen.web.tsx` retains the web fallback. `GradeRouteScreen` imports only the stable platform entry.

- [ ] **Step 5: Verify and commit**

Run grade presentation tests, parser tests, typecheck, then remove V2 after `rg` confirms no consumer.

```powershell
git add src/features/grade
git rm src/features/grade/screens/GradeScreenV2.tsx
git commit -m "refactor: split grade presentation sections"
```

### Task 9: Split Tutoring course detail sections and file commands

**Files:**
- Create: `src/features/tutoring/presentation/TutoringCourseDetailScreen.tsx`
- Create: section files for Overview, Announcements, Materials, Assignments, Progress, Classmates, and DetailModal
- Create: `src/features/tutoring/presentation/__tests__/TutoringCourseDetailScreen.test.tsx`
- Modify: `app/tutoring/[courseCode].tsx`
- Delete: `src/features/tutoring/screens/TutoringCourseDetailScreen.tsx`

- [ ] **Step 1: Write tab/command/detail tests**

Use a fake `TutoringCourseDetailViewModel` to cover each tab, counts, suspicious-progress refresh command, download/upload commands, announcement detail modal, stale/error, and pull-to-refresh. Assert sections receive only display models and callbacks.

- [ ] **Step 2: Run focused tests and verify failure**

- [ ] **Step 3: Define exact section contracts**

```ts
type TutoringSectionProps<T> = { items: readonly T[]; loading: boolean; emptyText: string };
type AssignmentSectionProps = TutoringSectionProps<AssignmentItemModel> & { onUpload(id: string): void; onDownload(id: string): void };
type MaterialSectionProps = TutoringSectionProps<MaterialItemModel> & { onDownload(id: string): void };
type AnnouncementSectionProps = TutoringSectionProps<AnnouncementItemModel> & { onOpen(id: string): void; onDownload(id: string): void };
```

Move existing visual blocks and helper-derived strings into display models. File actions remain application commands created in Phase 2C/3; sections never import the sync coordinator.

- [ ] **Step 4: Compose route and screen**

`app/tutoring/[courseCode].tsx` validates the string param, sets the normalized route title, and renders the feature route/screen. The screen owns active tab and detail-modal visibility only; remote/data state comes from the view-model.

- [ ] **Step 5: Verify, remove old screen, and commit**

Run tutoring presentation, route title, file action, and workflow tests plus typecheck. Remove the old screen after `rg` finds no imports.

```powershell
git add "app/tutoring/[courseCode].tsx" src/features/tutoring/presentation
git rm src/features/tutoring/screens/TutoringCourseDetailScreen.tsx
git commit -m "refactor: split tutoring detail presentation"
```

### Task 10: Promote proven settings primitives

**Files:**
- Create: `src/shared/ui/settings/InsetGroup.tsx`
- Create: `src/shared/ui/settings/SettingRow.tsx`
- Create: `src/shared/ui/settings/SettingNote.tsx`
- Create: `src/shared/ui/settings/__tests__/settingsPrimitives.test.tsx`
- Modify: Settings, Security, Privacy, Notifications, Developer, Appearance, About screens

- [ ] **Step 1: Write primitive behavior tests**

Test group accessibility, row title/subtitle/action, pressed callback, switch rendering, separators excluding the last row, disabled state, and note text.

- [ ] **Step 2: Run the focused test and verify failure**

- [ ] **Step 3: Implement minimal primitives**

```tsx
export type SettingRowProps = Readonly<{
  title: string;
  subtitle?: string;
  action?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  showSeparator?: boolean;
  textColor: ColorValue;
  secondaryTextColor: ColorValue;
  separatorColor: ColorValue;
}>;

export function InsetGroup({ children, backgroundColor }: PropsWithChildren<{ backgroundColor: ColorValue }>) {
  return <View style={[styles.group, { backgroundColor }]}>{children}</View>;
}

export function SettingRow({
  title, subtitle, action, onPress, disabled = false, showSeparator = true,
  textColor, secondaryTextColor, separatorColor,
}: SettingRowProps) {
  const body = <View style={[styles.row, disabled && styles.disabled]}>
    <View style={styles.copy}>
      <Text style={[styles.title, { color: textColor }]}>{title}</Text>
      {subtitle ? <Text style={[styles.subtitle, { color: secondaryTextColor }]}>{subtitle}</Text> : null}
    </View>
    {action}
  </View>;
  return <>
    {onPress ? <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress}>{body}</Pressable> : body}
    {showSeparator ? <View style={[styles.separator, { backgroundColor: separatorColor }]} /> : null}
  </>;
}

export function SettingNote({ children, textColor }: PropsWithChildren<{ textColor: ColorValue }>) {
  return <View style={styles.note}><Text style={[styles.noteText, { color: textColor }]}>{children}</Text></View>;
}

const styles = StyleSheet.create({
  group: { borderRadius: 16, overflow: 'hidden' },
  row: { minHeight: 54, paddingHorizontal: 16, paddingVertical: 11, flexDirection: 'row', alignItems: 'center' },
  copy: { flex: 1, paddingRight: 12 },
  title: { fontSize: 16, fontWeight: '500' },
  subtitle: { marginTop: 3, fontSize: 13, lineHeight: 18 },
  disabled: { opacity: 0.45 },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  note: { paddingHorizontal: 16, paddingTop: 8 },
  noteText: { fontSize: 13, lineHeight: 18 },
});
```

Use theme colors through props so shared primitives do not import settings feature state.

- [ ] **Step 4: Migrate two screens first, then remaining screens**

Migrate Security and Privacy, run tests/Expo Go visual check, then migrate the other five without adding new primitive variants. Preserve all copy and callbacks.

- [ ] **Step 5: Verify and commit**

```powershell
npm.cmd test -- --runInBand src/shared/ui/settings src/features/settings
npm.cmd run typecheck
git add src/shared/ui/settings src/features/settings
git commit -m "refactor: share settings row primitives"
```

### Task 11: Final route, boundary, export, and Expo Go verification

**Files:**
- Create: `docs/verification/myccu-refactor-phase-4.md`
- Modify: `src/__tests__/legacyCleanup.test.ts`
- Modify: `src/composition/createAppRuntime.ts`
- Modify: persistent feature application sync commands and Tutoring file actions
- Delete: `src/features/pccu/engine/PccuSyncEngine.ts`
- Delete: `src/features/pccu/engine/compat/LegacyPccuSyncEngineFacade.ts`
- Delete: `src/features/pccu/engine/compat/__tests__/LegacyPccuSyncEngineFacade.test.ts`

- [ ] **Step 1: Add permanent route/UI architecture guards**

Assert app route files stay at or below 80 physical lines except `_layout.tsx` files, no route imports `AsyncStorage`, parser implementation, `GradeScreenV2`, or storage modules, and no modal uses `data` JSON params.

- [ ] **Step 2: Remove the final typed legacy caller facade**

Phase 3 `createAppRuntime` already owns account scope plus `SyncCoordinator`. Expose feature command functions that build full `SyncCommand<K>` values and call `coordinator.request` directly. Change Grade, Schedule, Traffic, Tutoring overview/detail, download, and upload application functions to accept those typed command functions rather than `LegacyPccuSyncEngineFacade.requestSync`. Preserve their public UI result shapes.

After this scan returns no production import:

```powershell
rg -n "PccuSyncEngine|LegacyPccuSyncEngineFacade|requestSync\(" app src --glob '!**/__tests__/**'
```

delete `PccuSyncEngine.ts`, `LegacyPccuSyncEngineFacade.ts`, and its compatibility tests. Add permanent assertions to `legacyCleanup.test.ts`. No new facade or untyped option bag replaces them.

- [ ] **Step 3: Run complete automated gates**

```powershell
npm.cmd run verify
npm.cmd run coverage:ci
npm.cmd run lint:boundaries
npm.cmd run export:smoke
```

Expected: all exit 0 and coverage ratchet holds.

- [ ] **Step 4: Run residue scans**

```powershell
rg -n "JSON\.parse\(.*params|JSON\.stringify.*params|GradeScreenV2|features/.*/storage" app
rg -n "from .*screens/" app
rg -n "GlobalScraperWebView|PccuSyncEngine|LegacyPccuSyncEngineFacade|Record<string, unknown>" app src/features/pccu src/composition
```

Expected: no serialized route payload, V2 route dependency, storage import, legacy screen path, legacy scraper/engine facade, or untyped production option bag remains.

- [ ] **Step 5: Complete Expo Go visual/behavior checklist**

Verify cold auth entry; Home navigation; canonical Schedule tab; Grade biometric enabled/disabled/cancel/unavailable/retry; course and semester modal deep links; all tutoring tabs/file flows; settings switches/rows; native tabs; dark/light themes; back behavior; logout. Expected: labels/layout remain visually equivalent and all commands work.

- [ ] **Step 6: Record sanitized evidence and commit**

Create the phase verification document with commit SHA, commands, device/Expo Go version, checklist, and no PII.

```powershell
git add docs/verification/myccu-refactor-phase-4.md src/__tests__/legacyCleanup.test.ts src/composition/createAppRuntime.ts src/features/grade/application src/features/schedule/application src/features/traffic/application src/features/tutoring/application src/features/tutoring/services
git rm src/features/pccu/engine/PccuSyncEngine.ts src/features/pccu/engine/compat/LegacyPccuSyncEngineFacade.ts src/features/pccu/engine/compat/__tests__/LegacyPccuSyncEngineFacade.test.ts
git commit -m "docs: record Phase 4 route and UI verification"
```

## Completion criteria

- Every Expo Router file is a thin route adapter; route params contain stable branded IDs, never serialized domain payloads.
- Auth entry, Grade access, Home, Schedule, Grade details, Tutoring, and Settings consume public application/view-model surfaces only.
- `PccuSyncEngine`, `LegacyPccuSyncEngineFacade`, `GlobalScraperWebView`, legacy screen re-exports, and feature storage imports are absent from production routes and composition.
- `npm.cmd run verify`, `coverage:ci`, `lint:boundaries`, and `export:smoke` pass.
- The complete Expo Go route, biometric, tutoring file, theme, back-navigation, and logout checklist is recorded without PII.
