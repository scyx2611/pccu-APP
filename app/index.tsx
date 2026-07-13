import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Alert, Platform, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import WelcomeScreen from '../src/features/auth/screens/WelcomeScreen';
import { useTheme } from '../src/providers/theme/ThemeProvider';
import {
  clearSavedPCCUCredentials,
  getSavedPCCUCredentials,
} from '../src/features/auth/services/authService';
import { getBootstrapCacheSnapshot } from '../src/features/auth/services/bootstrapCache';
import { getBiometricLoginEnabled } from '../src/features/settings/storage/securitySettings';

export default function IndexScreen() {
  const { theme } = useTheme();
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;

    const requestRetryAfterBiometricFailure = () =>
      new Promise<boolean>((resolve) => {
        Alert.alert('驗證失敗', 'Face ID / 生物辨識驗證未完成，是否要再試一次？', [
          {
            text: '取消',
            style: 'cancel',
            onPress: () => resolve(false),
          },
          {
            text: '重試',
            onPress: () => resolve(true),
          },
        ]);
      });

    const authenticateLoginAccess = async () => {
      const biometricLoginEnabled = await getBiometricLoginEnabled();
      if (!biometricLoginEnabled) {
        return true;
      }

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
          Platform.OS === 'ios' ? '無法使用 Face ID 登入' : '無法使用生物辨識登入',
          Platform.OS === 'ios'
            ? '這台裝置尚未設定 Face ID，或目前執行環境不支援。'
            : '這台裝置尚未設定生物辨識，或目前執行環境不支援。',
        );
        return false;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: Platform.OS === 'ios' ? '驗證 Face ID 以登入' : '驗證生物辨識以登入',
        cancelLabel: '取消',
        disableDeviceFallback: false,
      });

      if (result.success) {
        return true;
      }

      const shouldRetry = await requestRetryAfterBiometricFailure();
      if (!shouldRetry) {
        return false;
      }

      const retryResult = await LocalAuthentication.authenticateAsync({
        promptMessage: Platform.OS === 'ios' ? '再次驗證 Face ID 以登入' : '再次驗證生物辨識以登入',
        cancelLabel: '取消',
        disableDeviceFallback: false,
      });

      return retryResult.success;
    };

    const bootstrap = async () => {
      let savedCredentials: Awaited<ReturnType<typeof getSavedPCCUCredentials>> = null;
      try {
        savedCredentials = await getSavedPCCUCredentials();
      } catch {
        await clearSavedPCCUCredentials().catch(() => undefined);
      }

      if (!active) return;

      if (savedCredentials) {
        const passedBiometricAuth = await authenticateLoginAccess();
        if (!active) return;

        if (!passedBiometricAuth) {
          setCheckingSession(false);
          return;
        }

        const cacheSnapshot = await getBootstrapCacheSnapshot();
        if (!active) return;

        router.replace(cacheSnapshot.hasAnyCache ? '/(tabs)/home' : '/loading');
        return;
      }

      setCheckingSession(false);
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  if (checkingSession) {
    return (
      <View style={[styles.loadingScreen, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return <WelcomeScreen onStart={() => router.push('/login')} />;
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
