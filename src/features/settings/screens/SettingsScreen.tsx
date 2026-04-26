import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { ThemeMode, useTheme } from '../../../providers/theme/ThemeProvider';
import { logoutPCCU } from '../../auth/services/authService';
import AppSymbol from '../../../shared/components/AppSymbol';

type SettingsNavigationRowProps = {
  title: string;
  iconName: string;
  iconBackgroundColor: string;
  iconFallback: string;
  onPress: () => void;
  trailingValue?: string;
  showSeparator?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  titleColor: string;
  valueColor: string;
  chevronColor: string;
  separatorColor: string;
  pressedColor: string;
};

function SettingsNavigationRow({
  title,
  iconName,
  iconBackgroundColor,
  iconFallback,
  onPress,
  trailingValue,
  showSeparator = true,
  isFirst = false,
  isLast = false,
  titleColor,
  valueColor,
  chevronColor,
  separatorColor,
  pressedColor,
}: SettingsNavigationRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.navigationCell,
        isFirst && styles.firstNavigationCell,
        isLast && styles.lastNavigationCell,
        pressed && { backgroundColor: pressedColor },
      ]}
    >
      <View style={[styles.iconContainer, { backgroundColor: iconBackgroundColor }]}> 
        <AppSymbol
          name={iconName}
          size={22}
          tintColor="#FFF"
          weight="semibold"
          fallback={<Text style={styles.iconFallbackText}>{iconFallback}</Text>}
        />
      </View>

      <Text style={[styles.cellTitle, { color: titleColor }]} numberOfLines={1}>
        {title}
      </Text>

      {trailingValue ? (
        <Text style={[styles.cellValue, { color: valueColor }]} numberOfLines={1}>
          {trailingValue}
        </Text>
      ) : null}

      <AppSymbol
        name="chevron.right"
        size={15}
        tintColor={chevronColor}
        weight="semibold"
        fallback={<Text style={[styles.chevronFallback, { color: chevronColor }]}>&gt;</Text>}
      />

      {showSeparator ? (
        <View
          pointerEvents="none"
          style={[styles.navigationSeparator, { backgroundColor: separatorColor }]}
        />
      ) : null}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { mode, theme, isDark } = useTheme();

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

  const settingsCardBackground = isDark ? theme.card : '#FFFFFF';
  const pressedColor = isDark ? 'rgba(255,255,255,0.08)' : '#F2F2F7';
  const separatorColor = isDark ? theme.border : '#E5E5EA';
  const chevronColor = isDark ? '#636366' : '#C7C7CC';

  const settingsItems = [
    {
      title: '通知',
      iconName: 'bell.fill',
      iconBackgroundColor: theme.danger,
      iconFallback: 'B',
      onPress: () => router.push('/settings/notifications'),
    },
    {
      title: '外觀',
      trailingValue: modeLabels[mode],
      iconName: isDark ? 'moon.fill' : 'sun.max.fill',
      iconBackgroundColor: theme.primary,
      iconFallback: 'T',
      onPress: () => router.push('/settings/appearance'),
    },
    {
      title: '安全性',
      iconName: 'lock.fill',
      iconBackgroundColor: theme.warning,
      iconFallback: 'S',
      onPress: () => router.push('/settings/security'),
    },
    {
      title: '隱私',
      iconName: 'hand.raised.fill',
      iconBackgroundColor: '#5AC8FA',
      iconFallback: 'P',
      onPress: () => router.push('/settings/privacy'),
    },
    {
      title: '開發者',
      iconName: 'wrench.and.screwdriver.fill',
      iconBackgroundColor: theme.purple,
      iconFallback: 'D',
      onPress: () => router.push('/settings/developer'),
    },
    {
      title: '關於',
      iconName: 'info.circle.fill',
      iconBackgroundColor: theme.success,
      iconFallback: 'i',
      onPress: () => router.push('/settings/about'),
    },
  ];

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.bg }]}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.sectionTitle, { color: theme.textSub }]}>應用設定</Text>
      <View style={[styles.settingsCard, { backgroundColor: settingsCardBackground }]}> 
        {settingsItems.map((item, index) => (
          <SettingsNavigationRow
            key={item.title}
            {...item}
            isFirst={index === 0}
            isLast={index === settingsItems.length - 1}
            showSeparator={index !== settingsItems.length - 1}
            titleColor={theme.text}
            valueColor={theme.textSub}
            chevronColor={chevronColor}
            separatorColor={separatorColor}
            pressedColor={pressedColor}
          />
        ))}
      </View>

      <View style={[styles.insetGroup, { backgroundColor: theme.card }]}> 
        <TouchableOpacity style={styles.cellRowCenter} onPress={handleLogout}>
          <Text style={[styles.logoutText, { color: theme.danger }]}>登出目前帳號</Text>
        </TouchableOpacity>
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
  settingsCard: {
    marginHorizontal: 20,
    borderRadius: 26,
    marginBottom: 24,
    overflow: 'hidden',
  },
  insetGroup: {
    marginHorizontal: 20,
    borderRadius: 16,
    marginBottom: 24,
    overflow: 'hidden',
  },
  navigationCell: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 22,
    paddingRight: 18,
  },
  firstNavigationCell: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
  },
  lastNavigationCell: {
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  cellRowCenter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    minHeight: 52,
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  iconFallbackText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  cellTitle: {
    flex: 1,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '600',
  },
  cellValue: {
    flexShrink: 1,
    fontSize: 19,
    lineHeight: 23,
    marginLeft: 12,
    marginRight: 8,
    fontWeight: '400',
  },
  chevronFallback: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 20,
  },
  navigationSeparator: {
    position: 'absolute',
    left: 76,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  logoutText: {
    fontSize: 17,
    fontWeight: '600',
  },
  bottomSpacer: { height: 80 },
});
