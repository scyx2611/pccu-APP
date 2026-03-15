import React, { useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import * as SecureStore from 'expo-secure-store';
import { BlurView } from 'expo-blur';
import { parseGrades } from '../services/scraper';

export default function GradeWebViewScreen({ navigation, route }: any) {
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('正在初始化...');

  const onMessage = (event: any) => {
    try {
      const response = JSON.parse(event.nativeEvent.data);
      if (response.type === 'log') {
        setStatus(response.message);
      } else if (response.type === 'data') {
        console.log('[WebView] 數據獲取成功');
        const parsed = parseGrades(response.data);
        if (route.params?.onGradesFetched) {
          route.params.onGradesFetched(parsed);
        }
        Alert.alert('同步成功', '已成功獲取歷年成績與排名');
        navigation.goBack();
      }
    } catch (e) {
      console.error('[WebView] 解析 Message 失敗', e);
    }
  };

  const generateInjectionScript = (account: string, pass: string) => `
    (function() {
      const log = (msg) => window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'log', message: msg }));
      const sendData = (data) => window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'data', data }));

      async function run() {
        const url = window.location.href;

        // [1] 登入頁面
        if (url.includes('default.aspx')) {
          log('執行自動登入...');
          const accountInput = document.querySelector('input[id*="Account"]:not([type="hidden"])');
          const passwordInput = document.querySelector('input[id*="Password"]:not([type="hidden"])');
          
          if (accountInput && passwordInput) {
            accountInput.value = '${account}';
            passwordInput.value = '${pass}';
            
            // 模擬點擊登入分頁
            const studentTab = document.querySelector('.nav-link:contains("學生"), a:contains("學生")');
            if (studentTab) studentTab.click();

            setTimeout(() => {
              const loginBtn = document.querySelector('#LoginButton') || document.querySelector('input[value="登入"]');
              if (loginBtn) loginBtn.click();
              else document.forms[0]?.submit();
            }, 1000);
          }
          return;
        }

        // [2] Inside 頁面 (攔截或觸發 gfOpenLink)
        if (url.includes('inside.aspx')) {
          log('登入成功，正在開啟成績查詢...');
          
          // 核心：直接呼叫 1220 代碼開啟成績系統
          if (typeof gfOpenLink === 'function') {
            gfOpenLink("1220", "service", "0", "00", "", "");
          } else {
            log('找不到 gfOpenLink，嘗試手動點擊...');
            const allFunc = document.querySelector('a:contains("全部功能")');
            if (allFunc) allFunc.click();
          }
          return;
        }

        // [3] 成績/課表綜合頁面 (ap1.pccu.edu.tw)
        if (url.includes('queryCourse') || url.includes('queryBy')) {
          log('進入成績系統，正在定位歷年成績單...');
          
          // 步驟 6: 點擊 td[onclick*="..."] 切換分頁 (README 規範)
          // 優先尋找「歷年成績單」對應的 TD 或 ID
          const tabs = Array.from(document.querySelectorAll('td, a'));
          const historyTab = tabs.find(el => 
            (el.getAttribute('onclick') || '').includes('queryByStudentGrade') || 
            el.innerText.includes('歷年') || 
            el.innerText.includes('成績')
          );

          if (historyTab) {
            log('找到歷年成績頁籤，正在切換...');
            historyTab.click();
            
            // 等待切換後點擊查詢
            setTimeout(() => {
              const queryBtn = document.querySelector('#Search') || document.querySelector('input[value*="查詢"]');
              if (queryBtn) {
                log('執行最終查詢...');
                queryBtn.click();
              }
            }, 3000);
          }

          // [4] 擷取數據 (README 步驟 8)
          const checkData = setInterval(() => {
            const bodyText = document.body.innerText;
            // 根據真實數據特徵判定是否已載入
            if (bodyText.includes('學分') && (bodyText.includes('成績') || bodyText.includes('排名'))) {
              clearInterval(checkData);
              log('獲取成功！傳回 App...');
              sendData(bodyText);
            }
          }, 2000);
        }
      }

      // 監控 URL 變化並重複執行
      setInterval(run, 3000);
      run();
    })();
    true;
  `;

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: 'https://ecampus.pccu.edu.tw/eCampus/default.aspx' }}
        onMessage={onMessage}
        onLoadEnd={async () => {
          const acc = await SecureStore.getItemAsync('user_account');
          const pass = await SecureStore.getItemAsync('user_password');
          if (acc && pass) {
            webViewRef.current?.injectJavaScript(generateInjectionScript(acc, pass));
          }
          setLoading(false);
        }}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        style={styles.webview}
      />
      <View style={styles.overlay}>
        <BlurView intensity={90} tint="light" style={StyleSheet.absoluteFill} />
        <ActivityIndicator size="large" color="#0A7AFF" />
        <Text style={styles.statusText}>{status}</Text>
        <Text style={styles.subText}>請稍候，正在自動化獲取成績資料...</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  webview: { flex: 1, opacity: 0 }, // 遵循 README 隱藏 WebView
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  statusText: { marginTop: 20, fontSize: 18, fontWeight: '700', color: '#1C1C1E' },
  subText: { marginTop: 8, fontSize: 14, color: '#8E8E93' }
});
