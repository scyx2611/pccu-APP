# Issues

## 2026-04-01

- 初次安裝依賴發生 peer conflict（`react-test-renderer` vs React 19.1.0），使用 `--legacy-peer-deps` 解決。
- 初版安裝到 `jest@30` 與 `jest-expo@55` 造成執行失敗，已改為 Expo 54 相容版本並恢復綠燈。
- `GlobalScraperWebView` 的 schedule 流程測試若直接模擬完整 `inside.aspx -> TransUrl` timer 鏈，容易被共享 executor timeout 噪音影響；改用較小的 engine regression + 直接 script regression 會更穩定。
