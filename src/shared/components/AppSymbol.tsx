import React from 'react';
import { Platform, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';

type AppSymbolProps = {
  name: string;
  size?: number;
  tintColor?: string;
  weight?: string;
  style?: any;
  fallback?: React.ReactNode;
};

const ICON_MAP: Record<string, string> = {
  'graduationcap.fill': 'school',
  sparkles: 'sparkles',
  'bus.fill': 'bus',
  'books.vertical.fill': 'library',
  'clock.fill': 'time',
  clock: 'time-outline',
  'eye.fill': 'eye',
  'eye.slash.fill': 'eye-off',
  xmark: 'close',
  'person.fill': 'person',
  'mappin.and.ellipse': 'location',
  'tag.fill': 'pricetag',
  'arrow.clockwise': 'refresh',
  'info.circle.fill': 'information-circle',
  'info.circle': 'information-circle-outline',
  'doc.text.magnifyingglass': 'document-text',
  checkmark: 'checkmark',
  'chevron.right': 'chevron-forward',
  'bell.fill': 'notifications',
  bell: 'notifications-outline',
  'moon.fill': 'moon',
  moon: 'moon-outline',
  'sun.max': 'sunny-outline',
  'sun.max.fill': 'sunny',
  lock: 'lock-closed-outline',
  'person.badge.shield.checkmark': 'shield-checkmark-outline',
  'hand.raised': 'hand-left-outline',
  'wrench.and.screwdriver': 'construct-outline',
  'person.crop.circle.fill': 'person-circle',
  gear: 'settings',
  'house.fill': 'home',
  ribbon: 'ribbon',
  time: 'time',
  'chevron.up.chevron.down': 'swap-vertical-outline',
};

export default function AppSymbol({
  name,
  size = 24,
  tintColor = '#000',
  weight,
  style,
  fallback,
}: AppSymbolProps) {
  const iosVersion = typeof Platform.Version === 'number' ? Platform.Version : parseInt(String(Platform.Version), 10);
  const resolvedFallback =
    typeof fallback === 'string' || typeof fallback === 'number'
      ? <Text style={{ fontSize: size, color: tintColor }}>{String(fallback)}</Text>
      : fallback;
  const defaultFallback = resolvedFallback ?? <Text style={{ fontSize: size, color: tintColor }}>?</Text>;

  if (Platform.OS === 'ios' && iosVersion >= 17) {
    return (
      <SymbolView
        name={name as any}
        size={size}
        tintColor={tintColor}
        weight={weight as any}
        style={style as any}
        fallback={defaultFallback}
      />
    );
  }

  if (resolvedFallback) return <>{resolvedFallback}</>;

  const ionName = ICON_MAP[name];
  if (ionName) {
    return <Ionicons name={ionName as any} size={size} color={tintColor} style={style as any} />;
  }

  return <Text style={[{ fontSize: size, color: tintColor }, style]}>?</Text>;
}
