# MyCCU Phase 0 Expo Go 驗收清單

## 驗收環境

- 狀態：待實機執行
- 日期：待填
- 測試者：待填
- 平台與 OS 版本：待填（iOS 或 Android）
- Expo Go 版本：待填
- 測試版本：`codex/myccu-phase-0`（最終 commit 待填）

不得在本文件、截圖檔名或缺陷紀錄中保存學號、密碼、課程內容、HTML、完整 URL query 或 WebView message payload。

## 執行前準備

1. 在專案根目錄執行 `npm.cmd ci` 與 `npm.cmd run verify`。
2. 執行 `npm.cmd start -- --go`，強制 CLI 使用 Expo Go，再以同一區域網路中的 Expo Go 掃描 QR code。
3. 準備兩個合法測試帳號 A/B；證據只寫「帳號 A／帳號 B」。
4. 「設定 → 開發者 → Phase 0 Expo Go 驗收」只在開發模式出現：
   - 「測試 WebView 網域阻擋」會走正式 WebView navigation handler。
   - 「模擬下次清理失敗」只影響下一次登出，重試時自動恢復正常。
   - 「測試 ErrorBoundary」會觸發根層安全 fallback，按「重試」後重掛畫面。

## 必須通過的實機情境

| #   | 情境                                     | 操作與預期結果                                                                                                                                    | 結果    | 證據／備註 |
| --- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------- |
| 1   | Cold remembered login                    | 開啟「儲存帳號密碼」，成功登入後完全關閉 App；重新以 Expo Go 冷啟動，應能恢復登入流程，畫面與 log 不顯示帳密。                                    | ⬜ 待測 |            |
| 2   | Fresh login without remember             | 關閉「儲存帳號密碼」後登入；重啟時不得自動帶入帳密，當次 session 仍可同步。                                                                       | ⬜ 待測 |            |
| 3   | Fresh login with remember                | 開啟「儲存帳號密碼」後重新登入；重啟時可走 remembered login，AsyncStorage 不得出現明文帳密。                                                      | ⬜ 待測 |            |
| 4   | Grade/Schedule/Traffic/Tutoring sync     | 逐一同步成績、課表、交通與課業輔導；每項只完成一次、無卡住、無跨功能資料錯置。                                                                    | ⬜ 待測 |            |
| 5   | Background/foreground during active sync | 同步進行中切到背景再回前景；請求應暫停／恢復或以安全錯誤結束，之後可再次同步。                                                                    | ⬜ 待測 |            |
| 6   | Blocked HTTP/deceptive redirect          | 到「設定 → 開發者」按「測試 WebView 網域阻擋」；結果必須為「通過」，代表合法 HTTPS 通過、HTTP 與欺騙 suffix 都被拒絕。                            | ⬜ 待測 |            |
| 7   | Logout during queued sync                | 快速觸發至少兩項同步後立即登出；所有 caller 應結束、不得在登出後寫回舊帳號資料，完成清理後才到登入頁。                                            | ⬜ 待測 |            |
| 8   | Relaunch after logout                    | 登出後完全關閉並重開 App；不得恢復舊帳號、舊 WebView session、課表、成績、交通或課業輔導資料。                                                    | ⬜ 待測 |            |
| 9   | Account A → Account B switch             | 帳號 A session 尚存在時改以帳號 B 登入；必須先清理 A，再送出 B 的 login，B 不得看到 A 的資料。                                                    | ⬜ 待測 |            |
| 10  | Cleanup-failure retry                    | 到「設定 → 開發者」按「模擬下次清理失敗」，回設定登出；第一次應留在原頁並顯示「重試清除」，按下後才成功前往登入頁。                               | ⬜ 待測 |            |
| 11  | Dark/light ErrorBoundary recovery        | 分別在淺色、深色模式到「設定 → 開發者」按「測試 ErrorBoundary」；只顯示「畫面暫時無法顯示」與「重試」，不得顯示 error message/stack，重試後恢復。 | ⬜ 待測 |            |

## 驗收判定

- Phase 0 Expo Go：以上 11 項全部通過才可標記完成。
- Expo Go 是開發階段的主要實機 acceptance target。
- 遠端通知實際投遞、production signing、entitlement 與商店封裝不屬於 Expo Go 能力，留在 EAS preview／production build 驗證；不得因此改用 custom dev client 取代本清單。
