import { Stack } from 'expo-router';
import { useTheme } from '../../../src/providers/theme/ThemeProvider';

export default function HomeLayout() {
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
      <Stack.Screen name="index" options={{ title: '首頁' }} />
      <Stack.Screen name="schedule" options={{ title: '完整課表' }} />
      <Stack.Screen name="grade" options={{ title: '歷年成績' }} />
      <Stack.Screen name="traffic" options={{ title: '交通動態' }} />
    </Stack>
  );
}
