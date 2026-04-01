import 'expo-dev-client';
import React, { useMemo } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
  ThemeProvider as NavigationThemeProvider,
} from '@react-navigation/native';
import { ThemeProvider, useTheme } from '../src/providers/theme/ThemeProvider';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function RootLayoutNav() {
  const { isDark, theme } = useTheme();
  const navigationTheme = useMemo(() => {
    const baseTheme = isDark ? NavigationDarkTheme : NavigationDefaultTheme;

    return {
      ...baseTheme,
      dark: isDark,
      colors: {
        ...baseTheme.colors,
        primary: theme.primary,
        background: theme.bg,
        card: theme.card,
        text: theme.text,
        border: theme.border,
        notification: theme.primary,
      },
    };
  }, [isDark, theme]);
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
    <NavigationThemeProvider value={navigationTheme}>
      <>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
            contentStyle: { backgroundColor: theme.bg },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="loading" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="schedule"
            options={{
              presentation: 'card',
              headerShown: false,
              contentStyle: { backgroundColor: theme.bg },
            }}
          />
          <Stack.Screen
            name="grade"
            options={{
              presentation: 'card',
              headerShown: false,
              contentStyle: { backgroundColor: theme.bg },
            }}
          />
          <Stack.Screen
            name="modal"
            options={{ presentation: Platform.OS === 'ios' ? 'formSheet' : 'modal' }}
          />
          <Stack.Screen
            name="tutoring/[courseCode]"
            options={{
              presentation: 'card',
              headerShown: false,
              contentStyle: { backgroundColor: theme.bg },
            }}
          />
        </Stack>
      </>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootLayoutNav />
    </ThemeProvider>
  );
}
