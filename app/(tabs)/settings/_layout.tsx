import { Stack } from 'expo-router';
import { useTheme } from '../../../src/providers/theme/ThemeProvider';

export default function SettingsLayout() {
  const { theme } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerLargeTitle: true,
        headerShadowVisible: false,
        headerTransparent: true,
        contentStyle: { backgroundColor: theme.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: '我的' }} />
      <Stack.Screen name="appearance" options={{ title: '外觀', headerLargeTitle: false }} />
      <Stack.Screen name="security" options={{ title: '安全性', headerLargeTitle: false }} />
      <Stack.Screen name="privacy" options={{ title: '隱私', headerLargeTitle: false }} />
      <Stack.Screen name="developer" options={{ title: '開發者', headerLargeTitle: false }} />
      <Stack.Screen name="about" options={{ title: '關於', headerLargeTitle: false }} />
      <Stack.Screen name="notifications" options={{ title: '通知', headerLargeTitle: false }} />
    </Stack>
  );
}
