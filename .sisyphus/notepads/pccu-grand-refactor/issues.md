# Issues

## 2026-04-01

- 初次安裝依賴發生 peer conflict（`react-test-renderer` vs React 19.1.0），使用 `--legacy-peer-deps` 解決。
- 初版安裝到 `jest@30` 與 `jest-expo@55` 造成執行失敗，已改為 Expo 54 相容版本並恢復綠燈。
