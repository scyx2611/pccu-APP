import React from 'react';
import { Pressable, Platform, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../providers/theme/ThemeProvider';
import AppSymbol from './AppSymbol';

type GlassCloseButtonProps = {
  onPress?: () => void;
};

export default function GlassCloseButton({ onPress }: GlassCloseButtonProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }

    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)/home');
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      style={[styles.root, { top: insets.top + 10 }]}
    >
      <BlurView
        intensity={44}
        tint={theme.glassTint}
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : 'none'}
        style={[
          styles.button,
          {
            backgroundColor: theme.glassBg,
            borderColor: theme.glassBorder,
          },
        ]}
      >
        <AppSymbol name="xmark" size={18} tintColor={theme.text} weight="semibold" />
      </BlurView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    right: 20,
    zIndex: 50,
  },
  button: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
