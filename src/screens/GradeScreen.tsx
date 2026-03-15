import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Dimensions, Animated } from 'react-native';
import { WebView } from 'react-native-webview';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SemesterGrade, parseGradesFromHtml } from '../services/scraper';
import { getGrades, setGrades as saveGrades } from '../services/GradeStore';
import { useTheme } from '../contexts/ThemeContext';

type Phase = 'idle' | 'load_ecampus' | 'logging_in' | 'wait_redirect' | 'call_gfopen' | 'load_grade' | 'done';

type GradeScreenProps = {
  showDetails?: boolean;
  onToggleDetails?: () => void;
  onScrollY?: Animated.Value;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const formatUpdatedAt = (value?: number | null) => {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function GradeScreen({ showDetails, onToggleDetails, onScrollY }: GradeScreenProps) {
  const [loading, setLoading] = useState(false);
  const [grades, setGrades] = useState<SemesterGrade[]>([]);
  const [preAdmission, setPreAdmission] = useState<SemesterGrade[]>([]);
  const rankRef = useRef<{ average?: string; classRank?: string; deptRank?: string } | null>(null);
  const [statusText, setStatusText] = useState('');
  const [showWebView, setShowWebView] = useState(false);
  const [localShowDetails, setLocalShowDetails] = useState(true);
  const [updatedAtText, setUpdatedAtText] = useState('');
  
  const insets = useSafeAreaInsets();
  const { theme, isDark } = useTheme();
  const detailsVisible = typeof showDetails === 'boolean' ? showDetails : localShowDetails;
  const toggleDetails = useCallback(() => {
    if (onToggleDetails) {
      onToggleDetails();
    } else {
      setLocalShowDetails((v) => !v);
    }
  }, [onToggleDetails]);

  const webViewRef = useRef<WebView>(null);
  const credRef = useRef<{ account: string; password: string } | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<Phase>('idle');
  const hasCacheRef = useRef(false);
  const silentSyncRef = useRef(false);

  const setPhase = (p: Phase) => { phaseRef.current = p; };
  const clearTimeouts = () => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  };

  const finishSync = useCallback((err?: string) => {
    clearTimeouts();
    setPhase('done');
    setShowWebView(false);
    setLoading(false);
    if (err && !silentSyncRef.current) Alert.alert('同步結果', err);
    silentSyncRef.current = false;
  }, []);

  const startSync = useCallback(async (opts?: { silent?: boolean }) => {
    const account = await SecureStore.getItemAsync('user_account');
    const password = await SecureStore.getItemAsync('user_password');

    if (!account || !password) {
      if (!opts?.silent) Alert.alert('提示', '請先至「設定」儲存您的帳號與密碼');
      return;
    }

    credRef.current = { account, password };
    silentSyncRef.current = !!opts?.silent;
    if (!opts?.silent) {
      setLoading(true);
      setStatusText('連線中...');
    }
    setShowWebView(true);
    setPhase('load_ecampus');

    clearTimeouts();
    timeoutRef.current = setTimeout(() => {
      finishSync('連線逾時，請檢查網路狀態');
    }, 45000);
  }, [finishSync]);

  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.t === 'log') setStatusText(data.m);
      
      if (data.t === 'rank') {
        rankRef.current = {
          average: data.avg || '',
          classRank: data.classRank || '',
          deptRank: data.deptRank || ''
        };
      }

      if (data.t === 'login_ok') {
        setPhase('wait_redirect');
        setStatusText('登入成功，導向中...');
        webViewRef.current?.injectJavaScript(`window.location.href='https://ecampus.pccu.edu.tw/eCampus/inside.aspx';true;`);
      }

      if (data.t === 'login_fail') finishSync(data.m || '登入失敗，請確認帳號密碼');

      if (data.t === 'popup' && data.url) {
        const rawUrl = String(data.url || '');
        if (rawUrl.indexOf('PrjNo=1208') !== -1) {
          setStatusText('模組錯誤，重新導向成績系統...');
          webViewRef.current?.injectJavaScript(`(function(){ if(typeof gfOpenLink==='function'){ gfOpenLink("1220","service","0","00","",""); } })();true;`);
          return;
        }
        setPhase('load_grade');
        setStatusText('開啟成績系統...');
        webViewRef.current?.injectJavaScript(`window.location.href=${JSON.stringify(rawUrl)};true;`);
      }

      if (data.t === 'grade_html') {
        const rawHtml = data.html || '';
        const parsed = parseGradesFromHtml(rawHtml);
        const norm = (s: string) => s.replace(/\s|　/g, '');
        const hasPre = /入學前抵免/.test(norm(rawHtml));
        const isPre = (s: SemesterGrade) =>
          /入學前抵免/.test(norm(s.title)) ||
          s.courses.some((c) => /入學前抵免|抵免/.test(norm(c.name)) || /抵免/.test(norm(c.type)));

        let pre: SemesterGrade[] = parsed.filter(isPre);
        let regular: SemesterGrade[] = parsed.filter((s) => !isPre(s));
        
        if (hasPre && pre.length === 0 && parsed.length > 0) {
          pre = parsed.map((s) => ({ ...s, title: '入學前抵免', stats: {} }));
          regular = [];
        }

        if (parsed.length > 0) {
          const rank = rankRef.current;
          if (rank && regular.length > 0) {
            regular = regular.map((s) => ({
              ...s,
              stats: {
                ...s.stats,
                average: s.stats.average || rank.average,
                classRank: s.stats.classRank || rank.classRank,
                deptRank: s.stats.deptRank || rank.deptRank
              }
            }));
          }
          setGrades(regular);
          setPreAdmission(pre);
          const updatedAt = Date.now();
          setUpdatedAtText(formatUpdatedAt(updatedAt));
          saveGrades(regular, pre, updatedAt);
          finishSync();
        } else {
          finishSync('無法在頁面上解析到成績');
        }
      }

      if (data.t === 'err') finishSync(data.m || '未知錯誤');
    } catch (e) {}
  }, [finishSync]);

  const handleNavChange = useCallback((nav: any) => {
    const url = nav.url || '';
    const phase = phaseRef.current;

    if (phase === 'load_ecampus' && !nav.loading && url.includes('ecampus.pccu.edu.tw')) {
      setPhase('logging_in');
      setStatusText('登入中...');
      const c = credRef.current;
      if (!c) return finishSync('找不到帳密');

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
            } catch(e){
              window.ReactNativeWebView.postMessage(JSON.stringify({t:'err',m:e.message}));
            }
          };
          xhr.onerror=function(){window.ReactNativeWebView.postMessage(JSON.stringify({t:'err',m:'網路請求失敗'}));};
          xhr.send(JSON.stringify({
            Account:${JSON.stringify(c.account)},
            Password:${JSON.stringify(c.password)},
            SwitchUserId:"",UserRole:"student",LangType:"zh-TW",Switch:false
          }));
        })();true;
      `);
    }

    if (phase === 'wait_redirect' && !nav.loading && url.includes('inside.aspx')) {
      setPhase('call_gfopen');
      setStatusText('開啟成績模組...');

      setTimeout(() => {
        webViewRef.current?.injectJavaScript(`
          (function(){
            window.open = function(url){
              var abs = url;
              if(url && url.indexOf('http') !== 0){
                abs = 'https://ecampus.pccu.edu.tw/eCampus/' + url.replace(/^\\//,'');
              }
              window.ReactNativeWebView.postMessage(JSON.stringify({t:'popup', url:abs}));
              return null;
            };

            var tries = 0;
            var iv = setInterval(function(){
              tries++;
              if(typeof gfOpenLink === 'function'){
                clearInterval(iv);
                try { gfOpenLink("1220","service","0","00","",""); }
                catch(e){ window.ReactNativeWebView.postMessage(JSON.stringify({t:'err',m:'gfOpenLink:'+e.message})); }
              } else if(tries > 30){
                clearInterval(iv);
                window.ReactNativeWebView.postMessage(JSON.stringify({t:'err',m:'找不到成績連結'}));
              }
            }, 500);
          })();true;
        `);
      }, 2000);
    }

    if (phase === 'load_grade' && !nav.loading && (url.includes('ap1.pccu.edu.tw') || url.includes('ap2.pccu.edu.tw'))) {
      setStatusText('讀取成績數據...');
      webViewRef.current?.injectJavaScript(`
        (function(){
          if(window._gradeUrl === window.location.href) return;
          window._gradeUrl = window.location.href;
          var log = function(m){ window.ReactNativeWebView.postMessage(JSON.stringify({t:'log',m:m})); };
          var done = function(html){ window.ReactNativeWebView.postMessage(JSON.stringify({t:'grade_html',html:html})); };
          var err = function(m){ window.ReactNativeWebView.postMessage(JSON.stringify({t:'err',m:m})); };

          function extractRank(doc){
            try {
              var bodyText = (doc.body && doc.body.innerText) ? doc.body.innerText : '';
              var compact = bodyText.replace(/[\\s　]+/g,'');
              var avg = '';
              var classRank = '';
              var deptRank = '';
              var m;
              m = compact.match(/學業成績平均([0-9.]+)/);
              if(m && m[1]) avg = m[1];
              if(!avg){
                m = compact.match(/總平均([0-9.]+)/);
                if(m && m[1]) avg = m[1];
              }
              m = compact.match(/班名次[^0-9]*([0-9]+\\/[0-9]+)/);
              if(m && m[1]) classRank = m[1];
              if(!classRank){
                m = compact.match(/班排名[^0-9]*([0-9]+\\/[0-9]+)/);
                if(m && m[1]) classRank = m[1];
              }
              m = compact.match(/系名次[^0-9]*([0-9]+\\/[0-9]+)/);
              if(m && m[1]) deptRank = m[1];
              if(!deptRank){
                m = compact.match(/系排名[^0-9]*([0-9]+\\/[0-9]+)/);
                if(m && m[1]) deptRank = m[1];
              }
              if(!classRank){
                m = compact.match(/名次\\/全班人數[^0-9]*([0-9]+\\/[0-9]+)/);
                if(m && m[1]) classRank = m[1];
              }
              if(!deptRank){
                m = compact.match(/名次\\/全系人數[^0-9]*([0-9]+\\/[0-9]+)/);
                if(m && m[1]) deptRank = m[1];
              }
              if(avg || classRank || deptRank){
                return { avg: avg, classRank: classRank, deptRank: deptRank };
              }
            } catch(e){}
            return null;
          }

          function findTablesInDoc(doc){
            try {
              var tables = doc.querySelectorAll('table');
              var htmlOut = '';
              for(var i=0;i<tables.length;i++){
                var t = tables[i];
                var text = (t.innerText || '').replace(/\\s+/g,' ').trim();
                // 只要表格有一定長度，且包含關鍵字，就收集起來
                if(text.length > 50 && (
                   text.indexOf('選課別') !== -1 || 
                   text.indexOf('學期成績平均') !== -1 || 
                   text.indexOf('總平均') !== -1 || 
                   text.indexOf('抵免') !== -1 ||
                   text.indexOf('班排名') !== -1
                )){
                  htmlOut += t.outerHTML + '\\n';
                }
              }
              // 如果上面比較嚴格的過濾沒抓到，用寬鬆模式收集大表格
              if(!htmlOut){
                for(var j=0;j<tables.length;j++){
                  var t2 = tables[j];
                  if(t2.innerText && t2.innerText.length > 150){
                    htmlOut += t2.outerHTML + '\\n';
                  }
                }
              }
              return htmlOut;
            } catch(e){}
            return '';
          }

          function findTables(){
            var html = findTablesInDoc(document);
            if(html) return { html: html };
            var iframes = document.querySelectorAll('iframe');
            for(var i=0;i<iframes.length;i++){
              try {
                var doc = iframes[i].contentDocument || iframes[i].contentWindow.document;
                html = findTablesInDoc(doc);
                if(html) return { html: html };
              } catch(e){}
            }
            return { html: '' };
          }

          function findTabByTextInDoc(doc, text){
            var els = doc.querySelectorAll('*');
            for(var i=0;i<els.length;i++){
              var t = (els[i].textContent || '').replace(/\\s+/g,'').trim();
              if(t === text){ return els[i]; }
            }
            return null;
          }

          function findHistoryTabInDoc(doc){
            var els = doc.querySelectorAll('*');
            for(var i=0;i<els.length;i++){
              var txt = (els[i].textContent || '');
              var oc = els[i].getAttribute && (els[i].getAttribute('onclick') || '');
              var href = els[i].getAttribute && (els[i].getAttribute('href') || '');
              var clean = txt.replace(/\\s+/g,'').trim();
              if((oc && (oc.indexOf('queryByStudentGrade') !== -1 || oc.indexOf('queryByStudent') !== -1)) ||
                 (href && (href.indexOf('scoreListAll') !== -1 || href.indexOf('StudentScore') !== -1 || href.indexOf('studentscore') !== -1)) ||
                 clean === '歷年成績單' ||
                 clean === '歷年成績' ||
                 clean.indexOf('歷年成績單') !== -1 ||
                 clean.indexOf('歷年成績') !== -1){
                return els[i];
              }
            }
            return null;
          }

          function clickElementDeep(el){
            if(!el) return false;
            var cur = el;
            for(var i=0;i<4 && cur;i++){
              try {
                if(cur.getAttribute){
                  var href = cur.getAttribute('href');
                  if(href){ window.location.href = href; return true; }
                  var oc = cur.getAttribute('onclick');
                  if(oc){
                    var m = oc.match(/scoreListAll\\.asp[^'"]*/i);
                    if(m && m[0]){
                      var target = m[0];
                      if(target.indexOf('http') !== 0){
                        var base = window.location.href.replace(/\\/[^\\/]*$/, '/');
                        target = base + target;
                      }
                      window.location.href = target;
                      return true;
                    }
                    try { eval(oc); return true; } catch(e){}
                  }
                }
                if(cur.click) { cur.click(); return true; }
              } catch(e){}
              cur = cur.parentElement;
            }
            return false;
          }

          function findHistoryTab(){
            var t = null;
            try { t = findHistoryTabInDoc(document); } catch(e){}
            if(t) return { el: t, where: 'main' };
            var iframes = document.querySelectorAll('iframe');
            for(var i=0;i<iframes.length;i++){
              try {
                var doc = iframes[i].contentDocument || iframes[i].contentWindow.document;
                t = findHistoryTabInDoc(doc);
                if(t) return { el: t, where: 'iframe' };
              } catch(e){}
            }
            return null;
          }

          function clickSearchInDoc(doc){
            var btn = doc.querySelector('#Search') || doc.querySelector('input[value*=\"查詢\"],input[value*=\"搜尋\"],input[value*=\"查询\"]');
            if(btn) { btn.click(); return true; }
            return false;
          }

          function clickSearch(){
            if(clickSearchInDoc(document)) return true;
            var iframes = document.querySelectorAll('iframe');
            for(var i=0;i<iframes.length;i++){
              try {
                var doc = iframes[i].contentDocument || iframes[i].contentWindow.document;
                if(clickSearchInDoc(doc)) return true;
              } catch(e){}
            }
            return false;
          }

          if(window.location.href.indexOf('scoreListAll.asp') !== -1){
            log('正在擷取歷年成績...');
            if(!window._rankSent){
              var r = extractRank(document);
              if(!r){
                try {
                  var ifr = document.querySelectorAll('iframe');
                  for(var ri=0;ri<ifr.length;ri++){
                    try {
                      var d = ifr[ri].contentDocument || ifr[ri].contentWindow.document;
                      r = extractRank(d);
                      if(r) break;
                    } catch(e){}
                  }
                } catch(e){}
              }
              if(r){
                window._rankSent = true;
                window.ReactNativeWebView.postMessage(JSON.stringify({t:'rank', avg:r.avg, classRank:r.classRank, deptRank:r.deptRank}));
              }
            }
            var triesH = 0;
            var ivH = setInterval(function(){
              triesH++;
              var res = findTables();
              if(res && res.html){
                clearInterval(ivH);
                done(res.html);
                return;
              }
              if(triesH >= 20){
                clearInterval(ivH);
                err('找不到成績表格');
              }
            }, 1000);
            return;
          }

          log('尋找歷年成績頁籤...');
          function dumpCandidates(doc, label){
            try {
              var scoreLink = '';
              var nodes = doc.querySelectorAll('*');
              for(var i=0;i<nodes.length;i++){
                var n = nodes[i];
                if(!n.getAttribute) continue;
                var oc = n.getAttribute('onclick') || '';
                if(!scoreLink && oc && oc.indexOf('scoreListAll.asp') !== -1){
                  var m = oc.match(/scoreListAll\\.asp[^'"]*/i);
                  if(m && m[0]) scoreLink = m[0];
                }
              }
              if(scoreLink && !window._forceScoreJump && window.location.href.indexOf('scoreListAll.asp') === -1){
                window._forceScoreJump = true;
                var abs = scoreLink;
                if(abs.indexOf('http') !== 0){
                  abs = 'https://ap1.pccu.edu.tw/studentscore/student/' + abs.replace(/^\\//,'');
                }
                window.location.href = abs;
              }
            } catch(e){}
          }
          dumpCandidates(document, 'main');
          try {
            var ifr = document.querySelectorAll('iframe');
            for(var di=0;di<ifr.length;di++){
              try {
                var ddoc = ifr[di].contentDocument || ifr[di].contentWindow.document;
                dumpCandidates(ddoc, 'iframe'+di);
              } catch(e){}
            }
          } catch(e){}

          var tabTries = 0;
          var tabIv = setInterval(function(){
            tabTries++;
            var found = findHistoryTab();
            if(found && found.el){
              clearInterval(tabIv);
              log('切換至歷年成績單...');
              try {
                var el = found.el;
                var clickEl = el.closest && (el.closest('td') || el.closest('a')) || el;
                if(!clickElementDeep(clickEl)){
                  clickElementDeep(el);
                }
              } catch(e){}
              setTimeout(function(){ clickSearch(); }, 2000);
              return;
            }
            if(tabTries >= 12){
              clearInterval(tabIv);
              err('找不到歷年成績頁籤');
            }
          }, 1000);

          var tries = 0;
          var iv = setInterval(function(){
            tries++;
            var res = findTables();
            if(res && res.html){
              clearInterval(iv);
              done(res.html);
              return;
            }
            if(tries >= 16){
              clearInterval(iv);
              err('找不到成績數據');
            }
          }, 1500);
        })();true;
      `);
    }
  }, [finishSync]);

  useEffect(() => {
    (async () => {
      const cached = await getGrades();
      if (cached.grades && cached.grades.length > 0) {
        setGrades(cached.grades);
        setPreAdmission(cached.preAdmission || []);
        hasCacheRef.current = true;
      }
      if (cached.updatedAt) {
        setUpdatedAtText(formatUpdatedAt(cached.updatedAt));
      }
      startSync({ silent: hasCacheRef.current });
    })();
    return () => clearTimeouts();
  }, [startSync]);

  const renderSemesterCard = (semester: SemesterGrade, showStats: boolean) => {
    const hasStats = !!(semester.stats.average || semester.stats.classRank || semester.stats.deptRank);
    return (
    <View key={semester.title} style={[styles.card, { backgroundColor: theme.card }]}>
      <View style={[styles.cardHeader, { backgroundColor: theme.cardHeader, borderBottomColor: theme.border }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>{semester.title}</Text>
      </View>
      {showStats && hasStats && (
        <View style={[styles.rankRow, { backgroundColor: theme.rankBg, borderBottomColor: theme.border }]}>
          <View style={styles.rankItem}>
            <Text style={[styles.rankLabel, { color: theme.textSub }]}>平均</Text>
            <Text style={[styles.rankVal, { color: detailsVisible ? theme.primary : theme.textSub }]}>{detailsVisible ? (semester.stats.average || '--') : '•••'}</Text>
          </View>
          <View style={styles.rankItem}>
            <Text style={[styles.rankLabel, { color: theme.textSub }]}>班排</Text>
            <Text style={[styles.rankVal, { color: detailsVisible ? theme.primary : theme.textSub }]}>{detailsVisible ? (semester.stats.classRank || '--') : '••/••'}</Text>
          </View>
          <View style={styles.rankItem}>
            <Text style={[styles.rankLabel, { color: theme.textSub }]}>系排</Text>
            <Text style={[styles.rankVal, { color: detailsVisible ? theme.primary : theme.textSub }]}>{detailsVisible ? (semester.stats.deptRank || '--') : '••/••'}</Text>
          </View>
        </View>
      )}
      <View style={styles.courseList}>
        {semester.courses.map((course, cIdx) => (
          <View key={cIdx} style={[styles.courseRow, { borderBottomColor: theme.border }]}>
            <View style={styles.courseInfo}>
              <View style={[styles.typeBadge, { backgroundColor: course.type === '必' ? '#FF3B30' : '#34C759' }]}>
                <Text style={styles.typeText}>{course.type}</Text>
              </View>
              <Text style={[styles.courseName, { color: theme.text }]}>{course.name}</Text>
            </View>
            <View style={styles.scoreInfo}>
              <Text style={[styles.creditsText, { color: theme.textSub }]}>{course.credits} 學分</Text>
              <Text style={[styles.scoreText, { color: theme.text }]}>{detailsVisible ? course.score : '•••'}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {showWebView && (
        <View style={styles.webViewContainer} pointerEvents="none">
          <WebView
            ref={webViewRef}
            source={{ uri: 'https://ecampus.pccu.edu.tw/eCampus/default.aspx' }}
            onNavigationStateChange={handleNavChange}
            onMessage={handleMessage}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            sharedCookiesEnabled={true}
            thirdPartyCookiesEnabled={true}
            originWhitelist={['*']}
            style={{ flex: 1 }}
          />
        </View>
      )}

      {loading && (
        <View style={[styles.overlay, { backgroundColor: theme.overlay }]}>
          <BlurView intensity={isDark ? 50 : 40} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.status, { color: theme.primary }]}>{statusText}</Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 80 }]}
        onScroll={onScrollY ? Animated.event([{ nativeEvent: { contentOffset: { y: onScrollY } } }], { useNativeDriver: false }) : undefined}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Text style={[styles.title, { color: theme.text }]}>歷年成績</Text>
            <TouchableOpacity
              onPress={toggleDetails}
              style={[styles.eyeButton, { backgroundColor: theme.card, borderColor: theme.border }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
            >
              <Ionicons name={detailsVisible ? 'eye-outline' : 'eye-off-outline'} size={18} color={theme.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {grades.length === 0 && preAdmission.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="ribbon-outline" size={80} color={theme.textSub} />
            <Text style={[styles.emptyText, { color: theme.textSub }]}>成績同步中...</Text>
          </View>
        ) : (
          <>
            {preAdmission.map((s) => renderSemesterCard(s, false))}
            {grades.map((s) => renderSemesterCard(s, true))}
          </>
        )}
        <Text style={[styles.updatedAtText, { color: theme.textSub }]}>最後更新：{updatedAtText || '尚未更新'}</Text>
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webViewContainer: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, opacity: 0, zIndex: -1 },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 1000 },
  status: { marginTop: 15, fontSize: 16, fontWeight: 'bold' },
  scroll: { paddingHorizontal: 20 },
  header: { flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', marginBottom: 20 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 34, fontWeight: '800', lineHeight: 36, includeFontPadding: false },
  eyeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    marginLeft: 10,
  },
  syncBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  syncText: { fontWeight: 'bold', marginLeft: 6, fontSize: 16 },
  empty: { alignItems: 'center', marginTop: 120 },
  emptyText: { marginTop: 16, fontSize: 16 },
  updatedAtText: { fontSize: 12, textAlign: 'center', marginTop: 8 },
  card: { borderRadius: 20, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2, overflow: 'hidden' },
  cardHeader: { padding: 15, borderBottomWidth: 0.5 },
  cardTitle: { fontWeight: '700', fontSize: 16 },
  rankRow: { flexDirection: 'row', paddingVertical: 15, borderBottomWidth: 0.5 },
  rankItem: { flex: 1, alignItems: 'center' },
  rankLabel: { fontSize: 11, marginBottom: 4 },
  rankVal: { fontSize: 18, fontWeight: '800' },
  courseList: { padding: 10 },
  courseRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 5, borderBottomWidth: 0.5 },
  courseInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  typeBadge: { width: 22, height: 22, borderRadius: 6, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  typeText: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },
  courseName: { fontSize: 15, fontWeight: '500', flex: 1 },
  scoreInfo: { alignItems: 'flex-end', marginLeft: 10 },
  creditsText: { fontSize: 11, marginBottom: 2 },
  scoreText: { fontSize: 17, fontWeight: '700' }
});
