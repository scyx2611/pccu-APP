import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../src/providers/theme/ThemeProvider';
import ErrorBoundary from '../../src/shared/components/ErrorBoundary';
import ScheduleScreen from '../../src/features/schedule/screens/ScheduleScreen';

export default function ScheduleModal() {
  const { theme } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ErrorBoundary label='課表'>
        <ScheduleScreen />
      </ErrorBoundary>
    </View>
  );
}
