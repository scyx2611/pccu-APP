import { Stack, router } from 'expo-router';
import { useTheme } from '../../src/providers/theme/ThemeProvider';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AppSymbol from '../../src/shared/components/AppSymbol';

export default function ModalLayout() {
  const { theme } = useTheme();
  const withAlpha = (hex: string, alpha: number) => {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  return (
    <>
    <Stack screenOptions={{
      headerShown: true,
      headerTransparent: true,
      headerBlurEffect: 'prominent',
      headerShadowVisible: false,
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
      headerRight: () => (
        <TouchableOpacity 
          onPress={() => router.back()} 
          style={{ 
            backgroundColor: 'rgba(150,150,150,0.1)', 
            width: 30, 
            height: 30, 
            borderRadius: 15, 
            justifyContent: 'center', 
            alignItems: 'center',
            marginRight: 8
          }}
        >
          <AppSymbol name="xmark" size={14} tintColor={theme.textSub} weight="bold" fallback={<Text style={{ color: theme.textSub, fontWeight: 'bold' }}>×</Text>} />
        </TouchableOpacity>
      )
    }}>
      <Stack.Screen name="grade" options={{ title: '歷年成績', headerLargeTitle: true }} />
      <Stack.Screen name="gradeDetails" options={{ title: '成績詳細', presentation: 'card' }} />
      <Stack.Screen name="schedule" options={{ title: '完整課表', headerLargeTitle: true }} />
      <Stack.Screen name="courseDetails" options={{ title: '課程詳細', presentation: 'card' }} />
    </Stack>
    </>
  );
}
