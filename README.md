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
