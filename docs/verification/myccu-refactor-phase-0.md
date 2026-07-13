# MyCCU Refactor Phase 0 驗證紀錄

## 結論

- 自動化 acceptance：**PASS**
- Expo Go 實機 acceptance：**PENDING**
- Phase 0 整體狀態：**等待實機清單 11/11 通過**

本紀錄不包含學號、密碼、課程內容、HTML、完整 URL query、cookie 或 WebView message payload。

## 驗證版本

- 日期：2026-07-13（Asia/Taipei）
- Branch：`codex/myccu-phase-0`
- 自動化驗證 commit：`db5dba71b04f5396e1cc601fb6da47f72b0a4363`
- Node.js：`20.19.4`
- npm：`10.8.2`
- Expo SDK：54

## 自動化結果

| Gate                      | 結果 | 證據摘要                                                                           |
| ------------------------- | ---- | ---------------------------------------------------------------------------------- |
| `npm ci`                  | PASS | 由 lockfile 乾淨安裝 1,399 packages；無 peer-resolution workaround。               |
| `npm run typecheck`       | PASS | `tsc --noEmit`，strict source tree 無錯誤。                                        |
| `npm run lint`            | PASS | `eslint app src scripts --max-warnings=0`。                                        |
| `npm run lint:boundaries` | PASS | Core 與 feature layer boundary 規則無違規。                                        |
| `npm run format:check`    | PASS | 全部受控檔案符合 Prettier。                                                        |
| `npm run coverage:ci`     | PASS | 36 suites、242 tests、0 snapshots，全部通過。                                      |
| `npm run export:smoke`    | PASS | iOS bundle 完成；1,400 modules，Hermes bundle 約 4.49 MB。                         |
| `npm run verify`          | PASS | 聚合 lint、boundary、format、typecheck、coverage、iOS export 全部完成。            |
| `npm run audit:prod`      | PASS | critical gate exit 0；production audit 為 1 low、22 moderate、5 high、0 critical。 |

## Coverage

| 指標       |                    結果 | Phase 0 ratchet |
| ---------- | ----------------------: | --------------: |
| Statements | 46.20%（2,116 / 4,580） |            通過 |
| Branches   | 31.51%（1,010 / 3,205） |          24.64% |
| Functions  |     45.53%（438 / 962） |            通過 |
| Lines      | 47.39%（1,981 / 4,180） |          34.08% |

## 獨立審查修正

- WebView session reset 會遞增 generation 並等待舊訊息 handler 靜止；`await` 後的舊帳號訊息不能再更新 store 或完成新 session request。
- Auth session runtime 會取消舊 generation、以帳號區隔 45 秒 warm-session cache，並以 8 秒上限等待登入／憑證寫入；逾時後的 credential write 會觸發 active＋persisted compensation cleanup，retry 會等待補償完成。
- Session coordinator 在 auth 靜止前後各清一次 active credentials，再清除持久化 credentials、profile、feature caches 與舊課表通知，避免晚到寫入重新污染新 session。
- WebView handler drain 具有 8 秒上限；逾時會解除本次 transaction 供 UI 重試，晚到 persistence 完成後會執行補償清除，下一次 retry 也會等待補償清除完成。
- 登入例外改走結構化 redacted logger，只保留 `errorName`。

## Dependency audit

- 移除無任何 `app`、`src`、`scripts` import 的直接 `axios` 依賴，production aggregate findings 由 31 降到 28。
- `shell-quote` critical 已由 override 固定在修補版本，critical 維持 0。
- 剩餘 high findings 均位於 Expo/Metro/EAS/React Native 的 XML、certificate、glob、HTTP client 或 WebSocket tooling path，逐項記錄於 `docs/security/dependency-audit-triage.md`。
- 未執行 `npm audit fix --force`；需要 Expo major upgrade 的修正留到受控 SDK 升級。

## Expo Go 實機狀態

- Device OS：待填
- Expo Go version：待填
- Checklist：0 / 11（尚未在實機執行）
- Checklist 文件：`docs/testing/phase-0-expo-go-checklist.md`
- 開發者頁已提供正式 WebView host handler probe、單次 cleanup failure 與 ErrorBoundary recovery 三個驗收控制。

自動化不能替代真實 PCCU session、App 背景／前景、兩帳號切換與 Expo Go SecureStore/WebView lifecycle。完成實機清單前，不得將 Phase 0 整體標記為完成。

## EAS preview 後續項目

Expo Go 仍是開發階段 acceptance target。遠端通知實際投遞、production signing、entitlement 與商店封裝限制須另在 EAS preview／production build 驗證，不影響本次 Expo Go 清單的必要性。
