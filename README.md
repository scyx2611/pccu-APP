# MyCCU

MyCCU 是以 Expo / React Native 建置的校園行動 App，整合課表、成績、課輔、交通與個人設定。專案核心同步流程透過共用 WebView 登入 PCCU / eCampus，再注入腳本擷取校務系統資料。

## 技術棧

- Expo SDK 54
- React Native 0.81
- React 19
- TypeScript
- Expo Router
- Zustand
- Jest + jest-expo
- React Native WebView

## 開發環境

```powershell
npm install
npm run start
```

常用啟動方式：

```powershell
npm run android
npm run ios
npm run web
npm run start:tunnel
```

## 驗證指令

```powershell
npm run typecheck
npm run test:ci
npm run verify
```

`verify` 會先跑 TypeScript 型別檢查，再以單執行緒模式跑 Jest，適合在提交前使用。

## 專案結構

```text
app/                         Expo Router routes
src/features/auth/           登入、憑證與啟動快取
src/features/pccu/           PCCU WebView 同步引擎、腳本與解析器
src/features/schedule/       課表資料、儲存與畫面
src/features/grade/          成績資料、儲存與畫面
src/features/tutoring/       課輔課程、公告、教材、作業與同步流程
src/features/traffic/        公車到站資訊
src/features/settings/       設定頁與本機偏好
src/shared/                  共用元件與工具
scripts/                     本機驗證與偵錯腳本
```

## 同步流程概覽

PCCU / eCampus 的資料來源多半需要瀏覽器 session 與跨頁面導流，因此 App 使用 `GlobalScraperWebView` 作為共用同步執行器：

1. `PccuSyncEngine` 排隊同步請求。
2. `GlobalScraperWebView` 讀取本機安全憑證並登入 eCampus。
3. WebView 依請求類型前往課表、成績或課輔頁面。
4. 注入對應腳本擷取 HTML 或頁面資料。
5. Parser / storage 將結果轉為 App 可使用的資料並寫入本機快取。

## Debug Log

同步引擎與 scraper 的細節 log 預設會在測試與 production 中關閉。需要追查 WebView 流程時可開啟：

```powershell
$env:EXPO_PUBLIC_DEBUG_LOGS='1'
npm run start
```

## 測試資料

`__fixtures__/html/` 存放 parser 測試用 HTML fixture。修改 PCCU parser 或同步腳本時，建議先補 fixture 或對應單元測試，再調整實作。
