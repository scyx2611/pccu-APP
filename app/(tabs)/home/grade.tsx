import React, { useCallback, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as LocalAuthentication from 'expo-local-authentication';
import { useTheme } from '../../../src/providers/theme/ThemeProvider';
import AppSymbol from '../../../src/shared/components/AppSymbol';
import GradeScreenV2 from '../../../src/features/grade/screens/GradeScreenV2';
import { getGradeFaceIdProtectionEnabled } from '../../../src/features/settings/storage/privacySettings';

type AccessState = 'checking' | 'unlocking' | 'locked' | 'unavailable' | 'unlocked';

export default function HomeGradeScreen() {
  const isIOS = Platform.OS === 'ios';
  const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  const skipNextPressRef = useRef(false);
  const { theme, isDark } = useTheme();
  const [accessState, setAccessState] = useState<AccessState>('checking');
  const [accessMessage, setAccessMessage] = useState('');
  const [protectionEnabled, setProtectionEnabled] = useState(false);
  const userInterfaceStyle = isDark ? 'dark' : 'light';
  const biometricLabel = isIOS ? 'Face ID' : '生物辨識';

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
        },
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
      },
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

  const authenticateAccess = useCallback(async () => {
    const [hasHardware, isEnrolled, supportedTypes] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);

    const supportsBiometrics = isIOS
      ? supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
      : supportedTypes.length > 0;

    if (!hasHardware || !isEnrolled || !supportsBiometrics) {
      return {
        success: false,
        state: 'unavailable' as const,
        message: isIOS
          ? '目前無法使用 Face ID，請先確認裝置已設定，或到設定 > 隱私 關閉此保護。'
          : '目前無法使用生物辨識，請先確認裝置已設定，或到設定 > 隱私 關閉此保護。',
      };
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: isIOS ? '使用 Face ID 解鎖歷年成績' : '使用生物辨識解鎖歷年成績',
      cancelLabel: '取消',
      disableDeviceFallback: false,
    });

    if (result.success) {
      return {
        success: true,
        state: 'unlocked' as const,
        message: '',
      };
    }

    const authError = 'error' in result ? result.error : undefined;

    return {
      success: false,
      state: 'locked' as const,
      message:
        authError === 'user_cancel' || authError === 'system_cancel'
          ? '已取消驗證，重新驗證後即可查看歷年成績。'
          : `${biometricLabel} 驗證失敗，請再試一次。`,
    };
  }, [biometricLabel, isIOS]);

  const verifyGradeAccess = useCallback(async () => {
    const enabled = await getGradeFaceIdProtectionEnabled();
    setProtectionEnabled(enabled);

    if (!enabled) {
      setAccessState('unlocked');
      setAccessMessage('');
      return;
    }

    setAccessState('unlocking');
    const result = await authenticateAccess();
    setAccessState(result.state);
    setAccessMessage(result.message);
  }, [authenticateAccess]);

  useFocusEffect(
    useCallback(() => {
      void verifyGradeAccess();
      return undefined;
    }, [verifyGradeAccess]),
  );

  const retryAuthentication = useCallback(() => {
    void verifyGradeAccess();
  }, [verifyGradeAccess]);

  const isLoadingAccess = accessState === 'checking' || accessState === 'unlocking';
  const lockTitle = protectionEnabled ? `${biometricLabel} 保護已開啟` : '歷年成績';
  const lockStatusLabel =
    accessState === 'unavailable'
      ? `${biometricLabel} 不可用`
      : accessState === 'locked'
        ? '驗證未完成'
        : '正在驗證';
  const lockStatusTone =
    accessState === 'unavailable'
      ? theme.warning
      : accessState === 'locked'
        ? theme.danger
        : theme.primary;
  const lockDescription = isLoadingAccess
    ? `正在使用 ${biometricLabel} 驗證...`
    : accessMessage || `需要先通過 ${biometricLabel} 驗證才能查看歷年成績。`;
  const lockHint =
    accessState === 'unavailable'
      ? '可到「設定 > 隱私」關閉這項保護，或改用支援生物辨識的執行環境。'
      : '通過驗證後就會直接進入歷年成績頁。';

  return (
    <>
      <Stack.Screen
        options={{
          title: '歷年成績',
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
      {accessState === 'unlocked' ? (
        <GradeScreenV2 />
      ) : (
        <ScrollView
          style={[styles.lockContainer, { backgroundColor: theme.bg }]}
          contentContainerStyle={styles.lockContent}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.lockCard, { backgroundColor: theme.card, shadowColor: theme.text }]}>
            <View style={[styles.lockIconWrap, { backgroundColor: `${theme.primary}14` }]}>
              <AppSymbol
                name={isIOS ? 'faceid' : 'lock.shield.fill'}
                size={30}
                tintColor={theme.primary}
                fallback={<Text style={{ color: theme.primary }}>ID</Text>}
              />
            </View>

            <View style={[styles.lockStatusPill, { backgroundColor: `${lockStatusTone}18` }]}>
              <Text style={[styles.lockStatusText, { color: lockStatusTone }]}>
                {lockStatusLabel}
              </Text>
            </View>

            <Text style={[styles.lockTitle, { color: theme.text }]}>{lockTitle}</Text>
            <Text style={[styles.lockText, { color: theme.textSub }]}>{lockDescription}</Text>
            <Text style={[styles.lockHint, { color: theme.textSub }]}>{lockHint}</Text>

            {isLoadingAccess ? (
              <View style={styles.lockSpinnerRow}>
                <ActivityIndicator size="small" color={theme.primary} />
              </View>
            ) : (
              <Pressable
                onPress={retryAuthentication}
                style={[styles.retryButton, { backgroundColor: theme.primary }]}
              >
                <Text style={styles.retryButtonText}>重新驗證</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      )}
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
  lockContainer: {
    flex: 1,
  },
  lockContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 80,
  },
  lockCard: {
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingVertical: 24,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 4,
  },
  lockIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  lockStatusPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 12,
  },
  lockStatusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  lockTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  lockText: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  lockHint: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  lockSpinnerRow: {
    marginTop: 18,
    minHeight: 44,
    justifyContent: 'center',
  },
  retryButton: {
    marginTop: 18,
    borderRadius: 16,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
