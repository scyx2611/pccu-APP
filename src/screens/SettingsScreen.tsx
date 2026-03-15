import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal } from 'react-native';
import { logoutPCCU } from '../services/api';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, ThemeMode } from '../contexts/ThemeContext';

export default function SettingsScreen({ navigation }: any) {
  const { mode, setMode, isDark, theme } = useTheme();
  const [showThemeModal, setShowThemeModal] = useState(false);

  const handleLogout = async () => {
    Alert.alert('確認登出', '確定要登出此帳號嗎？', [
      { text: '取消', style: 'cancel' },
      { text: '登出', style: 'destructive', onPress: async () => {
          await logoutPCCU();
          navigation.replace('Login');
        } 
      }
    ]);
  };

  const modeLabels: Record<ThemeMode, string> = {
    'system': '跟隨系統',
    'light': '淺色模式',
    'dark': '深色模式'
  };

  const ThemeOption = ({ optionMode }: { optionMode: ThemeMode }) => (
    <TouchableOpacity 
      style={[styles.modalOption, { borderBottomColor: theme.border }]} 
      onPress={() => { setMode(optionMode); setShowThemeModal(false); }}
    >
      <Text style={[styles.modalOptionText, { color: theme.text }, mode === optionMode && { color: theme.primary, fontWeight: 'bold' }]}>
        {modeLabels[optionMode]}
      </Text>
      {mode === optionMode && <Ionicons name="checkmark" size={24} color={theme.primary} />}
    </TouchableOpacity>
  );

  return (
    <>
      <ScrollView style={[styles.container, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>
        <View style={styles.headerSpacer} />
        
        {/* 帳戶資訊卡片 */}
        <View style={[styles.profileCard, { backgroundColor: theme.card }]}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={40} color="#0A7AFF" />
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: theme.text }]}>文化大學學生</Text>
            <Text style={[styles.profileSub, { color: theme.textSub }]}>MyCCU 認證使用者</Text>
          </View>
        </View>

        {/* 設定群組卡片 */}
        <Text style={[styles.sectionTitle, { color: theme.textSub }]}>App 設定</Text>
        <View style={[styles.settingsGroup, { backgroundColor: theme.card }]}>
          <TouchableOpacity style={styles.settingRow}>
            <View style={[styles.settingIcon, { backgroundColor: '#34C759' }]}>
              <Ionicons name="notifications" size={18} color="#FFF" />
            </View>
            <Text style={[styles.settingText, { color: theme.text }]}>通知與提醒</Text>
            <Ionicons name="chevron-forward" size={20} color={theme.textSub} />
          </TouchableOpacity>
          
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          
          <TouchableOpacity style={styles.settingRow} onPress={() => setShowThemeModal(true)}>
            <View style={[styles.settingIcon, { backgroundColor: '#5856D6' }]}>
              <Ionicons name={isDark ? "moon" : "sunny"} size={18} color="#FFF" />
            </View>
            <Text style={[styles.settingText, { color: theme.text }]}>深色模式</Text>
            <Text style={[styles.settingValue, { color: theme.textSub }]}>{modeLabels[mode]}</Text>
            <Ionicons name="chevron-forward" size={20} color={theme.textSub} />
          </TouchableOpacity>
        </View>

        {/* 登出卡片 */}
        <TouchableOpacity style={[styles.logoutCard, { backgroundColor: theme.card }]} onPress={handleLogout}>
          <Text style={[styles.logoutText, { color: theme.danger }]}>登出帳號</Text>
        </TouchableOpacity>
        
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* 深色模式選單 Modal */}
      <Modal visible={showThemeModal} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowThemeModal(false)}>
          <View style={[styles.modalContent, { backgroundColor: theme.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>外觀設定</Text>
            </View>
            <ThemeOption optionMode="system" />
            <ThemeOption optionMode="light" />
            <ThemeOption optionMode="dark" />
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowThemeModal(false)}>
              <Text style={[styles.modalCancelText, { color: theme.primary }]}>取消</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20 },
  headerSpacer: { height: 100 },
  bottomSpacer: { height: 140 },
  
  profileCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 28, padding: 20, marginBottom: 30, elevation: 2 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#E5F1FF', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  profileInfo: { flex: 1 },
  profileName: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  profileSub: { fontSize: 15 },

  sectionTitle: { fontSize: 13, fontWeight: '600', marginLeft: 16, marginBottom: 8, textTransform: 'uppercase' },
  settingsGroup: { borderRadius: 24, paddingHorizontal: 20, marginBottom: 24, elevation: 2 },
  settingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16 },
  settingIcon: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  settingText: { flex: 1, fontSize: 17 },
  settingValue: { fontSize: 17, marginRight: 8 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 48 },

  logoutCard: { borderRadius: 24, paddingVertical: 18, alignItems: 'center', elevation: 2 },
  logoutText: { fontSize: 17, fontWeight: '600' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  modalHeader: { alignItems: 'center', marginBottom: 15 },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  modalOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  modalOptionText: { fontSize: 17 },
  modalCancelBtn: { marginTop: 15, paddingVertical: 16, alignItems: 'center' },
  modalCancelText: { fontSize: 17, fontWeight: 'bold' }
});
