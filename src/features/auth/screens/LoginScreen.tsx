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
import { ensurePCCUSession, getSavedPCCUCredentials, loginPCCU } from '../services/authService';
import { getBootstrapCacheSnapshot } from '../services/bootstrapCache';
import AppSymbol from '../../../shared/components/AppSymbol';
import { useTheme } from '../../../providers/theme/ThemeProvider';

export default function LoginScreen() {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [bootstrappingSavedLogin, setBootstrappingSavedLogin] = useState(false);
  const { theme } = useTheme();
  const busy = isLoading;

  useEffect(() => {
    let active = true;

    const loadSavedCredentials = async () => {
      const savedCredentials = await getSavedPCCUCredentials();

      if (!active) return;

      if (savedCredentials) {
        setAccount(savedCredentials.account);
        setPassword(savedCredentials.password);
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

  const handleLogin = async () => {
    if (!account || !password) {
      Alert.alert('無法登入', '請輸入學號與密碼');
      return;
    }

    setIsLoading(true);

    try {
      const result = await loginPCCU(account, password);
      if (!result.success) {
        setIsLoading(false);
        Alert.alert('登入失敗', result.message || '請確認學號與密碼是否正確');
        return;
      }

      setIsLoading(false);
      const cacheSnapshot = await getBootstrapCacheSnapshot();
      router.replace(cacheSnapshot.hasAnyCache ? '/(tabs)/home' : '/loading');
    } catch (error) {
      setIsLoading(false);
      Alert.alert('發生錯誤', '登入時發生問題，請稍後再試');
    }
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
          <Text style={[styles.subtitle, { color: theme.textSub }]}>使用 PCCU 帳號登入，會先進首頁顯示快取資料，並在背景自動更新課表與成績。</Text>
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

          <Text style={[styles.footerText, { color: theme.textSub }]}>
            登入後會直接進首頁，若已有快取會先顯示，再於背景自動更新。
          </Text>
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
  footerText: {
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 20,
  },
});
