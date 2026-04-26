import type { ComponentProps } from 'react';
import type { NativeTabs } from 'expo-router/unstable-native-tabs';
import type { SFSymbol } from 'sf-symbols-typescript';

export type MainTabName = 'home' | 'schedule' | 'tutoring' | 'settings';

export type MainTabConfig = {
  name: MainTabName;
  label: string;
  sfSymbol: {
    default: SFSymbol;
    selected: SFSymbol;
  };
};

export const MAIN_TAB_APPEARANCE = {
  iconColor: { default: '#8E8E93', selected: '#000000' },
  labelStyle: {
    default: { color: '#8E8E93', fontSize: 11, fontWeight: '600' },
    selected: { color: '#000000', fontSize: 11, fontWeight: '700' },
  },
} satisfies Pick<ComponentProps<typeof NativeTabs>, 'iconColor' | 'labelStyle'>;

export const MAIN_TABS: readonly MainTabConfig[] = [
  { name: 'home', label: '首頁', sfSymbol: { default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' } },
  { name: 'schedule', label: '行程', sfSymbol: { default: 'clock', selected: 'clock.fill' } },
  { name: 'tutoring', label: '課輔', sfSymbol: { default: 'book', selected: 'book.fill' } },
  { name: 'settings', label: '我的', sfSymbol: { default: 'person', selected: 'person.fill' } },
] as const;
