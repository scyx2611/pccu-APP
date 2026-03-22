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
    </Stack>
  );
}
