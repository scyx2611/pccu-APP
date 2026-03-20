import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import WelcomeScreen from '../src/features/auth/screens/WelcomeScreen';
import { useTheme } from '../src/providers/theme/ThemeProvider';
import { getSavedPCCUCredentials } from '../src/features/auth/services/authService';
import { getBootstrapCacheSnapshot } from '../src/features/auth/services/bootstrapCache';

export default function IndexScreen() {
  const { theme } = useTheme();
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const savedCredentials = await getSavedPCCUCredentials();

      if (!active) return;

      if (savedCredentials) {
        const cacheSnapshot = await getBootstrapCacheSnapshot();
        if (!active) return;

        router.replace(cacheSnapshot.hasAnyCache ? '/(tabs)/home' : '/loading');
        return;
      }

      setCheckingSession(false);
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  if (checkingSession) {
    return (
      <View style={[styles.loadingScreen, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  return <WelcomeScreen onStart={() => router.push('/login')} />;
}

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
