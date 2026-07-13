# Production Dependency Audit Triage

**Baseline date:** 2026-07-13

**Command:** `npm audit --omit=dev --json`

**Baseline lock:** 32 aggregate findings: 1 low, 23 moderate, 7 high, 1 critical.

**After Phase 0 override:** 31 aggregate findings: 1 low, 23 moderate, 7 high, 0 critical.

**After removing unused direct `axios`:** 28 aggregate findings: 1 low, 22 moderate, 5 high, 0 critical.

| Finding                                       | Runtime path                                                             | Phase 0 decision                                                                                                                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GHSA-w7jw-789q-3m8p` in `shell-quote<=1.8.3` | `react-native -> react-devtools-core -> shell-quote`                     | Override to patched `1.8.4`; verify Jest, Expo dependency check, and export.                                                                                                                                                |
| Direct `axios` high advisories                | Unused root dependency; no imports under `app`, `src`, or `scripts`      | Remove `axios` from the manifest and lockfile. This also removes its vulnerable `follow-redirects` and `form-data` path instead of accepting unused attack surface.                                                         |
| `ws` high-severity advisories                 | React Native, Metro, Expo CLI, and React DevTools development transports | Retain the Expo SDK 54 compatible tree; no compatible root upgrade is available without moving the managed stack. These servers are development tooling, not a MyCCU app network endpoint. Recheck on every Expo SDK patch. |
| `undici` advisories                           | nested `@expo/cli` HTTP client                                           | Retain the Expo-managed version and update only through a compatible Expo patch. The app uses React Native networking, not this CLI copy.                                                                                   |
| `@xmldom/xmldom` high advisories              | Expo CLI plist/config parsing                                            | Tooling-only serialization path; MyCCU does not parse user XML. Retain the Expo-managed version and recheck with compatible Expo SDK patches.                                                                               |
| `node-forge` high advisories                  | Expo CLI code-signing and certificate helpers                            | Build/signing tooling, not an application cryptography API or remote app endpoint. Retain only through Expo/EAS updates; validate signing in EAS preview.                                                                   |
| `picomatch` high advisories                   | Expo/Metro/Jest/EAS file matching                                        | Local build/test glob processing with repository-authored patterns. Do not force an incompatible transitive override; update with the managed toolchain.                                                                    |
| `@babel/core` low advisory                    | build/test transformation                                                | Retain the Expo/Metro-compatible version; do not override Babel independently of the managed toolchain.                                                                                                                     |

## Enforcement

`npm run audit:prod` must report zero critical findings. High findings remain visible and reviewed; they are not hidden by a count allowlist. Dependency remediation never uses `npm audit fix --force`.
