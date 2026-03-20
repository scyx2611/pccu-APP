import { Stack } from 'expo-router';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../../src/providers/theme/ThemeProvider';

export default function SettingsLayout() {
  const { theme } = useTheme();
  const withAlpha = (hex: string, alpha: number) => {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  return (
    <Stack
      screenOptions={{
        headerLargeTitle: true,
        headerShadowVisible: false,
        headerTransparent: true,
        headerBlurEffect: 'prominent',
        headerBackground: () => (
          <LinearGradient
            colors={[
              theme.ambient1 || theme.bg,
              withAlpha(theme.bg, 0.75),
              withAlpha(theme.bg, 0),
            ]}
            style={StyleSheet.absoluteFill}
          />
        ),
        headerTintColor: theme.text,
        contentStyle: { backgroundColor: theme.bg },
      }}
    >
      <Stack.Screen 
        name="index" 
        options={{ 
          title: "設定",
        }} 
      />
      <Stack.Screen name="about" options={{ title: '關於我們', headerLargeTitle: false, headerTransparent: false }} />
      <Stack.Screen name="notifications" options={{ title: '通知設定', headerLargeTitle: false, headerTransparent: false }} />
    </Stack>
  );
}
