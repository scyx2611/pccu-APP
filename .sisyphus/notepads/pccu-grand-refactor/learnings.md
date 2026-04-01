# Learnings

## 2026-04-01

- Expo SDK 54 專案若直接安裝最新版 Jest 會導致 `import outside of the scope of the test code` 類型錯誤；需將 Jest 生態版本對齊 SDK。
- `parseScheduleFromHtml` 只要 fixture 包含 `pubContent` / `pubTdItem_Period` 與基本節次欄位，就能穩定走 table parser 分支。
- `parseGradesFromHtml` 對「學年度學期 + 課程代碼 + 課名 + 學分/成績」的最小表格即可成功解析，適合做穩定單元測試樣本。
- 課表同步在 `TransUrl 1208` 後不應再把 `gfOpenLink` 就緒當成成功訊號；若直接改走 `queryByStudent` 頁面/表單提交流程，和 pccu-cli 的行為會一致且更穩定。
