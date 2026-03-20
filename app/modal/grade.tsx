import React, { useState } from 'react';
import { View, Animated } from 'react-native';
import { useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../src/providers/theme/ThemeProvider';
import ErrorBoundary from '../../src/shared/components/ErrorBoundary';
import GradeScreen from '../../src/features/grade/screens/GradeScreen';
import { getDeveloperDebugEnabled } from '../../src/features/settings/storage/developerSettings';

export default function GradeModal() {
  const { theme } = useTheme();
  const [showPreview, setShowPreview] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;

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
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ErrorBoundary label="成績">
        <GradeScreen showPreview={showPreview} onScrollY={scrollY} />
      </ErrorBoundary>
    </View>
  );
}
