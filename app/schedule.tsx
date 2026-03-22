import React from 'react';
import { Stack, router } from 'expo-router';
import { Platform, View } from 'react-native';
import { useTheme } from '../src/providers/theme/ThemeProvider';
import ScheduleScreen from '../src/features/schedule/screens/ScheduleScreen';
import ErrorBoundary from '../src/shared/components/ErrorBoundary';
import GlassCloseButton from '../src/shared/components/GlassCloseButton';

export default function ScheduleRootScreen() {
  const { theme } = useTheme();
  const iosVersion = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);
  const iosCloseHeaderItem = Platform.OS === 'ios'
    ? () => [
        {
          type: 'button' as const,
          label: '關閉',
          icon: { type: 'sfSymbol' as const, name: 'xmark' as const },
          variant: (iosVersion >= 26 ? 'prominent' : 'plain') as 'prominent' | 'plain',
          onPress: () => router.back(),
          accessibilityLabel: '關閉',
        },
      ]
    : undefined;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: Platform.OS === 'ios',
          headerTransparent: true,
          headerShadowVisible: false,
          headerBackVisible: false,
          title: '',
          unstable_headerRightItems: iosCloseHeaderItem,
        }}
      />
      <View style={{ flex: 1, backgroundColor: theme.bg }}>
        {Platform.OS !== 'ios' ? <GlassCloseButton /> : null}
        <ErrorBoundary label="課表">
          <ScheduleScreen />
        </ErrorBoundary>
      </View>
    </>
  );
}
