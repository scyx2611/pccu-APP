import React, { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { router } from 'expo-router';
import { useTheme } from '../../../providers/theme/ThemeProvider';
import { clearPersistedPCCUCredentials, logoutPCCU } from '../../auth/services/authService';
import {
  getBiometricLoginEnabled,
  getRememberCredentialsEnabled,
  setBiometricLoginEnabled,
  setRememberCredentialsEnabled,
} from '../storage/securitySettings';

export default function SecurityScreen() {
  const { theme } = useTheme();
  const [rememberCredentialsEnabled, setRememberCredentialsEnabledState] = useState(false);
  const [biometricLoginEnabled, setBiometricLoginEnabledState] = useState(false);
  const biometricLabel = Platform.OS === 'ios' ? 'Face ID' : '生物辨識';
  const isExpoGoOnIOS =
    Platform.OS === 'ios' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

  useEffect(() => {
    let active = true;

    const loadSettings = async () => {
      const [rememberEnabled, biometricEnabled] = await Promise.all([
        getRememberCredentialsEnabled(),
        getBiometricLoginEnabled(),
      ]);
      if (!active) return;
      setRememberCredentialsEnabledState(rememberEnabled);
      setBiometricLoginEnabledState(biometricEnabled);
    };

    void loadSettings();

    return () => {
      active = false;
    };
  }, []);

  const handleRememberCredentialsToggle = async (value: boolean) => {
    if (!value) {
      setRememberCredentialsEnabledState(false);
      await setRememberCredentialsEnabled(false);
      setBiometricLoginEnabledState(false);
      await setBiometricLoginEnabled(false);
      await clearPersistedPCCUCredentials();
      return;
    }

    Alert.alert('需要重新登入', '開啟儲存帳號密碼後，需重新登入才會套用這項設定。', [
      {
        text: '取消',
        style: 'cancel',
        onPress: () => {
          setRememberCredentialsEnabledState(false);
        },
      },
      {
        text: '重新登入',
        onPress: () => {
          void (async () => {
            setRememberCredentialsEnabledState(true);
            await setRememberCredentialsEnabled(true);
            await logoutPCCU();
            router.replace('/');
          })();
        },
      },
    ]);
  };

  const continueEnableBiometricLogin = async () => {
    const [hasHardware, isEnrolled, supportedTypes] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);

    const supportsBiometric =
      Platform.OS === 'ios'
        ? supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
        : supportedTypes.length > 0;

    if (!hasHardware || !isEnrolled || !supportsBiometric) {
      Alert.alert(
        `無法啟用${biometricLabel}`,
        Platform.OS === 'ios'
          ? '這台裝置尚未設定 Face ID，或目前執行環境不支援。'
          : '這台裝置尚未設定生物辨識，或目前執行環境不支援。',
      );
      setBiometricLoginEnabledState(false);
      await setBiometricLoginEnabled(false);
      return;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: Platform.OS === 'ios' ? '啟用 Face ID 登入保護' : '啟用生物辨識登入保護',
      cancelLabel: '取消',
      disableDeviceFallback: false,
    });

    if (!result.success) {
      setBiometricLoginEnabledState(false);
      await setBiometricLoginEnabled(false);
      return;
    }

    setBiometricLoginEnabledState(true);
    await setBiometricLoginEnabled(true);
  };

  const handleBiometricLoginToggle = async (value: boolean) => {
    if (!value) {
      setBiometricLoginEnabledState(false);
      await setBiometricLoginEnabled(false);
      return;
    }

    if (!rememberCredentialsEnabled) {
      Alert.alert(
        '需先開啟儲存帳號密碼',
        `${biometricLabel} 登入必須搭配已儲存的帳號密碼使用，請先開啟「儲存帳號密碼」。`,
      );
      setBiometricLoginEnabledState(false);
      await setBiometricLoginEnabled(false);
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
              setBiometricLoginEnabledState(false);
            },
          },
          {
            text: '仍然啟用',
            onPress: () => {
              void continueEnableBiometricLogin();
            },
          },
        ],
      );
      return;
    }

    await continueEnableBiometricLogin();
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.sectionTitle, { color: theme.textSub }]}>登入安全</Text>
      <View style={[styles.insetGroup, { backgroundColor: theme.card }]}>
        <View style={styles.switchRow}>
          <View style={styles.textWrap}>
            <Text style={[styles.cellTitle, { color: theme.text }]}>儲存帳號密碼</Text>
            <Text style={[styles.cellSubtitle, { color: theme.textSub }]}>
              開啟後，下次登入成功會自動記住帳號與密碼。
            </Text>
          </View>
          <Switch
            value={rememberCredentialsEnabled}
            onValueChange={(value) => void handleRememberCredentialsToggle(value)}
            trackColor={{ false: theme.border, true: '#34C759' }}
            thumbColor="#FFFFFF"
          />
        </View>

        <View style={[styles.separator, { backgroundColor: theme.border }]} />

        <View style={styles.switchRow}>
          <View style={styles.textWrap}>
            <Text
              style={[styles.cellTitle, { color: theme.text }]}
            >{`使用${biometricLabel}登入`}</Text>
            <Text style={[styles.cellSubtitle, { color: theme.textSub }]}>
              需先儲存帳號密碼，之後自動登入前會先通過 {biometricLabel} 或生物辨識驗證。
            </Text>
          </View>
          <Switch
            value={biometricLoginEnabled}
            onValueChange={(value) => void handleBiometricLoginToggle(value)}
            disabled={!rememberCredentialsEnabled}
            trackColor={{ false: theme.border, true: '#34C759' }}
            thumbColor="#FFFFFF"
          />
        </View>
      </View>

      <View style={[styles.noteCard, { backgroundColor: theme.card }]}>
        <Text style={[styles.noteText, { color: theme.textSub }]}>
          登入安全設定只會影響帳密保存與登入前驗證流程，不會改動課表、成績與其他同步資料。
        </Text>
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
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
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
