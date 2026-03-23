import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import {
  clearPersistedPCCUCredentials,
  ensurePCCUSession,
  getSavedPCCUCredentials,
  loginPCCU,
  savePCCUCredentials,
} from '../services/authService';
import { getBootstrapCacheSnapshot } from '../services/bootstrapCache';
import AppSymbol from '../../../shared/components/AppSymbol';
import { useTheme } from '../../../providers/theme/ThemeProvider';
import { getBiometricLoginEnabled, getRememberCredentialsEnabled } from '../../settings/storage/securitySettings';
import * as LocalAuthentication from 'expo-local-authentication';

export default function LoginScreen() {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [bootstrappingSavedLogin, setBootstrappingSavedLogin] = useState(false);
  const { theme } = useTheme();
  const busy = isLoading;

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
          : '這台裝置尚未設定生物辨識，或目前執行環境不支援。'
      );
      return false;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: Platform.OS === 'ios' ? '驗證 Face ID 以登入' : '驗證生物辨識以登入',
      cancelLabel: '取消',
      disableDeviceFallback: false,
    });

    if (!result.success) {
      Alert.alert('驗證未完成', '需通過生物辨識驗證後才能登入。');
      return false;
    }

    return true;
  };

  useEffect(() => {
    let active = true;

    const loadSavedCredentials = async () => {
      const biometricLoginEnabled = await getBiometricLoginEnabled();
      const savedCredentials = await getSavedPCCUCredentials();

      if (!active) return;

      if (biometricLoginEnabled) {
        setBootstrappingSavedLogin(false);
        return;
      }

      if (savedCredentials) {
        setAccount(savedCredentials.account);
        setPassword(savedCredentials.password);
        const passedBiometricAuth = await authenticateLoginAccess();
        if (!active || !passedBiometricAuth) {
          setBootstrappingSavedLogin(false);
          return;
        }
        await ensurePCCUSession(savedCredentials);
        if (!active) return;
        const cacheSnapshot = await getBootstrapCacheSnapshot();
        if (!active) return;
        router.replace(cacheSnapshot.hasAnyCache ? '/(tabs)/home' : '/loading');
        return;
      }

      setBootstrappingSavedLogin(false);
    };

    void loadSavedCredentials();

    return () => {
      active = false;
    };
  }, []);

  const performLogin = async () => {
    if (!account || !password) {
      Alert.alert('無法登入', '請輸入學號與密碼');
      return;
    }

    setIsLoading(true);

    try {
      const rememberCredentialsEnabled = await getRememberCredentialsEnabled();
      const result = await loginPCCU(account, password, { persistCredentials: false });
      if (!result.success) {
        setIsLoading(false);
        Alert.alert('登入失敗', result.message || '請確認學號與密碼是否正確');
        return;
      }

      if (rememberCredentialsEnabled) {
        await savePCCUCredentials(account, password);
      } else {
        await clearPersistedPCCUCredentials();
      }

      setIsLoading(false);
      Alert.alert(
        '登入提醒',
        '本 App 僅供學習、研究與個人使用參考，並非中國文化大學官方服務。資料若有落差，仍應以校方系統、公告與正式通知為準。\n\n繼續使用即代表你已閱讀並同意上述免責聲明。',
        [
          { text: '取消', style: 'cancel' },
          {
            text: '同意並繼續',
            onPress: () => {
              void (async () => {
                const cacheSnapshot = await getBootstrapCacheSnapshot();
                router.replace(cacheSnapshot.hasAnyCache ? '/(tabs)/home' : '/loading');
              })();
            },
          },
        ]
      );
    } catch (error) {
      setIsLoading(false);
      Alert.alert('發生錯誤', '登入時發生問題，請稍後再試');
    }
  };

  const handleLogin = () => {
    if (busy) return;
    void performLogin();
  };

  if (bootstrappingSavedLogin) {
    return (
      <View style={[styles.screen, styles.loadingScreen, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
      style={[styles.screen, { backgroundColor: theme.bg }]}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerContainer}>
          <AppSymbol
            name="graduationcap.fill"
            size={80}
            tintColor={theme.primary}
            fallback={<Text style={{ fontSize: 80, color: theme.primary }}>CCU</Text>}
          />
          <Text style={[styles.title, { color: theme.text }]}>登入 MyCCU</Text>
          <Text style={[styles.subtitle, { color: theme.textSub }]}>
            使用 PCCU 帳號登入後，
            {'\n'}
            可快速查看課表、成績與校園資訊。
          </Text>
        </View>

        <View style={styles.formContainer}>
          <View style={[styles.insetGroup, { backgroundColor: theme.card }]}> 
            <View style={styles.inputRow}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>學號</Text>
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="Account"
                placeholderTextColor={theme.textSub}
                value={account}
                onChangeText={setAccount}
                autoCapitalize="none"
                keyboardType="number-pad"
                editable={!busy}
              />
            </View>
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <View style={styles.inputRow}>
              <Text style={[styles.inputLabel, { color: theme.text }]}>密碼</Text>
              <TextInput
                style={[styles.input, { color: theme.text }]}
                placeholder="Password"
                placeholderTextColor={theme.textSub}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                onSubmitEditing={handleLogin}
                editable={!busy}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.loginButton, { backgroundColor: theme.primary }, busy && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginButtonText}>登入</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loadingScreen: { justifyContent: 'center', alignItems: 'center' },
  container: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 },
  headerContainer: { alignItems: 'center', marginBottom: 40, paddingHorizontal: 20 },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: 0.5, marginTop: 24, marginBottom: 8 },
  subtitle: { fontSize: 15, textAlign: 'center', lineHeight: 22, paddingHorizontal: 20 },
  formContainer: { width: '100%', paddingHorizontal: 20 },
  insetGroup: {
    borderRadius: 10,
    marginBottom: 24,
    overflow: 'hidden',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  inputLabel: {
    width: 70,
    fontSize: 17,
    fontWeight: '400',
  },
  input: {
    flex: 1,
    fontSize: 17,
    fontWeight: '400',
    height: '100%',
  },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 16 },
  loginButton: {
    height: 50,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  loginButtonDisabled: { opacity: 0.6 },
  loginButtonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
});
