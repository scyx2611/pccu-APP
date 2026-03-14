import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Linking, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { CourseData } from '../services/scraper';

const MOCK_COURSES: CourseData[] = [
  { name: '程式設計 (二)', teacher: '余平', location: '大義 0402', required: true, type: '資管系 1A', dayOfWeek: 2, periodRange: '星期二 第 1-2 節', startPeriod: 1, endPeriod: 2 },
  { name: '國文', teacher: '高菽華', location: '大孝 0412', required: true, type: '中文 1', dayOfWeek: 3, periodRange: '星期三 第 3-4 節', startPeriod: 3, endPeriod: 4 },
  { name: '外文：英文閱讀與聽講(一)', teacher: '李翠蘋', location: '大典 0009', required: true, type: '外文領域1', dayOfWeek: 4, periodRange: '星期四 第 3-4 節', startPeriod: 3, endPeriod: 4 },
  { name: '企業管理', teacher: '郭乃文', location: '大恩 0611', required: true, type: '資管系 1A', dayOfWeek: 5, periodRange: '星期五 第 1-2 節', startPeriod: 1, endPeriod: 2 },
  { name: '資訊管理導論', teacher: '陳武倚', location: '大恩 0608', required: true, type: '資管系 1A', dayOfWeek: 4, periodRange: '星期四 第 7-8 節', startPeriod: 7, endPeriod: 8 },
  { name: '體育 (二)', teacher: '廖俊強', location: '體育館', required: true, type: '體育 1', dayOfWeek: 3, periodRange: '星期三 第 7-8 節', startPeriod: 7, endPeriod: 8 },
  { name: '商用軟體應用與設計', teacher: '郭乃文', location: '大義 0418', required: true, type: '資管系 1A', dayOfWeek: 2, periodRange: '星期二 第 7-8 節', startPeriod: 7, endPeriod: 8 },
];

interface ScheduleWebViewProps {
  onCoursesLoaded?: (courses: CourseData[]) => void;
  onClose?: () => void;
}

export default function ScheduleWebView({ onCoursesLoaded, onClose }: ScheduleWebViewProps) {
  const webViewRef = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showWebView, setShowWebView] = useState(false);

  const scheduleUrl = 'https://ap1.pccu.edu.tw/queryCourse/queryByStudent.asp?QuerySource=student';

  const handleLoadStart = () => {
    setLoading(true);
  };

  const handleLoadEnd = (navState: any) => {
    setLoading(false);
    
    if (navState.url.includes('queryByStudent')) {
      // 頁面加載完成，嘗試注入 JS 來提取課表數據
      setTimeout(() => {
        webViewRef.current?.injectJavaScript(`
          (function() {
            var tables = document.querySelectorAll('table');
            var result = { found: false, html: '' };
            
            tables.forEach(function(table) {
              var text = table.innerText || '';
              if (text.includes('(必)') || text.includes('(選)')) {
                result.found = true;
                result.html = table.outerHTML;
                return;
              }
            });
            
            window.ReactNativeWebView.postMessage(JSON.stringify(result));
          })();
          true;
        `);
      }, 2000);
    }
  };

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.found) {
        // 找到了課表數據，可以進一步解析
        console.log('找到課表 HTML');
      }
    } catch (e) {
      console.log('解析消息失敗:', e);
    }
  };

  const handleOpenExternal = () => {
    Linking.openURL(scheduleUrl);
  };

  if (!showWebView) {
    return (
      <View style={styles.container}>
        <View style={styles.headerSpacer} />
        
        <View style={styles.headerRow}>
          <Text style={styles.pageTitle}>我的課表</Text>
          <TouchableOpacity onPress={() => setShowWebView(true)} style={styles.refreshBtn}>
            <Ionicons name="globe" size={24} color="#0A7AFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.emptyCard}>
          <View style={[styles.iconCircle, { backgroundColor: '#E8F5E9' }]}>
            <Ionicons name="calendar" size={48} color="#34C759" />
          </View>
          <Text style={styles.emptyTitle}>課表載入方式</Text>
          <Text style={styles.emptyText}>
            學校系統有驗證碼保護，請選擇以下方式查看課表：
          </Text>
          
          <TouchableOpacity 
            style={styles.primaryButton} 
            onPress={() => setShowWebView(true)}
          >
            <Ionicons name="browsers" size={20} color="#fff" style={{marginRight: 8}} />
            <Text style={styles.primaryButtonText}>用 WebView 開啟</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.secondaryButton}
            onPress={handleOpenExternal}
          >
            <Ionicons name="open-outline" size={20} color="#0A7AFF" style={{marginRight: 8}} />
            <Text style={styles.secondaryButtonText}>用瀏覽器開啟</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.mockLabel}>或使用示範資料：</Text>
        
        <View style={styles.mockCourses}>
          {MOCK_COURSES.slice(0, 3).map((course, index) => (
            <View key={index} style={styles.courseCard}>
              <View style={styles.courseHeader}>
                <View style={[styles.badge, course.required ? styles.badgeRequired : styles.badgeOptional]}>
                  <Text style={[styles.badgeText, course.required ? styles.badgeTextRequired : styles.badgeTextOptional]}>
                    {course.required ? '必修' : '選修'}
                  </Text>
                </View>
                <Text style={styles.courseType}>{course.type}</Text>
              </View>
              <Text style={styles.courseName}>{course.name}</Text>
              <View style={styles.courseInfoRow}>
                <Text style={styles.infoText}>{course.periodRange}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.webViewContainer}>
      <View style={styles.webViewHeader}>
        <TouchableOpacity onPress={() => setShowWebView(false)} style={styles.closeButton}>
          <Ionicons name="close" size={24} color="#1C1C1E" />
        </TouchableOpacity>
        <Text style={styles.webViewTitle}>課表查詢</Text>
        <TouchableOpacity onPress={handleOpenExternal} style={styles.externalButton}>
          <Ionicons name="open-outline" size={24} color="#0A7AFF" />
        </TouchableOpacity>
      </View>
      
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#0A7AFF" />
          <Text style={styles.loadingText}>載入中...</Text>
        </View>
      )}
      
      <WebView
        ref={webViewRef}
        source={{ uri: scheduleUrl }}
        style={{ flex: 1 }}
        onLoadStart={handleLoadStart}
        onLoadEnd={handleLoadEnd}
        onMessage={handleMessage}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        sharedCookiesEnabled={true}
        cacheEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F5F5F9',
    paddingHorizontal: 20,
  },
  headerSpacer: { height: 100 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  pageTitle: { fontSize: 34, fontWeight: '800', color: '#1C1C1E', letterSpacing: 0.5 },
  refreshBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8 },
  
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 32, padding: 24, alignItems: 'center', marginTop: 20 },
  iconCircle: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1C1C1E', marginBottom: 8 },
  emptyText: { fontSize: 15, color: '#8E8E93', textAlign: 'center', lineHeight: 22, marginBottom: 20 },
  
  primaryButton: { flexDirection: 'row', backgroundColor: '#0A7AFF', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 14, alignItems: 'center', marginBottom: 12, width: '100%', justifyContent: 'center' },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  
  secondaryButton: { flexDirection: 'row', backgroundColor: '#F2F2F7', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 14, alignItems: 'center', width: '100%', justifyContent: 'center' },
  secondaryButtonText: { color: '#0A7AFF', fontSize: 16, fontWeight: '600' },

  mockLabel: { fontSize: 14, color: '#8E8E93', marginTop: 20, marginBottom: 12, marginLeft: 4 },
  mockCourses: {},
  
  courseCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, marginBottom: 12 },
  courseHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginRight: 8 },
  badgeRequired: { backgroundColor: '#FF3B3015' },
  badgeOptional: { backgroundColor: '#34C75915' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  badgeTextRequired: { color: '#FF3B30' },
  badgeTextOptional: { color: '#34C759' },
  courseType: { fontSize: 13, color: '#8E8E93' },
  courseName: { fontSize: 17, fontWeight: '600', color: '#1C1C1E', marginBottom: 4 },
  courseInfoRow: { flexDirection: 'row' },
  infoText: { fontSize: 13, color: '#8E8E93' },

  webViewContainer: { flex: 1, backgroundColor: '#F5F5F9' },
  webViewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E5EA' },
  closeButton: { padding: 8 },
  webViewTitle: { fontSize: 17, fontWeight: '600', color: '#1C1C1E' },
  externalButton: { padding: 8 },
  loadingOverlay: { position: 'absolute', top: 60, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.8)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  loadingText: { marginTop: 12, fontSize: 15, color: '#8E8E93' },
});
