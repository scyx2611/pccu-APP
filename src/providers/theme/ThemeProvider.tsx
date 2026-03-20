import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'system' | 'light' | 'dark';

interface ThemeContextType {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  theme: typeof lightTheme;
}

// iOS 26 / VisionOS inspired Theme
export const lightTheme = {
  bg: '#F2F2F7',
  card: 'rgba(255, 255, 255, 0.65)',
  cardHeader: 'rgba(255, 255, 255, 0.4)',
  cardTitle: '#1C1C1E',
  text: '#000000',
  textSub: '#8E8E93',
  border: 'rgba(0, 0, 0, 0.05)',
  primary: '#007AFF',
  danger: '#FF3B30',
  success: '#34C759',
  warning: '#FF9500',
  purple: '#AF52DE',
  rankBg: 'rgba(250, 250, 250, 0.5)',
  syncBtnBg: '#FFFFFF',
  overlay: 'rgba(255,255,255,0.7)',
  glassBg: 'rgba(255,255,255,0.45)',
  glassBorder: 'rgba(255,255,255,0.8)',
  glassTint: 'light' as 'light' | 'dark',
  ambient1: '#E5F1FF', // Soft Blue
  ambient2: '#F3E5F5', // Soft Purple
};

export const darkTheme = {
  bg: '#000000',
  card: 'rgba(28, 28, 30, 0.65)',
  cardHeader: 'rgba(28, 28, 30, 0.4)',
  cardTitle: '#FFFFFF',
  text: '#FFFFFF',
  textSub: '#EBEBF599',
  border: 'rgba(255, 255, 255, 0.1)',
  primary: '#0A84FF',
  danger: '#FF453A',
  success: '#32D74B',
  warning: '#FF9F0A',
  purple: '#BF5AF2',
  rankBg: 'rgba(28, 28, 30, 0.5)',
  syncBtnBg: '#1C1C1E',
  overlay: 'rgba(0,0,0,0.7)',
  glassBg: 'rgba(30,30,30,0.65)',
  glassBorder: 'rgba(255,255,255,0.15)',
  glassTint: 'dark' as 'light' | 'dark',
  ambient1: '#001A33', // Deep Blue
  ambient2: '#1A0033', // Deep Purple
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem('theme_mode').then(savedMode => {
      if (savedMode) setModeState(savedMode as ThemeMode);
    });
  }, []);

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
    AsyncStorage.setItem('theme_mode', newMode);
  };

  const isDark = mode === 'system' ? systemColorScheme === 'dark' : mode === 'dark';
  const theme = isDark ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ mode, isDark, setMode, theme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
}
