# Decisions

## GlobalScraperWebView Architecture (2026-04-01)

- **Single WebView, Engine-driven**: Instead of 3 separate SyncAgent components (each with its own WebView), a single hidden `GlobalScraperWebView` registers itself as the `SyncExecutor` for `PccuSyncEngine`. The engine manages the priority queue and AppState lifecycle; the WebView handles the actual DOM scraping.
- **Hidden dimensions**: `opacity: 0, width: 375, height: 667, position: 'absolute', left: -1000, top: -1000` — large enough for the PCCU eCampus site to render properly, positioned off-screen.
- **Mode switching**: The component tracks `activeMode` (`'pccu' | 'traffic' | 'none'`) to route navigation and message events to the correct handler. Traffic uses a different URL domain (ebus.gov.taipei) so the `sourceUri` state is dynamically switched.
- **HomeScreen cleanup**: Removed `ScheduleSyncAgent`, `GradeSyncAgent`, `TrafficSyncAgent` imports and JSX. Also removed the old sync orchestration state (`scheduleSyncReloadKey`, `gradeSyncReloadKey`, `backgroundSyncStage`, `kickBackgroundSync`) since the engine now handles all of this internally.
- **Old SyncAgent files preserved**: Per MUST NOT DO, the old `GradeSyncAgent.tsx`, `ScheduleSyncAgent.tsx`, `TrafficSyncAgent.tsx` files are NOT deleted yet (Phase 3 will handle that).

## Schedule Module Zustand Migration (2026-04-01)

- **ScheduleScreen reduced from 929 to ~400 lines**: Removed all WebView sync machinery (5-phase state machine, credential handling, HTML parsing, retry logic). Screen now focuses purely on UI rendering.
- **useScheduleStore pattern**: Mirrors useGradeStore exactly — Zustand store with `courses`, `lastSyncedAt`, `syncStatus`, `error` state plus `hydrate()` for AsyncStorage bootstrapping.
- **useScheduleSync hook**: Calls `PccuSyncEngine.getInstance().requestSync('schedule', priority)`. Re-hydrates from storage after sync completes (GlobalScraperWebView persists results).
- **LoadingScreen updated**: Replaced `ScheduleSyncAgent` JSX with `useScheduleSync` hook. Schedule and grade sync now run sequentially via the engine's priority queue.
- **ScheduleSyncAgent.tsx deleted**: The feature-level component is removed. Note: `src/components/ScheduleSyncAgent.tsx` (older legacy version) still exists and may need cleanup later.
- **UI preserved**: All styling, layout, and visual behavior maintained. Only the data-fetching layer changed.

## Parser Testing Infrastructure (2026-04-01)

- **Jest stack pinned for Expo SDK 54**: Use `jest@29.7.0` + `jest-expo@~54.0.0` + `@types/jest@29.5.14` to avoid runtime incompatibility from Jest 30 / jest-expo 55.
- **Fixture strategy**: Keep parser fixtures under `__fixtures__/html/` and store only sanitized/minimal HTML (no student id/name/department fields).
- **Parser-first test scope**: Focus tests on `parseScheduleFromHtml` and `parseGradesFromHtml` pure parsing behavior; avoid coupling to WebView/UI flows.

## Schedule queryByStudent Pivot (2026-04-01)

- **Schedule-only engine hook**: `GlobalScraperWebView` now treats schedule `TransUrl 1208` as the handoff into schedule sync injection, while grade keeps the original service-open flow.
- **CLI-aligned acquisition**: `buildAdaptiveSchedulePageScript()` now resolves the `queryByStudent` entry/form/action and submits the form directly, then returns HTML for the existing parser/storage contract.
- **Failure states preserved at script level**: The schedule script now explicitly distinguishes relogin, no-data, and timeout outcomes instead of waiting on `gfOpenLink` readiness.
