import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { logoutPCCU } from '../services/api';
import { Ionicons } from '@expo/vector-icons';

export default function SettingsScreen({ navigation }: any) {
  const handleLogout = async () => {
    await logoutPCCU();
    navigation.replace('Login');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerSpacer} />
      
      {/* 帳戶資訊卡片 (iOS 26 風格) */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={40} color="#0A7AFF" />
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>文化大學學生</Text>
          <Text style={styles.profileSub}>MyCCU 認證使用者</Text>
        </View>
      </View>

      {/* 設定群組卡片 */}
      <Text style={styles.sectionTitle}>App 設定</Text>
      <View style={styles.settingsGroup}>
        <TouchableOpacity style={styles.settingRow}>
          <View style={[styles.settingIcon, { backgroundColor: '#34C759' }]}>
            <Ionicons name="notifications" size={18} color="#FFF" />
          </View>
          <Text style={styles.settingText}>通知與提醒</Text>
          <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
        </TouchableOpacity>
        
        <View style={styles.divider} />
        
        <TouchableOpacity style={styles.settingRow}>
          <View style={[styles.settingIcon, { backgroundColor: '#5856D6' }]}>
            <Ionicons name="moon" size={18} color="#FFF" />
          </View>
          <Text style={styles.settingText}>深色模式</Text>
          <Text style={styles.settingValue}>跟隨系統</Text>
          <Ionicons name="chevron-forward" size={20} color="#C7C7CC" />
        </TouchableOpacity>
      </View>

      {/* 登出卡片 */}
      <TouchableOpacity style={styles.logoutCard} onPress={handleLogout}>
        <Text style={styles.logoutText}>登出帳號</Text>
      </TouchableOpacity>
      
      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F9' },
  content: { paddingHorizontal: 20 },
  headerSpacer: { height: 120 },
  bottomSpacer: { height: 140 },
  
  profileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 28, padding: 20, marginBottom: 30,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.04, shadowRadius: 16 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#E5F1FF', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 22, fontWeight: '700', color: '#1C1C1E', marginBottom: 4 },
  profileSub: { fontSize: 15, color: '#8E8E93' },

  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#8E8E93', marginLeft: 16, marginBottom: 8, textTransform: 'uppercase' },
  settingsGroup: { backgroundColor: '#FFFFFF', borderRadius: 24, paddingHorizontal: 20, marginBottom: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.02, shadowRadius: 8 },
  settingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16 },
  settingIcon: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  settingText: { flex: 1, fontSize: 17, color: '#1C1C1E' },
  settingValue: { fontSize: 17, color: '#8E8E93', marginRight: 8 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: '#E5E5EA', marginLeft: 48 },

  logoutCard: { backgroundColor: '#FFFFFF', borderRadius: 24, paddingVertical: 18, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.02, shadowRadius: 8 },
  logoutText: { color: '#FF3B30', fontSize: 17, fontWeight: '600' }
});
