import React, { useState } from 'react';
import { Stack, router } from 'expo-router';
import { Animated, Platform, View } from 'react-native';
import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../src/providers/theme/ThemeProvider';
import GradeScreen from '../src/features/grade/screens/GradeScreen';
import ErrorBoundary from '../src/shared/components/ErrorBoundary';
import { getDeveloperDebugEnabled } from '../src/features/settings/storage/developerSettings';
import GlassCloseButton from '../src/shared/components/GlassCloseButton';

export default function GradeRootScreen() {
  const { theme } = useTheme();
  const [showPreview, setShowPreview] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;
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

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const loadDeveloperSetting = async () => {
        const enabled = await getDeveloperDebugEnabled();
        if (active) {
          setShowPreview(enabled);
        }
      };

      void loadDeveloperSetting();

      return () => {
        active = false;
      };
    }, [])
  );

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
        <ErrorBoundary label="成績">
          <GradeScreen showPreview={showPreview} onScrollY={scrollY} />
        </ErrorBoundary>
      </View>
    </>
  );
}
