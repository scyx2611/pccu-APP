import React from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { useTheme } from '../../src/providers/theme/ThemeProvider';
import AppSymbol from '../../src/shared/components/AppSymbol';

export default function ModalLayout() {
  const { theme } = useTheme();
  const iosCloseHeaderItem = Platform.OS === 'ios'
    ? () => [
        {
          type: 'button' as const,
          label: '關閉',
          icon: { type: 'sfSymbol' as const, name: 'xmark' as const },
          variant: 'prominent' as const,
          onPress: () => router.back(),
          accessibilityLabel: '關閉',
        },
      ]
    : undefined;

  const fallbackCloseButton = () => (
    <Pressable onPress={() => router.back()} style={styles.fallbackCloseButton}>
      <AppSymbol name="xmark" size={16} tintColor={theme.text} weight="semibold" />
    </Pressable>
  );

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTransparent: true,
        headerShadowVisible: false,
        headerTintColor: theme.text,
        contentStyle: { backgroundColor: theme.bg },
      }}
    >
      <Stack.Screen name="gradeDetails" options={{ title: '成績詳細', presentation: 'card' }} />
      <Stack.Screen name="courseDetails" options={{ title: '課程詳細', presentation: 'card' }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  fallbackCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
});
