import { Stack } from 'expo-router';
import { useTheme } from '../../../src/providers/theme/ThemeProvider';

export default function ScheduleLayout() {
  const { theme } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerLargeTitle: true,
        headerShadowVisible: false,
        headerTransparent: true,
        headerTintColor: theme.text,
        headerTitleStyle: { color: theme.text },
        headerLargeTitleStyle: { color: theme.text },
        scrollEdgeEffects: {
          top: 'automatic',
        },
        contentStyle: { backgroundColor: theme.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: '行程' }} />
    </Stack>
  );
}
