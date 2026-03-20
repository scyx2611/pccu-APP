import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { ThemeProvider, useTheme } from '../src/providers/theme/ThemeProvider';

function RootLayoutNav() {
  const { isDark, theme } = useTheme();

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: theme.bg }
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="loading" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="schedule"
          options={{ presentation: Platform.OS === 'ios' ? 'formSheet' : 'modal' }}
        />
        <Stack.Screen
          name="grade"
          options={{ presentation: Platform.OS === 'ios' ? 'formSheet' : 'modal' }}
        />
        <Stack.Screen
          name="modal"
          options={{ presentation: Platform.OS === 'ios' ? 'formSheet' : 'modal' }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootLayoutNav />
    </ThemeProvider>
  );
}
