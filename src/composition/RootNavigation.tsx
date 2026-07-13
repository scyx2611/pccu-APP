import 'expo-dev-client';
import React, { useMemo } from 'react';
import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
  ThemeProvider as NavigationThemeProvider,
} from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import GlobalScraperWebView from '../features/pccu/engine/GlobalScraperWebView';
import TutoringBackgroundWarmup from '../features/tutoring/components/TutoringBackgroundWarmup';
import { useTheme } from '../providers/theme/ThemeProvider';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootNavigation() {
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

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <GlobalScraperWebView />
        <TutoringBackgroundWarmup />
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
              title: '課業輔導',
              headerShown: true,
              headerTransparent: true,
              headerShadowVisible: false,
              headerBackVisible: true,
              headerBackTitle: '返回',
              headerBackButtonDisplayMode: 'minimal',
              headerTintColor: theme.text,
              headerTitleStyle: { color: theme.text },
              contentStyle: { backgroundColor: theme.bg },
            }}
          />
        </Stack>
      </>
    </NavigationThemeProvider>
  );
}
