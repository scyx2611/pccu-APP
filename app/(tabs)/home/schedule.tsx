import React, { useRef } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { Stack } from 'expo-router';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useTheme } from '../../../src/providers/theme/ThemeProvider';
import ScheduleScreen from '../../../src/features/schedule/screens/ScheduleScreen';

export default function HomeScheduleScreen() {
  const isIOS = Platform.OS === 'ios';
  const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  const skipNextPressRef = useRef(false);
  const { theme, isDark } = useTheme();
  const userInterfaceStyle = isDark ? 'dark' : 'light';

  const runTestAction = (label: string) => {
    Alert.alert('測試功能', `你選了${label}`, undefined, {
      userInterfaceStyle,
    });
  };

  const menuActions = [
    { label: '功能 1', onPress: () => runTestAction('功能 1') },
    { label: '功能 2', onPress: () => runTestAction('功能 2') },
    { label: '功能 3', onPress: () => runTestAction('功能 3') },
  ] as const;

  const showFallbackMenu = () => {
    if (isIOS) {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: '測試功能',
          options: [...menuActions.map((action) => action.label), '取消'],
          cancelButtonIndex: menuActions.length,
          tintColor: theme.primary,
          cancelButtonTintColor: theme.primary,
          userInterfaceStyle,
        },
        (buttonIndex) => {
          if (buttonIndex >= 0 && buttonIndex < menuActions.length) {
            menuActions[buttonIndex]?.onPress();
          }
        }
      );
      return;
    }

    Alert.alert(
      '測試功能',
      '選擇一個選項',
      [
        ...menuActions.map((action) => ({
          text: action.label,
          onPress: action.onPress,
        })),
        { text: '取消', style: 'cancel' },
      ],
      {
        userInterfaceStyle,
      }
    );
  };

  const handleFallbackPress = () => {
    if (skipNextPressRef.current) {
      skipNextPressRef.current = false;
      return;
    }

    showFallbackMenu();
  };

  const handleFallbackLongPress = () => {
    skipNextPressRef.current = true;
    showFallbackMenu();
  };

  const shouldUseNativeHeaderMenu = isIOS && !isExpoGo && !isDark;

  const iosHeaderMenu: NativeStackNavigationOptions['unstable_headerRightItems'] =
    shouldUseNativeHeaderMenu
      ? () => [
          {
            type: 'menu',
            label: '更多選項',
            icon: { type: 'sfSymbol', name: 'ellipsis' },
            variant: 'plain',
            tintColor: theme.text,
            accessibilityLabel: '更多選項',
            accessibilityHint: '開啟測試功能選單',
            menu: {
              title: '測試功能',
              items: menuActions.map((action) => ({
                type: 'action' as const,
                label: action.label,
                onPress: action.onPress,
              })),
            },
          },
        ]
      : undefined;

  const shouldUseFallbackButton = !shouldUseNativeHeaderMenu;

  return (
    <>
      <Stack.Screen
        options={{
          title: '完整課表',
          unstable_headerRightItems: iosHeaderMenu,
          headerRight: shouldUseFallbackButton
            ? ({ tintColor }) => (
                <Pressable
                  onPress={handleFallbackPress}
                  onLongPress={handleFallbackLongPress}
                  delayLongPress={220}
                  style={styles.menuButton}
                  accessibilityLabel="更多選項"
                >
                  <Text style={[styles.menuButtonText, { color: tintColor || theme.text }]}>⋯</Text>
                </Pressable>
              )
            : undefined,
        }}
      />
      <ScheduleScreen />
    </>
  );
}

const styles = StyleSheet.create({
  menuButton: {
    minWidth: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  menuButtonText: {
    fontSize: 28,
    lineHeight: 28,
    fontWeight: '600',
  },
});
