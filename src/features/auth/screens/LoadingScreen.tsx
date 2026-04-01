import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import AppSymbol from '../../../shared/components/AppSymbol';
import { useTheme } from '../../../providers/theme/ThemeProvider';
import { getSavedPCCUCredentials } from '../services/authService';
import { markPostLoginSyncHandled } from '../services/postLoginSyncState';
import { useScheduleStore } from '../../schedule/store/useScheduleStore';
import { useScheduleSync } from '../../schedule/hooks/useScheduleSync';
import { useGradeStore } from '../../grade/store/useGradeStore';
import { useGradeSync } from '../../grade/hooks/useGradeSync';

type SyncState = 'pending' | 'active' | 'done' | 'failed';

type SyncCompletionRef = {
  scheduleDone: boolean;
  gradeDone: boolean;
  navigated: boolean;
};

export default function LoadingScreen() {
  const { theme } = useTheme();
  const [scheduleState, setScheduleState] = useState<SyncState>('pending');
  const [gradeState, setGradeState] = useState<SyncState>('pending');
  const [headline, setHeadline] = useState('正在同步資訊');
  const [subline, setSubline] = useState('首次使用需要一點時間，完成後會自動進入首頁。');
  const completionRef = useRef<SyncCompletionRef>({
    scheduleDone: false,
    gradeDone: false,
    navigated: false,
  });
  const { sync: syncSchedule } = useScheduleSync();
  const scheduleHydrate = useScheduleStore((state) => state.hydrate);
  const scheduleResetSync = useScheduleStore((state) => state.resetSync);
  const { sync: syncGrade } = useGradeSync();
  const gradeHydrate = useGradeStore((state) => state.hydrate);
  const gradeResetSync = useGradeStore((state) => state.resetSync);

  const finishIfReady = useCallback(() => {
    const completion = completionRef.current;
    if (!completion.scheduleDone || !completion.gradeDone || completion.navigated) {
      return;
    }

    completion.navigated = true;
    setHeadline('同步完成');
    setSubline('正在進入首頁...');
    markPostLoginSyncHandled();

    setTimeout(() => {
      router.replace('/(tabs)/home');
    }, 450);
  }, []);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const credentials = await getSavedPCCUCredentials();
      if (!active) return;

      if (!credentials) {
        router.replace('/login');
        return;
      }

      setScheduleState('active');
      setGradeState('active');

      // Schedule sync via PccuSyncEngine
      scheduleHydrate();
      scheduleResetSync();
      try {
        await syncSchedule({ priority: 1 });
        if (active) setScheduleState('done');
      } catch {
        if (active) setScheduleState('failed');
      } finally {
        if (active) {
          completionRef.current.scheduleDone = true;
          finishIfReady();
        }
      }

      // Grade sync via PccuSyncEngine
      gradeHydrate();
      gradeResetSync();
      try {
        await syncGrade({ priority: 1 });
        if (active) setGradeState('done');
      } catch {
        if (active) setGradeState('failed');
      } finally {
        if (active) {
          completionRef.current.gradeDone = true;
          finishIfReady();
        }
      }
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, [scheduleHydrate, scheduleResetSync, syncSchedule, gradeHydrate, gradeResetSync, syncGrade, finishIfReady]);

  const isSyncing = scheduleState === 'active' || gradeState === 'active';

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <LinearGradient
        colors={[theme.ambient1 || theme.bg, theme.ambient2 || theme.bg, theme.bg]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={[styles.heroMark, { backgroundColor: 'rgba(0, 122, 255, 0.12)' }]}>
          <AppSymbol name="sparkles" size={24} tintColor={theme.primary} fallback="+" />
        </View>

        <Text style={[styles.headline, { color: theme.text }]}>{headline}</Text>
        <Text style={[styles.subline, { color: theme.textSub }]}>{subline}</Text>

        <View style={styles.spinnerWrap}>
          <ActivityIndicator size="large" color={theme.primary} animating={isSyncing} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    borderRadius: 32,
    padding: 24,
    borderWidth: 1,
  },
  heroMark: {
    width: 52,
    height: 52,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  headline: {
    fontSize: 28,
    lineHeight: 35,
    fontWeight: '800',
  },
  subline: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
  },
  spinnerWrap: {
    alignItems: 'flex-start',
    marginTop: 24,
  },
});
