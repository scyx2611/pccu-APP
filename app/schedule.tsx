import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../src/providers/theme/ThemeProvider';
import ScheduleScreen from '../src/features/schedule/screens/ScheduleScreen';
import ErrorBoundary from '../src/shared/components/ErrorBoundary';

export default function ScheduleRootScreen() {
  const { theme } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ErrorBoundary label="課表">
        <ScheduleScreen />
      </ErrorBoundary>
    </View>
  );
}
