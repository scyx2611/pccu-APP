import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Linking } from 'react-native';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { CourseData } from '../services/scraper';
import { getCourses, setCourses as saveCourses } from '../services/ScheduleStore';

/**
 * WebView 自動化狀態機（根據 Playwright 成功腳本）：
 * 
 * 1. load_ecampus   - 載入 ecampus 登入頁（含 ap1 iframe）
 * 2. logging_in     - 在 ecampus 頁面注入 JS 登入
 * 3. wait_redirect  - 等待登入後跳轉
 * 4. call_gfopen    - 在 inside.aspx 呼叫 gfOpenLink 並攔截彈出 URL
 * 5. load_schedule  - 載入被攔截的課表查詢 URL
 * 6. click_tab      - 點擊「學生課表查詢」分頁
 * 7. click_search   - 點擊 #Search 查詢按鈕
 * 8. extract        - 提取課表 HTML
 * 9. done
 */
type Phase = 'idle' | 'load_ecampus' | 'logging_in' | 'wait_redirect' |
  'call_gfopen' | 'load_schedule' | 'click_tab' | 'click_search' | 'extract' | 'done' | 'error';

export default function ScheduleScreen() {
  const [loading, setLoading] = useState(false);
  const [courses, setCoursesState] = useState<CourseData[]>([]);
  const [useMock, setUseMock] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [statusText, setStatusText] = useState('');

  const webViewRef = useRef<WebView>(null);
  const [showWebView, setShowWebView] = useState(false);
  const phaseRef = useRef<Phase>('idle');
  const credRef = useRef<{ account: string; password: string } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setPhase = (p: Phase) => {
    console.log('[WV] phase:', phaseRef.current, '→', p);
    phaseRef.current = p;
  };

  const clearTimeouts = () => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  };

  const finish = useCallback((err?: string) => {
    clearTimeouts();
    setShowWebView(false);
    setPhase('done');
    setLoading(false);
    if (err) setStatusText(err);
    setInitialLoaded(true);
  }, []);

  // 從快取載入
  const loadFromCache = async (): Promise<boolean> => {
    const cached = await getCourses();
    if (cached.courses && cached.courses.length > 0) {
      setCoursesState(cached.courses);
      setUseMock(cached.mock);
      setInitialLoaded(true);
      return true;
    }
    return false;
  };

  // 啟動 WebView 獲取
  const startFetch = async () => {
    const account = await SecureStore.getItemAsync('user_account');
    const password = await SecureStore.getItemAsync('user_password');
    if (!account || !password) {
      setStatusText('尚未登入，請先登入');
      setInitialLoaded(true);
      return;
    }
    credRef.current = { account, password };
    setLoading(true);
    setStatusText('準備連線...');
    setPhase('load_ecampus');
    setShowWebView(true);

    // 45 秒全域超時
    clearTimeouts();
    timeoutRef.current = setTimeout(() => {
      console.log('[WV] ⏰ 全域超時');
      finish('連線逾時');
    }, 45000);
  };

  // ========== WebView 導航回調 ==========
  const handleNavChange = useCallback((nav: WebViewNavigation) => {
    const url = nav.url || '';
    const phase = phaseRef.current;

    // 只在頁面「正在載入」時觸發某些動作，在「載入完成」時觸發另一些
    console.log('[WV] nav:', url.substring(0, 60), 'loading:', nav.loading, 'phase:', phase);

    // ---- Phase: load_ecampus → 等 ecampus 載入完成 ----
    if (phase === 'load_ecampus' && !nav.loading && url.includes('ecampus.pccu.edu.tw')) {
      setPhase('logging_in');
      setStatusText('正在登入...');
      const c = credRef.current;
      if (!c) return finish('缺少帳密');

      // 在 ecampus 頁面用 same-origin XHR 登入
      webViewRef.current?.injectJavaScript(`
        (function(){
          var xhr = new XMLHttpRequest();
          xhr.open('POST','/eCampus/default.aspx/gfChkLogin',true);
          xhr.setRequestHeader('Content-Type','application/json; charset=utf-8');
          xhr.setRequestHeader('X-Requested-With','XMLHttpRequest');
          xhr.onload = function(){
            try {
              var d = JSON.parse(xhr.responseText);
              if(d.d && d.d.HasError===false){
                window.ReactNativeWebView.postMessage(JSON.stringify({t:'login_ok'}));
              } else {
                window.ReactNativeWebView.postMessage(JSON.stringify({t:'login_fail',m:d.d?d.d.MessageKey:''}));
              }
            }catch(e){window.ReactNativeWebView.postMessage(JSON.stringify({t:'err',m:e.message}));}
          };
          xhr.onerror=function(){window.ReactNativeWebView.postMessage(JSON.stringify({t:'err',m:'xhr'}));};
          xhr.send(JSON.stringify({
            Account:${JSON.stringify(c.account)},
            Password:${JSON.stringify(c.password)},
            SwitchUserId:"",UserRole:"student",LangType:"zh-TW",Switch:false
          }));
        })();true;
      `);
    }

    // ---- Phase: wait_redirect → 等 inside.aspx 載入完成 ----
    if (phase === 'wait_redirect' && !nav.loading && url.includes('inside.aspx')) {
      setPhase('call_gfopen');
      setStatusText('正在開啟課表查詢...');

      // 等 RequireJS 加載完畢後呼叫 gfOpenLink
      // 覆寫 window.open 攔截彈出 URL
      setTimeout(() => {
        webViewRef.current?.injectJavaScript(`
          (function(){
            // 覆寫 window.open 來攔截 popup URL
            var _origOpen = window.open;
            window.open = function(url, name, features) {
              window.ReactNativeWebView.postMessage(JSON.stringify({t:'popup', url:url}));
              return null;
            };

            // 等 gfOpenLink 函數可用
            var tries = 0;
            var iv = setInterval(function(){
              tries++;
              if(typeof gfOpenLink === 'function'){
                clearInterval(iv);
                try {
                  gfOpenLink("1208","service","0","00","","");
                } catch(e){
                  window.ReactNativeWebView.postMessage(JSON.stringify({t:'err',m:'gfOpenLink:'+e.message}));
                }
              } else if(tries > 30){
                clearInterval(iv);
                window.ReactNativeWebView.postMessage(JSON.stringify({t:'err',m:'gfOpenLink not found after 15s'}));
              }
            }, 500);
          })();true;
        `);
      }, 2000); // 給 inside.aspx 額外 2 秒載入 JS
    }

    // ---- Phase: load_schedule → 等課表查詢頁載入完成 ----
    if (phase === 'load_schedule' && !nav.loading && (url.includes('ap1.pccu.edu.tw') || url.includes('ap2.pccu.edu.tw'))) {
      setPhase('click_tab');
      setStatusText('正在切換到學生課表...');

      setTimeout(() => {
        // 找到 td[onclick*="queryByStudent"] 並點擊
        webViewRef.current?.injectJavaScript(`
          (function(){
            // 嘗試在主頁面找
            var td = document.querySelector('td[onclick*="queryByStudent"]');
            if (td) {
              td.click();
              window.ReactNativeWebView.postMessage(JSON.stringify({t:'tab_clicked'}));
              return;
            }

            // 嘗試在 iframe 裡找
            var iframes = document.querySelectorAll('iframe');
            for(var i=0;i<iframes.length;i++){
              try {
                var doc = iframes[i].contentDocument || iframes[i].contentWindow.document;
                td = doc.querySelector('td[onclick*="queryByStudent"]');
                if(td) { td.click(); window.ReactNativeWebView.postMessage(JSON.stringify({t:'tab_clicked'})); return; }
              } catch(e){}
            }

            // 如果當前頁面已經是 queryByStudent 頁面
            if(document.getElementById('Search') || document.querySelector('#Search')){
              window.ReactNativeWebView.postMessage(JSON.stringify({t:'already_on_schedule'}));
              return;
            }

            window.ReactNativeWebView.postMessage(JSON.stringify({t:'err',m:'找不到課表分頁'}));
          })();true;
        `);
      }, 2000);
    }

    // ---- Phase: click_search → 等 queryByStudent 頁面載入完成 ----
    if (phase === 'click_search' && !nav.loading) {
      setStatusText('正在查詢...');

      setTimeout(() => {
        webViewRef.current?.injectJavaScript(`
          (function(){
            // 找 #Search 按鈕
            var btn = document.getElementById('Search');
            if(!btn){
              // 在 iframe 裡找
              var iframes = document.querySelectorAll('iframe');
              for(var i=0;i<iframes.length;i++){
                try {
                  var doc = iframes[i].contentDocument || iframes[i].contentWindow.document;
                  btn = doc.getElementById('Search');
                  if(btn) break;
                } catch(e){}
              }
            }

            if(btn){
              btn.click();
              window.ReactNativeWebView.postMessage(JSON.stringify({t:'search_clicked'}));
            } else {
              // 可能頁面已經有課表了
              var html = document.documentElement.outerHTML;
              if(html.indexOf('(必)')!==-1 || html.indexOf('(選)')!==-1){
                window.ReactNativeWebView.postMessage(JSON.stringify({t:'has_data'}));
              } else {
                window.ReactNativeWebView.postMessage(JSON.stringify({t:'err',m:'找不到查詢按鈕'}));
              }
            }
          })();true;
        `);
      }, 2000);
    }

    // ---- Phase: extract → 頁面載入完成時提取資料 ----
    if (phase === 'extract' && !nav.loading) {
      setStatusText('正在提取課表...');

      setTimeout(() => {
        webViewRef.current?.injectJavaScript(EXTRACT_SCRIPT);
      }, 3000);  // 查詢後等 3 秒讓結果渲染
    }
  }, [finish]);

  // ========== WebView 消息回調 ==========
  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('[WV] msg:', JSON.stringify(data).substring(0, 200));

      switch (data.t) {
        case 'login_ok':
          console.log('[WV] ✅ 登入成功，跳轉 inside.aspx');
          setPhase('wait_redirect');
          setStatusText('登入成功！');
          webViewRef.current?.injectJavaScript(`
            window.location.href='https://ecampus.pccu.edu.tw/eCampus/inside.aspx';true;
          `);
          break;

        case 'login_fail':
          finish('登入失敗：' + (data.m || ''));
          break;

        case 'popup':
          // 攔截到 gfOpenLink 的彈出 URL！
          console.log('[WV] ✅ 攔截到 popup URL:', data.url);
          setPhase('load_schedule');
          setStatusText('正在開啟課表...');
          webViewRef.current?.injectJavaScript(`
            window.location.href=${JSON.stringify(data.url)};true;
          `);
          break;

        case 'tab_clicked':
          console.log('[WV] ✅ 已點擊學生課表分頁');
          setPhase('click_search');
          // 等分頁載入完成（handleNavChange 會處理）
          break;

        case 'already_on_schedule':
          console.log('[WV] 已在學生課表頁面');
          setPhase('click_search');
          setStatusText('正在查詢...');
          // 手動觸發 click_search 邏輯
          setTimeout(() => {
            webViewRef.current?.injectJavaScript(`
              (function(){
                var btn = document.getElementById('Search');
                if(btn) { btn.click(); window.ReactNativeWebView.postMessage(JSON.stringify({t:'search_clicked'})); }
                else {
                  var html = document.documentElement.outerHTML;
                  if(html.indexOf('(必)')!==-1||html.indexOf('(選)')!==-1){
                    window.ReactNativeWebView.postMessage(JSON.stringify({t:'has_data'}));
                  } else {
                    window.ReactNativeWebView.postMessage(JSON.stringify({t:'err',m:'no search btn'}));
                  }
                }
              })();true;
            `);
          }, 2000);
          break;

        case 'search_clicked':
          console.log('[WV] ✅ 已點擊查詢，等待結果...');
          setPhase('extract');
          setStatusText('正在載入結果...');
          // 等查詢結果載入（handleNavChange 會處理 extract phase）
          // 但如果不觸發導航（同頁 POST），手動等待並提取
          setTimeout(() => {
            if (phaseRef.current === 'extract') {
              webViewRef.current?.injectJavaScript(EXTRACT_SCRIPT);
            }
          }, 5000);
          break;

        case 'has_data':
          console.log('[WV] 頁面已有課表，直接提取');
          setPhase('extract');
          webViewRef.current?.injectJavaScript(EXTRACT_SCRIPT);
          break;

        case 'schedule_html':
          console.log('[WV] ✅ 收到課表 HTML:', data.len, 'chars');
          const parsed = parseScheduleFromHtml(data.html || '');
          if (parsed.length > 0) {
            console.log('[WV] ✅ 成功解析', parsed.length, '門課程');
            setCoursesState(parsed);
            setUseMock(false);
            saveCourses(parsed, false);
          } else {
            console.log('[WV] ❌ 解析失敗');
            setStatusText('解析課表失敗');
          }
          finish();
          break;

        case 'no_schedule':
          console.log('[WV] 頁面無課表:', data.preview?.substring(0, 150));
          finish('未找到課表資料');
          break;

        case 'err':
          console.log('[WV] 錯誤:', data.m);
          finish('錯誤：' + (data.m || ''));
          break;
      }
    } catch (e: any) {
      console.log('[WV] msg parse err:', e.message);
    }
  }, [finish]);

  useEffect(() => {
    (async () => {
      const cached = await loadFromCache();
      if (!cached) startFetch();
    })();
    return () => clearTimeouts();
  }, []);

  return (
    <View style={{ flex: 1 }}>
      {showWebView && (
        <View style={styles.hiddenWebView} pointerEvents="none">
          <WebView
            ref={webViewRef}
            source={{ uri: 'https://ecampus.pccu.edu.tw/eCampus/default.aspx?UserType=&LangType=' }}
            onNavigationStateChange={handleNavChange}
            onMessage={handleMessage}
            onError={(e) => { console.log('[WV] error:', e.nativeEvent); finish('WebView 錯誤'); }}
            javaScriptEnabled={true}
            sharedCookiesEnabled={true}
            thirdPartyCookiesEnabled={true}
            originWhitelist={['*']}
            cacheEnabled={true}
            style={{ width: 375, height: 667 }}
          />
        </View>
      )}

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.headerSpacer} />

        <View style={styles.headerRow}>
          <Text style={styles.pageTitle}>我的課表</Text>
          <TouchableOpacity onPress={startFetch} style={styles.refreshBtn} disabled={loading}>
            {loading ? <ActivityIndicator size="small" color="#0A7AFF" />
              : <Ionicons name="refresh" size={24} color="#0A7AFF" />}
          </TouchableOpacity>
        </View>

        {loading && courses.length === 0 ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator size="large" color="#0A7AFF" />
            <Text style={styles.emptyTitle}>{statusText || '載入中...'}</Text>
            <Text style={styles.emptyText}>自動登入學校系統並擷取課表中{'\n'}這可能需要 10~15 秒...</Text>
          </View>
        ) : courses.length === 0 && initialLoaded ? (
          <View style={styles.emptyCard}>
            <View style={[styles.iconCircle, { backgroundColor: '#FFF3E0' }]}>
              <Ionicons name="information-circle" size={48} color="#FF9500" />
            </View>
            <Text style={styles.emptyTitle}>{statusText || '無法獲取課表'}</Text>
            <Text style={styles.emptyText}>學校系統暫時無法連線，{'\n'}請稍後重試或開啟網頁版。</Text>
            <TouchableOpacity style={styles.syncButton} onPress={startFetch}>
              <Text style={[styles.syncText, { color: '#0A7AFF' }]}>重新嘗試</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.syncButton, { marginTop: 12 }]} onPress={() =>
              Linking.openURL('https://ecampus.pccu.edu.tw/eCampus/')}>
              <Text style={[styles.syncText, { color: '#8E8E93' }]}>開啟網頁版</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {loading && (
              <View style={styles.refreshOverlay}>
                <ActivityIndicator size="small" color="#0A7AFF" />
                <Text style={styles.refreshText}>{statusText || '更新中...'}</Text>
              </View>
            )}
            {useMock && (
              <View style={styles.mockBanner}>
                <Ionicons name="information-circle" size={18} color="#FF9500" />
                <Text style={styles.mockBannerText}>示範資料</Text>
                <TouchableOpacity onPress={startFetch}>
                  <Text style={styles.mockBannerLink}>重新獲取</Text>
                </TouchableOpacity>
              </View>
            )}
            {courses.map((c, i) => <CourseCard key={i} course={c} />)}
          </>
        )}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

// ========== 提取課表 JS ==========
const EXTRACT_SCRIPT = `
(function(){
  function findScheduleTable(doc) {
    var tables = doc.querySelectorAll('table');
    for(var i=0;i<tables.length;i++){
      var t = tables[i];
      if((t.innerHTML.indexOf('(必)') !== -1 || t.innerHTML.indexOf('(選)') !== -1)
          && t.innerHTML.indexOf('pubTdItem_Period') !== -1) {
        return t.outerHTML;
      }
    }
    return '';
  }

  // 先在主頁面找
  var html = findScheduleTable(document);

  // 在 iframe 裡找
  if(!html) {
    var iframes = document.querySelectorAll('iframe');
    for(var i=0;i<iframes.length;i++){
      try {
        var doc = iframes[i].contentDocument || iframes[i].contentWindow.document;
        html = findScheduleTable(doc);
        if(html) break;
      } catch(e){}
    }
  }

  if(html) {
    window.ReactNativeWebView.postMessage(JSON.stringify({
      t:'schedule_html', html:html, len:html.length
    }));
  } else {
    var bodyText = document.body ? document.body.innerText.substring(0,200) : 'no body';
    window.ReactNativeWebView.postMessage(JSON.stringify({
      t:'no_schedule', preview:bodyText
    }));
  }
})();true;
`;

// ========== CourseCard ==========
function CourseCard({ course }: { course: CourseData }) {
  return (
    <View style={styles.courseCard}>
      <View style={styles.courseHeader}>
        <View style={[styles.badge, course.required ? styles.badgeRequired : styles.badgeOptional]}>
          <Text style={[styles.badgeText, course.required ? styles.badgeTextReq : styles.badgeTextOpt]}>
            {course.required ? '必修' : '選修'}
          </Text>
        </View>
        {course.type ? <Text style={styles.courseType}>{course.type}</Text> : null}
      </View>
      <Text style={styles.courseName}>{course.name}</Text>
      <View style={styles.courseInfoRow}>
        <View style={styles.infoItem}>
          <Ionicons name="time" size={16} color="#8E8E93" style={styles.infoIcon} />
          <Text style={styles.infoText}>{course.periodRange}</Text>
        </View>
      </View>
      <View style={[styles.courseInfoRow, { marginTop: 6 }]}>
        <View style={styles.infoItem}>
          <Ionicons name="person" size={16} color="#8E8E93" style={styles.infoIcon} />
          <Text style={styles.infoText}>{course.teacher}</Text>
        </View>
        <View style={styles.infoItem}>
          <Ionicons name="location" size={16} color="#8E8E93" style={styles.infoIcon} />
          <Text style={styles.infoText}>{course.location}</Text>
        </View>
      </View>
    </View>
  );
}

// ========== HTML 解析 ==========
// 根據 schedule.html 的真實結構：
// <tr> 裡第一個 <td> 是節次編號(01~14)，第二個 <td> 是時間，之後 7 個 <td> 是星期一~日
function parseScheduleFromHtml(tableHtml: string): CourseData[] {
  if (!tableHtml) return [];
  const map = new Map<string, CourseData>();
  const dayStrs = ['日', '一', '二', '三', '四', '五', '六'];

  // 從 HTML 結構提取: 每一行有 period(01~14) 和 7 天的 td
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;

  while ((trMatch = trRegex.exec(tableHtml)) !== null) {
    const trHtml = trMatch[1];

    // 提取節次 (例如 01, 02, ..., 14)
    const periodMatch = trHtml.match(/style="background-color:\s*#FEFE8D[^"]*"[^>]*>(\d{2})<\/td>/);
    if (!periodMatch) continue;  // 表頭行，跳過
    const period = parseInt(periodMatch[1]);

    // 提取所有 td（跳過前兩個：節次編號 + 時間）
    const tdRegex = /<td[^>]*class="pubContent"[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch;
    let dayOfWeek = 1;  // 從星期一(=1)開始

    while ((tdMatch = tdRegex.exec(trHtml)) !== null) {
      const cell = tdMatch[1].trim();

      // 空格子
      if (!cell || cell === '&nbsp;' || cell === '\u0026nbsp;') {
        dayOfWeek++;
        continue;
      }

      // 有課程資料
      if (cell.includes('(必)') || cell.includes('(選)')) {
        // 提取課程名稱（在 <font color="#CC3300"> 中）
        const nameMatch = cell.match(/<font color="#CC3300">([\s\S]*?)<\/font>/);
        const rawName = nameMatch ? nameMatch[1].replace(/<[^>]+>/g, '').trim() : '';

        // 提取老師名字（在 <span class="PccuEudcFont"> 中）
        const teacherMatch = cell.match(/<span class="PccuEudcFont">([\s\S]*?)<\/span>/);
        const teacher = teacherMatch ? teacherMatch[1].trim() : '未知';

        // 提取教室地點（在 <font style="color: #666666;"> 中）
        const locMatches = cell.match(/<font style="color: #666666;">([\s\S]*?)<\/font>/g);
        let location = '未定';
        if (locMatches && locMatches.length > 0) {
          location = locMatches[0].replace(/<[^>]+>/g, '').trim() || '未定';
        }

        // 解析 (必)/(選)、type、name
        const isRequired = rawName.includes('(必)');
        let cleanName = rawName.replace(/^\([必選]\)\s*/, '').trim();
        let type = '';

        // 格式: "資管系  1A  D903 程式設計（二）"
        // 用課號 (4~5位英數) 來分割 type 和 name
        const codeMatch = cleanName.match(/^(.+?)\s+([A-Z0-9]{3,5})\s+(.+)$/);
        if (codeMatch) {
          type = codeMatch[1].replace(/\s+/g, ' ').trim();
          cleanName = codeMatch[3].trim();
        }

        // 去掉括號裡的學分數/人數: " (29)" " (24)"
        cleanName = cleanName.replace(/\s*\(\d+\)\s*$/, '').trim();

        const key = `${cleanName}-${dayOfWeek}`;
        if (!map.has(key)) {
          map.set(key, {
            name: cleanName, teacher, location, required: isRequired, type, dayOfWeek,
            periodRange: '', startPeriod: period, endPeriod: period,
          });
        } else {
          map.get(key)!.endPeriod = period;
        }
      }

      dayOfWeek++;
    }
  }

  // 生成最終結果並排序：星期一~日 → 節次小~大
  const courses: CourseData[] = [];
  for (const [, v] of map.entries()) {
    const p = v.startPeriod === v.endPeriod ? `${v.startPeriod}` : `${v.startPeriod}-${v.endPeriod}`;
    courses.push({ ...v, periodRange: `星期${dayStrs[v.dayOfWeek] || '?'} 第 ${p} 節` });
  }
  courses.sort((a, b) => {
    if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
    return a.startPeriod - b.startPeriod;
  });
  return courses;
}

// ========== Styles ==========
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F9' },
  content: { paddingHorizontal: 20 },
  headerSpacer: { height: 100 },
  bottomSpacer: { height: 140 },

  hiddenWebView: {
    position: 'absolute', top: -1000, left: 0, width: 375, height: 667, overflow: 'hidden',
  },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  pageTitle: { fontSize: 34, fontWeight: '800', color: '#1C1C1E', letterSpacing: 0.5 },
  refreshBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8
  },

  mockBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF8E1', borderRadius: 12, padding: 12, marginBottom: 16 },
  mockBannerText: { fontSize: 13, color: '#8E8E93', marginLeft: 6, flex: 1 },
  mockBannerLink: { fontSize: 13, color: '#0A7AFF', fontWeight: '600', marginLeft: 8 },
  refreshOverlay: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, marginBottom: 12 },
  refreshText: { fontSize: 14, color: '#8E8E93', marginLeft: 8 },

  emptyCard: {
    backgroundColor: '#FFF', borderRadius: 32, padding: 32, alignItems: 'center', marginTop: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.06, shadowRadius: 24
  },
  iconCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#F2F2F7', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: '#1C1C1E', marginBottom: 12, marginTop: 16 },
  emptyText: { fontSize: 16, color: '#8E8E93', textAlign: 'center', lineHeight: 24, marginBottom: 32 },
  syncButton: { backgroundColor: '#F2F2F7', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 20 },
  syncText: { fontSize: 16, fontWeight: '600' },

  courseCard: {
    backgroundColor: '#FFF', borderRadius: 24, padding: 20, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 12
  },
  courseHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginRight: 8 },
  badgeRequired: { backgroundColor: '#FF3B3015' },
  badgeOptional: { backgroundColor: '#34C75915' },
  badgeText: { fontSize: 13, fontWeight: '700' },
  badgeTextReq: { color: '#FF3B30' },
  badgeTextOpt: { color: '#34C759' },
  courseType: { fontSize: 14, color: '#8E8E93', fontWeight: '500' },
  courseName: { fontSize: 20, fontWeight: '700', color: '#1C1C1E', marginBottom: 16, letterSpacing: -0.5 },
  courseInfoRow: { flexDirection: 'row', alignItems: 'center' },
  infoItem: { flexDirection: 'row', alignItems: 'center', marginRight: 24 },
  infoIcon: { marginRight: 6 },
  infoText: { fontSize: 15, color: '#8E8E93', fontWeight: '500' },
});
