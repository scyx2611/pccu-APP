import React, { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useTheme } from '../../../providers/theme/ThemeProvider';
import {
  getGradeFaceIdProtectionEnabled,
  getHideHomeGradeDetails,
  setGradeFaceIdProtectionEnabled,
  setHideHomeGradeDetails,
} from '../storage/privacySettings';

export default function PrivacyScreen() {
  const { theme } = useTheme();
  const [hideHomeGradeDetails, setHideHomeGradeDetailsState] = useState(false);
  const [gradeFaceIdProtectionEnabled, setGradeFaceIdProtectionEnabledState] = useState(false);
  const isExpoGoOnIOS =
    Platform.OS === 'ios' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

  useEffect(() => {
    let active = true;

    const loadSettings = async () => {
      const [hideGrades, protectGrades] = await Promise.all([
        getHideHomeGradeDetails(),
        getGradeFaceIdProtectionEnabled(),
      ]);

      if (!active) return;
      setHideHomeGradeDetailsState(hideGrades);
      setGradeFaceIdProtectionEnabledState(protectGrades);
    };

    void loadSettings();

    return () => {
      active = false;
    };
  }, []);

  const handleToggleHideHomeGradeDetails = async (value: boolean) => {
    setHideHomeGradeDetailsState(value);
    await setHideHomeGradeDetails(value);
  };

  const continueEnableProtection = async () => {
    const [hasHardware, isEnrolled, supportedTypes] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);

    const supportsFaceId =
      Platform.OS === 'ios'
        ? supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
        : supportedTypes.length > 0;

    if (!hasHardware || !isEnrolled || !supportsFaceId) {
      Alert.alert(
        Platform.OS === 'ios' ? '無法啟用 Face ID' : '無法啟用生物辨識',
        Platform.OS === 'ios'
          ? '這台裝置尚未設定 Face ID，或目前執行環境不支援。'
          : '這台裝置尚未設定生物辨識，或目前執行環境不支援。'
      );
      setGradeFaceIdProtectionEnabledState(false);
      await setGradeFaceIdProtectionEnabled(false);
      return;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: Platform.OS === 'ios' ? '啟用 Face ID 保護歷年成績' : '啟用生物辨識保護歷年成績',
      cancelLabel: '取消',
      disableDeviceFallback: false,
    });

    if (!result.success) {
      setGradeFaceIdProtectionEnabledState(false);
      await setGradeFaceIdProtectionEnabled(false);
      return;
    }

    setGradeFaceIdProtectionEnabledState(true);
    await setGradeFaceIdProtectionEnabled(true);
  };

  const handleToggleGradeFaceIdProtection = async (value: boolean) => {
    if (!value) {
      setGradeFaceIdProtectionEnabledState(false);
      await setGradeFaceIdProtectionEnabled(false);
      return;
    }

    if (isExpoGoOnIOS) {
      Alert.alert(
        '目前不是 build 環境',
        '你現在在 Expo Go 中，會先使用裝置驗證或鎖屏密碼；改用 iOS build / dev client 後，才會真正走 Face ID。',
        [
          {
            text: '取消',
            style: 'cancel',
            onPress: () => {
              setGradeFaceIdProtectionEnabledState(false);
            },
          },
          {
            text: '仍然啟用',
            onPress: () => {
              void continueEnableProtection();
            },
          },
        ]
      );
      return;
    }

    await continueEnableProtection();
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.sectionTitle, { color: theme.textSub }]}>首頁資料</Text>
      <View style={[styles.insetGroup, { backgroundColor: theme.card }]}> 
        <View style={styles.switchRow}>
          <View style={styles.textWrap}>
            <Text style={[styles.cellTitle, { color: theme.text }]}>隱藏成績摘要數字</Text>
            <Text style={[styles.cellSubtitle, { color: theme.textSub }]}>首頁成績卡的平均、班排、系排將改以小圓點顯示。</Text>
          </View>
          <Switch
            value={hideHomeGradeDetails}
            onValueChange={handleToggleHideHomeGradeDetails}
            trackColor={{ false: theme.border, true: '#34C759' }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: theme.textSub }]}>歷年成績</Text>
      <View style={[styles.insetGroup, { backgroundColor: theme.card }]}> 
        <View style={styles.switchRow}>
          <View style={styles.textWrap}>
            <Text style={[styles.cellTitle, { color: theme.text }]}>
              {Platform.OS === 'ios' ? '使用 Face ID 保護' : '使用生物辨識保護'}
            </Text>
            <Text style={[styles.cellSubtitle, { color: theme.textSub }]}>
              {Platform.OS === 'ios'
                ? '每次進入歷年成績頁前，先以 Face ID 驗證。'
                : '每次進入歷年成績頁前，先以生物辨識驗證。'}
            </Text>
          </View>
          <Switch
            value={gradeFaceIdProtectionEnabled}
            onValueChange={handleToggleGradeFaceIdProtection}
            trackColor={{ false: theme.border, true: '#34C759' }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>

      <View style={[styles.noteCard, { backgroundColor: theme.card }]}> 
        <Text style={[styles.noteText, { color: theme.textSub }]}>Face ID 保護只會影響進入歷年成績頁時的驗證流程，不會改動首頁與課表的其他資料同步邏輯。</Text>
      </View>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 16 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 36,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  insetGroup: {
    marginHorizontal: 20,
    borderRadius: 16,
    marginBottom: 24,
    overflow: 'hidden',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  textWrap: {
    flex: 1,
    paddingRight: 16,
  },
  cellTitle: {
    fontSize: 17,
    fontWeight: '500',
    marginBottom: 4,
  },
  cellSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  noteCard: {
    marginHorizontal: 20,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  noteText: {
    fontSize: 14,
    lineHeight: 21,
  },
  bottomSpacer: { height: 80 },
});
