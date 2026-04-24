# MyCCU 文化大學校園助理 📱

這是一個為中國文化大學學生打造的全新 iOS 體驗 App。
專案採用 React Native 搭配 Expo，完美模擬了 iOS 26 (未來感/空間運算) 的設計語言。

## 🌟 核心特色
- **未來感介面 (VisionOS Inspired)**：懸浮毛玻璃 (Glassmorphism)、連續曲線圓角與空間光源陰影。
- **自訂膠囊導航列 (Custom Capsule Tab Bar)**：手刻懸浮於畫面底部的半透明毛玻璃膠囊。
- **課表自動擷取**：透過隱藏 WebView 自動登入 ecampus → 攔截 `gfOpenLink` 彈窗 → 導航 ap1 課表查詢 → 注入 JS 提取並解析課表 HTML。
- **安全儲存**：使用 `expo-secure-store` 對接 iOS Keychain，確保學號密碼安全。

## 🚀 技術堆疊

| 類別 | 技術 |
|------|------|
| Framework | React Native (Expo SDK 54) |
| Language | TypeScript |
| Navigation | React Navigation (Bottom Tabs & Native Stack) |
| UI | `expo-blur`, `@expo/vector-icons` |
| 課表擷取 | `react-native-webview` (隱藏 WebView + JS 注入) |
| 資料快取 | `@react-native-async-storage/async-storage` |
| 安全存儲 | `expo-secure-store` |

## 📦 如何執行
1. 安裝依賴：`npm install --legacy-peer-deps`
2. 啟動伺服器：`npx expo start -c`（或直接執行 `run.bat`）
3. 使用 iPhone 上的 **Expo Go (SDK 54)** 掃描 QR Code。

---

## 📝 課表擷取技術筆記

### 問題背景
文化大學的校務系統 (`ecampus.pccu.edu.tw`) 與教務系統 (`ap1.pccu.edu.tw`) 是**完全獨立的域名**，各自維護獨立的 Session。在瀏覽器中，使用者從 ecampus 點選課表功能時，系統透過 SSO 機制（iframe 登入 + `gfOpenLink` 開啟新視窗）自動傳遞 Session。但在 React Native 中，`fetch` API 無法處理這種跨域 Cookie/Session 轉移。

### 嘗試過但失敗的方案

| 方案 | 為何失敗 |
|------|----------|
| `fetch` 手動管理 Cookie Jar | ecampus 的 `ASP.NET_SessionId` 無法跨域到 ap1 |
| 直接 GET ap1 課表 URL | 回應「逾時過期,請重新登入」(1232 bytes) |
| 呼叫 `gfGetMyFunctionList` API | 回傳 500（RequireJS 未載入完畢/Session 不完整）|
| ASP.NET POST with `__VIEWSTATE` | 同樣需要先有 ap1 的有效 Session |

### 最終成功方案：隱藏 WebView + JS 注入

使用隱藏的 `react-native-webview` 元件模擬完整的瀏覽器環境，自動化 9 步流程：

```
1. 載入 ecampus 登入頁 (含 ap1 iframe)
2. 注入 JS → same-origin XHR 呼叫 gfChkLogin 登入
3. 跳轉 inside.aspx 建立完整 Session
4. 覆寫 window.open → 攔截 gfOpenLink("1208",...) 的彈窗 URL
5. 在 WebView 內導航到該 URL（課表查詢系統）
6. 注入 JS → 點擊 td[onclick*="queryByStudent"] 切換分頁
7. 注入 JS → 點擊 #Search 執行查詢
8. 注入 JS → 從 <table> 中提取課表 HTML
9. 回傳 React Native 解析並渲染
```

### 開發坑點紀錄

#### 1. Big5 編碼
文大伺服器使用 Big5 編碼。URL 中若包含中文（如「下午」），必須先轉為 Big5 再 percent-encode（`%A4U%A4%C8`），**不能**使用標準 `encodeURIComponent`。

#### 2. 隱藏的 TD 事件
選單項目不是 `<a>` 標籤，而是寫在 `<td>` 的 `onclick` 屬性裡：
```javascript
// ✅ 正確
document.querySelector('td[onclick*="queryByStudent"]')
// ❌ 錯誤 — 找不到
document.querySelector('a[href*="queryByStudent"]')
```

#### 3. 多框架 (iframe) 問題
系統大量使用 iframe。在 WebView 中注入的 JS 預設只能訪問頂層 frame，需要用 `iframe.contentDocument` 遍歷子 frame。

#### 4. 防機器人偵測
系統會檢查輸入速度。帳密若「瞬間」填入會被擋。解決方式：在 WebView 中使用 XHR 直接呼叫 API（而非填表單）。

#### 5. 亂碼問題
頁面上的按鈕文字常顯示為亂碼（Big5 解碼失敗）。**優先用 ID 定位**（如 `#Search`），不要依賴文字比對（如 `.find('查詢')`）。

#### 6. WebView 尺寸
隱藏的 WebView 需要足夠的尺寸（如 375×667）才能正常載入頁面。1×1 像素的 WebView 可能導致頁面不正常渲染。

### 專案架構

```
src/
├── screens/
│   ├── LoginScreen.tsx       # 登入畫面（API 驗證帳密）
│   ├── ScheduleScreen.tsx    # 課表（隱藏 WebView 自動擷取 + 原生 UI 顯示）
│   ├── HomeScreen.tsx        # 首頁
│   └── SettingsScreen.tsx    # 設定 / 登出
├── navigation/
│   ├── AppNavigator.tsx      # Login → MainTabs 導航
│   └── TabNavigator.tsx      # 底部膠囊 Tab
└── services/
    ├── api.ts                # ecampus 登入 API
    ├── scraper.ts            # CourseData 型別定義
    └── ScheduleStore.ts      # AsyncStorage 課表快取
```

---

## 📅 開發紀錄
- [x] 階段一：專案基礎環境架設 (Expo + TS)
- [x] 階段二：ASP.NET 登入機制逆向工程 (發現 JSON API: `gfChkLogin`)
- [x] 階段三：實作 iOS 26 未來感登入畫面與主視圖
- [x] 階段四：自刻「懸浮毛玻璃膠囊」底部導航列
- [x] 階段五：課表爬蟲嘗試 — `fetch` + Cookie Jar（失敗：跨域 Session 無法轉移）
- [x] 階段六：Playwright 驗證完整流程（成功：確認 `gfOpenLink` + iframe 登入機制）
- [x] 階段七：WebView 自動化方案實作（成功：隱藏 WebView + JS 注入 9 步流程）
- [x] 階段八：課表解析優化（按星期→節次排序）+ 專案整理

---
*Developed with ❤️*

---

## PCCU 同步除錯紀錄

這段紀錄 health-check / 真機除錯期間確認的問題，避免之後再走回同一批坑。這次大多不是 parser 單點錯誤，而是 shared WebView 的導頁、session handoff、debug preview 呈現方式互相影響。

### 1. 即時 debug 預覽不能做成全域懸浮層

**現象：** Live WebView preview 蓋住整個 App、左右有大黑邊，而且會擋住正常操作。

**根因：** `GlobalScraperWebView` 把 debug preview 當成全域 absolute/floating panel 渲染，沒有使用目前頁面註冊的 debug slot。

**處理方向：** shared WebView preview 只能在頁面註冊 `scraperDebugPreviewFrame` 後顯示；沒有 frame 時必須 hidden 且 `pointerEvents="none"`。刷新按鈕可以保留，但也必須在 debug 框內。

相關檔案：
- `src/features/pccu/engine/GlobalScraperWebView.tsx`
- `src/features/pccu/engine/scraperDebugPreview.ts`
- `src/features/grade/screens/GradeScreenV2.tsx`
- `src/features/schedule/screens/ScheduleScreen.tsx`

### 2. 課表同步不能硬跳結果頁

**現象：** 登入成功後，流程不是卡在錯頁，就是跳到 404，或最後超時沒有進入學生課表頁。

**根因：** PCCU 需要自己的 session transfer 流程。直接跳 `queryByStudent.asp` 或其他 ap1 URL，可能缺少 eCampus 到 ap1 的 session handoff。課表流程必須從 eCampus 進入 `TransUrl.aspx?PrjNo=1208`。

**處理方向：** 透過 eCampus 官方入口開啟服務，跟著 `TransUrl.aspx` 轉進 `ap1.pccu.edu.tw/queryCourse`。除非 WebView 已被 PCCU 自己導到目標頁，否則不要繞過 transfer 頁。

相關檔案：
- `src/features/pccu/engine/GlobalScraperWebView.tsx`
- `src/features/pccu/sync/pccuSyncScripts.ts`

### 3. `queryByCourse.asp` 不是學生課表結果頁

**現象：** Scraper 看起來已進入課程查詢系統，但仍然超時或回傳錯誤 HTML。

**根因：** 課表流程會先落在 `queryByCourse.asp`，那是「依課程查詢」頁，不是「學生課表」結果頁。過寬的 ready 判斷，例如只看到 `pubContent`，會誤判頁面已準備好。

**處理方向：** 只有看到真正的課表結果 marker，例如 `pubTdItem_Period` 或 `PrintTitle`，才視為 ready。如果目前在 `queryByCourse.asp`，要先找到並切到學生課表查詢入口。

相關檔案：
- `src/features/pccu/sync/pccuSyncScripts.ts`

### 4. 學生課表需要正確查詢動作

**現象：** WebView 進入課表查詢區後，仍然沒有產生真正課表表格。

**根因：** 頁面不是載入就會有學生課表。它需要進入學生課表查詢路徑，並帶著正確 form state。

**處理方向：** 參考可運作的 CLI 流程：切到 `queryByStudent.asp`，設定 `hidChkSearch=searchByStudent`，清空不相關學生欄位，然後 submit form。按鈕 click 可以當 fallback，但 form submit 才是穩定路徑。

參考：
- `D:\Code\pccu-cli`

### 5. 歷年成績不能硬跳 `scoreListAll.asp`

**現象：** 歷年成績頁有載入，但拿到空殼、錯頁，或結果解析失敗。

**根因：** 成績系統也依賴自己的 session 與頁面狀態。直接跳 `scoreListAll.asp` 可能缺少成績首頁建立的狀態。

**處理方向：** 透過 `TransUrl.aspx?PrjNo=1220` 開啟成績服務，等成績 landing page 完成，再點/open「歷年成績單」tab，也就是 `scoreListAll.asp?fromasp=StudentScore&lvMainMenuIndex=1`。只有看到歷年成績結果 marker 後才解析。

相關檔案：
- `src/features/pccu/engine/GlobalScraperWebView.tsx`
- `src/features/pccu/sync/pccuSyncScripts.ts`
- `src/features/pccu/parsers/pccuScraper.ts`

### 6. PCCU popup / new-window 導頁必須接回 shared WebView

**現象：** Log 有 popup / open-target，但可視 scraper 沒有移動到預期頁面。

**根因：** PCCU 會用 popup / window.open 進入服務。如果 `popup` message 或 `onOpenWindow` 沒有導回 shared WebView，engine 就會一直等在舊頁面。

**處理方向：** 將 popup / open-window target URL 視為同一個 WebView 內的導頁目標，直接在 shared scraper WebView 裡指定 `window.location.href`。

相關檔案：
- `src/features/pccu/engine/GlobalScraperWebView.tsx`

### 7. Expo / Metro 快取會讓已修好的問題看起來沒變

**現象：** 程式碼已改，但真機看起來還在跑舊的 overlay 或導頁行為。

**根因：** Expo Go / Metro 可能還持有舊 bundle，直到 App reload。

**處理方向：** 改 WebView、debug preview、導頁狀態機後，要 reload Metro bundle 或用 cache clear 重啟 Expo。確認真機跑的是最新 bundle 前，不要直接判定修復失敗。

常用命令：

```powershell
npx expo start -c
curl.exe -s "http://127.0.0.1:8081/reload"
```
