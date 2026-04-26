import React, { useEffect, useState } from 'react';
import { Alert, ColorValue, Platform, PlatformColor, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { ThemeMode, useTheme } from '../../../providers/theme/ThemeProvider';
import { logoutPCCU } from '../../auth/services/authService';
import { getGrades } from '../../grade/storage/gradeStorage';
import AppSymbol from '../../../shared/components/AppSymbol';

const SETTINGS_ICON_SIZE = 19;
const SETTINGS_CARD_RADIUS = 19;
const SETTINGS_ROW_VERTICAL_PADDING = 15;
const SETTINGS_ROW_HORIZONTAL_PADDING = 16;
const SETTINGS_ICON_TITLE_GAP = 16;
const IOS_CHEVRON_COLOR = '#C7C7CC';
const IOS_SEPARATOR_COLOR = '#ECECF0';

type SettingsNavigationRowProps = {
  icon: string;
  title: string;
  value?: string;
  onPress: () => void;
  iconTint: string;
  textColor: string;
  valueColor: string;
  chevronColor: string;
  separatorColor: ColorValue;
  pressedBackground: ColorValue;
  showSeparator?: boolean;
};

function SettingsNavigationRow({
  icon,
  title,
  value,
  onPress,
  iconTint,
  textColor,
  valueColor,
  chevronColor,
  separatorColor,
  pressedBackground,
  showSeparator = true,
}: SettingsNavigationRowProps) {
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        android_ripple={{ color: 'rgba(0, 0, 0, 0.08)' }}
        onPress={onPress}
        style={({ pressed }) => [styles.navigationCell, pressed && { backgroundColor: pressedBackground }]}
      >
        <View style={styles.navigationIconContainer}>
          <AppSymbol
            name={icon}
            size={SETTINGS_ICON_SIZE}
            tintColor={iconTint}
            weight="semibold"
            fallback={<Text style={{ color: iconTint }}>?</Text>}
          />
        </View>
        <Text style={[styles.navigationTitle, { color: textColor }]} numberOfLines={1}>
          {title}
        </Text>
        {value ? (
          <Text style={[styles.navigationValue, { color: valueColor }]} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        <AppSymbol
          name="chevron.right"
          size={15}
          tintColor={chevronColor}
          weight="semibold"
          fallback={<Text style={{ color: chevronColor }}>&gt;</Text>}
        />
      </Pressable>
      {showSeparator ? <View style={[styles.navigationSeparator, { backgroundColor: separatorColor }]} /> : null}
    </View>
  );
}

const extractStudentProgram = (title?: string | null) => {
  if (!title) return null;

  const normalized = title.replace(/\s+/g, ' ').trim();
  const match = normalized.match(/(?:\d{2,3}學年度\s*)?(.+?系)?\s*(\d{1,2}年級(?:\s*[A-Z]班)?)/);
  if (!match) return null;

  return [match[1], match[2]].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
};

export default function SettingsScreen() {
  const { mode, theme } = useTheme();
  const [userName, setUserName] = useState('');
  const [studentProgram, setStudentProgram] = useState('系級未同步');
  const groupedBackground = Platform.OS === 'ios' ? PlatformColor('systemGroupedBackground') : theme.bg;
  const groupedCardBackground = Platform.OS === 'ios' ? PlatformColor('secondarySystemGroupedBackground') : theme.syncBtnBg;
  const groupedSeparator = Platform.OS === 'ios' ? IOS_SEPARATOR_COLOR : theme.border;
  const groupedSectionText = Platform.OS === 'ios' ? PlatformColor('secondaryLabel') : theme.textSub;
  const avatarBackground = Platform.OS === 'ios' ? PlatformColor('systemGray5') : theme.rankBg;
  const avatarBorder = Platform.OS === 'ios' ? PlatformColor('separator') : theme.border;
  const cellPressedBackground = Platform.OS === 'ios' ? PlatformColor('systemGray5') : 'rgba(0, 0, 0, 0.10)';
  const chevronColor = Platform.OS === 'ios' ? IOS_CHEVRON_COLOR : theme.textSub;

  useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      const [storedName, cachedGrades] = await Promise.all([
        SecureStore.getItemAsync('user_name'),
        getGrades(),
      ]);
      if (!active) return;

      setUserName((storedName || '').trim());
      const program = cachedGrades.grades?.map((grade) => extractStudentProgram(grade.title)).find(Boolean);
      setStudentProgram(program || '系級未同步');
    };

    void loadProfile();

    return () => {
      active = false;
    };
  }, []);

  const handleLogout = () => {
    Alert.alert('登出帳號', '確定要登出目前的 PCCU 帳號嗎？', [
      { text: '取消', style: 'cancel' },
      {
        text: '登出',
        style: 'destructive',
        onPress: async () => {
          await logoutPCCU();
          router.replace('/');
        },
      },
    ]);
  };

  const modeLabels: Record<ThemeMode, string> = {
    system: '系統',
    light: '淺色',
    dark: '深色',
  };
  const displayName = userName ? `${userName} 同學` : '同學';

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: groupedBackground }]}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.profileCard, { backgroundColor: groupedCardBackground }]}>
        <View style={[styles.avatar, { backgroundColor: avatarBackground, borderColor: avatarBorder }]}>
          <AppSymbol name="person.fill" size={28} tintColor={theme.textSub} fallback={<Text style={{ color: theme.textSub }}>人</Text>} />
        </View>
        <View style={styles.profileTextWrap}>
          <Text style={[styles.profileName, { color: theme.text }]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[styles.profileMeta, { color: theme.textSub }]} numberOfLines={1}>
            {`中國文化大學 · ${studentProgram}`}
          </Text>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: groupedSectionText }]}>應用設定</Text>
      <View style={[styles.insetGroup, { backgroundColor: groupedCardBackground }]}>
        <SettingsNavigationRow
          icon="bell"
          title="通知"
          onPress={() => router.push('/settings/notifications')}
          iconTint={theme.text}
          textColor={theme.text}
          valueColor={theme.textSub}
          chevronColor={chevronColor}
          separatorColor={groupedSeparator}
          pressedBackground={cellPressedBackground}
        />
        <SettingsNavigationRow
          icon="sun.max"
          title="外觀"
          value={modeLabels[mode]}
          onPress={() => router.push('/settings/appearance')}
          iconTint={theme.text}
          textColor={theme.text}
          valueColor={theme.textSub}
          chevronColor={chevronColor}
          separatorColor={groupedSeparator}
          pressedBackground={cellPressedBackground}
        />
        <SettingsNavigationRow
          icon="person.badge.shield.checkmark"
          title="安全性"
          onPress={() => router.push('/settings/security')}
          iconTint={theme.text}
          textColor={theme.text}
          valueColor={theme.textSub}
          chevronColor={chevronColor}
          separatorColor={groupedSeparator}
          pressedBackground={cellPressedBackground}
        />
        <SettingsNavigationRow
          icon="hand.raised"
          title="隱私"
          onPress={() => router.push('/settings/privacy')}
          iconTint={theme.text}
          textColor={theme.text}
          valueColor={theme.textSub}
          chevronColor={chevronColor}
          separatorColor={groupedSeparator}
          pressedBackground={cellPressedBackground}
        />
        <SettingsNavigationRow
          icon="wrench.and.screwdriver"
          title="開發者"
          onPress={() => router.push('/settings/developer')}
          iconTint={theme.text}
          textColor={theme.text}
          valueColor={theme.textSub}
          chevronColor={chevronColor}
          separatorColor={groupedSeparator}
          pressedBackground={cellPressedBackground}
        />
        <SettingsNavigationRow
          icon="info.circle"
          title="關於"
          onPress={() => router.push('/settings/about')}
          iconTint={theme.text}
          textColor={theme.text}
          valueColor={theme.textSub}
          chevronColor={chevronColor}
          separatorColor={groupedSeparator}
          pressedBackground={cellPressedBackground}
          showSeparator={false}
        />
      </View>

      <View style={[styles.insetGroup, { backgroundColor: groupedCardBackground }]}>
        <Pressable
          accessibilityRole="button"
          android_ripple={{ color: 'rgba(0, 0, 0, 0.08)' }}
          style={({ pressed }) => [styles.cellRowCenter, pressed && { backgroundColor: cellPressedBackground }]}
          onPress={handleLogout}
        >
          <Text style={[styles.logoutText, { color: theme.danger }]}>登出目前帳號</Text>
        </Pressable>
      </View>

      <View style={styles.bottomSpacer} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingTop: 16 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 16,
    overflow: 'hidden',
  },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  profileTextWrap: { flex: 1, minWidth: 0 },
  profileName: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '800',
  },
  profileMeta: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    marginTop: 3,
  },
  sectionTitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
    marginLeft: 36,
    marginBottom: 8,
    textTransform: 'none',
    letterSpacing: 0,
  },
  insetGroup: {
    marginHorizontal: 20,
    borderRadius: SETTINGS_CARD_RADIUS,
    marginBottom: 24,
    overflow: 'hidden',
  },
  navigationCell: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingLeft: SETTINGS_ROW_HORIZONTAL_PADDING,
    paddingRight: SETTINGS_ROW_HORIZONTAL_PADDING,
    paddingVertical: SETTINGS_ROW_VERTICAL_PADDING,
  },
  navigationIconContainer: {
    width: SETTINGS_ICON_SIZE,
    height: SETTINGS_ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SETTINGS_ICON_TITLE_GAP,
  },
  navigationTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '500',
  },
  navigationValue: {
    maxWidth: 130,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '400',
    marginLeft: 12,
    marginRight: 8,
  },
  navigationSeparator: {
    height: 1,
    marginLeft: SETTINGS_ROW_HORIZONTAL_PADDING + SETTINGS_ICON_SIZE + SETTINGS_ICON_TITLE_GAP,
    marginRight: 20,
  },
  cellRowCenter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingVertical: 14,
    minHeight: 52,
  },
  logoutText: {
    fontSize: 17,
    fontWeight: '600',
  },
  bottomSpacer: { height: 80 },
});
