import React, { useState } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, StyleSheet, 
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Dimensions
} from 'react-native';
import { loginPCCU } from '../services/api';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useTheme } from '../contexts/ThemeContext';

const { width } = Dimensions.get('window');

export default function LoginScreen({ navigation }: any) {
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const { theme, isDark } = useTheme();

  const handleLogin = async () => {
    if (!account || !password) return Alert.alert('提示', '請輸入學號與密碼');
    setIsLoading(true);
    try {
      const result = await loginPCCU(account, password);
      if (result.success) {
        navigation.replace('MainTabs');
      } else {
        Alert.alert('登入失敗', result.message || '請確認帳號密碼是否正確');
      }
    } catch (error) {
      Alert.alert('錯誤', '網路連線失敗，請稍後再試');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.ambientLightTop} />
      <View style={styles.ambientLightBottom} />
      <BlurView intensity={100} tint={theme.glassTint} style={StyleSheet.absoluteFillObject} />

      <View style={styles.headerContainer}>
        <View style={[styles.iconWrapper, { backgroundColor: theme.card, shadowColor: isDark ? '#FFFFFF' : '#000000' }]}>
          <Ionicons name="finger-print-outline" size={56} color={theme.primary} />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>MyCCU</Text>
        <Text style={[styles.subtitle, { color: theme.textSub }]}>Unlock Your Campus Life</Text>
      </View>

      <View style={styles.formContainer}>
        <View style={[styles.floatingCard, { backgroundColor: theme.card, shadowColor: isDark ? '#FFFFFF' : '#000000' }]}>
          <View style={styles.inputRow}>
            <Ionicons name="person-outline" size={20} color={theme.textSub} style={styles.inputIcon} />
            <TextInput 
              style={[styles.input, { color: theme.text }]} 
              placeholder="Account (學號)" 
              placeholderTextColor={isDark ? '#666666' : '#C7C7CC'}
              value={account} 
              onChangeText={setAccount} 
              autoCapitalize="none" 
              editable={!isLoading} 
            />
          </View>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <View style={styles.inputRow}>
            <Ionicons name="lock-closed-outline" size={20} color={theme.textSub} style={styles.inputIcon} />
            <TextInput 
              style={[styles.input, { color: theme.text }]} 
              placeholder="Password (密碼)" 
              placeholderTextColor={isDark ? '#666666' : '#C7C7CC'}
              value={password} 
              onChangeText={setPassword} 
              secureTextEntry={!showPassword} 
              autoCapitalize="none" 
              onSubmitEditing={handleLogin} 
              editable={!isLoading} 
            />
            <TouchableOpacity style={styles.eyeIcon} onPress={() => setShowPassword(!showPassword)}>
              <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={20} color={theme.textSub} />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity 
          style={[styles.loginButton, { backgroundColor: theme.primary }, isLoading && styles.loginButtonDisabled]} 
          onPress={handleLogin} 
          disabled={isLoading}
        >
          {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginButtonText}>Continue</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  ambientLightTop: { position: 'absolute', top: -100, left: -50, width: 300, height: 300, backgroundColor: '#0A7AFF20', borderRadius: 150 },
  ambientLightBottom: { position: 'absolute', bottom: -50, right: -50, width: 200, height: 200, backgroundColor: '#AF52DE20', borderRadius: 100 },
  headerContainer: { alignItems: 'center', marginBottom: 50, zIndex: 10 },
  iconWrapper: { padding: 20, borderRadius: 36, marginBottom: 24, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.08, shadowRadius: 24, elevation: 4 },
  title: { fontSize: 40, fontWeight: '800', letterSpacing: 0.8 },
  subtitle: { fontSize: 17, marginTop: 8, fontWeight: '500' },
  formContainer: { width: '100%', zIndex: 10 },
  floatingCard: { borderRadius: 28, paddingHorizontal: 20, marginBottom: 30, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 2 },
  inputRow: { flexDirection: 'row', alignItems: 'center', height: 60 },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, fontSize: 17, fontWeight: '500' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 32 },
  eyeIcon: { padding: 10 },
  loginButton: { height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center', shadowColor: '#0A7AFF', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 4 },
  loginButtonDisabled: { opacity: 0.6, shadowOpacity: 0 },
  loginButtonText: { color: '#FFFFFF', fontSize: 19, fontWeight: '700', letterSpacing: 0.5 },
});
