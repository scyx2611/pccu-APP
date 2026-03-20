import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { setCourses as saveCourses } from '../services/ScheduleStore';
import {
  buildAdaptiveSchedulePageScript,
  buildLoginScript,
  buildServiceOpenScript,
  PCCUCredentials,
} from '../services/pccuSyncScripts';
import { CourseData, parseScheduleFromHtml } from '../services/scraper';

const DEFAULT_URL = 'https://ecampus.pccu.edu.tw/eCampus/default.aspx';
const INSIDE_URL = 'https://ecampus.pccu.edu.tw/eCampus/inside.aspx';

type Phase = 'idle' | 'logging_in' | 'open_schedule' | 'syncing' | 'done';

type ScheduleSyncAgentProps = {
  reloadKey?: number;
};

export default function ScheduleSyncAgent({ reloadKey = 0 }: ScheduleSyncAgentProps) {
  const [webReady, setWebReady] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const credRef = useRef<PCCUCredentials | null>(null);
  const phaseRef = useRef<Phase>('idle');
  const pendingSyncRef = useRef(false);
  const retryRef = useRef(0);
  const lastHandledUrlRef = useRef('');
  const userAgent = Platform.OS === 'ios'
    ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    : 'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36';

  const finish = useCallback(() => {
    pendingSyncRef.current = false;
    retryRef.current = 0;
    lastHandledUrlRef.current = '';
    phaseRef.current = 'done';
  }, []);

  const runLogin = useCallback(() => {
    if (!credRef.current) {
      finish();
      return;
    }

    pendingSyncRef.current = false;
    phaseRef.current = 'logging_in';
    webViewRef.current?.injectJavaScript(buildLoginScript(credRef.current));
  }, [finish]);

  const retrySync = useCallback(() => {
    if (retryRef.current >= 2) {
      finish();
      return;
    }

    retryRef.current += 1;
    lastHandledUrlRef.current = '';
    phaseRef.current = 'syncing';
    webViewRef.current?.injectJavaScript(buildAdaptiveSchedulePageScript());
  }, [finish]);

  const startSync = useCallback(async () => {
    const account = await SecureStore.getItemAsync('user_account');
    const password = await SecureStore.getItemAsync('user_password');

    if (!account || !password) {
      finish();
      return;
    }

    credRef.current = { account, password };
    retryRef.current = 0;
    lastHandledUrlRef.current = '';
    pendingSyncRef.current = true;
    phaseRef.current = 'logging_in';

    if (!webReady) return;

    webViewRef.current?.injectJavaScript(`window.location.href=${JSON.stringify(`${DEFAULT_URL}?ts=`)} + Date.now();true;`);
  }, [finish, webReady]);

  const handleNavChange = useCallback((nav: WebViewNavigation) => {
    if (nav.loading) return;

    const url = nav.url || '';
    console.log('[schedule-agent][nav]', phaseRef.current, url);

    if (url.includes('inside.aspx')) {
      phaseRef.current = 'open_schedule';
      setTimeout(() => {
        webViewRef.current?.injectJavaScript(buildServiceOpenScript('1208'));
      }, 900);
      return;
    }

    if (url.includes('queryByStudent') || url.includes('ap1.pccu') || url.includes('ap2.pccu')) {
      lastHandledUrlRef.current = url;
      phaseRef.current = 'syncing';
      setTimeout(() => {
        console.log('[schedule-agent][inject]', 'adaptive-schedule-script', url);
        webViewRef.current?.injectJavaScript(buildAdaptiveSchedulePageScript());
      }, 900);
    }
  }, []);

  const handleMessage = useCallback(async (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('[schedule-agent][message]', data.t, data.m || '', data.url || '');

      if (data.t === 'user_name' && data.n) {
        await SecureStore.setItemAsync('user_name', data.n);
        return;
      }

      if (data.t === 'login_ok') {
        phaseRef.current = 'open_schedule';
        lastHandledUrlRef.current = '';
        webViewRef.current?.injectJavaScript(`window.location.href=${JSON.stringify(INSIDE_URL)};true;`);
        return;
      }

      if (data.t === 'popup') {
        lastHandledUrlRef.current = '';
        webViewRef.current?.injectJavaScript(`window.location.href=${JSON.stringify(data.url)};true;`);
        return;
      }

      if (data.t === 'courses') {
        const parsed = Array.isArray(data.c) ? (data.c as CourseData[]) : [];
        if (parsed.length > 0) {
          await saveCourses(parsed, false);
          finish();
        } else {
          retrySync();
        }
        return;
      }

      if (data.t === 'html') {
        const parsed = parseScheduleFromHtml(typeof data.h === 'string' ? data.h : '');
        if (parsed.length > 0) {
          await saveCourses(parsed, false);
          finish();
        } else {
          retrySync();
        }
        return;
      }

      if (data.t === 'err') {
        if (phaseRef.current === 'syncing') retrySync();
        else finish();
      }
    } catch (error) {
      finish();
    }
  }, [finish, retrySync]);

  useEffect(() => {
    void startSync();
  }, [reloadKey, startSync]);

  return (
    <View style={styles.hidden} pointerEvents="none">
      <WebView
        ref={webViewRef}
        style={styles.hiddenInner}
        source={{ uri: DEFAULT_URL }}
        originWhitelist={['*']}
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        domStorageEnabled
        cacheEnabled={false}
        userAgent={userAgent}
        onNavigationStateChange={handleNavChange}
        onMessage={handleMessage}
        onLoadEnd={() => {
          console.log('[schedule-agent][loadend]', phaseRef.current);
          if (!webReady) setWebReady(true);
          if (pendingSyncRef.current) {
            runLogin();
            return;
          }
          if (phaseRef.current === 'syncing') {
            setTimeout(() => {
              console.log('[schedule-agent][loadend-inject]', 'adaptive-schedule-script');
              webViewRef.current?.injectJavaScript(buildAdaptiveSchedulePageScript());
            }, 400);
          }
        }}
        onError={finish}
        javaScriptEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    left: -1000,
    top: -1000,
  },
  hiddenInner: {
    width: 1,
    height: 1,
  },
});
