import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../../providers/theme/ThemeProvider';

interface TutoringPendingBadgeProps {
  count: number;
  size?: 'small' | 'medium' | 'large';
}

const SIZE_CONFIG = {
  small: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    fontSize: 10,
    paddingHorizontal: 4,
  },
  medium: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    fontSize: 12,
    paddingHorizontal: 6,
  },
  large: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    fontSize: 14,
    paddingHorizontal: 8,
  },
};

export default function TutoringPendingBadge({
  count,
  size = 'medium',
}: TutoringPendingBadgeProps) {
  const { theme } = useTheme();
  const config = SIZE_CONFIG[size];

  if (count === 0) return null;

  const displayText = count > 99 ? '99+' : String(count);

  return (
    <View
      style={[
        styles.badge,
        {
          minWidth: config.minWidth,
          height: config.height,
          borderRadius: config.borderRadius,
          paddingHorizontal: config.paddingHorizontal,
          backgroundColor: theme.danger || '#FF3B30',
        },
      ]}
    >
      <Text style={[styles.text, { fontSize: config.fontSize }]}>{displayText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  text: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
