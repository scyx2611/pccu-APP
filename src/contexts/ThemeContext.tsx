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

export const lightTheme = {
  bg: '#F2F2F7',
  card: '#FFFFFF',
  cardHeader: '#F8F8F8',
  cardTitle: '#3A3A3C',
  text: '#1C1C1E',
  textSub: '#8E8E93',
  border: '#E5E5EA',
  primary: '#0A7AFF',
  danger: '#FF3B30',
  success: '#34C759',
  rankBg: '#FAFAFA',
  syncBtnBg: '#FFFFFF',
  overlay: 'rgba(255,255,255,0.7)',
  glassBg: 'rgba(255,255,255,0.45)',
  glassBorder: 'rgba(255,255,255,0.8)',
  glassTint: 'light' as 'light' | 'dark',
};

export const darkTheme = {
  bg: '#000000',
  card: '#1C1C1E',
  cardHeader: '#2C2C2E',
  cardTitle: '#E5E5EA',
  text: '#FFFFFF',
  textSub: '#98989D',
  border: '#38383A',
  primary: '#0A84FF',
  danger: '#FF453A',
  success: '#32D74B',
  rankBg: '#1C1C1E',
  syncBtnBg: '#1C1C1E',
  overlay: 'rgba(0,0,0,0.7)',
  glassBg: 'rgba(30,30,30,0.65)',
  glassBorder: 'rgba(255,255,255,0.15)',
  glassTint: 'dark' as 'light' | 'dark',
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
